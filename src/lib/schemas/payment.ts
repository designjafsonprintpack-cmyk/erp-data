import { z } from 'zod'

// amount is NOT NULL with no DEFAULT on both payments and vendor_payments
// (migrations 019/047) — the route already runtime-checks it's > 0
// separately; this just ensures it's present and well-typed before that
// check runs.
export const invoicePaymentSchema = z.object({
  amount: z.union([z.string(), z.number()]),
  payment_date: z.string().optional().nullable(),
  payment_method: z.string().optional().nullable(),
  reference: z.string().optional().nullable(),
  bank_name: z.string().optional().nullable(),
  notes: z.string().optional().nullable(),
})

export const vendorPaymentSchema = z.object({
  vendor_id: z.string().uuid('vendor_id must be a valid id'),
  po_id: z.string().uuid().optional().nullable(),
  amount: z.union([z.string(), z.number()]),
  payment_date: z.string().optional().nullable(),
  payment_method: z.string().optional().nullable(),
  reference: z.string().optional().nullable(),
  bank_name: z.string().optional().nullable(),
  notes: z.string().optional().nullable(),
})
