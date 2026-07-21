import { z } from 'zod'

const costingExtraLineSchema = z.object({
  description: z.string().trim().min(1, 'Description is required'),
  category: z.string().optional().nullable(),
  quantity: z.union([z.string(), z.number()]).optional(),
  unit_rate: z.union([z.string(), z.number()]).optional(),
  amount: z.union([z.string(), z.number()]).optional(),
})

// Mirrors the body.* fields the route already reads for job_costings
// (upsert on company_id+job_id) — job_id is required since the upsert's
// onConflict target depends on it.
export const costingSchema = z.object({
  job_id: z.string().uuid('job_id must be a valid id'),
  board_cost: z.union([z.string(), z.number()]).optional(),
  board_sheets: z.union([z.string(), z.number()]).optional().nullable(),
  board_rate: z.union([z.string(), z.number()]).optional().nullable(),
  printing_cost: z.union([z.string(), z.number()]).optional(),
  printing_plates: z.union([z.string(), z.number()]).optional().nullable(),
  plate_cost: z.union([z.string(), z.number()]).optional(),
  ink_cost: z.union([z.string(), z.number()]).optional(),
  lamination_cost: z.union([z.string(), z.number()]).optional(),
  foiling_cost: z.union([z.string(), z.number()]).optional(),
  uv_cost: z.union([z.string(), z.number()]).optional(),
  die_cutting_cost: z.union([z.string(), z.number()]).optional(),
  pasting_cost: z.union([z.string(), z.number()]).optional(),
  other_finishing: z.union([z.string(), z.number()]).optional(),
  labour_cost: z.union([z.string(), z.number()]).optional(),
  overhead_pct: z.union([z.string(), z.number()]).optional(),
  quoted_amount: z.union([z.string(), z.number()]).optional().nullable(),
  costing_notes: z.string().optional().nullable(),
  extra_lines: z.array(costingExtraLineSchema).optional(),
})
