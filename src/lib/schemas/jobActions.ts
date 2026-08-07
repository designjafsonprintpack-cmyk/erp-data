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
  // Is RUN ka apna layout. Die wohi purani rehti hai, magar ek run screen
  // printing wale spot UV ya doosre board ki wajah se kam ups par chal sakta
  // hai — aur us ke sath sheet size bhi badalta hai. Na bheja jaye to parent
  // wala layout hi chalta hai (purana behaviour).
  ups: z.union([z.string(), z.number()]).optional().nullable(),
  sheet_width_in: z.union([z.string(), z.number()]).optional().nullable(),
  sheet_height_in: z.union([z.string(), z.number()]).optional().nullable(),
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

/**
 * Press proof (migration 104). A proof run is ordered in SHEETS — "100, 200 ya
 * 500 sheets" — never in boxes, so sheet_qty is the only quantity asked for.
 * artwork_id records WHICH version went on the press, which is the one thing a
 * colour dispute later turns on; it is optional because a job may have no
 * artwork row yet when the first proof is pulled.
 */
export const proofCreateSchema = z.object({
  sheet_qty: z.union([z.string(), z.number()]),
  artwork_id: blankToNull(z.string().uuid().optional().nullable()),
  notes: z.string().optional().nullable(),
})

/**
 * The customer's verdict on a proof round. 'pending' is not accepted here —
 * that is the state a proof is created in, not something anyone sets by hand.
 */
export const proofVerdictSchema = z.object({
  proof_job_id: z.string().uuid('proof_job_id is required'),
  result: z.enum(['approved', 'changes_required']),
  notes: z.string().optional().nullable(),
})

export const jobWorkflowActionSchema = z.object({
  stage_progress_id: z.string().uuid('stage_progress_id is required'),
  action: z.enum(['start', 'complete', 'skip']),
  notes: z.string().optional().nullable(),
})
