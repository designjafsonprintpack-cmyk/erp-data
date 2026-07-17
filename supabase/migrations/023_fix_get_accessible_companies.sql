-- ══════════════════════════════════════════════════════════════════════════════
-- JAFSON PRINT ERP — MIGRATION 023: FIX get_accessible_companies()
-- 021_admin.sql referenced a column `u.app_role` that does not exist on the
-- users table (the real column is `role`) — this patches the already-deployed
-- function. The fix has also been applied directly in 021_admin.sql for any
-- future fresh installs.
-- ══════════════════════════════════════════════════════════════════════════════

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
    u.role
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
    WHERE u2.id = p_user_id AND u2.role IN ('superadmin','super_admin')
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

NOTIFY pgrst, 'reload schema';
