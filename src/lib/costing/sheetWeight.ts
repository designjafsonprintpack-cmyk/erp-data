// Sheet weight — the trade formula, in ONE place.
//
// `L(in) x W(in) x GSM / 15500` is the weight in kg of a BATCH OF 100 SHEETS,
// not of one sheet. This was established from Mehboob's own Cost.xlsx, cell by
// cell, and cross-checked against physical reality: a real 20x30in 300gsm sheet
// weighs about 0.116kg, and the formula gives 11.6129 — exactly 100x that.
// The v3 costing engine multiplied the constant straight by the sheet count
// with no /100 and overstated Board Weight (and Board Cost under per-kg
// costing) by 100x.
//
// It lives here rather than inside the costing engine because BOARD IS BOUGHT
// BY THE KILO. The store needs the identical formula to turn a vendor's per-kg
// rate into the per-sheet cost that jobs are costed at — and if the purchase
// side and the estimating side ever computed weight differently, quoted cost
// and actual cost could never be compared, which is the entire point of
// job_costings.

/** Weight of ONE HUNDRED sheets, in kg. Returns 0 if any input is missing. */
export function sheetWeightPer100Kg(widthIn: number, heightIn: number, gsm: number): number {
  if (!widthIn || !heightIn || !gsm) return 0
  return (widthIn * heightIn * gsm) / 15500
}

/** Weight of ONE sheet, in kg. Returns 0 if any input is missing. */
export function sheetWeightKg(widthIn: number, heightIn: number, gsm: number): number {
  return sheetWeightPer100Kg(widthIn, heightIn, gsm) / 100
}
