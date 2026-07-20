-- ══════════════════════════════════════════════════════════════════════════════
-- JAFSON PRINT ERP — MIGRATION 042: PLATE MANAGEMENT
--
-- Two tables:
--   plates      — master registry of physical printing plates. A plate is a
--                  reusable asset: it can be made for one job and, if kept in
--                  good condition, reused on a REPEAT job later instead of
--                  remaking (saves plate-making cost, common in offset printing).
--   job_plates  — junction: which plates were assigned to which job, on which
--                  machine, and in what condition they went out / came back.
--                  A plate can appear in job_plates more than once over its
--                  life (original job + every repeat that reused it).
-- ══════════════════════════════════════════════════════════════════════════════

-- ─── PLATES (master registry) ───────────────────────────────────────────────
CREATE TABLE plates (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id            UUID NOT NULL REFERENCES companies(id),
  plate_code            TEXT NOT NULL,
  color                 TEXT NOT NULL,
  die_number            TEXT,
  plate_size            TEXT,
  material              TEXT NOT NULL DEFAULT 'aluminum' CHECK (material IN ('aluminum','polyester','other')),
  status                TEXT NOT NULL DEFAULT 'pending' CHECK (status IN (
                          'pending','in_storage','in_use','damaged','retired'
                        )),
  origin_job_id         UUID REFERENCES jobs(id),
  vendor_id             UUID REFERENCES vendors(id),
  cost                  NUMERIC(12,2),
  made_date             DATE,
  storage_location      TEXT,
  reuse_count           INTEGER NOT NULL DEFAULT 0,
  last_used_at          TIMESTAMPTZ,
  retired_reason        TEXT,
  remarks               TEXT,

  created_at            TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at            TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_by            UUID,
  updated_by            UUID,
  deleted_at            TIMESTAMPTZ,
  is_active             BOOLEAN NOT NULL DEFAULT TRUE,

  UNIQUE (company_id, plate_code)
);

CREATE INDEX idx_plates_company    ON plates(company_id);
CREATE INDEX idx_plates_status     ON plates(company_id, status);
CREATE INDEX idx_plates_origin_job ON plates(origin_job_id);

CREATE TRIGGER trg_plates_updated_at BEFORE UPDATE ON plates
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

ALTER TABLE plates ENABLE ROW LEVEL SECURITY;
CREATE POLICY plates_tenant ON plates
  USING (company_id = (auth.jwt() ->> 'company_id')::UUID);

CREATE TRIGGER trg_audit_plates AFTER INSERT OR UPDATE OR DELETE ON plates
  FOR EACH ROW EXECUTE FUNCTION log_audit_event();

-- ─── JOB_PLATES (assignment junction) ───────────────────────────────────────
CREATE TABLE job_plates (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id            UUID NOT NULL REFERENCES companies(id),
  job_id                UUID NOT NULL REFERENCES jobs(id),
  plate_id              UUID NOT NULL REFERENCES plates(id),
  machine_id            UUID REFERENCES machines(id),
  is_reused             BOOLEAN NOT NULL DEFAULT FALSE,
  assigned_at           TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  returned_at           TIMESTAMPTZ,
  condition_on_assign   TEXT CHECK (condition_on_assign IN ('new','good','worn','damaged')),
  condition_on_return   TEXT CHECK (condition_on_return IN ('good','worn','damaged','discarded')),
  remarks               TEXT,

  created_at            TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at            TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_by            UUID,
  updated_by            UUID,
  deleted_at            TIMESTAMPTZ,
  is_active             BOOLEAN NOT NULL DEFAULT TRUE,

  UNIQUE (company_id, job_id, plate_id)
);

CREATE INDEX idx_job_plates_job   ON job_plates(job_id);
CREATE INDEX idx_job_plates_plate ON job_plates(plate_id);

CREATE TRIGGER trg_job_plates_updated_at BEFORE UPDATE ON job_plates
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

ALTER TABLE job_plates ENABLE ROW LEVEL SECURITY;
CREATE POLICY job_plates_tenant ON job_plates
  USING (company_id = (auth.jwt() ->> 'company_id')::UUID);

CREATE TRIGGER trg_audit_job_plates AFTER INSERT OR UPDATE OR DELETE ON job_plates
  FOR EACH ROW EXECUTE FUNCTION log_audit_event();

-- ─── ATOMIC REUSE HELPER ─────────────────────────────────────────────────────
-- Called when an existing stored plate is assigned to a (repeat) job, so
-- concurrent assignment requests can't race on reading-then-writing reuse_count.
CREATE OR REPLACE FUNCTION mark_plate_reused(p_plate_id UUID)
RETURNS VOID
LANGUAGE plpgsql
SECURITY INVOKER
AS $$
BEGIN
  UPDATE plates
  SET status = 'in_use',
      reuse_count = reuse_count + 1,
      last_used_at = NOW()
  WHERE id = p_plate_id;
END;
$$;

-- ─── JOB TIMELINE: allow plate events alongside hold/wastage/etc ───────────────
ALTER TABLE job_stage_events DROP CONSTRAINT job_stage_events_event_type_check;
ALTER TABLE job_stage_events ADD CONSTRAINT job_stage_events_event_type_check
  CHECK (event_type IN (
    'created','status_changed','stage_started','stage_completed',
    'stage_skipped','hold_started','hold_ended','remark_added',
    'artwork_uploaded','repeat_created','assigned','priority_changed',
    'wastage_recorded','plate_assigned','plate_returned'
  ));

-- ─── PERMISSION MODULE SEED (pattern from 031_missing_permission_modules.sql) ──
DO $$
DECLARE
  cid UUID := '00000000-0000-0000-0000-000000000001';
  actions TEXT[] := ARRAY['view','create','edit','delete','approve','reject','print','export','settings'];
  a TEXT;
BEGIN
  FOREACH a IN ARRAY actions LOOP
    INSERT INTO permissions (company_id, module, action, label)
    VALUES (cid, 'plates', a, 'Plates — ' || initcap(a))
    ON CONFLICT (company_id, module, action) DO NOTHING;
  END LOOP;

  INSERT INTO role_permissions (company_id, role_id, permission_id)
  SELECT cid, r.id, p.id
  FROM roles r
  CROSS JOIN permissions p
  WHERE r.company_id = cid
    AND r.slug = 'superadmin'
    AND p.module = 'plates'
  ON CONFLICT DO NOTHING;
END $$;

NOTIFY pgrst, 'reload schema';
