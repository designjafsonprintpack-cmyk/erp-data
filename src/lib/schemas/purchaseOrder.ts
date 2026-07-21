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

const poReceiveItemSchema = z.object({
  id: z.string().uuid('Each item needs a valid id'),
  quantity_received: z.union([z.string(), z.number()]).optional(),
  board_item_id: z.string().uuid().optional().nullable(),
  unit_price: z.union([z.string(), z.number()]).optional().nullable(),
})

// PATCH branches on the 'receive' action or falls through to
// `.update(body)` directly with no prior allowlist — this schema covers
// both paths.
export const updatePurchaseOrderSchema = z.object({
  action: z.string().optional(),
  items: z.array(poReceiveItemSchema).optional(),
  // generic-patch fields
  vendor_id: z.string().uuid().optional(),
  order_date: z.string().optional().nullable(),
  expected_date: z.string().optional().nullable(),
  status: z.string().optional(),
  notes: z.string().optional().nullable(),
  terms: z.string().optional().nullable(),
  tax_rate: z.union([z.string(), z.number()]).optional(),
})
