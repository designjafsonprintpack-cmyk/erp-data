-- ═══════════════════════════════════════════════════════════════════════════
-- PLATE SETS — REPAIR OF MIGRATION 072
-- ═══════════════════════════════════════════════════════════════════════════
-- WHAT WAS BROKEN
--   072_plate_sets.sql only ever landed in PART. Probed against the live
--   database on 2026-07-29:
--
--     plate_sets table .................. MISSING
--     plates.plate_set_id ............... MISSING
--     plates.plate_version .............. MISSING
--     plates.replaces_plate_id .......... MISSING
--     generate_plate_set() .............. MISSING
--     replace_plate() ................... MISSING
--     job_plates.operator_id ............ PRESENT   <-- only 072 adds this
--     mark_plate_reused() ............... PRESENT   <-- predates 072 (042)
--
--   So part of 072 is applied and part is not. Meanwhile
--   src/app/api/v1/jobs/[id]/plates/generate-set/route.ts calls
--   generate_plate_set() and writes to plate_sets — that endpoint 500s today.
--
--   072 cannot simply be re-run: it has no IF NOT EXISTS anywhere, so it dies
--   on `ALTER TABLE job_plates ADD COLUMN operator_id` (already present) and
--   would leave things half-done again. This migration does 072's work with
--   every step guarded, so it is safe whatever state the database is in.
--
-- HOW TO UNDO
--   DROP FUNCTION IF EXISTS generate_plate_set(UUID,UUID,UUID);
--   DROP FUNCTION IF EXISTS replace_plate(UUID,UUID,TEXT,UUID);
--   ALTER TABLE plates DROP COLUMN IF EXISTS plate_set_id,
--     DROP COLUMN IF EXISTS plate_version, DROP COLUMN IF EXISTS replaces_plate_id;
--   DROP TABLE IF EXISTS plate_sets;
--   (job_plates.operator_id is left alone — it was already there.)
--
-- MIGRATION RISK
--   Additive and idempotent; every statement is guarded, so re-running changes
--   nothing. `plates` and `job_plates` are empty today (0 rows), so the status
--   backfill and the CHECK swap touch no data and lock nothing.
--   plate_sets is a NEW table, so it gets its own RLS policy, tenant-scoped
--   the same way every other table here is — see 02's rule that a new table
--   never goes live without one.
-- ═══════════════════════════════════════════════════════════════════════════

-- ─── 1. THE TABLE ────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS plate_sets (
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

CREATE INDEX IF NOT EXISTS idx_plate_sets_job ON plate_sets(job_id);

ALTER TABLE plate_sets ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'plate_sets' AND policyname = 'plate_sets_tenant') THEN
    CREATE POLICY plate_sets_tenant ON plate_sets
      USING (company_id = (auth.jwt() ->> 'company_id')::UUID);
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'trg_plate_sets_updated_at') THEN
    CREATE TRIGGER trg_plate_sets_updated_at BEFORE UPDATE ON plate_sets
      FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'trg_audit_plate_sets') THEN
    CREATE TRIGGER trg_audit_plate_sets AFTER INSERT OR UPDATE OR DELETE ON plate_sets
      FOR EACH ROW EXECUTE FUNCTION log_audit_event();
  END IF;
END $$;

-- ─── 2. PLATES GAINS ITS SET / VERSION / REPLACEMENT CHAIN ───────────────────
ALTER TABLE plates
  ADD COLUMN IF NOT EXISTS plate_set_id      UUID REFERENCES plate_sets(id),
  ADD COLUMN IF NOT EXISTS plate_version     INTEGER NOT NULL DEFAULT 1,
  ADD COLUMN IF NOT EXISTS replaces_plate_id UUID REFERENCES plates(id);

CREATE INDEX IF NOT EXISTS idx_plates_set ON plates(plate_set_id);

-- job_plates.operator_id is ALREADY present — guarded so this is a no-op here
-- but still correct if this migration is ever run on a fresh database.
ALTER TABLE job_plates ADD COLUMN IF NOT EXISTS operator_id UUID REFERENCES users(id);

-- ─── 3. THE WIDER STATUS VOCABULARY ──────────────────────────────────────────
-- Backfill first, then widen. 'in_storage' is deliberately kept alongside the
-- 10 requested statuses: none of them means "available, on no job right now",
-- which the existing Reuse/Return flow depends on being able to say.
UPDATE plates SET status = 'created'  WHERE status = 'pending';
UPDATE plates SET status = 'mounted'  WHERE status = 'in_use';
UPDATE plates SET status = 'disposed' WHERE status = 'retired';

ALTER TABLE plates DROP CONSTRAINT IF EXISTS plates_status_check;
ALTER TABLE plates ADD CONSTRAINT plates_status_check CHECK (status IN (
  'created', 'mounted', 'printing', 'removed', 'in_storage',
  'damaged', 'remade', 'reused', 'archived', 'disposed', 'lost'
));
ALTER TABLE plates ALTER COLUMN status SET DEFAULT 'created';

-- 042's mark_plate_reused() hardcoded status = 'in_use', which the CHECK above
-- no longer allows. Same body, corrected literal.
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

-- ─── 4. generate_plate_set(): one job -> one full set, atomically ────────────
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

  -- CMYK for a 4-colour job (by far the most common), plain Black for a
  -- 1-colour job, generic placeholders otherwise — 2/3/5+ colour jobs are
  -- usually specific spot colours the estimator picks, not a formula. Every
  -- generated plate's colour name stays editable afterwards either way.
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

-- ─── 5. replace_plate(): retire one plate, insert its replacement ────────────
-- The rest of the set is never touched — a damaged Black does not invalidate
-- the Cyan, Magenta and Yellow that were made with it.
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
