-- ══════════════════════════════════════════════════════════════════════════════
-- JAFSON PRINT ERP — MIGRATION 096
-- Seed the missing `plates` permission module, and give admin / artwork /
-- planning their default permission sets
--
-- WHAT WAS BROKEN
--   1. Migration 005 seeded role_permissions for superadmin, owner, sales,
--      store, printing and dispatch — and nothing at all for `admin`,
--      `artwork` and `planning`. Those three roles have existed since 002 with
--      ZERO permissions, so every permission-checked API route returned 403 for
--      them. It went unnoticed because has_permission() hard-bypasses
--      superadmin and owner, which is what the office has been logging in as.
--   2. `plates` is missing from the permissions table entirely. 005 seeded a
--      fixed list of 27 modules and `plates` was not one of them, yet
--      src/app/api/v1/**/plates/* calls requirePermission(..., 'plates', ...).
--      With no permission rows to grant, that check could never pass for anyone
--      outside the superadmin/owner bypass, and Settings → Roles & Permissions
--      could not even display the module to fix it by hand.
--
-- WHAT THIS DOES
--   • Adds the 9 `plates` (module, action) rows, using 005's label format.
--   • Grants admin / artwork / planning a sensible starting set (below).
--   All of it is editable afterwards in Settings → Roles & Permissions.
--
-- SAFETY
--   Purely additive. Every insert is ON CONFLICT DO NOTHING, so a permission
--   that has already been switched OFF in the matrix (the UI sets is_active =
--   FALSE rather than deleting the row) stays off if this is ever re-run.
--   Nothing is revoked and no existing role is touched.
--
-- HOW TO UNDO
--   DELETE FROM role_permissions WHERE role_id IN
--     (SELECT id FROM roles WHERE company_id = '00000000-0000-0000-0000-000000000001'
--        AND slug IN ('admin','artwork','planning'));
--   DELETE FROM role_permissions WHERE permission_id IN
--     (SELECT id FROM permissions WHERE module = 'plates');
--   DELETE FROM permissions WHERE module = 'plates';
-- ══════════════════════════════════════════════════════════════════════════════

-- ─── 1. THE MISSING `plates` MODULE ───────────────────────────────────────────
DO $$
DECLARE
  cid UUID := '00000000-0000-0000-0000-000000000001';
  actions TEXT[] := ARRAY['view','create','edit','delete','approve','reject','print','export','settings'];
  a TEXT;
BEGIN
  FOREACH a IN ARRAY actions LOOP
    INSERT INTO permissions (company_id, module, action, label)
    VALUES (cid, 'plates', a, 'Plates — ' || initcap(a))
    ON CONFLICT (company_id, module, action) DO NOTHING;
  END LOOP;
END $$;

-- Roles that already hold "everything" must pick the new module up too,
-- otherwise plates silently stays locked for CEO and for a matrix-driven
-- superadmin/owner check.
INSERT INTO role_permissions (company_id, role_id, permission_id)
SELECT '00000000-0000-0000-0000-000000000001', r.id, p.id
FROM roles r
CROSS JOIN permissions p
WHERE r.company_id = '00000000-0000-0000-0000-000000000001'
  AND r.slug IN ('superadmin', 'owner', 'ceo')
  AND p.company_id = r.company_id
  AND p.module = 'plates'
ON CONFLICT DO NOTHING;

-- GM keeps its 095 rule: everything except delete.
INSERT INTO role_permissions (company_id, role_id, permission_id)
SELECT '00000000-0000-0000-0000-000000000001', r.id, p.id
FROM roles r
CROSS JOIN permissions p
WHERE r.company_id = '00000000-0000-0000-0000-000000000001'
  AND r.slug = 'gm'
  AND p.company_id = r.company_id
  AND p.module = 'plates'
  AND p.action <> 'delete'
ON CONFLICT DO NOTHING;

-- ─── 2. ADMIN — office / system administrator ─────────────────────────────────
-- Runs the system day to day: users, settings, master data, and fixing the
-- data-entry mistakes nobody else can. Everything EXCEPT the `admin` module,
-- which is the multi-company/superadmin screen.
INSERT INTO role_permissions (company_id, role_id, permission_id)
SELECT '00000000-0000-0000-0000-000000000001', r.id, p.id
FROM roles r
CROSS JOIN permissions p
WHERE r.company_id = '00000000-0000-0000-0000-000000000001'
  AND r.slug = 'admin'
  AND p.company_id = r.company_id
  AND p.deleted_at IS NULL
  AND p.module <> 'admin'
ON CONFLICT DO NOTHING;

-- ─── 3. ARTWORK — the design desk ─────────────────────────────────────────────
-- Owns artwork and plates; reads the paperwork it designs from. No deletes.
INSERT INTO role_permissions (company_id, role_id, permission_id)
SELECT '00000000-0000-0000-0000-000000000001', r.id, p.id
FROM roles r
CROSS JOIN permissions p
WHERE r.company_id = '00000000-0000-0000-0000-000000000001'
  AND r.slug = 'artwork'
  AND p.company_id = r.company_id
  AND (
    -- Full control of its own two modules, including customer approve/reject.
    (p.module IN ('artwork','plates')
       AND p.action IN ('view','create','edit','approve','reject','print','export'))
    -- Works on the job, but does not create or price one.
    OR (p.module = 'jobs'      AND p.action IN ('view','edit','print','export'))
    OR (p.module = 'reports'   AND p.action IN ('view','print','export'))
    -- Read-only context: whose job is this, what was quoted, what did QC say.
    OR (p.module IN ('dashboard','customers','quotations','sales_orders','qc')
       AND p.action = 'view')
    OR (p.module = 'quotations' AND p.action = 'print')
  )
ON CONFLICT DO NOTHING;

-- ─── 4. PLANNING — production planning ────────────────────────────────────────
-- Schedules the work and moves it through the workflow. No deletes.
INSERT INTO role_permissions (company_id, role_id, permission_id)
SELECT '00000000-0000-0000-0000-000000000001', r.id, p.id
FROM roles r
CROSS JOIN permissions p
WHERE r.company_id = '00000000-0000-0000-0000-000000000001'
  AND r.slug = 'planning'
  AND p.company_id = r.company_id
  AND (
    (p.module = 'planning'
       AND p.action IN ('view','create','edit','approve','print','export'))
    OR (p.module = 'jobs'     AND p.action IN ('view','create','edit','print','export'))
    -- Drives the shop floor stages and the machine schedule.
    OR (p.module IN ('workflow','production','machines')
       AND p.action IN ('view','edit'))
    OR (p.module IN ('printing','lamination','die_cutting','hot_foil','folder_gluing','packing')
       AND p.action IN ('view','edit'))
    OR (p.module = 'reports'  AND p.action IN ('view','print','export'))
    -- Read-only: can I actually start this? board on hand, plates ready,
    -- what was ordered, what QC found.
    OR (p.module IN ('dashboard','board_inventory','store','plates','purchase',
                     'qc','customers','sales_orders','quotations','dispatch')
       AND p.action = 'view')
  )
ON CONFLICT DO NOTHING;

NOTIFY pgrst, 'reload schema';
