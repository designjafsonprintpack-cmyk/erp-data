import { createSupabaseServerClient } from '@/lib/supabase/server'
import { getCompanyId } from '@/lib/utils/getCompanyId'
import FloorDashboardClient from './FloorDashboardClient'

export default async function ProductionFloorPage() {
  const supabase = createSupabaseServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  const companyId = user ? await getCompanyId(user, supabase) : '00000000-0000-0000-0000-000000000001'

  const [machinesRes, activeJobsRes, queuedRes, operatorsRes, stagesRes] = await Promise.all([
    // All machines with current assignment
    supabase.from('machine_floor_status' as any)
      .select('*').eq('company_id', companyId).order('machine_name'),

    // Currently running assignments
    supabase.from('production_assignments' as any)
      .select('*, jobs(job_number,job_title,priority,quantity,required_date,customers(name)), machines(name,machine_type), users(full_name)')
      .eq('company_id', companyId).eq('status', 'running')
      .is('deleted_at', null).order('actual_start'),

    // Queued assignments
    supabase.from('production_assignments' as any)
      .select('*, jobs(job_number,job_title,priority,required_date,customers(name)), machines(name,machine_type), users(full_name)')
      .eq('company_id', companyId).eq('status', 'queued')
      .is('deleted_at', null).order('scheduled_start').limit(30),

    // Operators (users in production dept)
    supabase.from('users' as any)
      .select('id,full_name,employee_code').eq('company_id', companyId)
      .eq('is_active', true).order('full_name').limit(50),

    // Jobs with their stage progress (for assign modal)
    supabase.from('jobs' as any)
      .select('id,job_number,job_title,priority,customers(name),job_stage_progress(id,sequence_order,status,workflow_stages(name))')
      .eq('company_id', companyId)
      .is('deleted_at', null)
      .in('status', ['new','in_progress'])
      .order('required_date').limit(60),
  ])

  // Today completed count
  const today = new Date(); today.setHours(0,0,0,0)
  const { count: completedToday } = await supabase
    .from('production_assignments' as any)
    .select('*', { count: 'exact', head: true })
    .eq('company_id', companyId).eq('status', 'completed')
    .gte('actual_end', today.toISOString()).is('deleted_at', null)

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-[var(--color-text-primary)]">Production Floor</h1>
          <p className="text-sm text-[var(--color-text-muted)] mt-0.5">Live machine status & job tracking</p>
        </div>
      </div>
      <FloorDashboardClient
        machines={(machinesRes.data ?? []) as any[]}
        activeJobs={(activeJobsRes.data ?? []) as any[]}
        queued={(queuedRes.data ?? []) as any[]}
        operators={(operatorsRes.data ?? []) as any[]}
        pendingJobs={(stagesRes.data ?? []) as any[]}
        completedToday={completedToday ?? 0}
      />
    </div>
  )
}
