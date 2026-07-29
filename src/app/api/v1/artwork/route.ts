import { NextResponse, type NextRequest } from 'next/server'
import { createSupabaseServerClient } from '@/lib/supabase/server'
import { getCompanyId } from '@/lib/utils/getCompanyId'
import { getUserTableId } from '@/lib/utils/getUserTableId'
import { requirePermission } from '@/lib/utils/requirePermission'
import { recordJobEvent } from '@/modules/jobs/services/jobEventService'
import { withErrorHandling } from '@/lib/utils/apiHandler'
import { parseBody } from '@/lib/utils/validate'
import { artworkSchema } from '@/lib/schemas/artwork'
import { isPageOutOfRange, outOfRangeResponse } from '@/lib/utils/pagedResponse'

export const GET = withErrorHandling(async function GET(req: NextRequest) {
  const supabase = createSupabaseServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const companyId = await getCompanyId(user, supabase)

  const { searchParams } = new URL(req.url)
  const jobId = searchParams.get('job_id')

  // Two modes. With ?job_id and no ?page it stays what it always was: every
  // version of one job's artwork, newest version first — Job Detail depends on
  // that shape. With ?page it is the Artwork page's list, which used to load a
  // capped 200 rows and filter them in the browser.
  const paged = searchParams.has('page') || searchParams.has('limit')
  if (!jobId && !paged) {
    return NextResponse.json({ error: 'job_id required' }, { status: 400 })
  }

  if (!paged) {
    const { data, error } = await supabase
      .from('job_artworks' as any)
      .select('*')
      .eq('job_id', jobId)
      .eq('company_id', companyId)
      .is('deleted_at', null)
      .order('version', { ascending: false })

    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json({ data: data ?? [] })
  }

  const page   = parseInt(searchParams.get('page') || '1')
  const limit  = Math.min(parseInt(searchParams.get('limit') || '50') || 50, 200)
  const offset = (page - 1) * limit

  let q = supabase
    .from('job_artworks' as any)
    .select('*, jobs!job_artworks_job_id_fkey(job_number,job_title,customers(name))', { count: 'exact' })
    .eq('company_id', companyId)
    .is('deleted_at', null)

  if (jobId) q = q.eq('job_id', jobId)

  const { data, error, count } = await q
    .order('created_at', { ascending: false })
    // Tiebreaker — versions uploaded together share a created_at.
    .order('id', { ascending: false })
    .range(offset, offset + limit - 1)

  // A page past the end is an empty page, not a 500 — see pagedResponse.
  if (isPageOutOfRange(error)) return NextResponse.json(outOfRangeResponse(page, limit))
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ data: data ?? [], total: count ?? 0, page, limit })
})

export const POST = withErrorHandling(async function POST(req: NextRequest) {
  const supabase = createSupabaseServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const companyId = await getCompanyId(user, supabase)
  const userTableId = await getUserTableId(user, supabase)
  const denied = await requirePermission(userTableId, 'artwork', 'create', supabase)
  if (denied) return denied

  const parsed = await parseBody(req, artworkSchema)
  if ('error' in parsed) return parsed.error
  const body = parsed.data

  // Get next version number for this job
  const { data: existing } = await supabase
    .from('job_artworks' as any)
    .select('version')
    .eq('job_id', body.job_id)
    .is('deleted_at', null)
    .order('version', { ascending: false })
    .limit(1)

  const nextVersion = existing && existing.length > 0 ? (existing[0] as any).version + 1 : 1

  const { data, error } = await supabase.from('job_artworks' as any).insert({
    company_id:   companyId,
    job_id:       body.job_id,
    version:      nextVersion,
    file_name:    body.file_name,
    file_url:     body.file_url,
    file_size:    body.file_size || null,
    file_type:    body.file_type || null,
    designer_notes: body.designer_notes || null,
    status: 'draft',
    is_production_ready: false,
  }).select().single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  await recordJobEvent({
    company_id: companyId, job_id: body.job_id,
    event_type: 'artwork_uploaded',
    new_value: `v${nextVersion} — ${body.file_name}`,
    actor_id: userTableId,
  }, supabase)

  return NextResponse.json({ data })
})
