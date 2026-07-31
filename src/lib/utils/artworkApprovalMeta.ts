import { createSupabaseAdminClient } from '@/lib/supabase/admin'
import { isAcceptedArtworkFile } from '@/lib/utils/artworkFileTypes'

/**
 * Everything the approval page's LINK PREVIEW needs, read by token.
 *
 * WHY
 *   A pasted `https://…/artwork/approve/<64 hex>` shows up in WhatsApp as a
 *   naked URL — no picture, no job, nothing. The message the ERP now copies
 *   alongside it says what it is, but the link itself still looked anonymous,
 *   and a forwarded link often arrives without the message.
 *
 *   So the page publishes Open Graph tags and a generated preview image, and
 *   WhatsApp/Slack/email render the artwork thumbnail with the job number under
 *   it. Both the metadata and the image route read this one function, so the
 *   card and the page can never disagree.
 *
 * TRUST MODEL
 *   Same as the approval page and /api/v1/public/artwork/[token]: the token IS
 *   the credential, looked up with the service-role client because there is no
 *   session. Nothing here is exposed that opening the link doesn't already
 *   expose.
 */
export interface ArtworkApprovalMeta {
  id: string
  job_id: string
  job_number: string | null
  job_title: string | null
  customer_name: string | null
  design_no: number
  design_label: string | null
  design_count: number
  version: number
  file_url: string
  file_name: string
  file_type: string | null
  /** True when the link's own expiry has passed — no preview for a dead link. */
  expired: boolean
}

export async function loadArtworkApprovalMeta(token: string): Promise<ArtworkApprovalMeta | null> {
  const supabase = createSupabaseAdminClient()

  // The FK hint is mandatory: since migration 104 there are two relationships
  // between jobs and job_artworks and PostgREST refuses to guess, failing the
  // whole query rather than just the embed.
  const { data, error } = await supabase.from('job_artworks' as any)
    .select('id, job_id, version, design_no, design_label, file_url, file_name, file_type, approval_token_expires_at, jobs!job_artworks_job_id_fkey(job_number, job_title, customers(name))')
    .eq('approval_token', token)
    .is('deleted_at', null)
    .maybeSingle()

  if (error || !data) return null
  const row = data as any

  const { data: designRows } = await supabase.from('job_artworks' as any)
    .select('design_no').eq('job_id', row.job_id).is('deleted_at', null)
  const designCount = new Set(((designRows ?? []) as any[]).map(r => Number(r.design_no) || 1)).size

  return {
    id: row.id,
    job_id: row.job_id,
    job_number: row.jobs?.job_number ?? null,
    job_title: row.jobs?.job_title ?? null,
    customer_name: row.jobs?.customers?.name ?? null,
    design_no: Number(row.design_no) || 1,
    design_label: row.design_label ?? null,
    design_count: designCount || 1,
    version: Number(row.version) || 1,
    file_url: row.file_url,
    file_name: row.file_name,
    file_type: row.file_type ?? null,
    expired: !!row.approval_token_expires_at && new Date(row.approval_token_expires_at) < new Date(),
  }
}

/**
 * Is this file worth asking Storage to resize into a preview?
 *
 * Delegates to the SAME list the uploaders and the artwork schema use, so a
 * type added there can't quietly stop previewing — one list, not a second copy
 * that drifts. What it rules out is the legacy PDF / AI / EPS rows from before
 * Storage existed: there is nothing an image transform can do with those, and
 * the tile in the app shows them as a file-type box for the same reason.
 *
 * Anything that gets past this and still can't be transformed simply yields no
 * picture — the route answers 404 and the link previews with its title and
 * description alone. Degrading is deliberate: a preview is a nicety, and it
 * must never be able to break the page it previews.
 */
export function isPreviewDrawable(fileName: string, fileType: string | null): boolean {
  return isAcceptedArtworkFile(fileName, null)
    || isAcceptedArtworkFile(`x.${fileType ?? ''}`, null)
}

/** "Design 2 (Lid) · Version 3", or "Version 3" on a single unnamed design. */
export function approvalMetaLabel(m: ArtworkApprovalMeta): string {
  const named = m.design_count > 1 || !!m.design_label?.trim()
  if (!named) return `Version ${m.version}`
  const label = m.design_label?.trim()
  return `${label ? `Design ${m.design_no} (${label})` : `Design ${m.design_no}`} · Version ${m.version}`
}
