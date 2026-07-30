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
 *   BOARD IS BOUGHT BY THE KILO — Mehboob's correction, and the reason
 *   `perSheetFromKgRate` exists. It uses the SAME weight formula the estimator
 *   costs with (`sheetWeightPer100Kg`, from Cost.xlsx), so the rate a job is
 *   costed at and the rate it was quoted at are finally the same arithmetic.
 *   Paper invoices still come per ream, so the packet path stays too.
 *
 *   Either way the entry point asks in the unit the vendor's invoice uses and
 *   converts here. Same boundary rule as the stock quantities themselves:
 *   packets and kilos are for display and data entry, sheets are what gets
 *   stored.
 */
import { sheetWeightKg } from '@/lib/costing/sheetWeight'

/**
 * A per-KG rate → the per-sheet figure that gets stored. This is how board
 * actually arrives.
 *
 * Returns null when the item has no sheet size or no GSM, because then its
 * weight is genuinely unknown and there is no honest per-sheet figure to
 * derive — the caller must say so rather than storing a 0 that would read as
 * "free". 24 of the 51 items on live are in exactly that state.
 */
export function perSheetFromKgRate(
  ratePerKg: number | null | undefined,
  widthIn: number | null | undefined,
  heightIn: number | null | undefined,
  gsm: number | null | undefined,
): number | null {
  if (ratePerKg == null || !Number.isFinite(ratePerKg) || ratePerKg <= 0) return null
  const kgPerSheet = sheetWeightKg(Number(widthIn ?? 0), Number(heightIn ?? 0), Number(gsm ?? 0))
  if (!(kgPerSheet > 0)) return null
  return ratePerKg * kgPerSheet
}

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
