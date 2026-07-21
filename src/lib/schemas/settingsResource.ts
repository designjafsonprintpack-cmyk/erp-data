import { z } from 'zod'

// One route serves 3 different tables (units/currencies/taxes), each with
// slightly different columns beyond the common `name` (symbol/unit_type
// for units, code/exchange_rate_to_base for currencies, rate_percent for
// taxes). Same reasoning as the material-types schema: validate the one
// thing every one of them requires and pass the rest through unvalidated,
// matching the route's own generic treatment of them.
export const settingsResourceSchema = z.object({
  name: z.string().trim().min(1, 'Name is required'),
}).passthrough()

export const settingsResourceUpdateSchema = z.object({
  id: z.string().uuid('id is required'),
  name: z.string().optional(),
}).passthrough()

// Mirrors the route's own fixed KEYS allowlist for costing-rate settings —
// any of these may be present, each as a string or number value.
const costingRateValue = z.union([z.string(), z.number()])
export const costingRatesUpdateSchema = z.object({
  costing_plate_rate_per_color: costingRateValue.optional(),
  costing_printing_rate_per_1000: costingRateValue.optional(),
  costing_die_cutting_rate_per_1000: costingRateValue.optional(),
  costing_pasting_rate_per_1000: costingRateValue.optional(),
  costing_foiling_rate_per_sheet: costingRateValue.optional(),
  costing_embossing_rate_per_1000: costingRateValue.optional(),
  costing_die_making_rate_per_ups: costingRateValue.optional(),
  costing_breaking_rate_per_1000: costingRateValue.optional(),
  costing_packing_rate_per_1000_boxes: costingRateValue.optional(),
  costing_cartage_rate_per_1000_boxes: costingRateValue.optional(),
  costing_default_wastage_percent: costingRateValue.optional(),
  costing_default_overhead_percent: costingRateValue.optional(),
  costing_default_margin_percent: costingRateValue.optional(),
})
