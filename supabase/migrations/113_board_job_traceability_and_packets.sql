-- ══════════════════════════════════════════════════════════════════════════════
-- JAFSON PRINT ERP — MIGRATION 113: BOARD → JOB TRACEABILITY, AND THE PACKET
-- ══════════════════════════════════════════════════════════════════════════════
--
-- WHY (two separate holes, one migration, because both are needed before the
--      real July board stock is loaded and neither is worth its own run)
--
-- ── A. "Kon sa board kis job ke liye aaya?" could not be answered ────────────
--   The ISSUE side was already traceable: store/[id] writes job_id onto the
--   'out' movement, so "which board went to which job" has always worked.
--   The RECEIPT side had nowhere to put it:
--       purchase_orders       — vendor, date, amount. No job.
--       purchase_order_items  — board_item_id, qty, rate. No job.
--       board_inventory_lots  — vendor, receipt date, cost, lot no. No job.
--   and the receipt's 'in' movement never set job_id even though the column has
--   existed since 015. So the ERP knew exactly as little as the Excel sheet it
--   was meant to replace.
--
--   The link goes on the PO **line**, not the PO header. Mehboob's own July
--   sheet is the proof: Saud Traders delivers 18.75×35, 18.5×35 and 19.5×33.5
--   on one purchase. A header-level job_id would force one PO per job, which is
--   not how this shop buys.
--
--   job_id is NULLABLE and that is a real answer, not a gap: rows 5–15 of the
--   same sheet are 10–20 packet leftovers bought for general stock, for no job
--   at all. Forcing a job would make people invent one.
--
-- ── B. current_stock had no declared unit, and the two halves disagreed ──────
--   The store counts board in PACKETS (1 packet = 100 sheets — Mehboob,
--   2026-07-30). The job side counts SHEETS: jobs.sheet_qty is sheets
--   (Sheet Qty = ceil(Box Qty / Ups)), a press proof is "100/200/500 sheets",
--   and the auto-MRN copies sheet_qty straight into
--   material_requisition_items.quantity_required, which is then deducted from
--   board_inventory.current_stock.
--
--   Nothing declared which unit current_stock held. Load the sheet as packets
--   and a job issuing 250 sheets would subtract 250 from a packet balance —
--   **wrong by 100×**, and the board-shortfall warning would never fire
--   correctly again.
--
--   THE RULE, from here on: **current_stock, reserved_stock, reorder_level and
--   every board movement quantity are in SHEETS.** Packets are a display and
--   data-entry convenience only.
--
--   Sheets is not an arbitrary pick — it is the unit the shop's own numbers are
--   already exact in. Every fractional packet on the July sheet is a whole
--   number of sheets: 4707.4 → 470,740 · 1795.4 → 179,540 · 79.8 → 7,980 ·
--   44.68 → 4,468. Storing packets would mean storing rounding error forever.
--
--   sheets_per_packet lives on the ITEM, not in code, because the bundle is not
--   always 100. The same July report carries Art Paper and Matt Paper, and in
--   the paper trade a ream is 500 or 250. Default 100 covers every board row;
--   paper rows can say what they actually are.
--
-- WHY IT IS SAFE
--   Purely additive: three nullable-or-defaulted columns and two indexes. No
--   column is altered, no row is deleted, no existing constraint changes.
--   Verified read-only against live on 2026-07-30 before writing this:
--   board_inventory, board_inventory_movements, board_inventory_lots,
--   purchase_orders and purchase_order_items are ALL at 0 rows. So there is no
--   stock recorded in an ambiguous unit and nothing to convert — which is
--   exactly why the unit is being pinned down now rather than after the load.
--
-- IDEMPOTENT
--   Every object guarded with IF NOT EXISTS. The FK and CHECK are added only if
--   absent (a bare ADD CONSTRAINT would fail on a second run — the mistake 072
--   made, which 106 had to redo).
--
-- HOW TO UNDO
--   ALTER TABLE purchase_order_items DROP COLUMN IF EXISTS job_id;
--   ALTER TABLE board_inventory_lots DROP COLUMN IF EXISTS job_id;
--   ALTER TABLE board_inventory     DROP COLUMN IF EXISTS sheets_per_packet;
--   (Indexes go with their columns. Dropping sheets_per_packet does NOT undo
--   the sheets convention — that lives in the code and in this header.)
-- ══════════════════════════════════════════════════════════════════════════════

BEGIN;

-- ─── A1. The PO line's job ────────────────────────────────────────────────────
ALTER TABLE purchase_order_items
  ADD COLUMN IF NOT EXISTS job_id UUID;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'purchase_order_items_job_id_fkey'
  ) THEN
    ALTER TABLE purchase_order_items
      ADD CONSTRAINT purchase_order_items_job_id_fkey
      FOREIGN KEY (job_id) REFERENCES jobs(id);
  END IF;
END $$;

COMMENT ON COLUMN purchase_order_items.job_id IS
  'The job this line was bought FOR, or NULL for general stock. Deliberately on '
  'the line and not the PO header — one purchase legitimately covers several '
  'sizes for several jobs. NULL is a real answer: leftover/top-up stock is '
  'bought for no job. Carried onto the receipt''s board_inventory_movements row '
  'and its board_inventory_lots row so the trail survives the PO.';

-- Answers "what was bought for this job", the whole point of the column.
CREATE INDEX IF NOT EXISTS idx_po_items_job ON purchase_order_items(job_id)
  WHERE job_id IS NOT NULL;

-- ─── A1b. The unit boundary, written down where it can't be missed ───────────
-- Mehboob, 2026-07-30: "PO packet ke hisab se hi banta hai aur maal aane par
-- bhi packet hi ginte hain; vendor hamare packets ka wazan kar ke bill bhejta
-- hai." So the PURCHASE document is in packets, the vendor's INVOICE is by
-- weight, and stock is in sheets. Three units, one flow — hence these comments.
COMMENT ON COLUMN purchase_order_items.quantity IS
  'Ordered quantity in the line''s own commercial unit. For board lines that is '
  'PACKETS, never sheets — that is how this shop buys and how the store counts. '
  'A fractional value is real: 44.68 packets is 44 packets plus 68 loose sheets.';

COMMENT ON COLUMN purchase_order_items.quantity_received IS
  'Received quantity in the SAME unit as quantity — PACKETS for board. '
  'DO NOT add this to board_inventory.current_stock directly: stock is in '
  'SHEETS. The receive route multiplies by board_inventory.sheets_per_packet '
  'before crediting stock and before writing the movement/lot rows.';

-- ─── A2. The same link on the physical delivery ───────────────────────────────
-- The lot IS the delivery — vendor, date, cost and remaining quantity already
-- live here, and FIFO consumption reads it. The job belongs alongside them.
ALTER TABLE board_inventory_lots
  ADD COLUMN IF NOT EXISTS job_id UUID;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'board_inventory_lots_job_id_fkey'
  ) THEN
    ALTER TABLE board_inventory_lots
      ADD CONSTRAINT board_inventory_lots_job_id_fkey
      FOREIGN KEY (job_id) REFERENCES jobs(id);
  END IF;
END $$;

COMMENT ON COLUMN board_inventory_lots.job_id IS
  'The job this delivery was received for, copied from the PO line. NULL for '
  'general stock. Lets a later quality complaint name both the delivery and the '
  'job it was bought for.';

CREATE INDEX IF NOT EXISTS idx_bil_job ON board_inventory_lots(job_id)
  WHERE job_id IS NOT NULL;

-- ─── B. The packet ────────────────────────────────────────────────────────────
ALTER TABLE board_inventory
  ADD COLUMN IF NOT EXISTS sheets_per_packet INTEGER NOT NULL DEFAULT 100;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'board_inventory_sheets_per_packet_positive'
  ) THEN
    ALTER TABLE board_inventory
      ADD CONSTRAINT board_inventory_sheets_per_packet_positive
      CHECK (sheets_per_packet > 0);
  END IF;
END $$;

COMMENT ON COLUMN board_inventory.sheets_per_packet IS
  'How many sheets are in one packet/ream of THIS item. 100 for board (the '
  'shop''s standard bundle); paper is often 500 or 250, which is why this is '
  'per-item data and not a constant in code. Display and data entry use '
  'packets; storage never does.';

COMMENT ON COLUMN board_inventory.current_stock IS
  'Stock in SHEETS — always, never packets. The job side speaks sheets '
  '(jobs.sheet_qty, the auto-MRN''s quantity_required, every '
  'board_inventory_movements quantity), so the store side must too or the two '
  'disagree by a factor of sheets_per_packet. Divide by sheets_per_packet for '
  'display only.';

COMMENT ON COLUMN board_inventory.reserved_stock IS 'In SHEETS. See current_stock.';
COMMENT ON COLUMN board_inventory.reorder_level IS 'In SHEETS. See current_stock.';

-- ─── C. The vendor link that was never a link ─────────────────────────────────
-- board_inventory.vendor_id has existed since 015 as a bare UUID with NO foreign
-- key. PostgREST will not embed across a relationship that does not exist, which
-- is the actual reason the Board Stock screen has never shown a vendor — the
-- data had nowhere to come from. Vendor is the FIRST grouping on the shop's own
-- stock report, so this matters.
--
-- Safe as a plain (validated) FK because board_inventory is empty — confirmed
-- read-only against live on 2026-07-30, 0 rows — so there is no orphan
-- vendor_id to trip over. On a populated table this would need NOT VALID first.
--
-- This is also the "adding an FK between two already-related tables breaks every
-- unhinted embed" trap from CLAUDE.md §5 — checked: there is no other
-- relationship between board_inventory and vendors, so board_inventory→vendors
-- stays unambiguous and unhinted embeds are fine.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'board_inventory_vendor_id_fkey'
  ) THEN
    ALTER TABLE board_inventory
      ADD CONSTRAINT board_inventory_vendor_id_fkey
      FOREIGN KEY (vendor_id) REFERENCES vendors(id);
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_board_inv_vendor ON board_inventory(vendor_id)
  WHERE vendor_id IS NOT NULL;

COMMIT;

-- ─── VERIFY (read-only) ───────────────────────────────────────────────────────
--   SELECT table_name, column_name, data_type, is_nullable, column_default
--   FROM   information_schema.columns
--   WHERE (table_name = 'purchase_order_items' AND column_name = 'job_id')
--      OR (table_name = 'board_inventory_lots' AND column_name = 'job_id')
--      OR (table_name = 'board_inventory'      AND column_name = 'sheets_per_packet')
--   ORDER BY table_name;
--
--   -- expect 3 indexes and 3 constraints
--   SELECT indexname FROM pg_indexes
--   WHERE indexname IN ('idx_po_items_job','idx_bil_job');
--   SELECT conname FROM pg_constraint
--   WHERE conname IN ('purchase_order_items_job_id_fkey',
--                     'board_inventory_lots_job_id_fkey',
--                     'board_inventory_sheets_per_packet_positive');

NOTIFY pgrst, 'reload schema';
