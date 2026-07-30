import { NextResponse, type NextRequest } from 'next/server'
import { createSupabaseServerClient } from '@/lib/supabase/server'
import { getCompanyId } from '@/lib/utils/getCompanyId'
import { getUserTableId } from '@/lib/utils/getUserTableId'
import { requirePermission } from '@/lib/utils/requirePermission'
import { withErrorHandling } from '@/lib/utils/apiHandler'
import { parseBody } from '@/lib/utils/validate'
import { jobPlanSchema } from '@/lib/schemas/planning'
import { nextDayOrder } from '@/lib/utils/planDayOrder'

export const GET = withErrorHandling(async function GET(req: NextRequest) {
  const supabase = createSupabaseServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const companyId = await getCompanyId(user, supabase)

  const { searchParams } = new URL(req.url)
  const dateFrom = searchParams.get('date_from') || new Date().toISOString().slice(0, 10)
  const dateTo   = searchParams.get('date_to')   || new Date(Date.now() + 30 * 86400000).toISOString().slice(0, 10)
  const status   = searchParams.get('status') || ''

  let q = supabase.from('job_plans' as any)
    .select('*, jobs(job_number,job_title,status,customers(name)), job_machine_assignments(*, machines(name,machine_type))', { count: 'exact' })
    .eq('company_id', companyId)
    .is('deleted_at', null)
    .gte('planned_date', dateFrom)
    .lte('planned_date', dateTo)
    // Removed machines are deactivated, never deleted (the assignments table has
    // no deleted_at and production writes real hours onto those rows), so the
    // embed has to exclude them or a machine taken off a plan keeps showing.
    .eq('job_machine_assignments.is_active', true)

  if (status) q = q.eq('status', status)

  // Canonical plan order (112): the day, then the running order inside it, then
  // id as the tiebreaker — two plans can share a day_order between writes, and
  // without a tiebreaker their positions swap between reads.
  const { data, error, count } = await q
    .order('planned_date').order('day_order').order('id')
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ data: data ?? [], total: count ?? 0 })
})

export const POST = withErrorHandling(async function POST(req: NextRequest) {
  const supabase = createSupabaseServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const companyId = await getCompanyId(user, supabase)
  const userTableId = await getUserTableId(user, supabase)
  const denied = await requirePermission(userTableId, 'planning', 'create', supabase)
  if (denied) return denied

  const parsed = await parseBody(req, jobPlanSchema)
  if ('error' in parsed) return parsed.error
  const { machines, ...body } = parsed.data

  const { data: plan, error } = await supabase.from('job_plans' as any).insert({
    company_id:  companyId,
    job_id:      body.job_id,
    planned_date: body.planned_date,
    planned_by:  userTableId,
    notes:       body.notes || null,
    status:      'scheduled',
    // End of that day's queue, not DEFAULT 0 — a brand new plan has no business
    // appearing above jobs that were already sequenced (112).
    day_order:   await nextDayOrder(supabase, companyId, body.planned_date),
  }).select().single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  // Insert machine assignments.
  // The inserted rows are selected back and returned: the client needs their
  // real ids to be able to edit them afterwards. It used to synthesise the list
  // locally using machine_id as the row id, which the machines PUT route
  // correctly refuses as "not part of this plan".
  let assignments: any[] = []
  if (machines?.length) {
    const { data: inserted, error: mErr } = await supabase.from('job_machine_assignments' as any).insert(
      machines.map((m: any) => ({
        company_id:      companyId,
        job_plan_id:     (plan as any).id,
        job_id:          body.job_id,
        machine_id:      m.machine_id,
        stage_id:        m.stage_id || null,
        estimated_hours: m.estimated_hours ? parseFloat(String(m.estimated_hours)) : null,
        operator_id:     m.operator_id || null,
        notes:           m.notes || null,
        created_by:      userTableId,
      }))
    ).select('id, machine_id, estimated_hours, machines(name,machine_type)')

    if (mErr) return NextResponse.json({ error: mErr.message }, { status: 500 })
    assignments = inserted ?? []
  }

  return NextResponse.json({ data: plan, machines: assignments })
})
