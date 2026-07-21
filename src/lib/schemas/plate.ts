import { z } from 'zod'

const plateColorRowSchema = z.object({
  color: z.string().trim().min(1, 'color is required'),
  mode: z.enum(['new', 'old']),
  existing_plate_id: z.string().uuid().optional(),
})

// "Add Plates" flow — one job/size/machine, several color rows, each
// independently a brand-new plate or a reused in-storage one. Mirrors what
// the route already reads from body.colors/job_id/plate_size/machine_id.
export const addPlatesSchema = z.object({
  job_id: z.string().uuid().optional().nullable(),
  plate_size: z.string().optional().nullable(),
  machine_id: z.string().uuid().optional().nullable(),
  made_date: z.string().optional().nullable(),
  colors: z.array(plateColorRowSchema).min(1, 'Add at least one color'),
})

// Already explicitly allowlisted in the route itself (if body.x !== undefined
// pattern) — this schema mainly adds type-correctness, not a new allowlist.
export const plateUpdateSchema = z.object({
  plate_size: z.string().optional().nullable(),
  status: z.string().optional(),
  color: z.string().optional(),
  made_date: z.string().optional().nullable(),
})

export const plateReplaceSchema = z.object({
  reason: z.string().optional().nullable(),
})

export const jobPlateReturnSchema = z.object({
  condition_on_return: z.string(),
})
