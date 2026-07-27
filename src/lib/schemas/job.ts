import { z } from 'zod'

/**
 * A blank select or an untouched input sends '', which is NOT a value — it
 * means "not set". Postgres does not agree: '' fails the DATE cast on
 * required_date and the UUID cast on every FK. (It was this same problem on
 * the now-removed grain_direction field, whose CHECK constraint rejected '',
 * that surfaced the whole class.)
 *
 * For a NULLABLE column, '' becomes NULL. That fixes the crash and also makes
 * clearing a field work: previously the uuid fields mapped '' to undefined,
 * which dropped them from the update entirely, so once a board type was set
 * it could never be removed.
 */
const blankToNull = <T extends z.ZodTypeAny>(schema: T) =>
  z.preprocess(v => (v === '' ? null : v), schema)

/**
 * For a NOT NULL column, a blank must DROP OUT of the update instead — NULL
 * would violate the constraint, so the existing value is left alone.
 */
const blankToUndefined = <T extends z.ZodTypeAny>(schema: T) =>
  z.preprocess(v => (v === '' ? undefined : v), schema)


// Mirrors the fields already read from the request body in
// jobs/route.ts (POST) and jobs/[id]/route.ts (PATCH). Only customer_id
// and job_title are required — matching the NOT NULL constraints on the
// jobs table (migration 014); quantity is also NOT NULL in the DB but has
// a DEFAULT 0, and the route already coerces a missing value to 0, so it
// stays optional here to preserve that existing behavior. status/priority
// are left as free-form strings rather than a strict enum — the DB CHECK
// constraint already enforces the allowed values, so Zod doesn't need to
// duplicate that list and risk rejecting a value some other role legitimately
// uses in the future without this schema being updated in lockstep.
export const jobSchema = z.object({
  customer_id: z.string().uuid('customer_id must be a valid id'),
  sales_order_id: blankToNull(z.string().uuid().optional().nullable()),
  sales_order_item_id: blankToNull(z.string().uuid().optional().nullable()),
  job_title: z.string().trim().min(1, 'Job title is required'),
  description: blankToNull(z.string().optional().nullable()),
  size_l: blankToNull(z.union([z.string(), z.number()]).optional().nullable()),
  size_w: blankToNull(z.union([z.string(), z.number()]).optional().nullable()),
  size_h: blankToNull(z.union([z.string(), z.number()]).optional().nullable()),
  sheet_width_in: blankToNull(z.union([z.string(), z.number()]).optional().nullable()),
  sheet_height_in: blankToNull(z.union([z.string(), z.number()]).optional().nullable()),
  box_type_id: blankToNull(z.string().uuid().optional().nullable()),
  quantity: blankToUndefined(z.union([z.string(), z.number()]).optional()),
  no_of_colors: blankToNull(z.union([z.string(), z.number()]).optional().nullable()),
  die_number: blankToNull(z.string().optional().nullable()),
  gsm: blankToNull(z.union([z.string(), z.number()]).optional().nullable()),
  ups: blankToNull(z.union([z.string(), z.number()]).optional().nullable()),
  board_type_id: blankToNull(z.string().uuid().optional().nullable()),
  paper_type_id: blankToNull(z.string().uuid().optional().nullable()),
  lamination_type_id: blankToNull(z.string().uuid().optional().nullable()),
  uv_coating: blankToNull(z.string().optional().nullable()),
  foil_type_id: blankToNull(z.string().uuid().optional().nullable()),
  special_finishing: blankToNull(z.string().optional().nullable()),
  pasting: blankToNull(z.string().optional().nullable()),
  workflow_template_id: blankToNull(z.string().uuid().optional().nullable()),
  priority: blankToUndefined(z.string().optional().nullable()),
  required_date: blankToNull(z.string().optional().nullable()),
  quoted_amount: blankToNull(z.union([z.string(), z.number()]).optional().nullable()),
  internal_remarks: blankToNull(z.string().optional().nullable()),

  // ─── "Repeat with Changes" (migration 097) ────────────────────────────────
  // A changed repeat is created through THIS route, not /jobs/[id]/repeat:
  // that route copies the parent's specs and only accepts a quantity and date
  // override, whereas the whole point here is that every spec is editable.
  // Passing parent_job_id turns an ordinary create into a linked repeat.
  parent_job_id: blankToNull(z.string().uuid().optional().nullable()),
  repeat_kind: blankToNull(z.enum(['exact', 'changed']).optional().nullable()),
  changed_aspects: z.array(z.enum([
    'design', 'expiry', 'printed_rate', 'size',
    'board_gsm', 'colors', 'die', 'finishing', 'other',
  ])).optional(),
  change_note: blankToNull(z.string().optional().nullable()),
})

// PATCH accepts everything create does (all optional here) plus `status`,
// which POST deliberately never reads (new jobs are always created with
// status 'new' server-side).
export const jobUpdateSchema = jobSchema.partial().extend({
  status: blankToUndefined(z.string().optional()),
})
