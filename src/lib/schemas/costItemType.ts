import { z } from 'zod'

// Mirrors cost_item_types columns (migration 062) — name and unit_basis
// are both NOT NULL, matching the route's own existing manual check.
export const costItemTypeSchema = z.object({
  name: z.string().trim().min(1, 'name is required'),
  unit_basis: z.string().trim().min(1, 'unit_basis is required'),
  default_rate: z.union([z.string(), z.number()]).optional(),
})

export const costItemTypeUpdateSchema = z.object({
  name: z.string().optional(),
  unit_basis: z.string().optional(),
  default_rate: z.union([z.string(), z.number()]).optional(),
})
