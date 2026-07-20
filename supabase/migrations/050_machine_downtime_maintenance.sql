-- ═══════════════════════════════════════════════════════════════════════════
-- MACHINE DOWNTIME & MAINTENANCE LOG
-- ═══════════════════════════════════════════════════════════════════════════
-- machine_status_history (006_machines.sql) already logs every status
-- transition with a free-text reason, but nothing categorizes WHY a machine
-- went down (breakdown vs planned service vs no-operator) or tracks
-- scheduled/completed maintenance work separately from ad-hoc status
-- changes. This adds both.
-- ═══════════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS machine_downtime_log (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id      UUID NOT NULL REFERENCES companies(id),
  machine_id      UUID NOT NULL REFERENCES machines(id) ON DELETE CASCADE,
  category        TEXT NOT NULL CHECK (category IN
                    ('breakdown','planned_maintenance','no_operator','material_shortage','power_outage','other')),
  reason          TEXT,
  started_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  ended_at        TIMESTAMPTZ,                          -- NULL while still down
  duration_minutes INTEGER,                              -- filled in when closed
  reported_by     UUID REFERENCES users(id),
  resolved_by     UUID REFERENCES users(id),
  resolution_notes TEXT,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_by UUID, updated_by UUID, deleted_at TIMESTAMPTZ,
  is_active  BOOLEAN NOT NULL DEFAULT TRUE
);

CREATE INDEX IF NOT EXISTS idx_mdl_machine ON machine_downtime_log(company_id, machine_id, started_at DESC);
CREATE INDEX IF NOT EXISTS idx_mdl_open    ON machine_downtime_log(machine_id) WHERE ended_at IS NULL;
DROP TRIGGER IF EXISTS trg_mdl_upd ON machine_downtime_log;
CREATE TRIGGER trg_mdl_upd BEFORE UPDATE ON machine_downtime_log
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
ALTER TABLE machine_downtime_log ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS mdl_tenant ON machine_downtime_log;
CREATE POLICY mdl_tenant ON machine_downtime_log
  USING (company_id = (auth.jwt() ->> 'company_id')::UUID)
  WITH CHECK (company_id = (auth.jwt() ->> 'company_id')::UUID);
DROP TRIGGER IF EXISTS trg_audit_mdl ON machine_downtime_log;
CREATE TRIGGER trg_audit_mdl AFTER INSERT OR UPDATE OR DELETE ON machine_downtime_log
  FOR EACH ROW EXECUTE FUNCTION log_audit_event();

-- ─── SCHEDULED / COMPLETED MAINTENANCE ───────────────────────────────────────
CREATE TABLE IF NOT EXISTS machine_maintenance_log (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id      UUID NOT NULL REFERENCES companies(id),
  machine_id      UUID NOT NULL REFERENCES machines(id) ON DELETE CASCADE,
  maintenance_type TEXT NOT NULL CHECK (maintenance_type IN
                    ('preventive','corrective','inspection','calibration','other')),
  status          TEXT NOT NULL DEFAULT 'scheduled' CHECK (status IN ('scheduled','in_progress','completed','cancelled')),
  scheduled_date  DATE,
  completed_date  DATE,
  description     TEXT NOT NULL,
  performed_by    TEXT,                                 -- often an outside technician, not a system user
  cost            NUMERIC(12,2),
  next_due_date   DATE,                                  -- for recurring preventive maintenance
  notes           TEXT,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_by UUID, updated_by UUID, deleted_at TIMESTAMPTZ,
  is_active  BOOLEAN NOT NULL DEFAULT TRUE
);

CREATE INDEX IF NOT EXISTS idx_mml_machine ON machine_maintenance_log(company_id, machine_id, scheduled_date DESC);
CREATE INDEX IF NOT EXISTS idx_mml_due     ON machine_maintenance_log(company_id, next_due_date) WHERE status != 'completed';
DROP TRIGGER IF EXISTS trg_mml_upd ON machine_maintenance_log;
CREATE TRIGGER trg_mml_upd BEFORE UPDATE ON machine_maintenance_log
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
ALTER TABLE machine_maintenance_log ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS mml_tenant ON machine_maintenance_log;
CREATE POLICY mml_tenant ON machine_maintenance_log
  USING (company_id = (auth.jwt() ->> 'company_id')::UUID)
  WITH CHECK (company_id = (auth.jwt() ->> 'company_id')::UUID);
DROP TRIGGER IF EXISTS trg_audit_mml ON machine_maintenance_log;
CREATE TRIGGER trg_audit_mml AFTER INSERT OR UPDATE OR DELETE ON machine_maintenance_log
  FOR EACH ROW EXECUTE FUNCTION log_audit_event();

-- Closing a downtime entry (ended_at set) also flips the machine's own
-- status back, and computes duration_minutes atomically rather than trusting
-- a client-computed value.
CREATE OR REPLACE FUNCTION close_machine_downtime(
  p_company_id  UUID,
  p_downtime_id UUID,
  p_resolved_by UUID,
  p_resolution_notes TEXT DEFAULT NULL,
  p_new_machine_status TEXT DEFAULT 'idle'
)
RETURNS machine_downtime_log
LANGUAGE plpgsql
SECURITY INVOKER
AS $$
DECLARE
  v_row machine_downtime_log;
BEGIN
  UPDATE machine_downtime_log SET
    ended_at          = NOW(),
    duration_minutes  = EXTRACT(EPOCH FROM (NOW() - started_at)) / 60,
    resolved_by       = p_resolved_by,
    resolution_notes  = p_resolution_notes
  WHERE id = p_downtime_id AND company_id = p_company_id AND ended_at IS NULL
  RETURNING * INTO v_row;

  IF v_row.id IS NULL THEN
    RAISE EXCEPTION 'close_machine_downtime: no open downtime entry % for company %', p_downtime_id, p_company_id;
  END IF;

  UPDATE machines SET status = p_new_machine_status
  WHERE id = v_row.machine_id AND company_id = p_company_id;

  INSERT INTO machine_status_history (company_id, machine_id, status, reason, changed_by)
  VALUES (p_company_id, v_row.machine_id, p_new_machine_status, p_resolution_notes, p_resolved_by);

  RETURN v_row;
END;
$$;

NOTIFY pgrst, 'reload schema';
