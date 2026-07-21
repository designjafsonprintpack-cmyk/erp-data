import { z } from 'zod'

// Mirrors customer_addresses columns (migration 012) — customer_id and
// address_line1 are NOT NULL.
export const addressSchema = z.object({
  customer_id: z.string().uuid('customer_id must be a valid id'),
  label: z.string().optional(),
  address_type: z.string().optional(),
  address_line1: z.string().trim().min(1, 'address_line1 is required'),
  address_line2: z.string().optional().nullable(),
  city: z.string().optional().nullable(),
  state: z.string().optional().nullable(),
  country: z.string().optional().nullable(),
  is_default: z.boolean().optional(),
})

// PATCH reads `id` out of the body itself (flat /addresses endpoint, no
// [id] segment) — declared here so parseBody doesn't strip the field the
// route depends on.
export const addressUpdateSchema = addressSchema.partial().extend({
  id: z.string().uuid('id is required'),
})

// Mirrors customer_contacts columns (migration 012) — customer_id and name
// are NOT NULL.
export const contactSchema = z.object({
  customer_id: z.string().uuid('customer_id must be a valid id'),
  name: z.string().trim().min(1, 'Name is required'),
  designation: z.string().optional().nullable(),
  email: z.string().email().optional().or(z.literal('')).nullable(),
  phone: z.string().optional().nullable(),
  mobile: z.string().optional().nullable(),
  is_primary: z.boolean().optional(),
})

export const contactUpdateSchema = contactSchema.partial().extend({
  id: z.string().uuid('id is required'),
})

// Mirrors customer_activities columns (migration 053) — activity_type and
// subject are NOT NULL, matching the route's own existing manual check.
export const customerActivitySchema = z.object({
  activity_type: z.string().trim().min(1, 'activity_type is required'),
  subject: z.string().trim().min(1, 'subject is required'),
  notes: z.string().optional().nullable(),
  activity_date: z.string().optional().nullable(),
})
