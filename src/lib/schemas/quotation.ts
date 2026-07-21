import { z } from 'zod'

const quotationItemCostLineSchema = z.object({
  cost_item_type_id: z.string().uuid().optional().nullable(),
  name: z.string().optional().nullable(),
  unit_basis: z.string().optional().nullable(),
  rate: z.union([z.string(), z.number()]).optional().nullable(),
  quantity: z.union([z.string(), z.number()]).optional().nullable(),
  amount: z.union([z.string(), z.number()]).optional().nullable(),
})

// product_desc is the only NOT NULL column on quotation_items besides the
// FKs the route fills in itself (quotation_id/company_id) — everything else
// mirrors what the route already reads off each item.
const quotationItemSchema = z.object({
  product_desc: z.string().trim().min(1, 'Product description is required'),
  size_l: z.union([z.string(), z.number()]).optional().nullable(),
  size_w: z.union([z.string(), z.number()]).optional().nullable(),
  size_h: z.union([z.string(), z.number()]).optional().nullable(),
  quantity: z.union([z.string(), z.number()]).optional(),
  unit_id: z.string().uuid().optional().nullable(),
  board_type_id: z.string().uuid().optional().nullable(),
  no_of_colors: z.union([z.string(), z.number()]).optional().nullable(),
  lamination_type_id: z.string().uuid().optional().nullable(),
  unit_price: z.union([z.string(), z.number()]).optional(),
  notes: z.string().optional().nullable(),
  cost_lines: z.array(quotationItemCostLineSchema).optional(),
})

// Mirrors the quotations columns the route already spreads `...body`
// straight into on insert (migration 013) — customer_id is the only
// NOT NULL column among these (subtotal/tax_amount/etc default to 0 in the
// DB, so they stay optional here exactly as the route already treats them).
export const quotationSchema = z.object({
  customer_id: z.string().uuid('customer_id must be a valid id'),
  customer_contact_id: z.string().uuid().optional().nullable(),
  status: z.string().optional(),
  valid_until: z.string().optional().nullable(),
  currency_id: z.string().uuid().optional().nullable(),
  tax_id: z.string().uuid().optional().nullable(),
  discount_percent: z.union([z.string(), z.number()]).optional().nullable(),
  notes: z.string().optional().nullable(),
  terms_conditions: z.string().optional().nullable(),
  subtotal: z.union([z.string(), z.number()]).optional(),
  tax_amount: z.union([z.string(), z.number()]).optional(),
  discount_amount: z.union([z.string(), z.number()]).optional(),
  total_amount: z.union([z.string(), z.number()]).optional(),
  items: z.array(quotationItemSchema).optional(),
})

// PATCH updates the header with `.update(headerBody)` and no prior
// allowlist — this partial schema is what closes that mass-assignment gap
// (unknown/protected fields like company_id, approval_token, id are
// stripped automatically since they're not declared here).
export const quotationUpdateSchema = quotationSchema.partial()

export const quotationConvertSchema = z.object({
  required_date: z.string().optional().nullable(),
  special_instructions: z.string().optional().nullable(),
})
