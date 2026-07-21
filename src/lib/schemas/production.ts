import { z } from 'zod'

// Mirrors production_assignments columns (migration 016) — job_id and
// machine_id are the only NOT NULL columns among these.
export const productionAssignmentSchema = z.object({
  job_id: z.string().uuid('job_id must be a valid id'),
  machine_id: z.string().uuid('machine_id must be a valid id'),
  stage_progress_id: z.string().uuid().optional().nullable(),
  operator_id: z.string().uuid().optional().nullable(),
  scheduled_start: z.string().optional().nullable(),
  estimated_minutes: z.union([z.string(), z.number()]).optional().nullable(),
  notes: z.string().optional().nullable(),
})

// PATCH is action-driven (start/pause/resume/complete/note/issue) with a
// "generic patch" fallback for anything else, which does
// `Object.assign(updateData, body)` after stripping action/notes/
// quantity_done — declaring the legitimate generic-patch fields here (and
// leaving out actual_start/actual_end/actual_minutes/company_id/job_id,
// which only the action-based cases should ever set) closes that gap the
// same way the other action-driven PATCH schemas in this batch do.
export const productionAssignmentUpdateSchema = z.object({
  action: z.string().optional(),
  notes: z.string().optional().nullable(),
  quantity_done: z.union([z.string(), z.number()]).optional().nullable(),
  machine_id: z.string().uuid().optional(),
  operator_id: z.string().uuid().optional().nullable(),
  stage_progress_id: z.string().uuid().optional().nullable(),
  status: z.string().optional(),
  scheduled_start: z.string().optional().nullable(),
  estimated_minutes: z.union([z.string(), z.number()]).optional().nullable(),
})
