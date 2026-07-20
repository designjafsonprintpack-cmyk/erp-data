// Quotation Costing Engine — pure calculation, no I/O. Ups is always a manual
// estimator input (same convention as jobs.ups): box dieline nesting isn't a
// simple L/W grid, so it's never auto-derived from raw dimensions.
//
// v3 — removed overhead%/margin% auto-pricing per Mehboob's request: the
// engine now only computes COST. Profit is whatever the estimator's chosen
// unit price leaves after cost — an output shown live, not an input that
// drives the price. Sheet size, board GSM, and board rate are all editable
// per line (pre-filled from the selected Board Type but overridable), since
// a custom/one-off sheet size not in the catalog still needs to be costable.
//
//   - Board weight: L(in) × W(in) × GSM / 15500 per sheet (trade formula,
//     verified against Mehboob's own worksheet).
//   - UV/Lamination/Foiling are area-based (rate × sheet sqft × sheet qty),
//     same formula as each other — part of the generic cost-line list with
//     a 'per_sqft' basis.
//   - Printing needs a color multiplier AND stepped-1000 rounding together
//     ('per_1000_sheets_per_color'). Embossing/Die-Cutting/Breaking use
//     plain 'per_1000_sheets' — no color multiplier.
//   - Pasting is priced on box quantity + wastage%, per 1000 — not sheets.
//   - "Stepped 1000" rounding: remainder ≤ 200 rounds down to the block
//     below, otherwise rounds up — always at least 1 block for qty > 0.

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
}

const round2 = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100

// One sheet's weight in KG — trade formula: L(in) × W(in) × GSM / 15500.
function sheetWeightKg(lengthIn: number, widthIn: number, gsm: number): number {
  if (!lengthIn || !widthIn || !gsm) return 0
  return (lengthIn * widthIn * gsm) / 15500
}

// "Stepped 1000" block count: remainder ≤ 200 rounds down, otherwise up,
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

  const boardWeightKg = input.boardCostingMethod === 'per_kg'
    ? sheetWeightKg(input.sheetLengthIn, input.sheetWidthIn, input.boardGsm) * grossSheetQty
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
  }
}
