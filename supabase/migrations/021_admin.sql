-- ══════════════════════════════════════════════════════════════════════════════
-- JAFSON PRINT ERP — MIGRATION 021: ADMIN & MULTI-TENANT
-- Phase 53 — User Management
-- Phase 54 — Branch-wise Access Control
-- Phase 55 — Multi-company Setup
-- Phase 56 — System Settings & Audit
-- ══════════════════════════════════════════════════════════════════════════════

-- ─── USER BRANCH ACCESS (Phase 54) ───────────────────────────────────────────
-- Controls which branches a user can access within their company
CREATE TABLE IF NOT EXISTS user_branch_access (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id  UUID NOT NULL REFERENCES companies(id),
  user_id     UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  branch_id   UUID NOT NULL REFERENCES branches(id) ON DELETE CASCADE,
  can_view    BOOLEAN NOT NULL DEFAULT TRUE,
  can_create  BOOLEAN NOT NULL DEFAULT FALSE,
  can_edit    BOOLEAN NOT NULL DEFAULT FALSE,
  granted_by  UUID REFERENCES users(id),
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  is_active   BOOLEAN NOT NULL DEFAULT TRUE,
  UNIQUE (company_id, user_id, branch_id)
);

CREATE INDEX IF NOT EXISTS idx_uba_user   ON user_branch_access(user_id);
CREATE INDEX IF NOT EXISTS idx_uba_branch ON user_branch_access(branch_id);
DROP TRIGGER IF EXISTS trg_uba_upd ON user_branch_access;
CREATE TRIGGER trg_uba_upd BEFORE UPDATE ON user_branch_access
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
ALTER TABLE user_branch_access ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS uba_tenant ON user_branch_access;
CREATE POLICY uba_tenant ON user_branch_access
  USING (company_id = (auth.jwt() ->> 'company_id')::UUID);

-- ─── SYSTEM SETTINGS (Phase 56) ──────────────────────────────────────────────
-- Key-value store for company-level settings
CREATE TABLE IF NOT EXISTS system_settings (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id  UUID NOT NULL REFERENCES companies(id),
  key         TEXT NOT NULL,
  value       TEXT,
  category    TEXT NOT NULL DEFAULT 'general',
  -- categories: 'general','notifications','finance','production','dispatch'
  description TEXT,
  updated_by  UUID REFERENCES users(id),
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (company_id, key)
);

CREATE INDEX IF NOT EXISTS idx_ss_company ON system_settings(company_id, category);
DROP TRIGGER IF EXISTS trg_ss_upd ON system_settings;
CREATE TRIGGER trg_ss_upd BEFORE UPDATE ON system_settings
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
ALTER TABLE system_settings ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS ss_tenant ON system_settings;
CREATE POLICY ss_tenant ON system_settings
  USING (company_id = (auth.jwt() ->> 'company_id')::UUID);
DROP TRIGGER IF EXISTS trg_audit_ss ON system_settings;
CREATE TRIGGER trg_audit_ss AFTER INSERT OR UPDATE OR DELETE ON system_settings
  FOR EACH ROW EXECUTE FUNCTION log_audit_event();

-- ─── ACTIVITY LOG VIEW (for admin audit trail) ────────────────────────────────
CREATE OR REPLACE VIEW admin_audit_trail AS
SELECT
  al.id,
  al.company_id,
  al.table_name,
  al.record_id,
  al.action,
  al.old_values,
  al.new_values,
  al.changed_at    AS performed_at,
  u.full_name      AS performed_by_name,
  u.email          AS performed_by_email
FROM audit_log al
LEFT JOIN users u ON u.id = al.changed_by
ORDER BY al.changed_at DESC;

-- ─── MULTI-COMPANY HELPER FUNCTION ───────────────────────────────────────────
-- Returns all companies a superadmin can access
CREATE OR REPLACE FUNCTION get_accessible_companies(p_user_id UUID)
RETURNS TABLE (
  company_id   UUID,
  company_name TEXT,
  is_primary   BOOLEAN,
  user_role    TEXT
) AS $$
BEGIN
  RETURN QUERY
  SELECT
    c.id,
    c.name,
    (u.company_id = c.id) AS is_primary,
    u.app_role
  FROM users u
  JOIN companies c ON c.id = u.company_id
  WHERE u.id = p_user_id
  UNION
  -- Superadmins can see all companies
  SELECT
    c2.id,
    c2.name,
    FALSE,
    'superadmin'::TEXT
  FROM companies c2
  WHERE EXISTS (
    SELECT 1 FROM users u2
    WHERE u2.id = p_user_id AND u2.app_role IN ('superadmin','super_admin')
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ─── SEED: DEFAULT SYSTEM SETTINGS ───────────────────────────────────────────
INSERT INTO system_settings (company_id, key, value, category, description) VALUES
  ('00000000-0000-0000-0000-000000000001', 'company_name',        'Jafson Print Pack',  'general',      'Company display name'),
  ('00000000-0000-0000-0000-000000000001', 'company_phone',       '+92 42 0000000',     'general',      'Primary phone number'),
  ('00000000-0000-0000-0000-000000000001', 'company_address',     'Lahore, Pakistan',   'general',      'Company address'),
  ('00000000-0000-0000-0000-000000000001', 'company_ntn',         '',                   'general',      'NTN number for invoices'),
  ('00000000-0000-0000-0000-000000000001', 'company_strn',        '',                   'general',      'STRN number'),
  ('00000000-0000-0000-0000-000000000001', 'invoice_prefix',      'INV',                'finance',      'Invoice number prefix'),
  ('00000000-0000-0000-0000-000000000001', 'default_tax_pct',     '0',                  'finance',      'Default GST/tax percentage'),
  ('00000000-0000-0000-0000-000000000001', 'default_payment_terms','30',                'finance',      'Default payment terms (days)'),
  ('00000000-0000-0000-0000-000000000001', 'low_stock_alerts',    'true',               'production',   'Enable low stock notifications'),
  ('00000000-0000-0000-0000-000000000001', 'job_auto_assign',     'false',              'production',   'Auto-assign jobs to default workflow'),
  ('00000000-0000-0000-0000-000000000001', 'dispatch_sms',        'false',              'dispatch',     'Send SMS on dispatch'),
  ('00000000-0000-0000-0000-000000000001', 'qc_mandatory',        'true',               'production',   'QC mandatory before dispatch'),
  ('00000000-0000-0000-0000-000000000001', 'currency_symbol',     'PKR',                'finance',      'Currency symbol'),
  ('00000000-0000-0000-0000-000000000001', 'date_format',         'DD/MM/YYYY',         'general',      'Display date format'),
  ('00000000-0000-0000-0000-000000000001', 'fiscal_year_start',   '07',                 'finance',      'Fiscal year start month (01-12)')
ON CONFLICT (company_id, key) DO NOTHING;

NOTIFY pgrst, 'reload schema';
