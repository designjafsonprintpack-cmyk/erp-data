import { z } from 'zod'

// Drawn markup geometry (migration 090). Coordinates are PERCENTAGES of the
// image on both axes, so the drawing lands in the right place at any size.
// Limits are deliberately tight — this arrives from a public, unauthenticated
// endpoint, and a freehand stroke can otherwise carry thousands of points.
const markupPoint = z.tuple([z.number().min(0).max(100), z.number().min(0).max(100)])

export const markupShapeSchema = z.object({
  tool: z.enum(['pen', 'arrow', 'rect', 'text']),
  color: z.string().regex(/^#[0-9a-fA-F]{6}$/, 'color must be a #rrggbb hex value'),
  points: z.array(markupPoint).min(1).max(500),
})
export type MarkupShape = z.infer<typeof markupShapeSchema>

// `publicArtworkActionSchema` lived here and is gone: the customer-facing
// artwork approval link was retired — approval is taken on WhatsApp now and
// recorded by staff from the artwork status dropdown. `markupShapeSchema`
// above STAYS: it defines MarkupShape, which MarkupOverlay and both artwork
// screens still use to draw the marks customers left while the link existed.

export const publicQuotationActionSchema = z.object({
  action: z.enum(['approve', 'reject']),
})
