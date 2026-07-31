-- ═══════════════════════════════════════════════════════════════════════════
-- THE STORE MANAGER ROLE — Store, plus the rates that keep board costing true
-- ═══════════════════════════════════════════════════════════════════════════
-- WHY THIS EXISTS
--   Aqib Ali is the Store Manager: board inventory and the store are both his.
--   (The staff CSV lists him as "HR Manager" with role "Manager" — Mehboob
--   corrected it, so his real job is what is modelled here, not the sheet.)
--
--   The existing `store` role already does the WORK: Store (MRN), Board
--   Inventory, Purchase, Reports and Dashboard, all with create/edit. Nothing
--   is missing there. What is missing is money.
--
--   120 deliberately gave Store no money scope, and 120's own header flagged
--   the consequence as the thing most likely to bite. It has now bitten:
--     · Board Inventory's unit cost renders masked
--     · the Stock In purchase-rate box does not render at all — so board that
--       arrives WITHOUT a purchase order (cash / walk-in) can never have its
--       cost recorded, and `board_inventory.unit_cost` — a weighted average
--       since 117 — drifts away from the truth with nothing to flag it
--     · `store` can raise a purchase order (it holds purchase create/edit) but
--       cannot see or type a rate on it, which is not a workable PO
--
--   A Store Manager who owns board inventory receives the material and checks
--   the delivery against the vendor's invoice. That is a rate job.
--
-- WHY A NEW ROLE INSTEAD OF GIVING `store` THE SCOPE
--   Permissions attach to a ROLE, not a person — 095's trigger keeps exactly
--   one active role per user — so granting `money_purchase` to `store` would
--   also hand buying rates to M. Afaq Mirza, the Store Incharge under him, who
--   issues material rather than buying it. Mehboob chose to keep that line:
--     store_manager  → Aqib Ali      — the work, and the rates
--     store          → M. Afaq Mirza — the work, no rates
--
-- WHAT THIS ROLE IS, EXACTLY
--   `store`'s permission set, copied module-for-module, PLUS
--   `money_purchase` (view/print/export) from 120.
--   It is deliberately NOT a superset of anything else: no jobs, no vendors,
--   no production, no `money` master, no settings/users/admin/delete. Each of
--   those is one tick in Settings if it turns out to be needed — and a tick is
--   reversible, while a rate someone has already seen is not.
--
--   Copied by SELECT from the live `store` role rather than re-listing the
--   modules by hand, so the two cannot drift: if `store` is ever adjusted in
--   Settings, re-running this migration lines the manager back up with it.
--
-- DEPENDS ON
--   005 (roles/permissions), 095 (the users.role → user_roles trigger, which
--   matches on slug), and 120 (the `money_purchase` module). Run 120 first —
--   it already is on live.
--
-- HOW TO UNDO
--   DELETE FROM user_roles WHERE role_id IN
--     (SELECT id FROM roles WHERE company_id = '00000000-0000-0000-0000-000000000001'
--        AND slug = 'store_manager');
--   DELETE FROM role_permissions WHERE role_id IN
--     (SELECT id FROM roles WHERE company_id = '00000000-0000-0000-0000-000000000001'
--        AND slug = 'store_manager');
--   DELETE FROM roles WHERE company_id = '00000000-0000-0000-0000-000000000001'
--     AND slug = 'store_manager';
--   Move anyone still on the role to `store` FIRST — a user whose role slug has
--   no matching row keeps whatever user_roles link they had, because 095's
--   trigger no-ops on an unknown slug rather than stripping permissions.
--
-- MIGRATION RISK
--   Purely additive and idempotent. `store` is not touched — it neither gains
--   nor loses anything. No table changes, no backfill, nothing locks. Every
--   insert is guarded, so re-running changes nothing, including a permission
--   switched OFF by hand in Settings.
-- ═══════════════════════════════════════════════════════════════════════════

DO $$
DECLARE
  cid UUID := '00000000-0000-0000-0000-000000000001';
BEGIN
  -- ─── 1. THE ROLE ──────────────────────────────────────────────────────────
  INSERT INTO roles (company_id, name, slug, description, is_system_role)
  SELECT cid, 'Store Manager', 'store_manager',
         'Owns the store and board inventory, and sees what board and purchase orders cost. The Store Incharge does the same work without the rates.',
         FALSE
  WHERE NOT EXISTS (
    SELECT 1 FROM roles r
     WHERE r.company_id = cid AND r.slug = 'store_manager' AND r.deleted_at IS NULL
  );

  -- ─── 2. EVERYTHING `store` CAN DO ─────────────────────────────────────────
  -- Copied from the live role rather than re-listed, so the two cannot drift.
  INSERT INTO role_permissions (company_id, role_id, permission_id)
  SELECT cid, mgr.id, rp.permission_id
  FROM roles mgr
  JOIN roles st ON st.company_id = cid AND st.slug = 'store' AND st.deleted_at IS NULL
  JOIN role_permissions rp ON rp.role_id = st.id AND rp.deleted_at IS NULL AND rp.is_active
  WHERE mgr.company_id = cid AND mgr.slug = 'store_manager' AND mgr.deleted_at IS NULL
    AND NOT EXISTS (
      SELECT 1 FROM role_permissions x
       WHERE x.role_id = mgr.id AND x.permission_id = rp.permission_id
    );

  -- ─── 3. ...PLUS THE RATES ─────────────────────────────────────────────────
  -- `money_purchase` only (120): what WE pay for board and on a PO. NOT
  -- `money_sales` (customer prices are none of the store's business) and NOT
  -- the `money` master (job cost, margin, invoices and ledgers stay with
  -- management and Accounts).
  INSERT INTO role_permissions (company_id, role_id, permission_id)
  SELECT cid, r.id, p.id
  FROM roles r
  CROSS JOIN permissions p
  WHERE r.company_id = cid AND r.slug = 'store_manager' AND r.deleted_at IS NULL
    AND p.company_id = cid AND p.deleted_at IS NULL
    AND p.module = 'money_purchase' AND p.action IN ('view','print','export')
    AND NOT EXISTS (
      SELECT 1 FROM role_permissions x
       WHERE x.role_id = r.id AND x.permission_id = p.id
    );
END $$;

NOTIFY pgrst, 'reload schema';
