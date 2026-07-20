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
