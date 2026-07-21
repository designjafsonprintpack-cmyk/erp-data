import { z } from 'zod'

// Mirrors job_artworks columns (migration 015) — job_id, file_name, and
// file_url are all NOT NULL.
export const artworkSchema = z.object({
  job_id: z.string().uuid('job_id must be a valid id'),
  file_name: z.string().trim().min(1, 'file_name is required'),
  file_url: z.string().trim().min(1, 'file_url is required'),
  file_size: z.union([z.string(), z.number()]).optional().nullable(),
  file_type: z.string().optional().nullable(),
  designer_notes: z.string().optional().nullable(),
})

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

export const artworkApprovalLinkSchema = z.object({
  expiry: z.string().optional(),
})

export const artworkCommentSchema = z.object({
  comment_text: z.string().trim().min(1, 'Comment text is required'),
  position_x: z.union([z.string(), z.number()]).optional().nullable(),
  position_y: z.union([z.string(), z.number()]).optional().nullable(),
})

export const artworkCommentUpdateSchema = z.object({
  resolved: z.boolean().optional(),
})
