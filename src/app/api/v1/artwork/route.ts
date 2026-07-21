import { NextResponse, type NextRequest } from 'next/server'
import { createSupabaseServerClient } from '@/lib/supabase/server'
import { getCompanyId } from '@/lib/utils/getCompanyId'
import { getUserTableId } from '@/lib/utils/getUserTableId'
import { requirePermission } from '@/lib/utils/requirePermission'
import { recordJobEvent } from '@/modules/jobs/services/jobEventService'
import { withErrorHandling } from '@/lib/utils/apiHandler'
import { parseBody } from '@/lib/utils/validate'
import { artworkSchema } from '@/lib/schemas/artwork'

export const GET = withErrorHandling(async function GET(req: NextRequest) {
  const supabase = createSupabaseServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const companyId = await getCompanyId(user, supabase)

  const { searchParams } = new URL(req.url)
  const jobId = searchParams.get('job_id')
  if (!jobId) return NextResponse.json({ error: 'job_id required' }, { status: 400 })

  const { data, error } = await supabase
    .from('job_artworks' as any)
    .select('*')
    .eq('job_id', jobId)
    .eq('company_id', companyId)
    .is('deleted_at', null)
    .order('version', { ascending: false })

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ data: data ?? [] })
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
