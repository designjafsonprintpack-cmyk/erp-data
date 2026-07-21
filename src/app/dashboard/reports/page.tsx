import { createSupabaseServerClient } from '@/lib/supabase/server'
import { getCompanyId } from '@/lib/utils/getCompanyId'
import ReportsClient from './ReportsClient'

export default async function ReportsPage() {
  const supabase = createSupabaseServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  const companyId = user ? await getCompanyId(user, supabase) : '00000000-0000-0000-0000-000000000001'

  const days = 30
  const since = new Date(Date.now() - days * 86400000).toISOString().slice(0, 10)

  const [kpiRes, monthlyRes, customerRes, financialRes, machineRes, qcRes, overdueRes, costingRes] = await Promise.all([
    (supabase as any).rpc('get_dashboard_kpis', { p_company_id: companyId, p_days: days }),
    supabase.from('report_monthly_production' as any).select('*').eq('company_id', companyId).limit(6),
    supabase.from('report_customer_sales' as any).select('*').eq('company_id', companyId).order('total_jobs', { ascending: false }).limit(10),
    supabase.from('report_financial_summary' as any).select('*').eq('company_id', companyId).limit(6),
    supabase.from('report_machine_utilization' as any).select('*').eq('company_id', companyId).order('total_assignments', { ascending: false }),
    supabase.from('report_qc_analysis' as any).select('*').eq('company_id', companyId).limit(6),
    supabase.from('jobs' as any)
      .select('id,job_number,job_title,required_date,status,priority,customers(name)')
      .eq('company_id', companyId).is('deleted_at', null)
      .not('required_date', 'is', null)
      .lt('required_date', new Date().toISOString().slice(0, 10))
      .not('status', 'in', '("completed","dispatched","cancelled")')
      .order('required_date').limit(20),
    supabase.from('report_job_costing_variance' as any).select('*').eq('company_id', companyId).order('costed_at', { ascending: false }).limit(200),
  ])

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-2xl font-bold text-[var(--color-text-primary)]">Reports & Analytics</h1>
        <p className="text-sm text-[var(--color-text-muted)] mt-0.5">Last 30 days performance overview</p>
      </div>
      <ReportsClient
        kpi={kpiRes.data || null}
        monthly={(monthlyRes.data ?? []) as any[]}
        customers={(customerRes.data ?? []) as any[]}
        financial={(financialRes.data ?? []) as any[]}
        machines={(machineRes.data ?? []) as any[]}
        qc={(qcRes.data ?? []) as any[]}
        overdueJobs={(overdueRes.data ?? []) as any[]}
        costingVariance={(costingRes.data ?? []) as any[]}
      />
    </div>
  )
}
