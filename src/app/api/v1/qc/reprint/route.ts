import { NextResponse, type NextRequest } from 'next/server'
import { createSupabaseServerClient } from '@/lib/supabase/server'
import { getCompanyId } from '@/lib/utils/getCompanyId'
import { recordJobEvent, initializeJobWorkflow } from '@/modules/jobs/services/jobEventService'

export async function GET(req: NextRequest) {
  const supabase = createSupabaseServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { searchParams } = new URL(req.url)
  const status = searchParams.get('status') || ''

  let q = supabase.from('reprint_requests' as any)
    .select('*, jobs!reprint_requests_original_job_id_fkey(job_number,job_title,customers(name)), reprint_job:jobs!reprint_requests_reprint_job_id_fkey(job_number)', { count: 'exact' })
    .is('deleted_at', null)

  if (status) q = q.eq('status', status)

  const { data, error, count } = await q.order('created_at', { ascending: false }).limit(50)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ data: data ?? [], total: count ?? 0 })
}

export async function POST(req: NextRequest) {
  const supabase = createSupabaseServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const companyId = await getCompanyId(user, supabase)
  const body = await req.json()

  const { data, error } = await supabase.from('reprint_requests' as any).insert({
    company_id:      companyId,
    original_job_id: body.original_job_id,
    inspection_id:   body.inspection_id || null,
    reason:          body.reason,
    quantity:        parseFloat(body.quantity || '0'),
    priority:        body.priority || 'normal',
    notes:           body.notes || null,
    requested_by:    user.id,
    status:          'pending',
  }).select().single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  await recordJobEvent({
    company_id: companyId,
    job_id:     body.original_job_id,
    event_type: 'status_changed',
    new_value:  'Re-print requested',
    notes:      body.reason,
    actor_id:   user.id,
  }, supabase)

  return NextResponse.json({ data })
}
