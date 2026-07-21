import { z } from 'zod'

export const publicArtworkActionSchema = z.object({
  action: z.enum(['approve', 'reject', 'request_changes', 'comment']),
  comment_text: z.string().optional(),
  author_name: z.string().optional().nullable(),
  position_x: z.union([z.number(), z.string()]).optional().nullable(),
  position_y: z.union([z.number(), z.string()]).optional().nullable(),
  notes: z.string().optional().nullable(),
})

export const publicQuotationActionSchema = z.object({
  action: z.enum(['approve', 'reject']),
})
