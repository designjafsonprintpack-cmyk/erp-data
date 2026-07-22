import { z } from 'zod'

// ─── Delay Reasons (migration 011) — name is the only NOT NULL column ───────
export const delayReasonSchema = z.object({
  name: z.string().trim().min(1, 'Name is required'),
  category: z.string().optional(),
})
// PATCH reads `id` out of the body itself (flat endpoint, no [id] segment).
export const delayReasonUpdateSchema = delayReasonSchema.partial().extend({
  id: z.string().uuid('id is required'),
})

// ─── Departments (migration 002) — name and code are NOT NULL ───────────────
export const departmentSchema = z.object({
  name: z.string().trim().min(1, 'Name is required'),
  code: z.string().trim().min(1, 'Code is required'),
  description: z.string().optional().nullable(),
})
export const departmentUpdateSchema = departmentSchema.partial().extend({
  id: z.string().uuid('id is required'),
})

// ─── Job Statuses (migration 011) — name and slug are NOT NULL ──────────────
export const jobStatusSchema = z.object({
  name: z.string().trim().min(1, 'Name is required'),
  slug: z.string().trim().min(1, 'slug is required'),
  color_hex: z.string().optional(),
  sort_order: z.union([z.string(), z.number()]).optional(),
  is_system: z.boolean().optional(),
})
export const jobStatusUpdateSchema = jobStatusSchema.partial().extend({
  id: z.string().uuid('id is required'),
})

// ─── Material Types (migration 007) — one route serves 7 different tables
// (board/paper/ink/glue/foil/lamination/coating types), each with slightly
// different optional columns beyond the common `name`. Rather than one
// fixed schema per table (a lot of near-duplicate schemas for a route that
// itself treats them generically), this validates the one thing every one
// of them requires — `name` — and passes the rest through unvalidated,
// same as the route already treats them.
// Numeric columns shared by board/paper types (gsm is INTEGER, the rest are
// NUMERIC — see migrations 007/046/062). The form sends '' for a blank
// field; that must become null, not reach Postgres as an empty string.
const materialTypeNumeric = z.preprocess(
  (v) => (v === '' || v === undefined ? null : v),
  z.coerce.number().nullable(),
).optional()

const materialTypeNumericFields = {
  gsm: materialTypeNumeric,
  sheet_length_in: materialTypeNumeric,
  sheet_width_in: materialTypeNumeric,
  rate_per_sheet: materialTypeNumeric,
  rate_per_kg: materialTypeNumeric,
}

export const materialTypeSchema = z.object({
  name: z.string().trim().min(1, 'Name is required'),
  ...materialTypeNumericFields,
}).passthrough()
export const materialTypeUpdateSchema = z.object({
  id: z.string().uuid('id is required'),
  name: z.string().optional(),
  ...materialTypeNumericFields,
}).passthrough()

// ─── Document Sequences — PATCH only, no insert route ───────────────────────
export const sequenceUpdateSchema = z.object({
  document_type: z.string().trim().min(1, 'document_type is required'),
  prefix: z.string().optional(),
  padding: z.union([z.string(), z.number()]).optional(),
})

// ─── Workflow Templates (migration 010) — name is NOT NULL ──────────────────
export const workflowTemplateSchema = z.object({
  name: z.string().trim().min(1, 'Name is required'),
  description: z.string().optional().nullable(),
})
// PATCH reads `id` out of the body itself (flat endpoint, no [id] segment).
export const workflowTemplateUpdateSchema = z.object({
  id: z.string().uuid('id is required'),
  name: z.string().optional(),
  description: z.string().optional().nullable(),
  is_default: z.boolean().optional(),
})

// ─── Workflow Stages (migration 010 + 069) — workflow_template_id and name
// are NOT NULL.
export const workflowStageSchema = z.object({
  workflow_template_id: z.string().uuid('workflow_template_id must be a valid id'),
  name: z.string().trim().min(1, 'Name is required'),
  department_id: z.string().uuid().optional().nullable(),
  sequence_order: z.union([z.string(), z.number()]).optional(),
  is_optional: z.boolean().optional(),
  estimated_hours: z.union([z.string(), z.number()]).optional().nullable(),
  stage_type: z.string().optional().nullable(),
})
export const workflowStageUpdateSchema = z.object({
  id: z.string().uuid('id is required'),
  workflow_template_id: z.string().uuid().optional(),
  name: z.string().optional(),
  department_id: z.string().uuid().optional().nullable(),
  sequence_order: z.union([z.string(), z.number()]).optional(),
  is_optional: z.boolean().optional(),
  is_active: z.boolean().optional(),
  estimated_hours: z.union([z.string(), z.number()]).optional().nullable(),
  stage_type: z.string().optional().nullable(),
})

// ─── Branches (migration 001) — name is NOT NULL ─────────────────────────────
export const branchSchema = z.object({
  name: z.string().trim().min(1, 'Name is required'),
  address: z.string().optional().nullable(),
  is_head_office: z.boolean().optional(),
})
// PATCH reads `id` out of the body itself (flat endpoint, no [id] segment).
export const branchUpdateSchema = branchSchema.partial().extend({
  id: z.string().uuid('id is required'),
})

// ─── Company (migration 001) — already explicitly allowlisted in the route
// itself (destructures name/ntn/address) — this just adds type-correctness.
export const companyUpdateSchema = z.object({
  name: z.string().optional(),
  ntn: z.string().optional().nullable(),
  address: z.string().optional().nullable(),
  logo_url: z.string().optional().nullable(),
})
