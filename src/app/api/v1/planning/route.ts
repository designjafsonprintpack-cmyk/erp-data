import { NextResponse, type NextRequest } from 'next/server'
import { createSupabaseServerClient } from '@/lib/supabase/server'
import { getCompanyId } from '@/lib/utils/getCompanyId'
import { getUserTableId } from '@/lib/utils/getUserTableId'
import { requirePermission } from '@/lib/utils/requirePermission'

export async function GET(req: NextRequest) {
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

  if (status) q = q.eq('status', status)

  const { data, error, count } = await q.order('planned_date').order('created_at')
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ data: data ?? [], total: count ?? 0 })
}

export async function POST(req: NextRequest) {
  const supabase = createSupabaseServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const companyId = await getCompanyId(user, supabase)
  const userTableId = await getUserTableId(user, supabase)
  const denied = await requirePermission(userTableId, 'planning', 'create', supabase)
  if (denied) return denied

  const { machines, ...body } = await req.json()

  const { data: plan, error } = await supabase.from('job_plans' as any).insert({
    company_id:  companyId,
    job_id:      body.job_id,
    planned_date: body.planned_date,
    planned_by:  userTableId,
    notes:       body.notes || null,
    status:      'scheduled',
  }).select().single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  // Insert machine assignments
  if (machines?.length) {
    await supabase.from('job_machine_assignments' as any).insert(
      machines.map((m: any) => ({
        company_id:      companyId,
        job_plan_id:     (plan as any).id,
        job_id:          body.job_id,
        machine_id:      m.machine_id,
        stage_id:        m.stage_id || null,
        estimated_hours: m.estimated_hours ? parseFloat(m.estimated_hours) : null,
        operator_id:     m.operator_id || null,
        notes:           m.notes || null,
      }))
    )
  }

  return NextResponse.json({ data: plan })
}
