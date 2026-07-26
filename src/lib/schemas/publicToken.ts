import { z } from 'zod'

export const publicArtworkActionSchema = z.object({
  action: z.enum(['approve', 'reject', 'request_changes', 'comment']),
  comment_text: z.string().optional(),
  // 'comment' = ordinary customer note, 'emboss' = the customer marking an
  // element that has to be embossed (migration 089). Both travel through
  // action: 'comment' since they are the same insert with one flag flipped.
  comment_type: z.enum(['comment', 'emboss']).optional(),
  author_name: z.string().optional().nullable(),
  // Name is required for approve/reject/request_changes (the actual decision)
  // — NOT for 'comment', which stays informal/optional as before. Enforced
  // together with the cross-field refine below since a plain z.string() can't
  // conditionally require itself based on a sibling field.
  approver_name: z.string().trim().min(1).optional().nullable(),
  // Email is deliberately NOT required — a customer who writes it gets it
  // recorded, one who doesn't can still approve. It only has to be a real
  // address IF they typed something. A blank form control sends '', which
  // z.string().email() would reject outright, so the check runs on the
  // trimmed value and lets empty through; the route stores NULL for it
  // (nullable column → NULL, same convention as blankToNull).
  approver_email: z.string().trim().optional().nullable().refine(
    v => !v || /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v),
    { message: 'Enter a valid email address, or leave it blank.' }
  ),
  position_x: z.union([z.number(), z.string()]).optional().nullable(),
  position_y: z.union([z.number(), z.string()]).optional().nullable(),
  notes: z.string().optional().nullable(),
}).refine(
  (data) => data.action === 'comment' || !!data.approver_name?.trim(),
  { message: 'Your name is required to approve, reject, or request changes.', path: ['approver_name'] }
)

export const publicQuotationActionSchema = z.object({
  action: z.enum(['approve', 'reject']),
})
