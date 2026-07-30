import { z } from 'zod'

const machineAssignmentSchema = z.object({
  machine_id: z.string().uuid('machine_id must be a valid id'),
  stage_id: z.string().uuid().optional().nullable(),
  estimated_hours: z.union([z.string(), z.number()]).optional().nullable(),
  operator_id: z.string().uuid().optional().nullable(),
  notes: z.string().optional().nullable(),
})

// Mirrors job_plans columns (migration 015) — job_id and planned_date are
// both NOT NULL.
export const jobPlanSchema = z.object({
  job_id: z.string().uuid('job_id must be a valid id'),
  planned_date: z.string().trim().min(1, 'planned_date is required'),
  notes: z.string().optional().nullable(),
  machines: z.array(machineAssignmentSchema).optional(),
})

// PATCH does `.update(body)` directly with no prior allowlist.
export const jobPlanUpdateSchema = z.object({
  planned_date: z.string().optional(),
  notes: z.string().optional().nullable(),
  status: z.string().optional(),
})

// The whole day's order in one call, not two-row swaps: idempotent, closes gaps
// left by deletes, and can't drift. `day_order` is written 1..n in this array's
// order (migration 112).
export const planReorderSchema = z.object({
  planned_date: z.string().trim().min(1, 'planned_date is required'),
  ordered_ids: z.array(z.string().uuid('ordered_ids must all be valid ids'))
    .min(1, 'ordered_ids cannot be empty'),
})

// Full desired machine list for an existing plan. `id` present = an existing
// assignment to keep (and possibly update); absent = a new one to insert.
// Anything not listed is deactivated — see the route for why it is never
// hard-deleted.
export const planMachinesSchema = z.object({
  machines: z.array(machineAssignmentSchema.extend({
    id: z.string().uuid().optional(),
  })),
})
