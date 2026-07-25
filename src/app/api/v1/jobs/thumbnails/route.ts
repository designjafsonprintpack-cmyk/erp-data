import { NextResponse, type NextRequest } from 'next/server'
import { createSupabaseServerClient } from '@/lib/supabase/server'
import { withErrorHandling } from '@/lib/utils/apiHandler'

/** Extensions a browser can render directly in an <img> — same list as
 *  isPreviewable() in src/components/artwork/ArtworkThumb.tsx. Duplicated
 *  rather than imported because that file is 'use client' and this route
 *  runs server-side only. */
const PREVIEWABLE_EXT = new Set(['JPG', 'JPEG', 'PNG', 'WEBP', 'GIF', 'BMP', 'SVG', 'AVIF'])

/**
 * GET /api/v1/jobs/thumbnails?ids=uuid1,uuid2,...
 *
 * Returns, for each job id, its LATEST artwork version as a ready-to-render
 * thumbnail: { url (signed, or null if not previewable / no artwork yet),
 * file_name, file_type, version, approved }.
 *
 * Wherever a job appears in a list (Jobs, Kanban, Production Floor, Planning)
 * only its job id is on hand — not an artwork row — so this does both steps
 * server-side in one round trip: pick the newest job_artworks row per job_id,
 * then batch-sign every previewable one with a single Storage call. Auth only
 * (no requirePermission) to match the read pattern GET /api/v1/jobs already
 * uses — RLS on job_artworks and on storage.objects both already scope by
 * company_id, so a caller can never see another tenant's artwork this way.
 */
export const GET = withErrorHandling(async function GET(req: NextRequest) {
  const supabase = createSupabaseServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { searchParams } = new URL(req.url)
  const idsParam = searchParams.get('ids') || ''
  // Capped well above any single page's job count — this is a lookup, not a
  // report; a caller asking for more than this is almost certainly a bug.
  const jobIds = Array.from(new Set(idsParam.split(',').map(s => s.trim()).filter(Boolean))).slice(0, 300)
  if (jobIds.length === 0) return NextResponse.json({ data: {} })

  const { data: artworks, error } = await supabase
    .from('job_artworks' as any)
    .select('id, job_id, version, file_name, file_type, file_url, status')
    .in('job_id', jobIds)
    .is('deleted_at', null)
    .order('job_id', { ascending: true })
    .order('version', { ascending: false })

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  // First row per job_id wins — the ORDER BY above puts each job's highest
  // version first within its group.
  const latest = new Map<string, any>()
  for (const a of (artworks ?? []) as any[]) {
    if (!latest.has(a.job_id)) latest.set(a.job_id, a)
  }

  const previewable = Array.from(latest.values()).filter(a => {
    const ext = (a.file_type || (a.file_name as string).split('.').pop() || '').toUpperCase()
    return PREVIEWABLE_EXT.has(ext)
  })

  const signedByPath = new Map<string, string>()
  if (previewable.length > 0) {
    const { data: signed } = await supabase.storage
      .from('artwork')
      .createSignedUrls(previewable.map(a => a.file_url), 3600)
    // Results come back in request order; map by index, not by the returned
    // path, which Storage may normalise (same reasoning as the client-side
    // useArtworkThumbnails hook).
    signed?.forEach((row, i) => {
      if (row?.signedUrl && previewable[i]) signedByPath.set(previewable[i].file_url, row.signedUrl)
    })
  }

  const data: Record<string, { url: string | null; file_name: string; file_type: string | null; version: number; approved: boolean }> = {}
  for (const [jobId, a] of Array.from(latest.entries())) {
    data[jobId] = {
      url: signedByPath.get(a.file_url) ?? null,
      file_name: a.file_name,
      file_type: a.file_type,
      version: a.version,
      approved: a.status === 'approved',
    }
  }

  return NextResponse.json({ data })
})
