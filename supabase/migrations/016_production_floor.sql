-- ══════════════════════════════════════════════════════════════════════════════
-- JAFSON PRINT ERP — MIGRATION 016: PRODUCTION FLOOR
-- Phase 34 — Floor Dashboard
-- Phase 35 — Machine-wise Job Tracking
-- Phase 36 — Production Progress
-- ══════════════════════════════════════════════════════════════════════════════

-- ─── PRODUCTION JOB ASSIGNMENTS ───────────────────────────────────────────────
-- Assigns a job+stage to a specific machine & operator on the floor
CREATE TABLE production_assignments (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id          UUID NOT NULL REFERENCES companies(id),
  job_id              UUID NOT NULL REFERENCES jobs(id) ON DELETE CASCADE,
  machine_id          UUID NOT NULL REFERENCES machines(id),
  stage_progress_id   UUID REFERENCES job_stage_progress(id),
  operator_id         UUID REFERENCES users(id),
  status              TEXT NOT NULL DEFAULT 'queued'
                      CHECK (status IN ('queued','running','paused','completed','cancelled')),
  scheduled_start     TIMESTAMPTZ,
  actual_start        TIMESTAMPTZ,
  actual_end          TIMESTAMPTZ,
  estimated_minutes   INTEGER,
  actual_minutes      INTEGER,
  notes               TEXT,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_by UUID, updated_by UUID, deleted_at TIMESTAMPTZ,
  is_active   BOOLEAN NOT NULL DEFAULT TRUE
);

CREATE INDEX idx_pa_job      ON production_assignments(job_id);
CREATE INDEX idx_pa_machine  ON production_assignments(machine_id, status);
CREATE INDEX idx_pa_operator ON production_assignments(operator_id);
CREATE INDEX idx_pa_company  ON production_assignments(company_id, status);
CREATE TRIGGER trg_pa_upd BEFORE UPDATE ON production_assignments
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
ALTER TABLE production_assignments ENABLE ROW LEVEL SECURITY;
CREATE POLICY pa_tenant ON production_assignments
  USING (company_id = (auth.jwt() ->> 'company_id')::UUID);
CREATE TRIGGER trg_audit_pa AFTER INSERT OR UPDATE OR DELETE ON production_assignments
  FOR EACH ROW EXECUTE FUNCTION log_audit_event();

-- ─── PRODUCTION LOGS (append-only, per assignment) ────────────────────────────
-- Immutable event log per assignment: start, pause, resume, complete, notes
CREATE TABLE production_logs (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id      UUID NOT NULL REFERENCES companies(id),
  assignment_id   UUID NOT NULL REFERENCES production_assignments(id) ON DELETE CASCADE,
  job_id          UUID NOT NULL REFERENCES jobs(id),
  machine_id      UUID NOT NULL REFERENCES machines(id),
  event_type      TEXT NOT NULL
                  CHECK (event_type IN ('started','paused','resumed','completed','note_added','issue_reported')),
  notes           TEXT,
  quantity_done   NUMERIC(12,2),
  actor_id        UUID REFERENCES users(id),
  occurred_at     TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_pl_assignment ON production_logs(assignment_id, occurred_at DESC);
CREATE INDEX idx_pl_job        ON production_logs(job_id, occurred_at DESC);
CREATE INDEX idx_pl_machine    ON production_logs(machine_id, occurred_at DESC);
ALTER TABLE production_logs ENABLE ROW LEVEL SECURITY;
CREATE POLICY pl_read   ON production_logs FOR SELECT
  USING (company_id = (auth.jwt() ->> 'company_id')::UUID);
CREATE POLICY pl_insert ON production_logs FOR INSERT
  WITH CHECK (company_id = (auth.jwt() ->> 'company_id')::UUID);

-- ─── MACHINE STATUS VIEW ──────────────────────────────────────────────────────
-- Live view of what each machine is doing right now
CREATE OR REPLACE VIEW machine_floor_status AS
SELECT
  m.id           AS machine_id,
  m.name         AS machine_name,
  m.machine_type,
  m.is_active    AS machine_active,
  pa.id          AS assignment_id,
  pa.status      AS assignment_status,
  pa.job_id,
  j.job_number,
  j.job_title,
  j.priority     AS job_priority,
  j.required_date,
  c.name         AS customer_name,
  pa.operator_id,
  u.full_name    AS operator_name,
  pa.actual_start,
  pa.estimated_minutes,
  ws.name        AS stage_name,
  pa.company_id
FROM machines m
LEFT JOIN production_assignments pa
  ON pa.machine_id = m.id
  AND pa.status IN ('queued','running','paused')
  AND pa.deleted_at IS NULL
  AND pa.is_active = TRUE
LEFT JOIN jobs j ON j.id = pa.job_id
LEFT JOIN customers c ON c.id = j.customer_id
LEFT JOIN users u ON u.id = pa.operator_id
LEFT JOIN job_stage_progress jsp ON jsp.id = pa.stage_progress_id
LEFT JOIN workflow_stages ws ON ws.id = jsp.workflow_stage_id
WHERE m.is_active = TRUE;

NOTIFY pgrst, 'reload schema';
