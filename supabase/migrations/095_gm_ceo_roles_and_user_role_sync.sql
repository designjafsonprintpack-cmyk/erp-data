-- ══════════════════════════════════════════════════════════════════════════════
-- JAFSON PRINT ERP — MIGRATION 095
-- GM + CEO roles, and keep user_roles in sync with users.role
--
-- WHAT WAS BROKEN / MISSING
--   1. There was no General Manager or CEO role. 002 seeded superadmin, admin,
--      owner, sales, artwork, planning, store, printing, dispatch — nothing for
--      the two people who sit above operations.
--   2. Nothing in the app has ever written to `user_roles`. The New User API
--      (src/app/api/v1/admin/users/route.ts) sets `users.role` (the text slug
--      the JWT hook reads) but never creates the user_roles link row that
--      has_permission() joins through. Result: every role except superadmin and
--      owner — which has_permission() hard-bypasses — resolves to ZERO
--      permissions server-side. That was invisible until now only because those
--      two roles cover almost everyone; a GM or CEO user created today would be
--      locked out of every permission-checked API route.
--
-- WHAT THIS DOES
--   • Seeds roles `gm` (General Manager) and `ceo`.
--   • CEO gets every permission (same reach as owner).
--   • GM gets every permission EXCEPT `delete` on anything and the whole
--     `admin` module — day-to-day operational authority, but record deletion
--     and company/system administration stay with owner/superadmin.
--     Both are fully editable afterwards in Settings → Roles & Permissions.
--   • Backfills user_roles from users.role for every existing user, and adds a
--     trigger so the link row is created/updated automatically from now on.
--
-- HOW TO UNDO
--   DROP TRIGGER trg_users_sync_user_role ON public.users;
--   DROP FUNCTION public.sync_user_role_link();
--   DELETE FROM role_permissions WHERE role_id IN
--     (SELECT id FROM roles WHERE slug IN ('gm','ceo'));
--   DELETE FROM user_roles     WHERE role_id IN
--     (SELECT id FROM roles WHERE slug IN ('gm','ceo'));
--   DELETE FROM roles WHERE slug IN ('gm','ceo');
--   -- (the backfilled user_roles rows for pre-existing roles are harmless and
--   --  can be left; they only ever grant what the permission matrix already says)
-- ══════════════════════════════════════════════════════════════════════════════

-- ─── 1. SEED THE TWO ROLES ────────────────────────────────────────────────────
INSERT INTO roles (company_id, name, slug, description, is_system_role) VALUES
  ('00000000-0000-0000-0000-000000000001', 'CEO',             'ceo', 'Chief Executive — full access across every module', TRUE),
  ('00000000-0000-0000-0000-000000000001', 'General Manager', 'gm',  'Runs day-to-day operations; cannot delete records or change system administration', TRUE)
ON CONFLICT (company_id, slug) DO UPDATE
  SET name = EXCLUDED.name, description = EXCLUDED.description, is_active = TRUE, deleted_at = NULL;

-- ─── 2. CEO — every permission ────────────────────────────────────────────────
INSERT INTO role_permissions (company_id, role_id, permission_id)
SELECT '00000000-0000-0000-0000-000000000001', r.id, p.id
FROM roles r
CROSS JOIN permissions p
WHERE r.company_id = '00000000-0000-0000-0000-000000000001'
  AND r.slug = 'ceo'
  AND p.company_id = '00000000-0000-0000-0000-000000000001'
  AND p.deleted_at IS NULL
ON CONFLICT DO NOTHING;

-- ─── 3. GM — everything except delete, and except the admin module ────────────
INSERT INTO role_permissions (company_id, role_id, permission_id)
SELECT '00000000-0000-0000-0000-000000000001', r.id, p.id
FROM roles r
CROSS JOIN permissions p
WHERE r.company_id = '00000000-0000-0000-0000-000000000001'
  AND r.slug = 'gm'
  AND p.company_id = '00000000-0000-0000-0000-000000000001'
  AND p.deleted_at IS NULL
  AND p.action <> 'delete'
  AND p.module <> 'admin'
ON CONFLICT DO NOTHING;

-- ─── 4. KEEP user_roles IN SYNC WITH users.role ───────────────────────────────
-- The app treats users.role as the single source of truth (it is what the JWT
-- hook publishes as app_role). user_roles exists purely so has_permission() and
-- the client-side permission hook can join to role_permissions. This function
-- mirrors one into the other: exactly one active link row per user, matching
-- their current slug.
CREATE OR REPLACE FUNCTION public.sync_user_role_link()
RETURNS TRIGGER AS $$
DECLARE
  v_role_id UUID;
BEGIN
  SELECT id INTO v_role_id
  FROM public.roles
  WHERE company_id = NEW.company_id
    AND slug = NEW.role
    AND deleted_at IS NULL
  LIMIT 1;

  -- Unknown slug (users.role is free text) — leave whatever is there alone
  -- rather than stripping the user of every permission.
  IF v_role_id IS NULL THEN
    RETURN NEW;
  END IF;

  -- Retire any other active link so the user carries one role, not a union.
  UPDATE public.user_roles
     SET is_active = FALSE, deleted_at = NOW()
   WHERE user_id = NEW.id
     AND role_id <> v_role_id
     AND deleted_at IS NULL;

  INSERT INTO public.user_roles (company_id, user_id, role_id)
  VALUES (NEW.company_id, NEW.id, v_role_id)
  ON CONFLICT (company_id, user_id, role_id) DO UPDATE
    SET is_active = TRUE, deleted_at = NULL, updated_at = NOW();

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS trg_users_sync_user_role ON public.users;
CREATE TRIGGER trg_users_sync_user_role
  AFTER INSERT OR UPDATE OF role ON public.users
  FOR EACH ROW EXECUTE FUNCTION public.sync_user_role_link();

-- ─── 5. BACKFILL EXISTING USERS ───────────────────────────────────────────────
INSERT INTO user_roles (company_id, user_id, role_id)
SELECT u.company_id, u.id, r.id
FROM public.users u
JOIN public.roles r
  ON r.company_id = u.company_id
 AND r.slug = u.role
 AND r.deleted_at IS NULL
WHERE u.deleted_at IS NULL
ON CONFLICT (company_id, user_id, role_id) DO UPDATE
  SET is_active = TRUE, deleted_at = NULL;

NOTIFY pgrst, 'reload schema';
