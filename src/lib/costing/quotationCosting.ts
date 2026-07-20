// Quotation Costing Engine — pure calculation, no I/O.
//
// v4 — rebuilt to match Mehboob's Cost.xlsx line-by-line (formulas analyzed
// cell by cell, not just item names). Ups is always a manual estimator
// input (same convention as jobs.ups): box dieline nesting isn't a simple
// L/W grid, so it's never auto-derived from raw dimensions.
//
//   - Board weight: the Excel's own "Packets / Pkt Weight" section proves
//     `L(in) x W(in) x GSM / 15500` is the weight of a BATCH OF 100 SHEETS
//     in kg — not one sheet. (Verified: a real 20x30in 300gsm sheet weighs
//     ~0.116kg; that formula gives 11.6129, which is exactly 100x — i.e.
//     the weight of 100 such sheets.) The v3 engine multiplied this
//     constant directly by sheet count with no /100, overstating Board
//     Weight (and Board Cost under Per-KG costing) by 100x. Fixed here.
//   - UV/Lamination/Foiling are area-based (rate x sheet sqft x sheet qty).
//   - Printing multiplies by BOTH the color count AND stepped-1000
//     rounding ('per_1000_sheets_per_color') — confirmed with Mehboob;
//     the raw Excel is missing the color multiplier there (a mistake).
//   - Embossing/Die-Cutting/Breaking use plain 'per_1000_sheets' — no
//     color multiplier. The raw Excel's Breaking row multiplies by color
//     (copied from the Printing row by mistake) — confirmed with Mehboob
//     to drop it, consistent with Embossing/Die-Cutting.
//   - Pasting is priced on box quantity + wastage%, per 1000.
//   - "Stepped 1000" rounding: remainder <= 200 rounds down to the block
//     below, otherwise rounds up — always at least 1 block for qty > 0.
//   - Packet Size (L/W) + Div: the Excel has these fields but its own Pkt
//     Weight formula actually reads the Sheet Size cells, not the Packet
//     Size cells — dead/decorative in the original. Kept editable per
//     Mehboob's request for future use, and wired to an actual formula
//     using the real packet dimensions here (informational only — does
//     NOT feed into Board Weight/Board Cost/Total Cost).
//   - Profit Margin %: re-activated per Mehboob's request. Suggested Unit
//     Price = (Total Cost x (1 + margin% / 100)) / Quantity. Still just a
//     suggestion the estimator can override — see applyMargin in the form.

export type UnitBasis =
  | 'per_sheet' | 'per_1000_sheets' | 'per_1000_sheets_per_color' | 'per_plate'
  | 'per_ups' | 'per_1000_boxes' | 'per_1000_boxes_carton' | 'per_sqft' | 'per_1000_boxes_wastage'

export interface DynamicCostLine {
  name: string
  unitBasis: UnitBasis
  rate: number
}

export interface CostingInput {
  quantity: number
  ups: number
  wastagePercent: number
  noOfColors: number
  boardCostingMethod: 'per_sheet' | 'per_kg'
  boardRatePerSheet: number
  boardRatePerKg: number
  boardGsm: number
  sheetLengthIn: number
  sheetWidthIn: number
  costLines: DynamicCostLine[]
  profitMarginPercent: number
  // Informational only — Packet Size + Div (Excel parity, does not affect cost)
  packetLengthIn?: number
  packetWidthIn?: number
  packetDiv?: number
}

export interface DynamicCostLineResult extends DynamicCostLine {
  quantityUsed: number
  amount: number
}

export interface CostingResult {
  sheetQty: number
  grossSheetQty: number
  sheetsBilledBlocks: number   // stepped-1000 block count, for display next to any "per 1000 sheets" line
  boardWeightKg: number
  boardCost: number
  costLines: DynamicCostLineResult[]
  costLinesTotal: number
  totalCost: number
  costPerUnit: number
  profitAmount: number
  agreedRate: number           // Total Cost + Profit Amount, for the whole order quantity
  suggestedUnitPrice: number   // Agreed Rate / Quantity
  // Informational only (Excel "Packets" / "Pkt Weight") — not a cost driver
  packets: number
  pktWeightKg: number
}

const round2 = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100

// Weight of ONE HUNDRED sheets, in kg — trade constant: L(in) x W(in) x GSM / 15500.
function sheetWeightPer100Kg(lengthIn: number, widthIn: number, gsm: number): number {
  if (!lengthIn || !widthIn || !gsm) return 0
  return (lengthIn * widthIn * gsm) / 15500
}

// "Stepped 1000" block count: remainder <= 200 rounds down, otherwise up,
// minimum 1 block for any quantity > 0.
function steppedThousandBlocks(sheets: number): number {
  if (sheets <= 0) return 0
  const remainder = sheets % 1000
  const blocks = remainder <= 200 ? Math.floor(sheets / 1000) : Math.floor(sheets / 1000) + 1
  return Math.max(1, blocks)
}

function quantityForBasis(
  basis: UnitBasis,
  grossSheetQty: number, ups: number, noOfColors: number, boxQty: number,
  sqftPerSheet: number, wastagePercent: number
): number {
  switch (basis) {
    case 'per_sheet':                  return grossSheetQty
    case 'per_1000_sheets':            return steppedThousandBlocks(grossSheetQty)
    case 'per_1000_sheets_per_color':  return steppedThousandBlocks(grossSheetQty) * Math.max(noOfColors || 0, 0)
    case 'per_plate':                  return Math.max(noOfColors || 0, 0)
    case 'per_ups':                    return ups
    case 'per_1000_boxes':             return boxQty / 1000
    case 'per_1000_boxes_carton':      return boxQty / 1000
    case 'per_1000_boxes_wastage':     return (boxQty + boxQty * (wastagePercent / 100)) / 1000
    case 'per_sqft':                   return sqftPerSheet * grossSheetQty
  }
}

export function calculateQuotationItemCost(input: CostingInput): CostingResult {
  const ups = Math.max(input.ups || 0, 0)
  const quantity = Math.max(input.quantity || 0, 0)
  const wastagePercent = Math.max(input.wastagePercent || 0, 0)

  const sheetQty = ups > 0 ? Math.ceil(quantity / ups) : 0
  const grossSheetQty = Math.ceil(sheetQty * (1 + wastagePercent / 100))
  // Boxes produced = pieces, same as quantity for a single-item box/carton
  // job — packing/cartage/pasting are priced per box, and one "piece" here
  // is one finished box, matching the worksheet's own convention.
  const boxQty = quantity
  const sqftPerSheet = input.sheetLengthIn && input.sheetWidthIn ? (input.sheetLengthIn * input.sheetWidthIn) / 144 : 0

  // Board weight — FIXED: sheetWeightPer100Kg is the weight of a batch of
  // 100 sheets, so total weight = grossSheetQty / 100 x that constant, not
  // grossSheetQty x that constant directly (the old 100x-overstated bug).
  const boardWeightKg = input.boardCostingMethod === 'per_kg'
    ? (grossSheetQty / 100) * sheetWeightPer100Kg(input.sheetLengthIn, input.sheetWidthIn, input.boardGsm)
    : 0
  const boardCost = input.boardCostingMethod === 'per_kg'
    ? boardWeightKg * (input.boardRatePerKg || 0)
    : grossSheetQty * (input.boardRatePerSheet || 0)

  const costLines: DynamicCostLineResult[] = (input.costLines || []).map(line => {
    const quantityUsed = quantityForBasis(line.unitBasis, grossSheetQty, ups, input.noOfColors, boxQty, sqftPerSheet, wastagePercent)
    return { ...line, quantityUsed, amount: round2(quantityUsed * (line.rate || 0)) }
  })
  const costLinesTotal = costLines.reduce((s, l) => s + l.amount, 0)

  const totalCost = boardCost + costLinesTotal
  const costPerUnit = quantity > 0 ? totalCost / quantity : 0

  const profitMarginPercent = Math.max(input.profitMarginPercent || 0, 0)
  const profitAmount = totalCost * (profitMarginPercent / 100)
  const agreedRate = totalCost + profitAmount
  const suggestedUnitPrice = quantity > 0 ? agreedRate / quantity : 0

  // Informational Packets / Pkt Weight — uses the actual Packet Size
  // fields (unlike the raw Excel, which reads Sheet Size here by mistake).
  // Div cancels out of Total KG either way, so this never feeds boardCost.
  const div = input.packetDiv && input.packetDiv > 0 ? input.packetDiv : 1
  const packets = div > 0 ? grossSheetQty / 100 / div : 0
  const pktWeightKg = input.packetLengthIn && input.packetWidthIn
    ? sheetWeightPer100Kg(input.packetLengthIn, input.packetWidthIn, input.boardGsm) / 100 * div
    : 0

  return {
    sheetQty,
    grossSheetQty,
    sheetsBilledBlocks: steppedThousandBlocks(grossSheetQty),
    boardWeightKg: round2(boardWeightKg),
    boardCost: round2(boardCost),
    costLines,
    costLinesTotal: round2(costLinesTotal),
    totalCost: round2(totalCost),
    costPerUnit: round2(costPerUnit),
    profitAmount: round2(profitAmount),
    agreedRate: round2(agreedRate),
    suggestedUnitPrice: round2(suggestedUnitPrice),
    packets: round2(packets),
    pktWeightKg: round2(pktWeightKg),
  }
}
