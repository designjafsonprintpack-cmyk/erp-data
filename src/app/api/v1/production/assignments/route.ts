import { NextResponse, type NextRequest } from 'next/server'
import { createSupabaseServerClient } from '@/lib/supabase/server'
import { getCompanyId } from '@/lib/utils/getCompanyId'
import { getUserTableId } from '@/lib/utils/getUserTableId'
import { requirePermission } from '@/lib/utils/requirePermission'
import { withErrorHandling } from '@/lib/utils/apiHandler'

export const GET = withErrorHandling(async function GET(req: NextRequest) {
  const supabase = createSupabaseServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const companyId = await getCompanyId(user, supabase)

  const { searchParams } = new URL(req.url)
  const jobId     = searchParams.get('job_id') || ''
  const machineId = searchParams.get('machine_id') || ''
  const status    = searchParams.get('status') || ''

  let q = supabase.from('production_assignments' as any)
    .select('*, jobs(job_number,job_title,priority,required_date,customers(name)), machines(name,machine_type), users(full_name)', { count: 'exact' })
    .eq('company_id', companyId)
    .is('deleted_at', null)
    .eq('is_active', true)

  if (jobId)     q = q.eq('job_id', jobId)
  if (machineId) q = q.eq('machine_id', machineId)
  if (status)    q = q.eq('status', status)

  const { data, error, count } = await q
    .order('created_at', { ascending: false }).limit(50)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ data: data ?? [], total: count ?? 0 })
})

export const POST = withErrorHandling(async function POST(req: NextRequest) {
  const supabase = createSupabaseServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const companyId = await getCompanyId(user, supabase)
  const userTableId = await getUserTableId(user, supabase)
  const denied = await requirePermission(userTableId, 'production', 'create', supabase)
  if (denied) return denied

  const body = await req.json()

  if (!body.job_id || !body.machine_id) {
    return NextResponse.json({ error: 'job_id and machine_id required' }, { status: 400 })
  }

  // Overlap check: only meaningful when both a start time and an estimated
  // duration are given — a queue-only assignment with no specific time has
  // no window to conflict with.
  if (body.scheduled_start && body.estimated_minutes) {
    const newStart = new Date(body.scheduled_start)
    const newEnd = new Date(newStart.getTime() + parseInt(body.estimated_minutes) * 60000)

    const { data: existing } = await supabase.from('production_assignments' as any)
      .select('scheduled_start, estimated_minutes, jobs(job_number)')
      .eq('machine_id', body.machine_id)
      .eq('company_id', companyId)
      .in('status', ['queued', 'running', 'paused'])
      .is('deleted_at', null)
      .not('scheduled_start', 'is', null)
      .not('estimated_minutes', 'is', null)

    const conflict = ((existing ?? []) as any[]).find(a => {
      const aStart = new Date(a.scheduled_start)
      const aEnd = new Date(aStart.getTime() + a.estimated_minutes * 60000)
      return newStart < aEnd && aStart < newEnd // standard interval-overlap test
    })

    if (conflict) {
      return NextResponse.json({
        error: `This machine is already scheduled for job ${conflict.jobs?.job_number || 'another job'} ` +
               `from ${new Date(conflict.scheduled_start).toLocaleString()} for ${conflict.estimated_minutes} min — overlaps with the requested time.`,
      }, { status: 400 })
    }
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
})
