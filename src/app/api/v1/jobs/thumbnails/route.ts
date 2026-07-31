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
 * Returns, for each job id, an ARRAY — the latest version of **every design**
 * on that job, in design order:
 *   { url (signed, or null if not previewable), file_name, file_type,
 *     version, approved, design_no, design_label }
 *
 * It used to return a single object, the newest row on the job. Since 124 a job
 * can carry two separate DESIGNS (an HL lid and base, a carton and its insert)
 * and the second one used to be stored as "v2" of the first — so every list
 * showed design 2 and silently hid design 1.
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
    .select('id, job_id, design_no, design_label, version, file_name, file_type, file_url, status')
    .in('job_id', jobIds)
    .is('deleted_at', null)
    .order('job_id', { ascending: true })
    .order('design_no', { ascending: true })
    .order('version', { ascending: false })

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  // First row per (job, design) wins — the ORDER BY puts each design's highest
  // version first within its group. Keyed on the pair, not on job_id alone,
  // which is what used to collapse a job's two designs into one thumbnail.
  const latestPerDesign = new Map<string, any>()
  for (const a of (artworks ?? []) as any[]) {
    const key = `${a.job_id}::${a.design_no ?? 1}`
    if (!latestPerDesign.has(key)) latestPerDesign.set(key, a)
  }

  const previewable = Array.from(latestPerDesign.values()).filter(a => {
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

  interface ThumbRow {
    url: string | null
    file_name: string
    file_type: string | null
    version: number
    approved: boolean
    design_no: number
    design_label: string | null
  }

  const data: Record<string, ThumbRow[]> = {}
  for (const a of Array.from(latestPerDesign.values())) {
    ;(data[a.job_id] ||= []).push({
      url: signedByPath.get(a.file_url) ?? null,
      file_name: a.file_name,
      file_type: a.file_type,
      version: a.version,
      approved: a.status === 'approved',
      design_no: a.design_no ?? 1,
      design_label: a.design_label ?? null,
    })
  }
  // Map insertion order follows the job_id/design_no ORDER BY, but sorting here
  // makes the contract independent of that — a caller reads data[jobId][0] as
  // "design 1" and must not be at the mercy of a future query change.
  for (const rows of Object.values(data)) rows.sort((x, y) => x.design_no - y.design_no)

  return NextResponse.json({ data })
})
