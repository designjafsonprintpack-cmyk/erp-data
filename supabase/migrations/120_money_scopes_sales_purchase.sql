-- ═══════════════════════════════════════════════════════════════════════════
-- MONEY, SPLIT INTO THREE SCOPES — SALES PRICE, PURCHASE RATE, INTERNAL COST
-- ═══════════════════════════════════════════════════════════════════════════
-- WHAT 119 GOT WRONG
--   119 read Mehboob's instruction ("price sirf accounts, admin, gm,
--   production manager ko") literally and made `money::view` a single
--   all-or-nothing switch. That is one switch too few: it took the rate off a
--   salesman's own quotation and off a purchaser's own PO, which is not what he
--   meant. His correction, 2026-07-31:
--
--     "Sales apni quotation ka rate dekh sake baqi nahi, Purchase apne PO ka
--      dekh sake baqi nahi, mere kehne ka matlab yeh tha ke production wale
--      rates na dekh saken — production manager se aage wale log."
--
--   So the line is not "who is senior enough to see money", it is "money
--   belongs to the document you own, and the production floor owns none of it".
--   Sales prices the job. Purchase buys the board. Neither should see the
--   other's numbers, and the shop floor should see neither.
--
-- WHAT THIS DOES
--   Adds two NARROW permission modules beside the master one from 119:
--     money            (119) — every amount, everywhere. Management + Accounts.
--     money_sales      (new) — what the CUSTOMER pays: quotation and sales
--                              order rates, line totals, the estimator's cost
--                              calculator and margin on the quotation screen.
--     money_purchase   (new) — what WE pay: purchase order rates and totals,
--                              board unit cost, and the Stock In purchase rate.
--
--   The master satisfies both scopes in code, so nobody who already had `money`
--   loses anything and no role needs two rows to work. They are granted here
--   anyway, for the same reason 119 granted `money` to superadmin: the
--   Settings → Roles & Permissions matrix should show what is actually in
--   force, not an unticked box that is really on.
--
--   Grants:
--     sales     → money_sales
--     purchase  → money_purchase
--     superadmin / owner / ceo / gm / admin / accounts / production_manager
--               → both (they already hold the master)
--
-- WHO STILL SEES NO MONEY AT ALL — and this is the whole point
--   printing (Production Operator), store, plates, qc, dispatch, artwork,
--   planning. Every one of them can still open its screens and do its work;
--   only the amounts on those screens are masked.
--
-- ONE CONSEQUENCE WORTH KNOWING BEFORE YOU RUN THIS
--   **Store loses the purchase-rate box on a manual Stock In.** Store is on the
--   production side of the line Mehboob drew, so it gets no money scope — but
--   Store is also who physically receives board, and that rate is what keeps
--   `board_inventory.unit_cost` (a weighted average, per 117) true. Receiving
--   against a PO is unaffected: the rate comes off the PO line, which Purchase
--   entered. Only a walk-in / cash Stock In loses it.
--   If that turns out to matter, it is ONE TICK:
--     Settings → Roles & Permissions → Store → Money (Purchase) → View.
--   Left off here because it is what Mehboob asked for, and turning it on is
--   reversible while a silently-visible rate is not.
--
-- ORDER / DEPENDENCIES
--   Needs 119 (the `money` module and the production_manager role) and 005.
--   Run BEFORE deploying the matching code — until then Sales and Purchase see
--   masked amounts, exactly as they do today. Nothing 500s either way.
--
-- HOW TO UNDO
--   DELETE FROM role_permissions rp USING permissions p
--    WHERE rp.permission_id = p.id AND p.company_id = '00000000-0000-0000-0000-000000000001'
--      AND p.module IN ('money_sales','money_purchase');
--   DELETE FROM permissions WHERE company_id = '00000000-0000-0000-0000-000000000001'
--     AND module IN ('money_sales','money_purchase');
--   (and remove both from ERP_MODULES in
--    src/modules/settings/permissions/types/permission.types.ts)
--   Undoing this does NOT undo 119 — the master switch keeps working on its own.
--
-- MIGRATION RISK
--   Purely additive and idempotent. No role loses anything, nothing is revoked,
--   no table or column changes, no backfill, nothing locks. Every insert is
--   guarded, so re-running changes nothing — including a scope switched OFF by
--   hand in Settings, which the UI stores as is_active = FALSE rather than
--   deleting the row, and which the NOT EXISTS guards therefore leave off.
-- ═══════════════════════════════════════════════════════════════════════════

DO $$
DECLARE
  cid UUID := '00000000-0000-0000-0000-000000000001';
  m   TEXT;
  a   TEXT;
  modules TEXT[] := ARRAY['money_sales','money_purchase'];
  actions TEXT[] := ARRAY['view','create','edit','delete','approve','reject','print','export','settings'];
  label   TEXT;
BEGIN
  -- ─── 1. THE TWO SCOPED MODULES ────────────────────────────────────────────
  -- All nine actions, so the permissions matrix renders a complete row like
  -- every other module. Only `view` is read by the app.
  FOREACH m IN ARRAY modules LOOP
    label := CASE m WHEN 'money_sales' THEN 'Money (Sales)' ELSE 'Money (Purchase)' END;
    FOREACH a IN ARRAY actions LOOP
      INSERT INTO permissions (company_id, module, action, label)
      VALUES (cid, m, a, label || ' — ' || initcap(a))
      ON CONFLICT (company_id, module, action) DO NOTHING;
    END LOOP;
  END LOOP;

  -- ─── 2. SALES SEES THE PRICE IT SETS ──────────────────────────────────────
  -- Sales is also the estimator here (the quotation's cost calculator is how
  -- the price gets made), so this scope covers that whole screen — cost lines
  -- and margin included. Without it a salesman cannot quote at all.
  INSERT INTO role_permissions (company_id, role_id, permission_id)
  SELECT cid, r.id, p.id
  FROM roles r
  CROSS JOIN permissions p
  WHERE r.company_id = cid AND r.slug = 'sales' AND r.deleted_at IS NULL
    AND p.company_id = cid AND p.deleted_at IS NULL
    AND p.module = 'money_sales' AND p.action IN ('view','print','export')
    AND NOT EXISTS (
      SELECT 1 FROM role_permissions rp
       WHERE rp.role_id = r.id AND rp.permission_id = p.id
    );

  -- ─── 3. PURCHASE SEES THE RATE IT PAYS ────────────────────────────────────
  -- PO rates and board cost. NOT the vendor ledger or Record Payment — those
  -- stay with Accounts, keeping 105's separation: whoever raises a PO does not
  -- also settle it.
  INSERT INTO role_permissions (company_id, role_id, permission_id)
  SELECT cid, r.id, p.id
  FROM roles r
  CROSS JOIN permissions p
  WHERE r.company_id = cid AND r.slug = 'purchase' AND r.deleted_at IS NULL
    AND p.company_id = cid AND p.deleted_at IS NULL
    AND p.module = 'money_purchase' AND p.action IN ('view','print','export')
    AND NOT EXISTS (
      SELECT 1 FROM role_permissions rp
       WHERE rp.role_id = r.id AND rp.permission_id = p.id
    );

  -- ─── 4. WHOEVER HOLDS THE MASTER HOLDS BOTH SCOPES ────────────────────────
  -- Code treats `money::view` as satisfying every scope, so this changes no
  -- behaviour. It exists so the Settings matrix is not lying about what is on.
  INSERT INTO role_permissions (company_id, role_id, permission_id)
  SELECT cid, r.id, p.id
  FROM roles r
  CROSS JOIN permissions p
  WHERE r.company_id = cid AND r.deleted_at IS NULL
    AND r.slug IN ('superadmin','owner','ceo','gm','admin','accounts','production_manager')
    AND p.company_id = cid AND p.deleted_at IS NULL
    AND p.module IN ('money_sales','money_purchase')
    AND p.action IN ('view','print','export')
    AND NOT EXISTS (
      SELECT 1 FROM role_permissions rp
       WHERE rp.role_id = r.id AND rp.permission_id = p.id
    );
END $$;

NOTIFY pgrst, 'reload schema';
