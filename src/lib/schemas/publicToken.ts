import { z } from 'zod'

// `publicArtworkActionSchema` and `markupShapeSchema` both lived here and are
// both gone. The customer-facing artwork approval link was retired first —
// approval is taken on WhatsApp — and the on-image markup went with the
// comments feature that displayed it, so nothing reads the shape geometry
// (migration 090) any more. The stored shapes are untouched in
// `artwork_comments.shape`; only the code that drew them is gone.

export const publicQuotationActionSchema = z.object({
  action: z.enum(['approve', 'reject']),
})
