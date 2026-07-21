import { z } from 'zod'

const qcResponseSchema = z.object({
  template_item_id: z.string().uuid().optional().nullable(),
  question: z.string().trim().min(1, 'Question is required'),
  is_critical: z.boolean().optional(),
  response: z.string().optional().nullable(),
  notes: z.string().optional().nullable(),
})

// Mirrors qc_inspections columns (migration 017) — job_id is the only
// NOT NULL column the route reads directly from the client.
export const qcInspectionSchema = z.object({
  job_id: z.string().uuid('job_id must be a valid id'),
  template_id: z.string().uuid().optional().nullable(),
  sample_size: z.union([z.string(), z.number()]).optional().nullable(),
  notes: z.string().optional().nullable(),
  responses: z.array(qcResponseSchema).optional(),
})

// PATCH is either the 'signoff' action or a "generic patch" that does
// `.update(body)` directly with no prior allowlist at all — this schema
// closes that gap. `action` is declared so parseBody doesn't strip the
// field the route's own branching depends on reading.
export const qcInspectionUpdateSchema = z.object({
  action: z.string().optional(),
  result: z.string().optional(),
  notes: z.string().optional().nullable(),
  template_id: z.string().uuid().optional().nullable(),
  sample_size: z.union([z.string(), z.number()]).optional().nullable(),
})

// Mirrors qc_defects columns (migration 017) — job_id and defect_type are
// the NOT NULL columns among these.
export const qcDefectSchema = z.object({
  inspection_id: z.string().uuid().optional().nullable(),
  job_id: z.string().uuid('job_id must be a valid id'),
  defect_type: z.string().trim().min(1, 'defect_type is required'),
  severity: z.string().optional(),
  quantity_affected: z.union([z.string(), z.number()]).optional().nullable(),
  description: z.string().optional().nullable(),
  photo_url: z.string().optional().nullable(),
  photo_urls: z.array(z.string()).optional(),
})

// PATCH does `{ ...body }` with no prior allowlist, separately reading
// `action` ('resolve') before deleting it from the update payload.
export const qcDefectUpdateSchema = z.object({
  action: z.string().optional(),
  resolved_notes: z.string().optional().nullable(),
  severity: z.string().optional(),
  description: z.string().optional().nullable(),
  quantity_affected: z.union([z.string(), z.number()]).optional().nullable(),
  photo_url: z.string().optional().nullable(),
  photo_urls: z.array(z.string()).optional(),
})

// Mirrors reprint_requests columns (migration 017) — original_job_id,
// reason, and quantity are all NOT NULL.
export const reprintRequestSchema = z.object({
  original_job_id: z.string().uuid('original_job_id must be a valid id'),
  inspection_id: z.string().uuid().optional().nullable(),
  reason: z.string().trim().min(1, 'Reason is required'),
  quantity: z.union([z.string(), z.number()]),
  priority: z.string().optional(),
  notes: z.string().optional().nullable(),
})

// PATCH branches on 'approve'/'reject'/generic-patch — the generic-patch
// branch does `.update(body)` directly with no prior allowlist, and the
// 'approve' branch separately reads material_quantity/board_item_id to
// optionally deduct board stock.
export const reprintRequestUpdateSchema = z.object({
  action: z.string().optional(),
  notes: z.string().optional().nullable(),
  material_quantity: z.union([z.string(), z.number()]).optional().nullable(),
  board_item_id: z.string().uuid().optional().nullable(),
  priority: z.string().optional(),
  reason: z.string().optional(),
  quantity: z.union([z.string(), z.number()]).optional(),
})
