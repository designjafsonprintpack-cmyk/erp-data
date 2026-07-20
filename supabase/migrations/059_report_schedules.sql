-- ═══════════════════════════════════════════════════════════════════════════
-- REPORTS — SCHEDULED EMAIL DELIVERY
-- ═══════════════════════════════════════════════════════════════════════════
-- Recipients and cadence for automatically emailing a report. The actual
-- sending is driven by a Vercel Cron job hitting /api/cron/send-scheduled-
-- reports once a day — this table just holds what's due and when it was
-- last sent, so the cron endpoint can determine which schedules fire today
-- without needing its own state.
-- ═══════════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS report_schedules (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id     UUID NOT NULL REFERENCES companies(id),
  report_type    TEXT NOT NULL CHECK (report_type IN
                   ('kpi','monthly_production','customer_sales','financial','machines','qc','overdue')),
  frequency      TEXT NOT NULL CHECK (frequency IN ('daily','weekly','monthly')),
  recipients     TEXT[] NOT NULL,          -- email addresses
  is_active      BOOLEAN NOT NULL DEFAULT TRUE,
  last_sent_at   TIMESTAMPTZ,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_by UUID, updated_by UUID, deleted_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_rs_company ON report_schedules(company_id) WHERE is_active = TRUE;
DROP TRIGGER IF EXISTS trg_rs_upd ON report_schedules;
CREATE TRIGGER trg_rs_upd BEFORE UPDATE ON report_schedules
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
ALTER TABLE report_schedules ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS rs_tenant ON report_schedules;
CREATE POLICY rs_tenant ON report_schedules
  USING (company_id = (auth.jwt() ->> 'company_id')::UUID)
  WITH CHECK (company_id = (auth.jwt() ->> 'company_id')::UUID);

NOTIFY pgrst, 'reload schema';
