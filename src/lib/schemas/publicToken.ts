import { z } from 'zod'

export const publicArtworkActionSchema = z.object({
  action: z.enum(['approve', 'reject', 'request_changes', 'comment']),
  comment_text: z.string().optional(),
  author_name: z.string().optional().nullable(),
  // Required for approve/reject/request_changes (the actual decision) —
  // NOT required for 'comment', which stays informal/optional as before.
  // Enforced together with the cross-field refine below since a plain
  // z.string() can't conditionally require itself based on a sibling field.
  approver_name: z.string().trim().min(1).optional().nullable(),
  approver_email: z.string().trim().email().optional().nullable(),
  position_x: z.union([z.number(), z.string()]).optional().nullable(),
  position_y: z.union([z.number(), z.string()]).optional().nullable(),
  notes: z.string().optional().nullable(),
}).refine(
  (data) => data.action === 'comment' || (!!data.approver_name?.trim() && !!data.approver_email?.trim()),
  { message: 'Approver name and email are required to approve, reject, or request changes.', path: ['approver_name'] }
)

export const publicQuotationActionSchema = z.object({
  action: z.enum(['approve', 'reject']),
})
