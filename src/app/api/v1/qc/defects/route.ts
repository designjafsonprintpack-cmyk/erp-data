import { NextResponse, type NextRequest } from 'next/server'
import { createSupabaseServerClient } from '@/lib/supabase/server'
import { getCompanyId } from '@/lib/utils/getCompanyId'

export async function GET(req: NextRequest) {
  const supabase = createSupabaseServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { searchParams } = new URL(req.url)
  const jobId        = searchParams.get('job_id') || ''
  const inspectionId = searchParams.get('inspection_id') || ''
  const severity     = searchParams.get('severity') || ''
  const unresolved   = searchParams.get('unresolved') === 'true'

  let q = supabase.from('qc_defects' as any)
    .select('*, jobs(job_number,job_title), qc_inspections(inspection_no)', { count: 'exact' })
    .is('deleted_at', null)

  if (jobId)        q = q.eq('job_id', jobId)
  if (inspectionId) q = q.eq('inspection_id', inspectionId)
  if (severity)     q = q.eq('severity', severity)
  if (unresolved)   q = q.eq('resolved', false)

  const { data, error, count } = await q
    .order('created_at', { ascending: false }).limit(50)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ data: data ?? [], total: count ?? 0 })
}

export async function POST(req: NextRequest) {
  const supabase = createSupabaseServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const companyId = await getCompanyId(user, supabase)
  const body = await req.json()

  const { data, error } = await supabase.from('qc_defects' as any).insert({
    company_id:        companyId,
    inspection_id:     body.inspection_id,
    job_id:            body.job_id,
    defect_type:       body.defect_type,
    severity:          body.severity || 'minor',
    quantity_affected: body.quantity_affected ? parseInt(body.quantity_affected) : 0,
    description:       body.description || null,
    photo_url:         body.photo_url || null,
    reported_by:       user.id,
  }).select().single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ data })
}
