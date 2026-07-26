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

// One drawn mark on its way to the server. comment_text is NOT NULL in the
// database, so the editor always sends a fallback label when the customer
// draws without typing anything.
const markupMarkSchema = z.object({
  comment_text: z.string().trim().min(1).max(500),
  comment_type: z.enum(['comment', 'emboss']).optional(),
  shape: markupShapeSchema.optional().nullable(),
  position_x: z.number().min(0).max(100).optional().nullable(),
  position_y: z.number().min(0).max(100).optional().nullable(),
})

export const publicArtworkActionSchema = z.object({
  // 'save_marks' saves a whole drawing session in ONE request. Sending each
  // stroke separately would burn through the 20-per-5-minutes rate limit on
  // this route after a normal amount of marking up.
  action: z.enum(['approve', 'reject', 'request_changes', 'comment', 'save_marks']),
  marks: z.array(markupMarkSchema).min(1).max(50).optional(),
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
  shape: markupShapeSchema.optional().nullable(),
  notes: z.string().optional().nullable(),
}).refine(
  // Marking up (comment / save_marks) never needs identity — only an actual
  // decision does.
  (data) => data.action === 'comment' || data.action === 'save_marks' || !!data.approver_name?.trim(),
  { message: 'Your name is required to approve, reject, or request changes.', path: ['approver_name'] }
).refine(
  (data) => data.action !== 'save_marks' || (data.marks?.length ?? 0) > 0,
  { message: 'Nothing to save.', path: ['marks'] }
)

export const publicQuotationActionSchema = z.object({
  action: z.enum(['approve', 'reject']),
})
