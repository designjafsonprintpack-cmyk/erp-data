import { z } from 'zod'

const poLineItemSchema = z.object({
  board_item_id: z.string().uuid().optional().nullable(),
  /**
   * `description` was MISSING from this schema while the create route inserts
   * `description: item.description` into a NOT NULL column — and z.object()
   * strips unknown keys, so the field the form actually sends was thrown away
   * and every line-item insert failed. PO line items had never once been
   * created. `specification` and `notes` were dropped the same way.
   * `material_name` is kept because it has always been declared here, but
   * nothing reads it — the column is `description`.
   */
  description: z.string().optional(),
  specification: z.string().optional().nullable(),
  notes: z.string().optional().nullable(),
  material_name: z.string().optional(),
  /** Always PACKETS — what is physically delivered, whatever the rate basis. */
  quantity: z.union([z.string(), z.number()]).optional(),
  /** The rate, in `rate_basis` units. */
  unit_price: z.union([z.string(), z.number()]).optional(),
  /**
   * What unit_price is per (118). Board is bought by the kilo, so 'kg' is the
   * normal case; 'packet' covers paper reams and reproduces the pre-118
   * arithmetic; 'unit' is a non-stock line. Defaults to 'packet' rather than
   * being required, so an older client that omits it behaves exactly as before.
   */
  rate_basis: z.enum(['kg', 'packet', 'unit']).optional(),
  unit_id: z.string().uuid().optional().nullable(),
  /**
   * The job this line is being bought for (113), or null/absent for general
   * stock. On the LINE, not the PO: one purchase covers several sizes for
   * several jobs. Carried onto the stock ledger and the lot at receipt.
   */
  job_id: z.string().uuid().optional().nullable(),
  /**
   * Kaunsi board demand ye line poori kar rahi hai (135). Ye set ho to PO bante
   * hi us demand ka `sheets_ordered` barh jata hai aur maal aane par wo khud
   * 'ready' ho jati hai. Null = koi demand nahi, saada khareed.
   */
  demand_id: z.string().uuid().optional().nullable(),
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
