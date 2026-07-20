-- ═══════════════════════════════════════════════════════════════════════════
-- CRM — LEAD SOURCE TRACKING & ACTIVITY TIMELINE
-- ═══════════════════════════════════════════════════════════════════════════

ALTER TABLE customers
  ADD COLUMN IF NOT EXISTS lead_source TEXT
    CHECK (lead_source IN ('referral','website','cold_call','exhibition','social_media','existing_customer','other'));

-- ─── ACTIVITY TIMELINE ────────────────────────────────────────────────────────
-- A manually-logged interaction (call, meeting, email, note) against a
-- customer. This is distinct from job_stage_events (which is job-specific,
-- system-generated, append-only) — activities are customer-relationship
-- level, manually entered, and editable/deletable by the person who logged
-- them (soft-delete, not append-only).
CREATE TABLE IF NOT EXISTS customer_activities (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id    UUID NOT NULL REFERENCES companies(id),
  customer_id   UUID NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
  activity_type TEXT NOT NULL CHECK (activity_type IN ('call','meeting','email','note','site_visit','other')),
  subject       TEXT NOT NULL,
  notes         TEXT,
  activity_date TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  logged_by     UUID REFERENCES users(id),
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_by UUID, updated_by UUID, deleted_at TIMESTAMPTZ,
  is_active  BOOLEAN NOT NULL DEFAULT TRUE
);

CREATE INDEX IF NOT EXISTS idx_ca_customer ON customer_activities(company_id, customer_id, activity_date DESC);
DROP TRIGGER IF EXISTS trg_ca_upd ON customer_activities;
CREATE TRIGGER trg_ca_upd BEFORE UPDATE ON customer_activities
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
ALTER TABLE customer_activities ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS ca_tenant ON customer_activities;
CREATE POLICY ca_tenant ON customer_activities
  USING (company_id = (auth.jwt() ->> 'company_id')::UUID)
  WITH CHECK (company_id = (auth.jwt() ->> 'company_id')::UUID);
DROP TRIGGER IF EXISTS trg_audit_ca ON customer_activities;
CREATE TRIGGER trg_audit_ca AFTER INSERT OR UPDATE OR DELETE ON customer_activities
  FOR EACH ROW EXECUTE FUNCTION log_audit_event();

NOTIFY pgrst, 'reload schema';
