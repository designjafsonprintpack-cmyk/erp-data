import { z } from 'zod'

export const jobRemarkSchema = z.object({
  notes: z.string().trim().min(1, 'Notes required'),
})

export const jobHoldSchema = z.object({
  hold_reason_id: z.string().uuid('Delay reason is required'),
  hold_notes: z.string().optional().nullable(),
})

export const jobResumeSchema = z.object({
  notes: z.string().optional().nullable(),
})

// Either { plate_id } to reuse an existing plate, or { color, plate_size,
// ... } to make a new one — mirrors the route's own branching logic.
export const jobPlateAssignSchema = z.object({
  plate_id: z.string().uuid().optional(),
  color: z.string().optional(),
  plate_size: z.string().optional().nullable(),
  machine_id: z.string().uuid().optional().nullable(),
  operator_id: z.string().uuid().optional().nullable(),
})

export const jobRepeatSchema = z.object({
  quantity: z.union([z.string(), z.number()]).optional(),
  required_date: z.string().optional().nullable(),
  notes: z.string().optional().nullable(),
  same_artwork: z.boolean().optional(),
})

/**
 * A `<select>` left on its blank option sends '', and z.string().uuid()
 * rejects that — so "record wastage without picking a machine" was failing
 * validation with a 400 instead of meaning "no machine". Same class of bug as
 * the one in src/lib/schemas/job.ts; same fix.
 */
const blankToNull = <T extends z.ZodTypeAny>(schema: T) =>
  z.preprocess(v => (v === '' ? null : v), schema)

// Mirrors job_wastage columns — wastage_reason_id is required, matching
// the route's own existing manual check.
export const jobWastageSchema = z.object({
  wastage_reason_id: z.string().uuid('Reason is required'),
  quantity: z.union([z.string(), z.number()]),
  stage_progress_id: blankToNull(z.string().uuid().optional().nullable()),
  machine_id: blankToNull(z.string().uuid().optional().nullable()),
  shift: blankToNull(z.enum(['A', 'B', 'C']).optional().nullable()),
  notes: z.string().optional().nullable(),
})

// Mirrors job_ink_usage (migration 102), which itself mirrors job_wastage.
export const jobInkSchema = z.object({
  ink_type_id: z.string().uuid('Ink is required'),
  quantity_kg: z.union([z.string(), z.number()]),
  stage_progress_id: blankToNull(z.string().uuid().optional().nullable()),
  machine_id: blankToNull(z.string().uuid().optional().nullable()),
  shift: blankToNull(z.enum(['A', 'B', 'C']).optional().nullable()),
  notes: z.string().optional().nullable(),
})

export const jobWorkflowActionSchema = z.object({
  stage_progress_id: z.string().uuid('stage_progress_id is required'),
  action: z.enum(['start', 'complete', 'skip']),
  notes: z.string().optional().nullable(),
})
