-- ══════════════════════════════════════════════════════════════════════════════
-- JAFSON PRINT ERP — MIGRATION 028: WASTAGE TRACKING
-- Printing-industry cost-control feature — was missing entirely from the
-- schema despite being on the required feature checklist. Follows the same
-- pattern as delay_reasons (company-scoped lookup table + soft delete).
-- ══════════════════════════════════════════════════════════════════════════════

CREATE TABLE wastage_reasons (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id  UUID NOT NULL REFERENCES companies(id),
  name        TEXT NOT NULL,
  category    TEXT NOT NULL DEFAULT 'general'
              CHECK (category IN ('setup','machine_fault','material_defect','operator_error','color_mismatch','damaged','general')),
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_by  UUID, updated_by UUID, deleted_at TIMESTAMPTZ,
  is_active   BOOLEAN NOT NULL DEFAULT TRUE,
  UNIQUE (company_id, name)
);

CREATE INDEX idx_wastage_reasons_company ON wastage_reasons(company_id);
CREATE TRIGGER trg_wastage_reasons_upd BEFORE UPDATE ON wastage_reasons FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
ALTER TABLE wastage_reasons ENABLE ROW LEVEL SECURITY;
CREATE POLICY wastage_reasons_tenant ON wastage_reasons USING (company_id = (auth.jwt() ->> 'company_id')::UUID);

INSERT INTO wastage_reasons (company_id, name, category) VALUES
  ('00000000-0000-0000-0000-000000000001', 'Machine Setup Waste',      'setup'),
  ('00000000-0000-0000-0000-000000000001', 'Machine Fault / Jam',      'machine_fault'),
  ('00000000-0000-0000-0000-000000000001', 'Material Defect',         'material_defect'),
  ('00000000-0000-0000-0000-000000000001', 'Operator Error',           'operator_error'),
  ('00000000-0000-0000-0000-000000000001', 'Colour / Print Mismatch',  'color_mismatch'),
  ('00000000-0000-0000-0000-000000000001', 'Torn / Damaged Sheet',     'damaged'),
  ('00000000-0000-0000-0000-000000000001', 'Other',                    'general');

-- ─── WASTAGE RECORDS ────────────────────────────────────────────────────────
CREATE TABLE job_wastage (
  id                 UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id         UUID NOT NULL REFERENCES companies(id),
  job_id             UUID NOT NULL REFERENCES jobs(id) ON DELETE CASCADE,
  stage_progress_id  UUID REFERENCES job_stage_progress(id),
  machine_id         UUID REFERENCES machines(id),
  wastage_reason_id  UUID NOT NULL REFERENCES wastage_reasons(id),
  quantity            NUMERIC(12,2) NOT NULL CHECK (quantity > 0),
  notes              TEXT,
  recorded_by        UUID REFERENCES users(id),
  occurred_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_at         TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at         TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_by UUID, updated_by UUID, deleted_at TIMESTAMPTZ,
  is_active  BOOLEAN NOT NULL DEFAULT TRUE
);

CREATE INDEX idx_job_wastage_job     ON job_wastage(job_id, occurred_at DESC);
CREATE INDEX idx_job_wastage_company ON job_wastage(company_id, occurred_at DESC);
CREATE INDEX idx_job_wastage_machine ON job_wastage(machine_id);
CREATE TRIGGER trg_job_wastage_upd BEFORE UPDATE ON job_wastage FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
ALTER TABLE job_wastage ENABLE ROW LEVEL SECURITY;
CREATE POLICY job_wastage_tenant ON job_wastage USING (company_id = (auth.jwt() ->> 'company_id')::UUID);
CREATE TRIGGER trg_audit_job_wastage AFTER INSERT OR UPDATE OR DELETE ON job_wastage
  FOR EACH ROW EXECUTE FUNCTION log_audit_event();

-- ─── REPORT: WASTAGE SUMMARY (for Reports module, same pattern as report_*) ──
CREATE OR REPLACE VIEW report_wastage_summary AS
SELECT
  jw.company_id,
  DATE_TRUNC('month', jw.occurred_at)  AS month,
  TO_CHAR(jw.occurred_at, 'Mon YYYY')  AS month_label,
  wr.category                          AS reason_category,
  wr.name                              AS reason_name,
  m.name                               AS machine_name,
  COUNT(*)                             AS wastage_events,
  COALESCE(SUM(jw.quantity), 0)        AS total_quantity
FROM job_wastage jw
JOIN wastage_reasons wr ON wr.id = jw.wastage_reason_id
LEFT JOIN machines m ON m.id = jw.machine_id
WHERE jw.deleted_at IS NULL
GROUP BY jw.company_id, DATE_TRUNC('month', jw.occurred_at), TO_CHAR(jw.occurred_at, 'Mon YYYY'), wr.category, wr.name, m.name
ORDER BY month DESC;

ALTER VIEW report_wastage_summary SET (security_invoker = true);

-- ─── FIX: machine_floor_status had the same RLS-bypass gap as the report_*
-- views (noted in the audit) — it's a view with no RLS of its own, created by
-- a role that bypasses RLS on the underlying tables. Close it the same way.
ALTER VIEW machine_floor_status SET (security_invoker = true);

-- Let wastage entries show up in the job timeline alongside hold/resume/etc.
ALTER TABLE job_stage_events DROP CONSTRAINT job_stage_events_event_type_check;
ALTER TABLE job_stage_events ADD CONSTRAINT job_stage_events_event_type_check
  CHECK (event_type IN (
    'created','status_changed','stage_started','stage_completed',
    'stage_skipped','hold_started','hold_ended','remark_added',
    'artwork_uploaded','repeat_created','assigned','priority_changed',
    'wastage_recorded'
  ));

NOTIFY pgrst, 'reload schema';
