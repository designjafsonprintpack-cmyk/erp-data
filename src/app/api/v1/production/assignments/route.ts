import { NextResponse, type NextRequest } from 'next/server'
import { createSupabaseServerClient } from '@/lib/supabase/server'
import { getCompanyId } from '@/lib/utils/getCompanyId'

export async function GET(req: NextRequest) {
  const supabase = createSupabaseServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { searchParams } = new URL(req.url)
  const jobId     = searchParams.get('job_id') || ''
  const machineId = searchParams.get('machine_id') || ''
  const status    = searchParams.get('status') || ''

  let q = supabase.from('production_assignments' as any)
    .select('*, jobs(job_number,job_title,priority,required_date,customers(name)), machines(name,machine_type), users(full_name)', { count: 'exact' })
    .is('deleted_at', null)
    .eq('is_active', true)

  if (jobId)     q = q.eq('job_id', jobId)
  if (machineId) q = q.eq('machine_id', machineId)
  if (status)    q = q.eq('status', status)

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

  if (!body.job_id || !body.machine_id) {
    return NextResponse.json({ error: 'job_id and machine_id required' }, { status: 400 })
  }

  const { data, error } = await supabase.from('production_assignments' as any).insert({
    company_id:         companyId,
    job_id:             body.job_id,
    machine_id:         body.machine_id,
    stage_progress_id:  body.stage_progress_id || null,
    operator_id:        body.operator_id || null,
    status:             'queued',
    scheduled_start:    body.scheduled_start || null,
    estimated_minutes:  body.estimated_minutes ? parseInt(body.estimated_minutes) : null,
    notes:              body.notes || null,
  }).select('*, jobs(job_number,job_title,priority,customers(name)), machines(name,machine_type)').single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ data })
}
