import { z } from 'zod'

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
  sales_order_id: z.string().uuid().optional().nullable(),
  job_title: z.string().trim().min(1, 'Job title is required'),
  description: z.string().optional().nullable(),
  size_l: z.union([z.string(), z.number()]).optional().nullable(),
  size_w: z.union([z.string(), z.number()]).optional().nullable(),
  size_h: z.union([z.string(), z.number()]).optional().nullable(),
  sheet_size: z.string().optional().nullable(),
  quantity: z.union([z.string(), z.number()]).optional(),
  no_of_colors: z.union([z.string(), z.number()]).optional().nullable(),
  die_number: z.string().optional().nullable(),
  grain_direction: z.string().optional().nullable(),
  ups: z.union([z.string(), z.number()]).optional().nullable(),
  board_type_id: z.string().uuid().optional().nullable(),
  paper_type_id: z.string().uuid().optional().nullable(),
  lamination_type_id: z.string().uuid().optional().nullable(),
  uv_coating: z.string().optional().nullable(),
  foil_type_id: z.string().uuid().optional().nullable(),
  special_finishing: z.string().optional().nullable(),
  pasting: z.string().optional().nullable(),
  workflow_template_id: z.string().uuid().optional().nullable(),
  priority: z.string().optional().nullable(),
  required_date: z.string().optional().nullable(),
  quoted_amount: z.union([z.string(), z.number()]).optional().nullable(),
  internal_remarks: z.string().optional().nullable(),
})

// PATCH accepts everything create does (all optional here) plus `status`,
// which POST deliberately never reads (new jobs are always created with
// status 'new' server-side).
export const jobUpdateSchema = jobSchema.partial().extend({
  status: z.string().optional(),
})
