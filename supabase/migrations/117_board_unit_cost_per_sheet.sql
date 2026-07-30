-- ═══════════════════════════════════════════════════════════════════════════
-- BOARD COSTING — DECLARE THE UNIT ON unit_cost (documentation only)
-- ═══════════════════════════════════════════════════════════════════════════
-- No table, column, index, function or policy changes. This migration only
-- writes the unit down, for the same reason 113 wrote down "current_stock is
-- SHEETS" and 114 wrote down "quantity is a positive magnitude": every single
-- costing bug found on this table so far came from a number whose unit was
-- never declared anywhere.
--
-- WHAT WAS BROKEN (fixed in code, same commit)
--   `board_inventory.unit_cost` is PER SHEET. It has to be: api/v1/store/[id]
--   books material onto a job as `unit_cost * delta`, and `delta` is in sheets.
--
--   But PO receiving wrote the purchase order line's `unit_price` straight
--   into `board_inventory_lots.unit_cost` — and a PO line is priced PER
--   PACKET, because that is how the shop buys. The lot's own
--   `quantity_received` is in sheets. So the lot carried a rate 100× too high
--   for its own quantity (500× on a paper ream), and it disagreed with the
--   item's rate on the same board.
--
--   Nothing had spent that number yet: every `unit_cost` on `board_inventory`
--   is 0 and every `board_inventory_lots.unit_cost` is NULL on live (the 51
--   opening lots were created without a cost), so there is NO history to
--   correct and this migration deliberately rewrites no data. It was a trap
--   waiting for the first priced PO receipt, not a live error.
--
--   Also fixed in the same commit: neither receipt path ever updated
--   `board_inventory.unit_cost`, so it stayed 0 forever and every job booked
--   its board at zero cost. Both paths now re-average it — weighted average,
--   Mehboob's decision — via weightedUnitCost() in src/lib/utils/boardUnitCost.ts.
--   `unit_cost = 0` is treated as UNKNOWN rather than free, so the first
--   priced receipt SETS the rate instead of averaging against the zero that
--   1.7 million sheets of opening stock currently carries.
--
-- RISK
--   None. COMMENT ON COLUMN only — no lock beyond a catalog row, no data
--   touched, no query affected.
--
-- TO UNDO
--   The comments can be dropped with COMMENT ON COLUMN … IS NULL, but there is
--   no reason to: removing the only written record of the unit is how this got
--   broken in the first place.
-- ═══════════════════════════════════════════════════════════════════════════

COMMENT ON COLUMN board_inventory.unit_cost IS
  'PKR PER SHEET. Not per packet, not per kg. Forced by api/v1/store/[id], '
  'which books job material cost as unit_cost * sheets_issued. Maintained as a '
  'WEIGHTED AVERAGE by both receipt paths (manual Stock In and PO receipt) — '
  'see src/lib/utils/boardUnitCost.ts. 0 means NOT KNOWN YET, not free: the '
  'first priced receipt sets the rate rather than averaging into the zero. '
  'The shop buys in packets, so both forms ask for a packet price and divide '
  'by sheets_per_packet before storing. Declared in 117.';

COMMENT ON COLUMN board_inventory_lots.unit_cost IS
  'PKR PER SHEET, matching quantity_received / quantity_remaining on the same '
  'row. A purchase lot carries the rate of that delivery; a production_return '
  'lot carries the item''s own average, because a return is not a purchase. '
  'PO receiving used to write the PO line''s per-PACKET unit_price here, i.e. '
  '100x too high against a sheet quantity — fixed alongside 117. Every lot on '
  'live was NULL at that point, so no history needed correcting.';

COMMENT ON COLUMN board_inventory.sheets_per_packet IS
  'Sheets in one packet for this item: 100 for board, 500 or 250 for paper '
  'reams. This is the ONLY conversion between what the store counts and types '
  '(packets) and what is stored and consumed (sheets) — for both quantities '
  'and, since 117, for cost.';

-- ═══════════════════════════════════════════════════════════════════════════
-- VERIFY (read-only)
--
--   SELECT col_description('board_inventory'::regclass, a.attnum) IS NOT NULL AS documented,
--          a.attname
--   FROM pg_attribute a
--   WHERE a.attrelid = 'board_inventory'::regclass
--     AND a.attname IN ('unit_cost','sheets_per_packet');
--   -- expect: both true
--
--   -- Confirms there is still nothing to correct:
--   SELECT count(*) FROM board_inventory_lots WHERE unit_cost IS NOT NULL;
--   SELECT count(*) FROM board_inventory      WHERE unit_cost <> 0;
-- ═══════════════════════════════════════════════════════════════════════════

NOTIFY pgrst, 'reload schema';
