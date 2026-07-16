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
      .order('planned_date'),
    supabase.from('machines' as any)
      .select('id,name,machine_type').eq('company_id', companyId).eq('is_active', true).order('name'),
    supabase.from('jobs' as any)
      .select('id,job_number,job_title,priority,required_date,customers(name)')
      .eq('company_id', companyId).is('deleted_at', null)
      .in('status', ['new','in_progress']).order('required_date').limit(100),
  ])

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-2xl font-bold text-[var(--color-text-primary)]">Production Planning</h1>
        <p className="text-sm text-[var(--color-text-muted)] mt-0.5">{plansRes.count ?? 0} plans scheduled in the next 30 days</p>
      </div>
      <PlanningClient
        initialPlans={(plansRes.data ?? []) as any[]}
        machines={(machinesRes.data ?? []) as any[]}
        unplannedJobs={(jobsRes.data ?? []) as any[]}
      />
    </div>
  )
}
