import { z } from 'zod'

const poLineItemSchema = z.object({
  board_item_id: z.string().uuid().optional().nullable(),
  material_name: z.string().optional(),
  quantity: z.union([z.string(), z.number()]).optional(),
  unit_price: z.union([z.string(), z.number()]).optional(),
  unit_id: z.string().uuid().optional().nullable(),
})

export const createPurchaseOrderSchema = z.object({
  vendor_id: z.string().uuid(),
  order_date: z.string().optional(),
  expected_date: z.string().optional().nullable(),
  notes: z.string().optional().nullable(),
  terms: z.string().optional().nullable(),
  tax_rate: z.union([z.string(), z.number()]).optional(),
  items: z.array(poLineItemSchema).optional(),
})
