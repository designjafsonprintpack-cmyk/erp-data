import { z } from 'zod'

// Mirrors the field allowlist already used in customers/[id] PATCH — kept in
// sync deliberately so create and edit accept the same shape.
export const customerSchema = z.object({
  name: z.string().trim().min(1, 'Customer name is required'),
  email: z.string().email().optional().or(z.literal('')).nullable(),
  phone: z.string().optional().nullable(),
  mobile: z.string().optional().nullable(),
  ntn: z.string().optional().nullable(),
  address: z.string().optional().nullable(),
  city: z.string().optional().nullable(),
  pipeline_stage: z.string().optional().nullable(),
  credit_limit: z.union([z.string(), z.number()]).optional(),
  payment_terms: z.union([z.string(), z.number()]).optional(),
  notes: z.string().optional().nullable(),
  contact_person: z.string().optional().nullable(),
  lead_source: z.enum(['referral', 'website', 'cold_call', 'exhibition', 'social_media', 'existing_customer', 'other']).optional().nullable(),
  force: z.boolean().optional(), // bypasses duplicate-detection warning on create
})

export const customerUpdateSchema = customerSchema.partial()
