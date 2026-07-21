import { z } from 'zod'

const dispatchItemSchema = z.object({
  job_id: z.string().uuid('job_id must be a valid id'),
  quantity_ordered: z.union([z.string(), z.number()]).optional(),
  quantity_dispatched: z.union([z.string(), z.number()]).optional(),
  carton_count: z.union([z.string(), z.number()]).optional().nullable(),
  weight_kg: z.union([z.string(), z.number()]).optional().nullable(),
  notes: z.string().optional().nullable(),
})

// Mirrors the individual body.* fields the route already reads for
// dispatch_orders (migration 018) — customer_id is the only NOT NULL
// column among these; status/dispatch_number are set server-side and
// deliberately not accepted from the client here.
export const dispatchSchema = z.object({
  customer_id: z.string().uuid('customer_id must be a valid id'),
  delivery_address: z.string().optional().nullable(),
  delivery_city: z.string().optional().nullable(),
  delivery_contact: z.string().optional().nullable(),
  delivery_phone: z.string().optional().nullable(),
  dispatch_method: z.string().optional().nullable(),
  vehicle_number: z.string().optional().nullable(),
  driver_name: z.string().optional().nullable(),
  driver_phone: z.string().optional().nullable(),
  courier_name: z.string().optional().nullable(),
  tracking_number: z.string().optional().nullable(),
  scheduled_date: z.string().optional().nullable(),
  delivery_charges: z.union([z.string(), z.number()]).optional().nullable(),
  notes: z.string().optional().nullable(),
  items: z.array(dispatchItemSchema).optional(),
})

// PATCH does `{ ...body }` with no prior allowlist, and separately reads
// `action` ('dispatch'/'deliver') to drive status transitions before
// deleting it from the update payload — `action` and `status` are declared
// here (unlike POST) so parseBody doesn't strip the field the route's own
// logic depends on reading.
export const dispatchUpdateSchema = z.object({
  customer_id: z.string().uuid().optional(),
  delivery_address: z.string().optional().nullable(),
  delivery_city: z.string().optional().nullable(),
  delivery_contact: z.string().optional().nullable(),
  delivery_phone: z.string().optional().nullable(),
  dispatch_method: z.string().optional().nullable(),
  vehicle_number: z.string().optional().nullable(),
  driver_name: z.string().optional().nullable(),
  driver_phone: z.string().optional().nullable(),
  courier_name: z.string().optional().nullable(),
  tracking_number: z.string().optional().nullable(),
  scheduled_date: z.string().optional().nullable(),
  delivery_charges: z.union([z.string(), z.number()]).optional().nullable(),
  notes: z.string().optional().nullable(),
  status: z.string().optional(),
  action: z.string().optional(),
})

export const podSchema = z.object({
  received_by: z.string().optional().nullable(),
  received_at: z.string().optional().nullable(),
  signature_url: z.string().optional().nullable(),
  photo_url: z.string().optional().nullable(),
  condition: z.string().optional().nullable(),
  damage_notes: z.string().optional().nullable(),
  notes: z.string().optional().nullable(),
})
