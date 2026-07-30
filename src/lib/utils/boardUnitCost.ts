/**
 * Board stock costing — the one place the per-sheet cost of an item is worked
 * out, so the two receipt paths (manual Stock In and PO receipt) can never
 * disagree about it.
 *
 * THE UNIT, WRITTEN DOWN
 *   `board_inventory.unit_cost` and `board_inventory_lots.unit_cost` are
 *   **PKR PER SHEET**. Not per packet, not per kg.
 *
 *   This is not a preference — it is forced by the only consumer that spends
 *   the number: api/v1/store/[id] books material onto a job as
 *   `unit_cost * delta`, and `delta` is in sheets (113). A per-packet figure
 *   there overstates every job's board cost by `sheets_per_packet`, i.e. 100×
 *   on board and 500× on a paper ream.
 *
 *   The shop BUYS in packets, so both entry points ask for a packet price and
 *   convert here. Same boundary rule as the stock quantities themselves:
 *   packets are for display and data entry, sheets are what gets stored.
 */

/** A packet price as typed by the user → the per-sheet figure that gets stored. */
export function perSheetFromPacket(packetPrice: number | null | undefined, sheetsPerPacket: number): number | null {
  if (packetPrice == null || !Number.isFinite(packetPrice) || packetPrice <= 0) return null
  const per = sheetsPerPacket > 0 ? sheetsPerPacket : 100
  return packetPrice / per
}

/**
 * The item's new per-sheet cost after a receipt, by weighted average.
 *
 * `unit_cost = 0` means UNKNOWN, not free. Every one of the 51 items loaded in
 * July 2026 carries 0 against real stock, so averaging a priced receipt against
 * that zero would hold the cost near zero for as long as that opening stock
 * lasts — 1.7 million sheets of it. The first priced receipt therefore SETS the
 * rate instead of averaging into a zero, and only later receipts average.
 *
 * A receipt with no price never moves the average: an unpriced delivery is
 * missing information, and letting it pull the rate toward zero would quietly
 * corrupt a figure that was already correct.
 */
export function weightedUnitCost({
  stockBefore, oldUnitCost, sheetsIn, receiptPerSheet,
}: {
  /** Sheets on hand before this receipt. */
  stockBefore: number
  /** The item's current per-sheet cost; 0 or null means not known yet. */
  oldUnitCost: number | null | undefined
  /** Sheets being received. */
  sheetsIn: number
  /** Per-sheet cost of this receipt, or null when the price wasn't given. */
  receiptPerSheet: number | null
}): number | null {
  if (receiptPerSheet == null || receiptPerSheet <= 0) return null   // nothing to learn
  const old = Number(oldUnitCost ?? 0)
  const before = Number(stockBefore ?? 0)
  const incoming = Number(sheetsIn ?? 0)
  if (!(old > 0) || before <= 0 || incoming <= 0) return receiptPerSheet
  return (before * old + incoming * receiptPerSheet) / (before + incoming)
}
