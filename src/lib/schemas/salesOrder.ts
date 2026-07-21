import { z } from 'zod'

const salesOrderItemSchema = z.object({
  quotation_item_id: z.string().uuid().optional().nullable(),
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
})

// Mirrors sales_orders columns (migration 013) the route spreads `...body`
// into on insert — customer_id is the only NOT NULL column among these.
export const salesOrderSchema = z.object({
  quotation_id: z.string().uuid().optional().nullable(),
  customer_id: z.string().uuid('customer_id must be a valid id'),
  customer_contact_id: z.string().uuid().optional().nullable(),
  delivery_address_id: z.string().uuid().optional().nullable(),
  status: z.string().optional(),
  order_date: z.string().optional().nullable(),
  required_date: z.string().optional().nullable(),
  currency_id: z.string().uuid().optional().nullable(),
  tax_id: z.string().uuid().optional().nullable(),
  discount_percent: z.union([z.string(), z.number()]).optional().nullable(),
  special_instructions: z.string().optional().nullable(),
  subtotal: z.union([z.string(), z.number()]).optional(),
  tax_amount: z.union([z.string(), z.number()]).optional(),
  discount_amount: z.union([z.string(), z.number()]).optional(),
  total_amount: z.union([z.string(), z.number()]).optional(),
  items: z.array(salesOrderItemSchema).optional(),
})

// PATCH does `.update(body)` directly with no prior allowlist — this
// partial schema closes that gap the same way quotationUpdateSchema does.
export const salesOrderUpdateSchema = salesOrderSchema.partial()
