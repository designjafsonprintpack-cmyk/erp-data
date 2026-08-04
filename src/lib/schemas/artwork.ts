import { z } from 'zod'
import { isAcceptedArtworkFile, ARTWORK_REJECT_MESSAGE } from '@/lib/utils/artworkFileTypes'

// Mirrors job_artworks columns (migration 015) — job_id, file_name, and
// file_url are all NOT NULL.
//
// The accepted-type check used to live ONLY in the two upload forms, so the
// route would happily record a row for any file that reached Storage. It is
// asserted here as well now — the widened JPG/PNG/WEBP list is the reason to
// have looked, and one uploader forgetting the check is exactly how the second
// one nearly got missed. Applied to CREATE only: legacy rows carry older types
// (PDF/AI/EPS from before Storage existed) and must stay editable.
export const artworkSchema = z.object({
  job_id: z.string().uuid('job_id must be a valid id'),
  file_name: z.string().trim().min(1, 'file_name is required'),
  file_url: z.string().trim().min(1, 'file_url is required'),
  // Storage path of the small preview the uploader generated (migration 130).
  // Optional — non-raster files never get one, and a failed generation must not
  // fail the upload. It has to be DECLARED here even so: z.object() strips
  // unknown keys, so a field the route inserts but the schema never mentions is
  // thrown away silently (§5 — the PO line-item bug).
  thumb_url: z.string().trim().min(1).optional().nullable(),
  file_size: z.union([z.string(), z.number()]).optional().nullable(),
  file_type: z.string().optional().nullable(),
  designer_notes: z.string().optional().nullable(),

  // ─── Which DESIGN this belongs to (migration 124) ─────────────────────────
  // Given → the upload is the next VERSION of that design.
  // Omitted → it is a NEW DESIGN. A job's first upload is design 1 either way.
  // Coerced because a <select> hands back a string.
  design_no: z.coerce.number().int().min(1).optional(),
  design_label: z.string().trim().max(60).optional().nullable(),
}).refine(
  v => isAcceptedArtworkFile(v.file_name, null) || isAcceptedArtworkFile(`x.${v.file_type ?? ''}`, null),
  { path: ['file_name'], message: ARTWORK_REJECT_MESSAGE }
)

// PATCH does `.update(body)` directly with no prior allowlist, and the
// route itself sets approved_at/approved_by/is_production_ready as
// server-derived fields based on status — those three are deliberately
// left out of this schema so a client can never set them directly; the
// route always computes them itself after validation.
export const artworkUpdateSchema = z.object({
  status: z.string().optional(),
  designer_notes: z.string().optional().nullable(),
  file_name: z.string().optional(),
  file_url: z.string().optional(),
  file_size: z.union([z.string(), z.number()]).optional().nullable(),
  file_type: z.string().optional().nullable(),
})

// `artworkApprovalLinkSchema` is gone with the customer approval link it
// validated — approval is taken on WhatsApp and recorded by staff.
//
// `artworkCommentSchema` / `artworkCommentUpdateSchema` are gone with the
// comment and markup feature. Approval happens on WhatsApp and only the
// already-approved file is uploaded, so there is no round of remarks to
// capture here. The `artwork_comments` table keeps its old rows; nothing in
// the app writes to it any more.
