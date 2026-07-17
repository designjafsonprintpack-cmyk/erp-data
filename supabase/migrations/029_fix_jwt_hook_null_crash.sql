-- ══════════════════════════════════════════════════════════════════════════════
-- JAFSON PRINT ERP — MIGRATION 029: FIX custom_access_token_hook NULL crash
--
-- The hook used chained jsonb_set() calls to add claims. jsonb_set() is a
-- STRICT function — if any argument is NULL (e.g. a user's department_id is
-- NULL, which is normal for users with no department assigned), the whole
-- call returns NULL, which then poisons every subsequent jsonb_set() in the
-- chain and makes the hook return NULL entirely. Supabase then rejects the
-- token with "output claims do not conform to the expected schema" and the
-- user cannot log in at all.
--
-- Fix: jsonb_build_object + the || merge operator, which encode NULL field
-- values as JSON null instead of erroring. Source also updated in
-- 002_auth_users.sql for future fresh installs.
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
      'role',          user_rec.role,
      'department_id', user_rec.department_id::TEXT,
      'full_name',     user_rec.full_name,
      'user_table_id', user_rec.user_table_id::TEXT
    );
  END IF;

  RETURN jsonb_set(event, '{claims}', claims);
END;
$$ LANGUAGE plpgsql STABLE SECURITY DEFINER;

NOTIFY pgrst, 'reload schema';
