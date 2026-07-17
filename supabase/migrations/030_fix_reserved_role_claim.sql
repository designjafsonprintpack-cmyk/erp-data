-- ══════════════════════════════════════════════════════════════════════════════
-- JAFSON PRINT ERP — MIGRATION 030: FIX RESERVED 'role' JWT CLAIM
--
-- custom_access_token_hook set a top-level 'role' claim to the user's
-- application role (e.g. 'superadmin'). The top-level 'role' claim in a
-- Supabase JWT is RESERVED — PostgREST reads it to decide which Postgres
-- database role to connect as for that request. Since no Postgres role
-- literally named 'superadmin' (or 'sales', 'staff', etc.) exists, PostgREST
-- fails every query for that user with "role \"<value>\" does not exist".
--
-- Fix: rename the claim to 'app_role'. The application code already expects
-- this name (src/modules/settings/permissions/hooks/usePermission.ts and
-- src/app/api/v1/admin/companies/route.ts read claims.app_role, not
-- claims.role) — this migration makes the hook actually match that.
-- ══════════════════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION public.custom_access_token_hook(event JSONB)
RETURNS JSONB AS $$
DECLARE
  claims    JSONB;
  user_rec  RECORD;
BEGIN
  SELECT u.company_id, u.role, u.department_id, u.full_name, u.id AS user_table_id
  INTO user_rec
  FROM public.users u
  WHERE u.auth_user_id = (event ->> 'user_id')::UUID
    AND u.deleted_at IS NULL
    AND u.is_active = TRUE
  LIMIT 1;

  claims := COALESCE(event -> 'claims', '{}'::jsonb);

  IF user_rec.company_id IS NOT NULL THEN
    claims := claims || jsonb_build_object(
      'company_id',    user_rec.company_id::TEXT,
      'app_role',      user_rec.role,
      'department_id', user_rec.department_id::TEXT,
      'full_name',     user_rec.full_name,
      'user_table_id', user_rec.user_table_id::TEXT
    );
  END IF;

  RETURN jsonb_set(event, '{claims}', claims);
END;
$$ LANGUAGE plpgsql STABLE SECURITY DEFINER;

NOTIFY pgrst, 'reload schema';
