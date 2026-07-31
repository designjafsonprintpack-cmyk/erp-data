-- ═══════════════════════════════════════════════════════════════════════════
-- THE MANAGER ROLE — a department's supervisor
-- ═══════════════════════════════════════════════════════════════════════════
-- WHAT WAS MISSING
--   The staff list Mehboob brought in has seven people whose title is
--   "Manager", and there was no role for any of them. `roles` had the operator
--   (`printing`, labelled Production Operator) and, since 119, the whole-floor
--   `production_manager` — but nobody in between: the person who runs ONE
--   department.
--
--   Mehboob described exactly two of them, and both descriptions are the spec:
--     Riaz Ahmad  — "manager role dy do, die cutting department ka manager hay"
--     Zahid Mahmood — "Manager ka role bana ker, yay plate making ko b dykhta
--                      hay aur board demand b dyta hy, dieline b banata hay"
--
--   So a Manager: runs the stages of their own department, can also make and
--   read plates, draws dielines (artwork), and can see what board is needed —
--   without owning the plan, the purchasing, or the money.
--
-- WHAT THIS DOES
--   Adds the `manager` role and its permission set. The slug `manager` was
--   already anticipated by the UI — ROLE_CFG and FALLBACK_ROLES in
--   UsersClient.tsx have carried it since before this — so nothing in the
--   frontend has to change for the label and colour to appear.
--
-- WHERE THE LINE IS, AND WHY
--   Manager sits BELOW production_manager, and 120 drew the money line at
--   production_manager ("production wale rates na dekh saken"). So a Manager
--   gets **no money scope at all** — not `money`, not `money_sales`, not
--   `money_purchase`. They can open Board Inventory and see how much board
--   there is; they cannot see what it cost.
--
--   No `delete`, no `settings`, no `admin`, no `users` — 105's rule for every
--   operational role. No `approve`/`reject` either: passing an inspection is
--   QC's job, and a department manager signing off their own department's work
--   is the separation 105 was written to protect.
--
--   Deliberately NOT granted: quotations, sales_orders, customers, purchase,
--   vendors, finance. A die-cutting manager has no business in the order book.
--
-- DEPENDS ON
--   005 (permissions/roles/role_permissions) and 095 (the users.role →
--   user_roles sync trigger — that trigger matching on `slug` is what makes a
--   user set to 'manager' actually pick these permissions up).
--   Independent of 119 and 120; order does not matter.
--
-- HOW TO UNDO
--   DELETE FROM user_roles WHERE role_id IN
--     (SELECT id FROM roles WHERE company_id = '00000000-0000-0000-0000-000000000001'
--        AND slug = 'manager');
--   DELETE FROM role_permissions WHERE role_id IN
--     (SELECT id FROM roles WHERE company_id = '00000000-0000-0000-0000-000000000001'
--        AND slug = 'manager');
--   DELETE FROM roles WHERE company_id = '00000000-0000-0000-0000-000000000001'
--     AND slug = 'manager';
--   Any user still set to role = 'manager' would then have no permissions —
--   move them to another role first.
--
-- MIGRATION RISK
--   Purely additive and idempotent. No existing role loses anything, no
--   permission is revoked, no table is altered, no backfill, nothing locks.
--   Every insert is guarded, so re-running changes nothing — including a
--   permission switched OFF by hand in Settings, which the UI stores as
--   is_active = FALSE rather than deleting the row.
-- ═══════════════════════════════════════════════════════════════════════════

DO $$
DECLARE
  cid UUID := '00000000-0000-0000-0000-000000000001';
BEGIN
  -- ─── 1. THE ROLE ──────────────────────────────────────────────────────────
  INSERT INTO roles (company_id, name, slug, description, is_system_role)
  SELECT cid, 'Manager', 'manager',
         'Runs one department: its production stages, plus plates, dielines and board demand. Sees no rates or cost — that starts at Production Manager.',
         FALSE
  WHERE NOT EXISTS (
    SELECT 1 FROM roles r
     WHERE r.company_id = cid AND r.slug = 'manager' AND r.deleted_at IS NULL
  );

  -- ─── 2. ITS PERMISSIONS ───────────────────────────────────────────────────
  INSERT INTO role_permissions (company_id, role_id, permission_id)
  SELECT cid, r.id, p.id
  FROM roles r
  CROSS JOIN permissions p
  WHERE r.company_id = cid AND r.slug = 'manager' AND r.deleted_at IS NULL
    AND p.company_id = cid AND p.deleted_at IS NULL
    AND (
         -- Runs the floor. All six stage modules, because the `printing` role
         -- already covers lamination → packing as one job (105) and a manager
         -- of any of those departments needs the same reach.
         (p.module = 'production'     AND p.action IN ('view','create','edit'))
      OR (p.module = 'printing'       AND p.action IN ('view','create','edit'))
      OR (p.module = 'lamination'     AND p.action IN ('view','create','edit'))
      OR (p.module = 'die_cutting'    AND p.action IN ('view','create','edit'))
      OR (p.module = 'hot_foil'       AND p.action IN ('view','create','edit'))
      OR (p.module = 'folder_gluing'  AND p.action IN ('view','create','edit'))
      OR (p.module = 'packing'        AND p.action IN ('view','create','edit'))
         -- "plate making ko b dykhta hay" — makes and issues plates.
      OR (p.module = 'plates'         AND p.action IN ('view','create','edit','print','export'))
         -- "dieline b banata hay" — artwork is where a dieline lives.
      OR (p.module = 'artwork'        AND p.action IN ('view','create','edit','print'))
         -- "board demand b dyta hy" — sees the stock and what jobs need, but
         -- cannot move it (that is Store) or buy it (that is Purchase).
      OR (p.module = 'board_inventory'AND p.action IN ('view','print'))
      OR (p.module = 'store'          AND p.action IN ('view','print'))
         -- The work itself.
      OR (p.module = 'jobs'           AND p.action IN ('view','edit','print','export'))
      OR (p.module = 'planning'       AND p.action IN ('view','print'))
      OR (p.module = 'machines'       AND p.action IN ('view'))
      OR (p.module = 'workflow'       AND p.action IN ('view'))
      OR (p.module = 'qc'             AND p.action IN ('view','print'))
      OR (p.module = 'dispatch'       AND p.action IN ('view','print'))
      OR (p.module = 'dashboard'      AND p.action IN ('view'))
      OR (p.module = 'reports'        AND p.action IN ('view','print','export'))
    )
    AND NOT EXISTS (
      SELECT 1 FROM role_permissions rp
       WHERE rp.role_id = r.id AND rp.permission_id = p.id
    );
END $$;

NOTIFY pgrst, 'reload schema';
