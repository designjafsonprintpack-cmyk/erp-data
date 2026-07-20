-- ══════════════════════════════════════════════════════════════════════════════
-- MIGRATION 072: PLATE SETS + AUTO-GENERATION + REPLACE-IN-PLACE — Phase 5
-- ══════════════════════════════════════════════════════════════════════════════
-- plate_sets: groups the plates made together for one job's color count into
-- a unit (C/M/Y/K as one set, not four independent plates). A job can have
-- more than one set over time (set_number increments) — e.g. a repeat job
-- reusing some plates but needing a fresh set for a redesign.
--
-- plates gains:
--   plate_set_id     — which set this plate belongs to (NULL for older
--                       plates made before this migration, and for
--                       standalone reusable stock plates never tied to a
--                       specific job/set — both stay valid, just ungrouped)
--   plate_version     — 1 for an original plate, 2+ for a replacement
--   replaces_plate_id — self-FK, so "Black damaged -> Black V2" has a
--                       queryable history chain instead of just being a
--                       new unrelated row
--
-- Status vocabulary expands from the original 5 values to the requested
-- list, PLUS 'in_storage' kept alongside it — none of the 10 requested
-- statuses (created/mounted/printing/removed/damaged/remade/reused/
-- archived/disposed/lost) cleanly means "available, not on any job right
-- now", which the existing Reuse/Return flow depends on knowing. Old rows
-- are backfilled: pending->created, in_use->mounted, retired->disposed
-- (in_storage and damaged already match, kept as-is).
--
-- job_plates gains operator_id (machine_id already existed) — the original
-- spec asks for operator-wise plate usage reporting (Phase 7), which needs
-- this captured at assignment time, not reconstructed after the fact.
--
-- Two RPCs do the actual generation/replacement work atomically:
--   generate_plate_set(job_id)  — reads jobs.no_of_colors, creates the set
--                                  + one plate per color in one transaction
--   replace_plate(plate_id)     — retires the damaged plate (status stays
--                                  in the SAME row, just marked 'damaged'),
--                                  inserts ONE new plate row (version+1,
--                                  same set, same color) — never touches
--                                  the other plates in the set
-- ══════════════════════════════════════════════════════════════════════════════

CREATE TABLE plate_sets (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id    UUID NOT NULL REFERENCES companies(id),
  job_id        UUID NOT NULL REFERENCES jobs(id),
  set_number    INTEGER NOT NULL DEFAULT 1,
  no_of_colors  INTEGER NOT NULL,
  notes         TEXT,

  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_by    UUID,
  updated_by    UUID,
  deleted_at    TIMESTAMPTZ,
  is_active     BOOLEAN NOT NULL DEFAULT TRUE,

  UNIQUE (company_id, job_id, set_number)
);

CREATE INDEX idx_plate_sets_job ON plate_sets(job_id);

CREATE TRIGGER trg_plate_sets_updated_at BEFORE UPDATE ON plate_sets
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

ALTER TABLE plate_sets ENABLE ROW LEVEL SECURITY;
CREATE POLICY plate_sets_tenant ON plate_sets
  USING (company_id = (auth.jwt() ->> 'company_id')::UUID);

CREATE TRIGGER trg_audit_plate_sets AFTER INSERT OR UPDATE OR DELETE ON plate_sets
  FOR EACH ROW EXECUTE FUNCTION log_audit_event();

ALTER TABLE plates
  ADD COLUMN plate_set_id     UUID REFERENCES plate_sets(id),
  ADD COLUMN plate_version    INTEGER NOT NULL DEFAULT 1,
  ADD COLUMN replaces_plate_id UUID REFERENCES plates(id);

CREATE INDEX idx_plates_set ON plates(plate_set_id);

-- Backfill old status values to the new vocabulary before widening the
-- CHECK constraint (in_storage/damaged already match, left alone).
UPDATE plates SET status = 'created' WHERE status = 'pending';
UPDATE plates SET status = 'mounted' WHERE status = 'in_use';
UPDATE plates SET status = 'disposed' WHERE status = 'retired';

ALTER TABLE plates DROP CONSTRAINT plates_status_check;
ALTER TABLE plates ADD CONSTRAINT plates_status_check CHECK (status IN (
  'created', 'mounted', 'printing', 'removed', 'in_storage',
  'damaged', 'remade', 'reused', 'archived', 'disposed', 'lost'
));
ALTER TABLE plates ALTER COLUMN status SET DEFAULT 'created';

-- mark_plate_reused() (migration 042) hardcoded status = 'in_use' — no
-- longer a valid value under the new CHECK constraint above. Replaced with
-- the same function body, only the status literal changed to 'mounted'.
CREATE OR REPLACE FUNCTION mark_plate_reused(p_plate_id UUID)
RETURNS VOID
LANGUAGE plpgsql
SECURITY INVOKER
AS $$
BEGIN
  UPDATE plates
  SET status = 'mounted',
      reuse_count = reuse_count + 1,
      last_used_at = NOW()
  WHERE id = p_plate_id;
END;
$$;

ALTER TABLE job_plates ADD COLUMN operator_id UUID REFERENCES users(id);

-- ─── generate_plate_set(): one job -> one full set, atomically ────────────────
CREATE OR REPLACE FUNCTION generate_plate_set(p_job_id UUID, p_company_id UUID, p_created_by UUID)
RETURNS UUID
LANGUAGE plpgsql
SECURITY INVOKER
AS $$
DECLARE
  v_no_of_colors INTEGER;
  v_job_number   TEXT;
  v_set_id       UUID;
  v_next_set     INTEGER;
  v_colors       TEXT[];
  v_i            INTEGER;
BEGIN
  SELECT no_of_colors, job_number INTO v_no_of_colors, v_job_number
  FROM jobs WHERE id = p_job_id AND company_id = p_company_id;

  IF v_job_number IS NULL THEN
    RAISE EXCEPTION 'Job not found';
  END IF;
  IF v_no_of_colors IS NULL OR v_no_of_colors < 1 THEN
    RAISE EXCEPTION 'Job has no color count set — add "No. of Colors" on the job first';
  END IF;

  SELECT COALESCE(MAX(set_number), 0) + 1 INTO v_next_set
  FROM plate_sets WHERE job_id = p_job_id AND company_id = p_company_id;

  INSERT INTO plate_sets (company_id, job_id, set_number, no_of_colors, created_by)
  VALUES (p_company_id, p_job_id, v_next_set, v_no_of_colors, p_created_by)
  RETURNING id INTO v_set_id;

  -- Default color names: standard CMYK for a 4-color job (by far the most
  -- common case), plain "Black" for a 1-color job, generic "Color N"
  -- placeholders otherwise (2/3/5+ color jobs are usually specific spot
  -- colors the estimator/designer picks, not a fixed formula) — every
  -- generated plate's color name stays freely editable afterward either way.
  v_colors := CASE
    WHEN v_no_of_colors = 1 THEN ARRAY['Black']
    WHEN v_no_of_colors = 4 THEN ARRAY['Cyan', 'Magenta', 'Yellow', 'Black']
    ELSE (SELECT array_agg('Color ' || g) FROM generate_series(1, v_no_of_colors) g)
  END;

  FOR v_i IN 1 .. array_length(v_colors, 1) LOOP
    INSERT INTO plates (company_id, plate_code, color, status, origin_job_id, plate_set_id, made_date, created_by)
    VALUES (
      p_company_id,
      v_job_number || '-S' || v_next_set || '-' || v_colors[v_i],
      v_colors[v_i], 'created', p_job_id, v_set_id, CURRENT_DATE, p_created_by
    );
  END LOOP;

  RETURN v_set_id;
END;
$$;

-- ─── replace_plate(): retire one plate, insert its replacement — set untouched ─
CREATE OR REPLACE FUNCTION replace_plate(p_plate_id UUID, p_company_id UUID, p_reason TEXT, p_created_by UUID)
RETURNS UUID
LANGUAGE plpgsql
SECURITY INVOKER
AS $$
DECLARE
  v_old plates%ROWTYPE;
  v_new_id UUID;
BEGIN
  SELECT * INTO v_old FROM plates WHERE id = p_plate_id AND company_id = p_company_id;
  IF v_old.id IS NULL THEN
    RAISE EXCEPTION 'Plate not found';
  END IF;

  UPDATE plates
  SET status = 'damaged', retired_reason = COALESCE(p_reason, retired_reason), updated_by = p_created_by
  WHERE id = p_plate_id;

  INSERT INTO plates (
    company_id, plate_code, color, plate_size, material, status,
    origin_job_id, plate_set_id, plate_version, replaces_plate_id, made_date, created_by
  ) VALUES (
    p_company_id,
    v_old.plate_code || '-v' || (v_old.plate_version + 1),
    v_old.color, v_old.plate_size, v_old.material, 'created',
    v_old.origin_job_id, v_old.plate_set_id, v_old.plate_version + 1, v_old.id, CURRENT_DATE, p_created_by
  ) RETURNING id INTO v_new_id;

  RETURN v_new_id;
END;
$$;

NOTIFY pgrst, 'reload schema';
