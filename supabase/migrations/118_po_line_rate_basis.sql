-- ═══════════════════════════════════════════════════════════════════════════
-- PURCHASE ORDER LINES — HOW THE VENDOR PRICED THE LINE
-- ═══════════════════════════════════════════════════════════════════════════
-- WHAT WAS BROKEN
--   A PO line's rate had no declared basis. `unit_price` was labelled
--   "Rate / pkt" on the form and the line total was computed as
--   `quantity * unit_price` with quantity in packets.
--
--   BOARD IS BOUGHT BY THE KILO — Mehboob's correction. The vendor's invoice
--   is a weight and a per-kg rate, so a per-packet-only PO could not be
--   reconciled against it, and the estimator's own costing engine has offered
--   per-kg board costing all along (quotation_items.board_costing_method).
--   The purchase side was the only place that couldn't say "per kg".
--
--   It also blocked the receipt from deriving a per-sheet cost correctly:
--   without knowing the basis, PO receiving cannot turn `unit_price` into the
--   PKR-per-sheet figure that `board_inventory.unit_cost` requires (117).
--
-- THE THREE BASES
--   'kg'     — board, the normal case. Line total = sheet weight x rate,
--              weight from L(in) x W(in) x GSM / 15500 per 100 sheets, the
--              same constant the costing engine uses (src/lib/costing/
--              sheetWeight.ts). Needs the line's board_item_id to have a sheet
--              size and a GSM.
--   'packet' — paper reams and anything invoiced by the packet. Line total =
--              packets x rate. This is exactly the old behaviour.
--   'unit'   — a non-stock line (ink, plates, service). Line total =
--              quantity x rate, and no per-sheet cost is derived on receipt.
--
-- WHY 'packet' IS THE DEFAULT AND NOT 'kg'
--   Because it reproduces the existing arithmetic bit for bit. Any row that
--   already exists keeps the total it already has; nothing is recalculated by
--   this migration. New board lines default to 'kg' in the FORM, not in the
--   database, so the column default can stay backward-compatible.
--
-- RISK
--   Additive. One nullable-with-default TEXT column plus a CHECK. Postgres
--   adds a column with a non-volatile default without rewriting the table, so
--   no long lock. No existing total, subtotal, ledger row or invoice is
--   touched — this migration recalculates nothing.
--
--   Live currently has no PO line items at all (line-item inserts failed for
--   the entire life of the feature until the zod-schema fix shipped with 113),
--   so in practice there is nothing to be backward-compatible WITH — but the
--   default is chosen as though there were.
--
-- TO UNDO
--   ALTER TABLE purchase_order_items DROP CONSTRAINT IF EXISTS purchase_order_items_rate_basis_chk;
--   ALTER TABLE purchase_order_items DROP COLUMN IF EXISTS rate_basis;
--   NOTIFY pgrst, 'reload schema';
-- ═══════════════════════════════════════════════════════════════════════════

ALTER TABLE purchase_order_items
  ADD COLUMN IF NOT EXISTS rate_basis TEXT NOT NULL DEFAULT 'packet';

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'purchase_order_items_rate_basis_chk'
  ) THEN
    ALTER TABLE purchase_order_items
      ADD CONSTRAINT purchase_order_items_rate_basis_chk
      CHECK (rate_basis IN ('kg', 'packet', 'unit'));
  END IF;
END $$;

COMMENT ON COLUMN purchase_order_items.rate_basis IS
  'What unit_price is PER: kg (board, the normal case — line total is sheet '
  'weight x rate, weight via L x W x GSM / 15500 per 100 sheets), packet '
  '(paper reams; total is packets x rate, the pre-118 behaviour), or unit '
  '(non-stock lines). Read by PO receiving to derive the PKR-per-SHEET figure '
  'board_inventory.unit_cost and board_inventory_lots.unit_cost require (117). '
  'quantity stays in PACKETS regardless of the basis, because that is what is '
  'physically delivered and what the receive modal counts. Added 118.';

-- ═══════════════════════════════════════════════════════════════════════════
-- VERIFY (read-only — safe to run against live)
--
--   SELECT column_name, data_type, is_nullable, column_default
--   FROM information_schema.columns
--   WHERE table_name = 'purchase_order_items' AND column_name = 'rate_basis';
--   -- expect: rate_basis | text | NO | 'packet'::text
--
--   SELECT pg_get_constraintdef(oid) FROM pg_constraint
--   WHERE conname = 'purchase_order_items_rate_basis_chk';
--   -- expect: CHECK (rate_basis = ANY (ARRAY['kg','packet','unit']))
--
--   SELECT rate_basis, count(*) FROM purchase_order_items GROUP BY 1;
--   -- expect: every pre-existing row on 'packet', i.e. unchanged arithmetic
-- ═══════════════════════════════════════════════════════════════════════════

NOTIFY pgrst, 'reload schema';
