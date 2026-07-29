-- ═══════════════════════════════════════════════════════════════════════════
-- MISSING SHOP ROLES — PLATE MAKING, QC, PURCHASE, ACCOUNTS
-- ═══════════════════════════════════════════════════════════════════════════
-- WHAT WAS MISSING
--   The permission catalogue has carried 28 modules × 9 actions = 252
--   permissions since 005, including `plates`, `qc`, `purchase` and `finance`.
--   The `departments` table has carried Plates and Quality Control since 010.
--   But `roles` had no row for any of them — so there was literally no role to
--   give the plate maker, the QC inspector, the purchaser or the accountant.
--   The modules and the departments existed; only the roles in between did not.
--
--   Mehboob raised this directly: "plate making aur kon kon say honay chahiyay".
--
-- WHAT THIS DOES
--   Adds four roles and their permission sets:
--     plates    — Plate Making
--     qc        — Quality Control
--     purchase  — Purchase
--     accounts  — Accounts
--   ...and renames the existing 'printing' role's DISPLAY NAME from
--   "Printing Operator" to "Production Operator", because it already grants
--   lamination, die cutting, hot foil, folder gluing and packing alongside
--   printing. A separate "Production Operator" role was considered and rejected
--   as a duplicate of it — the slug is untouched, so nothing that reads
--   `printing` changes.
--
-- WHAT THIS DELIBERATELY DOES NOT DO
--   No role here gets `delete`, `settings`, or `admin` — those stay with
--   superadmin / owner / ceo / gm, matching every existing operational role.
--
--   Purchase and Accounts get NO `approve`. Whoever raises a purchase order or
--   an invoice should not also be the one approving it; approval stays with
--   management. QC is the exception and keeps approve/reject, because passing
--   or failing an inspection IS the job, not a separation-of-duties question.
--
-- DEPENDS ON
--   Migration 096 must also be run — admin / artwork / planning still have ZERO
--   permissions on this database, which is what 096 was written to fix. This
--   migration does not duplicate those grants; run 096 as well. Order does not
--   matter, both are additive and idempotent.
--
-- HOW TO UNDO
--   DELETE FROM role_permissions WHERE role_id IN
--     (SELECT id FROM roles WHERE company_id = '00000000-0000-0000-0000-000000000001'
--        AND slug IN ('plates','qc','purchase','accounts'));
--   DELETE FROM roles WHERE company_id = '00000000-0000-0000-0000-000000000001'
--     AND slug IN ('plates','qc','purchase','accounts');
--   UPDATE roles SET name = 'Printing Operator'
--    WHERE company_id = '00000000-0000-0000-0000-000000000001' AND slug = 'printing';
--
-- MIGRATION RISK
--   Purely additive. No existing role loses anything, no permission is revoked,
--   no table is altered. Every insert is guarded so re-running changes nothing:
--   a permission switched OFF by hand in Settings → Roles & Permissions (the UI
--   sets is_active = FALSE rather than deleting the row) stays off.
--   No new tables, so no new RLS policies. No backfill. Nothing locks.
-- ═══════════════════════════════════════════════════════════════════════════

DO $$
DECLARE
  cid UUID := '00000000-0000-0000-0000-000000000001';
BEGIN
  -- ─── 1. THE ROLES ─────────────────────────────────────────────────────────
  INSERT INTO roles (company_id, name, slug, description, is_system_role)
  SELECT cid, v.name, v.slug, v.descr, FALSE
  FROM (VALUES
    ('Plate Making',    'plates',   'Makes and issues printing plates. Printing is hard-blocked until plates are issued to a job.'),
    ('Quality Control', 'qc',       'Inspects jobs and passes or fails them. A QC stage cannot complete without a passing inspection.'),
    ('Purchase',        'purchase', 'Raises purchase orders and manages vendors. Approval stays with management.'),
    ('Accounts',        'accounts', 'Invoicing, payments and job costing. Read-only on the sales documents it bills against.')
  ) AS v(name, slug, descr)
  WHERE NOT EXISTS (
    SELECT 1 FROM roles r WHERE r.company_id = cid AND r.slug = v.slug AND r.deleted_at IS NULL
  );

  -- ─── 2. PLATE MAKING ──────────────────────────────────────────────────────
  -- Owns plates. Reads the job and the artwork, because a plate is made FROM
  -- the approved artwork — without artwork view this role cannot do its work.
  INSERT INTO role_permissions (company_id, role_id, permission_id)
  SELECT cid, r.id, p.id
  FROM roles r
  CROSS JOIN permissions p
  WHERE r.company_id = cid AND r.slug = 'plates' AND r.deleted_at IS NULL
    AND p.company_id = cid AND p.deleted_at IS NULL
    AND (
         (p.module = 'plates'    AND p.action IN ('view','create','edit','print','export'))
      OR (p.module = 'artwork'   AND p.action IN ('view','print'))
      OR (p.module = 'jobs'      AND p.action IN ('view','print'))
      OR (p.module = 'dashboard' AND p.action IN ('view'))
      OR (p.module = 'reports'   AND p.action IN ('view','print','export'))
    )
    AND NOT EXISTS (
      SELECT 1 FROM role_permissions rp
       WHERE rp.role_id = r.id AND rp.permission_id = p.id
    );

  -- ─── 3. QUALITY CONTROL ───────────────────────────────────────────────────
  -- approve/reject is the job itself (migration 092 blocks completing a QC
  -- stage without a passing inspection), so unlike every other role below it
  -- genuinely needs them.
  INSERT INTO role_permissions (company_id, role_id, permission_id)
  SELECT cid, r.id, p.id
  FROM roles r
  CROSS JOIN permissions p
  WHERE r.company_id = cid AND r.slug = 'qc' AND r.deleted_at IS NULL
    AND p.company_id = cid AND p.deleted_at IS NULL
    AND (
         (p.module = 'qc'         AND p.action IN ('view','create','edit','approve','reject','print','export'))
      OR (p.module = 'jobs'       AND p.action IN ('view','print'))
      OR (p.module = 'production' AND p.action IN ('view'))
      OR (p.module = 'dashboard'  AND p.action IN ('view'))
      OR (p.module = 'reports'    AND p.action IN ('view','print','export'))
    )
    AND NOT EXISTS (
      SELECT 1 FROM role_permissions rp
       WHERE rp.role_id = r.id AND rp.permission_id = p.id
    );

  -- ─── 4. PURCHASE ──────────────────────────────────────────────────────────
  -- Raises POs and owns vendors. Reads stock so it can see what is already on
  -- hand before ordering more, but cannot change it — that is Store's job.
  INSERT INTO role_permissions (company_id, role_id, permission_id)
  SELECT cid, r.id, p.id
  FROM roles r
  CROSS JOIN permissions p
  WHERE r.company_id = cid AND r.slug = 'purchase' AND r.deleted_at IS NULL
    AND p.company_id = cid AND p.deleted_at IS NULL
    AND (
         (p.module = 'purchase'        AND p.action IN ('view','create','edit','print','export'))
      OR (p.module = 'vendors'         AND p.action IN ('view','create','edit','print','export'))
      OR (p.module = 'board_inventory' AND p.action IN ('view','print'))
      OR (p.module = 'store'           AND p.action IN ('view','print'))
      OR (p.module = 'dashboard'       AND p.action IN ('view'))
      OR (p.module = 'reports'         AND p.action IN ('view','print','export'))
    )
    AND NOT EXISTS (
      SELECT 1 FROM role_permissions rp
       WHERE rp.role_id = r.id AND rp.permission_id = p.id
    );

  -- ─── 5. ACCOUNTS ──────────────────────────────────────────────────────────
  -- Owns finance. Read-only on the documents it bills against — an accountant
  -- must be able to see the order and the dispatch behind an invoice, but must
  -- not be able to edit the sale after the fact.
  INSERT INTO role_permissions (company_id, role_id, permission_id)
  SELECT cid, r.id, p.id
  FROM roles r
  CROSS JOIN permissions p
  WHERE r.company_id = cid AND r.slug = 'accounts' AND r.deleted_at IS NULL
    AND p.company_id = cid AND p.deleted_at IS NULL
    AND (
         (p.module = 'finance'      AND p.action IN ('view','create','edit','print','export'))
      OR (p.module = 'customers'    AND p.action IN ('view','print'))
      OR (p.module = 'quotations'   AND p.action IN ('view','print'))
      OR (p.module = 'sales_orders' AND p.action IN ('view','print'))
      OR (p.module = 'dispatch'     AND p.action IN ('view','print'))
      OR (p.module = 'dashboard'    AND p.action IN ('view'))
      OR (p.module = 'reports'      AND p.action IN ('view','print','export'))
    )
    AND NOT EXISTS (
      SELECT 1 FROM role_permissions rp
       WHERE rp.role_id = r.id AND rp.permission_id = p.id
    );

  -- ─── 6. NAME THE PRINTING ROLE FOR WHAT IT ACTUALLY IS ────────────────────
  -- Slug stays 'printing' — only the label people read changes.
  UPDATE roles SET name = 'Production Operator', updated_at = NOW()
   WHERE company_id = cid AND slug = 'printing'
     AND name = 'Printing Operator' AND deleted_at IS NULL;
END $$;

NOTIFY pgrst, 'reload schema';
