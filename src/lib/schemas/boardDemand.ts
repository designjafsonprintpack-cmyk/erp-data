import { z } from 'zod'

const num = z.union([z.string(), z.number()]).transform(v => Number(v))

/**
 * Sirf FORECAST demand ke liye. Job ki demand koi nahi bharta — wo job banate hi
 * khud ban jati hai (`resolve_board_demand`, 135).
 */
export const boardDemandCreateSchema = z.object({
  material_name: z.string().min(1, 'Material name is required'),
  board_type_id: z.string().uuid().optional().nullable(),
  paper_type_id: z.string().uuid().optional().nullable(),
  board_item_id: z.string().uuid().optional().nullable(),
  gsm: num.optional().nullable(),
  sheet_width_in: num.optional().nullable(),
  sheet_height_in: num.optional().nullable(),
  sheets_required: num.refine(v => v > 0, 'Sheets must be greater than 0'),
  notes: z.string().optional().nullable(),
})

export const boardDemandUpdateSchema = z.object({
  action: z.enum(['cancel']).optional(),
  sheets_required: num.optional(),
  notes: z.string().optional().nullable(),
})

/**
 * "In demands ka PO bana do." Vendor aur maqdaar dono server khud nikal leta
 * hai; ye sirf un ko override karne ke liye hain jab kharidar kuch aur tay kar
 * le — mesalan aadha order abhi, ya doosre vendor se.
 */
export const boardDemandCreatePoSchema = z.object({
  demand_ids: z.array(z.string().uuid()).min(1, 'Pick at least one demand'),
  /** demand_id → override. Har cheez ikhtiyari hai. */
  overrides: z.record(z.string(), z.object({
    vendor_id: z.string().uuid().optional().nullable(),
    /** PACKETS — wahi unit jo PO line par jati hai. */
    packets: num.optional().nullable(),
    unit_price: num.optional().nullable(),
    rate_basis: z.enum(['kg', 'packet', 'unit']).optional(),
  })).optional(),
  expected_date: z.string().optional().nullable(),
  notes: z.string().optional().nullable(),
})

export type BoardDemandCreateInput = z.infer<typeof boardDemandCreateSchema>
