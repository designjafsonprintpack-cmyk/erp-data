import { z } from 'zod'

const invoiceLineItemSchema = z.object({
  job_id: z.string().uuid().optional().nullable(),
  description: z.string().min(1),
  quantity: z.union([z.string(), z.number()]).optional(),
  unit_price: z.union([z.string(), z.number()]).optional(),
})

export const createInvoiceSchema = z.object({
  customer_id: z.string().uuid(),
  dispatch_id: z.string().uuid().optional().nullable(),
  invoice_date: z.string().optional(),
  due_date: z.string().optional(),
  payment_terms: z.union([z.string(), z.number()]).optional(),
  discount_pct: z.union([z.string(), z.number()]).optional(),
  tax_id: z.string().uuid().optional().nullable(),
  tax_pct: z.union([z.string(), z.number()]).optional(),
  notes: z.string().optional().nullable(),
  terms: z.string().optional().nullable(),
  items: z.array(invoiceLineItemSchema).optional(),
})

// PATCH does `{ ...body }` into `.update()` with no prior allowlist, and
// separately reads `action` ('send'/'void') to drive status/sent_at before
// deleting it from the update payload — `action` is declared here (unlike
// create) so parseBody doesn't strip the field the route's own logic
// depends on reading.
export const updateInvoiceSchema = z.object({
  customer_id: z.string().uuid().optional(),
  dispatch_id: z.string().uuid().optional().nullable(),
  status: z.string().optional(),
  invoice_date: z.string().optional().nullable(),
  due_date: z.string().optional().nullable(),
  subtotal: z.union([z.string(), z.number()]).optional(),
  discount_pct: z.union([z.string(), z.number()]).optional().nullable(),
  discount_amount: z.union([z.string(), z.number()]).optional().nullable(),
  tax_pct: z.union([z.string(), z.number()]).optional().nullable(),
  tax_amount: z.union([z.string(), z.number()]).optional().nullable(),
  total_amount: z.union([z.string(), z.number()]).optional(),
  notes: z.string().optional().nullable(),
  terms: z.string().optional().nullable(),
  payment_terms: z.union([z.string(), z.number()]).optional().nullable(),
  action: z.string().optional(),
})
