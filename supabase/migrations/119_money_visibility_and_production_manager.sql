-- ═══════════════════════════════════════════════════════════════════════════
-- MONEY VISIBILITY + PRODUCTION MANAGER ROLE
-- ═══════════════════════════════════════════════════════════════════════════
-- WHAT WAS BROKEN
--   There was no way to hide a rupee figure from someone who legitimately
--   needs the page it sits on.
--
--   Module permissions gate whole PAGES, and that is all they have ever done.
--   The Finance page is behind `finance`, Costing Rates is behind `settings` —
--   those two are fine. But money is printed on pages that shop roles must be
--   able to open:
--     · Quotations / Sales Orders   — rate, amount, discount, grand total
--     · Purchase Orders             — rate, line amount, PO total
--     · Board Inventory / MRP       — unit cost, stock value, shortfall cost
--     · Customers                   — credit limit, outstanding, ledger
--     · Vendors                     — payable balance
--     · Jobs / Dispatch / Reports   — costing, margin, invoice value
--   Store, Purchase, Planning, Artwork, Plates, QC and Dispatch all have view
--   rights on at least one of those, so every one of them could read the
--   company's rates and margins. Mehboob's instruction: price sirf accounts,
--   admin, GM aur production manager ko.
--
--   Second gap: there was no production manager. `roles` carries an operator
--   role (`printing`, labelled "Production Operator" by 105) and a `planning`
--   role, but nobody in between who runs the floor — which is exactly the
--   person who has to see cost.
--
-- WHAT THIS DOES
--   1. Seeds a new permission module `money` (all 9 actions, same shape as the
--      other 28), whose `view` action is the single switch for "may this user
--      see rupee amounts anywhere in the app".
--   2. Grants `money::*` to superadmin / owner / ceo / gm / admin / accounts
--      and the new production_manager. NOBODY ELSE.
--   3. Adds the `production_manager` role and its permission set.
--
--   `money` is a DISPLAY gate, deliberately. It does not open or close a page —
--   `finance`, `purchase` and `settings` still do that. It decides whether the
--   figures on a page you can already open are rendered or masked.
--
-- WHAT THIS DELIBERATELY DOES NOT DO
--   · Sales does NOT get `money`, so a salesman cannot see the rate on his own
--     quotation, and Purchase cannot see the rate on its own PO. That follows
--     Mehboob's list literally. Both are ONE TICK away in
--     Settings → Roles & Permissions → Money → View if he wants them back —
--     which is the whole reason this is a permission row and not a hardcoded
--     role list in the code.
--   · No role loses anything. Nothing is revoked, no column changes, no table
--     is created. A user who could see a page before can still see it; only
--     the amounts on it are masked.
--   · production_manager gets no `delete`, `settings`, `admin` or `users`,
--     matching every other operational role (105's rule). It gets no `approve`
--     on `qc` either — passing an inspection stays with QC.
--
-- ORDER / DEPENDENCIES
--   Run this BEFORE deploying the matching code. The code reads `money::view`;
--   without these rows every non-superadmin sees masked amounts. Nothing 500s
--   either way, so the order is a cosmetic risk, not a breaking one.
--   Depends on 005 (permissions/roles/role_permissions) and 095 (the
--   users.role → user_roles sync trigger, which is what makes a user assigned
--   role 'production_manager' actually pick these permissions up).
--
-- HOW TO UNDO
--   DELETE FROM role_permissions rp USING permissions p
--    WHERE rp.permission_id = p.id AND p.company_id = '00000000-0000-0000-0000-000000000001'
--      AND p.module = 'money';
--   DELETE FROM permissions WHERE company_id = '00000000-0000-0000-0000-000000000001'
--     AND module = 'money';
--   DELETE FROM role_permissions WHERE role_id IN
--     (SELECT id FROM roles WHERE company_id = '00000000-0000-0000-0000-000000000001'
--        AND slug = 'production_manager');
--   DELETE FROM user_roles WHERE role_id IN
--     (SELECT id FROM roles WHERE company_id = '00000000-0000-0000-0000-000000000001'
--        AND slug = 'production_manager');
--   DELETE FROM roles WHERE company_id = '00000000-0000-0000-0000-000000000001'
--     AND slug = 'production_manager';
--   (and remove 'money' from ERP_MODULES in
--    src/modules/settings/permissions/types/permission.types.ts)
--
-- MIGRATION RISK
--   Purely additive and idempotent. Every insert is guarded, so re-running
--   changes nothing — including a `money` permission switched OFF by hand in
--   Settings, which the UI stores as is_active = FALSE rather than deleting the
--   row, and which the NOT EXISTS guards therefore leave off.
--   No new tables, so no new RLS policies. No backfill. Nothing locks.
-- ═══════════════════════════════════════════════════════════════════════════

DO $$
DECLARE
  cid UUID := '00000000-0000-0000-0000-000000000001';
  a   TEXT;
  actions TEXT[] := ARRAY['view','create','edit','delete','approve','reject','print','export','settings'];
BEGIN
  -- ─── 1. THE `money` PERMISSION MODULE ─────────────────────────────────────
  -- All nine actions, so the Settings → Roles & Permissions matrix renders a
  -- complete row like every other module. Only `view` is read by the app; the
  -- other eight exist so the grid has no holes in it.
  FOREACH a IN ARRAY actions LOOP
    INSERT INTO permissions (company_id, module, action, label)
    VALUES (cid, 'money', a, 'Money — ' || initcap(a))
    ON CONFLICT (company_id, module, action) DO NOTHING;
  END LOOP;

  -- ─── 2. THE production_manager ROLE ───────────────────────────────────────
  INSERT INTO roles (company_id, name, slug, description, is_system_role)
  SELECT cid, 'Production Manager', 'production_manager',
         'Runs the floor: plans and sequences jobs, drives every production stage, and sees job cost and margin. Not a sales or accounts role — no invoicing, no purchasing, no settings.',
         FALSE
  WHERE NOT EXISTS (
    SELECT 1 FROM roles r
     WHERE r.company_id = cid AND r.slug = 'production_manager' AND r.deleted_at IS NULL
  );

  -- Its permissions. Owns planning + every production stage; reads the paper
  -- trail either side of the floor (artwork, plates, store, board, dispatch)
  -- without being able to change it; sees money because judging a job's cost
  -- against its quote is the job.
  INSERT INTO role_permissions (company_id, role_id, permission_id)
  SELECT cid, r.id, p.id
  FROM roles r
  CROSS JOIN permissions p
  WHERE r.company_id = cid AND r.slug = 'production_manager' AND r.deleted_at IS NULL
    AND p.company_id = cid AND p.deleted_at IS NULL
    AND (
         -- owns these
         (p.module = 'planning'       AND p.action IN ('view','create','edit','print','export'))
      OR (p.module = 'jobs'           AND p.action IN ('view','create','edit','print','export'))
      OR (p.module = 'production'     AND p.action IN ('view','create','edit'))
      OR (p.module = 'printing'       AND p.action IN ('view','create','edit'))
      OR (p.module = 'lamination'     AND p.action IN ('view','create','edit'))
      OR (p.module = 'die_cutting'    AND p.action IN ('view','create','edit'))
      OR (p.module = 'hot_foil'       AND p.action IN ('view','create','edit'))
      OR (p.module = 'folder_gluing'  AND p.action IN ('view','create','edit'))
      OR (p.module = 'packing'        AND p.action IN ('view','create','edit'))
      OR (p.module = 'machines'       AND p.action IN ('view','edit'))
         -- reads these
      OR (p.module = 'artwork'        AND p.action IN ('view','print'))
      OR (p.module = 'plates'         AND p.action IN ('view','print'))
      OR (p.module = 'store'          AND p.action IN ('view','print'))
      OR (p.module = 'board_inventory'AND p.action IN ('view','print'))
      OR (p.module = 'dispatch'       AND p.action IN ('view','print'))
      OR (p.module = 'sales_orders'   AND p.action IN ('view','print'))
      OR (p.module = 'customers'      AND p.action IN ('view','print'))
      OR (p.module = 'qc'             AND p.action IN ('view','print','export'))
      OR (p.module = 'workflow'       AND p.action IN ('view'))
      OR (p.module = 'dashboard'      AND p.action IN ('view'))
      OR (p.module = 'reports'        AND p.action IN ('view','print','export'))
         -- sees cost and margin
      OR (p.module = 'money'          AND p.action IN ('view','print','export'))
    )
    AND NOT EXISTS (
      SELECT 1 FROM role_permissions rp
       WHERE rp.role_id = r.id AND rp.permission_id = p.id
    );

  -- ─── 3. WHO ELSE SEES MONEY ───────────────────────────────────────────────
  -- superadmin and owner are short-circuited in code and in has_permission(),
  -- but they are granted here anyway so the Settings matrix shows the truth
  -- rather than an unticked row that is actually in force.
  INSERT INTO role_permissions (company_id, role_id, permission_id)
  SELECT cid, r.id, p.id
  FROM roles r
  CROSS JOIN permissions p
  WHERE r.company_id = cid AND r.deleted_at IS NULL
    AND r.slug IN ('superadmin','owner','ceo','gm','admin','accounts')
    AND p.company_id = cid AND p.deleted_at IS NULL
    AND p.module = 'money'
    AND p.action IN ('view','print','export')
    AND NOT EXISTS (
      SELECT 1 FROM role_permissions rp
       WHERE rp.role_id = r.id AND rp.permission_id = p.id
    );
END $$;

NOTIFY pgrst, 'reload schema';
