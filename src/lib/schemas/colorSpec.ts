import { z } from 'zod'

// Mirrors color_specs columns (migration 076). color_type gates which
// pantone/cmyk fields are meaningful, but all of them stay optional at the
// schema level — the UI decides which fields to show per type, and a
// 'custom' spec may legitimately have none of them filled in beyond name.
export const colorSpecSchema = z.object({
  name: z.string().trim().min(1, 'Name is required'),
  color_type: z.enum(['pantone', 'cmyk', 'spot', 'custom']).default('custom'),
  pantone_code: z.string().trim().optional().nullable(),
  cmyk_c: z.union([z.string(), z.number()]).optional().nullable(),
  cmyk_m: z.union([z.string(), z.number()]).optional().nullable(),
  cmyk_y: z.union([z.string(), z.number()]).optional().nullable(),
  cmyk_k: z.union([z.string(), z.number()]).optional().nullable(),
  hex_preview: z.string().trim().optional().nullable(),
  customer_id: z.string().uuid().optional().nullable(),
  notes: z.string().trim().optional().nullable(),
})

export const colorSpecUpdateSchema = colorSpecSchema.partial().extend({
  id: z.string().uuid('id is required'),
})
