import { z } from 'zod'

// Mirrors vendors columns (migration 015) — name is the only NOT NULL
// column among these (vendor_code is server-generated).
export const vendorSchema = z.object({
  name: z.string().trim().min(1, 'Name is required'),
  contact_person: z.string().optional().nullable(),
  email: z.string().email().optional().or(z.literal('')).nullable(),
  phone: z.string().optional().nullable(),
  mobile: z.string().optional().nullable(),
  address: z.string().optional().nullable(),
  ntn: z.string().optional().nullable(),
  strn: z.string().optional().nullable(),
  payment_terms: z.union([z.string(), z.number()]).optional(),
  notes: z.string().optional().nullable(),
})

export const vendorUpdateSchema = vendorSchema.partial()

const vendorBillItemSchema = z.object({
  po_item_id: z.string().uuid().optional().nullable(),
  description: z.string().trim().min(1, 'Description is required'),
  quantity_billed: z.union([z.string(), z.number()]).optional(),
  unit_price: z.union([z.string(), z.number()]).optional(),
})

// Mirrors vendor_bills columns (migration 056) — bill_number is required,
// matching the route's own existing manual check.
export const vendorBillSchema = z.object({
  bill_number: z.string().trim().min(1, 'bill_number is required'),
  bill_date: z.string().optional().nullable(),
  due_date: z.string().optional().nullable(),
  notes: z.string().optional().nullable(),
  items: z.array(vendorBillItemSchema).optional(),
})
