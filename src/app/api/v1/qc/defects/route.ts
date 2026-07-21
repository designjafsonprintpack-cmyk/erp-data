import { NextResponse, type NextRequest } from 'next/server'
import { createSupabaseServerClient } from '@/lib/supabase/server'
import { getCompanyId } from '@/lib/utils/getCompanyId'
import { getUserTableId } from '@/lib/utils/getUserTableId'
import { requirePermission } from '@/lib/utils/requirePermission'
import { withErrorHandling } from '@/lib/utils/apiHandler'
import { parseBody } from '@/lib/utils/validate'
import { qcDefectSchema } from '@/lib/schemas/qc'

export const GET = withErrorHandling(async function GET(req: NextRequest) {
  const supabase = createSupabaseServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const companyId = await getCompanyId(user, supabase)

  const { searchParams } = new URL(req.url)
  const jobId        = searchParams.get('job_id') || ''
  const inspectionId = searchParams.get('inspection_id') || ''
  const severity     = searchParams.get('severity') || ''
  const defectType   = searchParams.get('defect_type') || ''
  const from         = searchParams.get('from') || ''
  const to           = searchParams.get('to') || ''
  const unresolved   = searchParams.get('unresolved') === 'true'
  const page  = parseInt(searchParams.get('page') || '1')
  const limit = parseInt(searchParams.get('limit') || '50')
  const offset = (page - 1) * limit

  let q = supabase.from('qc_defects' as any)
    .select('*, jobs(job_number,job_title), qc_inspections(inspection_no)', { count: 'exact' })
    .eq('company_id', companyId)
    .is('deleted_at', null)

  if (jobId)        q = q.eq('job_id', jobId)
  if (inspectionId) q = q.eq('inspection_id', inspectionId)
  if (severity)      q = q.eq('severity', severity)
  if (defectType)    q = q.eq('defect_type', defectType)
  if (from)          q = q.gte('created_at', from)
  if (to)            q = q.lte('created_at', to)
  if (unresolved)   q = q.eq('resolved', false)

  const { data, error, count } = await q
    .order('created_at', { ascending: false }).range(offset, offset + limit - 1)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ data: data ?? [], total: count ?? 0, page, limit })
})

export const POST = withErrorHandling(async function POST(req: NextRequest) {
  const supabase = createSupabaseServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const companyId = await getCompanyId(user, supabase)
  const userTableId = await getUserTableId(user, supabase)
  const denied = await requirePermission(userTableId, 'qc', 'create', supabase)
  if (denied) return denied

  const parsed = await parseBody(req, qcDefectSchema)
  if ('error' in parsed) return parsed.error
  const body = parsed.data

  const { data, error } = await supabase.from('qc_defects' as any).insert({
    company_id:        companyId,
    inspection_id:     body.inspection_id || null,
    job_id:            body.job_id,
    defect_type:       body.defect_type,
    severity:          body.severity || 'minor',
    quantity_affected: body.quantity_affected ? parseInt(String(body.quantity_affected)) : 0,
    description:       body.description || null,
    photo_url:         Array.isArray(body.photo_urls) && body.photo_urls[0] ? body.photo_urls[0] : (body.photo_url || null),
    photo_urls:        Array.isArray(body.photo_urls) ? body.photo_urls : [],
    reported_by:       userTableId,
  }).select().single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ data })
})
