import { createSupabaseServerClient } from '@/lib/supabase/server'
import { getCompanyId } from '@/lib/utils/getCompanyId'
import PlanningClient from './PlanningClient'

export default async function PlanningPage() {
  const supabase = createSupabaseServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  const companyId = user ? await getCompanyId(user, supabase) : '00000000-0000-0000-0000-000000000001'

  const today = new Date().toISOString().slice(0, 10)
  const in30  = new Date(Date.now() + 30 * 86400000).toISOString().slice(0, 10)

  const [plansRes, machinesRes, jobsRes] = await Promise.all([
    supabase.from('job_plans' as any)
      .select('*, jobs(job_number,job_title,status,priority,customers(name)), job_machine_assignments(*, machines(name,machine_type))')
      .eq('company_id', companyId).is('deleted_at', null)
      .gte('planned_date', today).lte('planned_date', in30)
      // Machines removed from a plan are deactivated, not deleted — filter them
      // out here or they keep showing on the timeline.
      .eq('job_machine_assignments.is_active', true)
      // The day, then the running order inside it (112), then id as tiebreaker.
      // Without day_order the order of jobs within one date was whatever
      // Postgres returned; without id two plans sharing a day_order still swap.
      .order('planned_date').order('day_order').order('id'),
    supabase.from('machines' as any)
      .select('id,name,machine_type').eq('company_id', companyId).eq('is_active', true).order('name'),
    supabase.from('jobs' as any)
      .select('id,job_number,job_title,priority,required_date,customers(name)')
      .eq('company_id', companyId).is('deleted_at', null)
      .in('status', ['new','in_progress']).order('required_date').limit(100),
  ])

  // "Unplanned" has to mean unplanned. This list used to be every active job,
  // so a job that had just been scheduled still showed up under Unplanned Jobs
  // — the tab contradicted the schedule right next to it. Any live
  // (non-cancelled) plan counts, whatever its date: a job planned for last week
  // isn't unplanned, it's late.
  const { data: plannedRows } = await supabase.from('job_plans' as any)
    .select('job_id')
    .eq('company_id', companyId)
    .is('deleted_at', null)
    .neq('status', 'cancelled')

  const plannedJobIds = new Set(((plannedRows ?? []) as any[]).map(r => r.job_id))
  const unplannedJobs = ((jobsRes.data ?? []) as any[]).filter(j => !plannedJobIds.has(j.id))

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-2xl font-bold text-[var(--color-text-primary)]">Production Planning</h1>
        {/* plansRes.count is always null — the query above doesn't ask for an
            exact count, which is why this header read "0 plans scheduled" with
            a plan sitting right underneath it. The fetched rows ARE the answer
            for a 30-day window. */}
        <p className="text-sm text-[var(--color-text-muted)] mt-0.5">{(plansRes.data ?? []).length} plans scheduled in the next 30 days</p>
      </div>
      <PlanningClient
        initialPlans={(plansRes.data ?? []) as any[]}
        machines={(machinesRes.data ?? []) as any[]}
        unplannedJobs={unplannedJobs}
      />
    </div>
  )
}
