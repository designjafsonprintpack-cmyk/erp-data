import { z } from 'zod'

// Mirrors board_inventory columns (migration 015) the route reads directly —
// description is the only NOT NULL column among these.
export const boardInventorySchema = z.object({
  board_type_id: z.string().uuid().optional().nullable(),
  description: z.string().trim().min(1, 'Description is required'),
  size_l: z.union([z.string(), z.number()]).optional().nullable(),
  size_w: z.union([z.string(), z.number()]).optional().nullable(),
  gsm: z.union([z.string(), z.number()]).optional().nullable(),
  current_stock: z.union([z.string(), z.number()]).optional(),
  reorder_level: z.union([z.string(), z.number()]).optional(),
  unit_id: z.string().uuid().optional().nullable(),
  unit_cost: z.union([z.string(), z.number()]).optional().nullable(),
  location: z.string().optional().nullable(),
})

// PATCH branches on a stock-movement action ('in'/'out'/'adjustment') or
// falls through to `.update(body)` directly with no prior allowlist — this
// schema covers both: movement fields plus the generic-editable columns
// (protected fields like company_id/current_stock-via-generic-patch are
// left out, since stock changes are only meant to happen via the action
// branch, which computes current_stock itself).
export const boardInventoryUpdateSchema = z.object({
  action: z.string().optional(),
  quantity: z.union([z.string(), z.number()]).optional(),
  reference_type: z.string().optional().nullable(),
  reference_id: z.string().uuid().optional().nullable(),
  job_id: z.string().uuid().optional().nullable(),
  notes: z.string().optional().nullable(),
  lot_number: z.string().optional().nullable(),
  vendor_id: z.string().uuid().optional().nullable(),
  unit_cost: z.union([z.string(), z.number()]).optional().nullable(),
  // generic-patch fields
  board_type_id: z.string().uuid().optional().nullable(),
  description: z.string().optional(),
  size_l: z.union([z.string(), z.number()]).optional().nullable(),
  size_w: z.union([z.string(), z.number()]).optional().nullable(),
  gsm: z.union([z.string(), z.number()]).optional().nullable(),
  reorder_level: z.union([z.string(), z.number()]).optional(),
  unit_id: z.string().uuid().optional().nullable(),
  location: z.string().optional().nullable(),
})

const materialRequisitionItemSchema = z.object({
  material_name: z.string().trim().min(1, 'material_name is required'),
  material_type: z.string().optional().nullable(),
  specification: z.string().optional().nullable(),
  quantity_required: z.union([z.string(), z.number()]).optional(),
  unit_id: z.string().uuid().optional().nullable(),
  notes: z.string().optional().nullable(),
})

// Mirrors material_requisitions columns (migration 015) — no column here
// is NOT NULL besides the server-generated mrn_number, so everything the
// client can send stays optional, matching the route's existing behavior.
export const materialRequisitionSchema = z.object({
  job_id: z.string().uuid().optional().nullable(),
  required_date: z.string().optional().nullable(),
  notes: z.string().optional().nullable(),
  items: z.array(materialRequisitionItemSchema).optional(),
})

const issueItemSchema = z.object({
  id: z.string().uuid('Each item needs a valid id'),
  quantity_issued: z.union([z.string(), z.number()]).optional(),
  board_item_id: z.string().uuid().optional().nullable(),
  material_type: z.string().optional().nullable(),
})

// PATCH branches on 'approve'/'issue' actions or falls through to
// `.update(body)` directly with no prior allowlist — this schema covers
// all three paths.
export const materialRequisitionUpdateSchema = z.object({
  action: z.string().optional(),
  items: z.array(issueItemSchema).optional(),
  // generic-patch fields
  job_id: z.string().uuid().optional().nullable(),
  required_date: z.string().optional().nullable(),
  notes: z.string().optional().nullable(),
  status: z.string().optional(),
})

// Mirrors warehouses columns (migration 001) — name is the only NOT NULL
// column among these.
export const warehouseSchema = z.object({
  name: z.string().trim().min(1, 'Name is required'),
  branch_id: z.string().uuid().optional().nullable(),
  location: z.string().optional().nullable(),
})

// PATCH reads `id` out of the body itself (there's no [id] route segment
// for warehouses — it's a flat /warehouses endpoint) to know which row to
// update, so `id` has to be declared here or parseBody would strip the
// field the route depends on.
export const warehouseUpdateSchema = warehouseSchema.partial().extend({
  id: z.string().uuid('id is required'),
})
