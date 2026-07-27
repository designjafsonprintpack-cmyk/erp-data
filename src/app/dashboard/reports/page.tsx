import { createSupabaseServerClient } from '@/lib/supabase/server'
import { getCompanyId } from '@/lib/utils/getCompanyId'
import ReportsClient from './ReportsClient'
import ReportDateRange from './ReportDateRange'

/** Local-date ISO. toISOString() would shift a day back for PKT (+05). */
function iso(d: Date) {
  return new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 10)
}

const isDate = (v: unknown): v is string => typeof v === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(v)

export default async function ReportsPage({ searchParams }: {
  searchParams: { from?: string; to?: string }
}) {
  const supabase = createSupabaseServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  const companyId = user ? await getCompanyId(user, supabase) : '00000000-0000-0000-0000-000000000001'

  // The range lives in the URL so it survives a refresh and a report can be
  // shared as a link. Anything that isn't a plain YYYY-MM-DD is ignored rather
  // than passed to Postgres, which would 500 on the DATE cast.
  const today = new Date()
  const defaultFrom = new Date(); defaultFrom.setDate(defaultFrom.getDate() - 29)
  const from = isDate(searchParams.from) ? searchParams.from : iso(defaultFrom)
  const to   = isDate(searchParams.to)   ? searchParams.to   : iso(today)
  const toExclusive = new Date(to); toExclusive.setDate(toExclusive.getDate() + 1)
  const toNext = iso(toExclusive)

  // Three of the views are rolled up to whole months, and their `month` column
  // holds the FIRST of the month. Filtering those with the raw `from` would
  // drop the month the range starts in whenever the range starts mid-month —
  // pick 15 Jul and July itself (stamped 01 Jul) falls out. So they get the
  // start of that month instead.
  const fromMonth = iso(new Date(new Date(from).getFullYear(), new Date(from).getMonth(), 1))

  const [
    kpiRes, monthlyRes, customerRes, financialRes, machineRes,
    qcRes, overdueRes, costingRes, wastageRes, turnaroundRes, statusRes,
  ] = await Promise.all([
    // The *_range functions exist because these three sources could not be
    // date-filtered at all before migration 098 — see its header.
    (supabase as any).rpc('get_dashboard_kpis_range', { p_company_id: companyId, p_from: from, p_to: to }),
    supabase.from('report_monthly_production' as any).select('*').eq('company_id', companyId)
      .gte('month', fromMonth).lt('month', toNext).order('month', { ascending: false }).limit(24),
    (supabase as any).rpc('get_customer_sales_range', { p_company_id: companyId, p_from: from, p_to: to }),
    supabase.from('report_financial_summary' as any).select('*').eq('company_id', companyId)
      .gte('month', fromMonth).lt('month', toNext).limit(24),
    (supabase as any).rpc('get_machine_utilization_range', { p_company_id: companyId, p_from: from, p_to: to }),
    supabase.from('report_qc_analysis' as any).select('*').eq('company_id', companyId)
      .gte('month', fromMonth).lt('month', toNext).limit(24),
    // Overdue is deliberately NOT date-filtered — "what is late right now" is a
    // live question, and scoping it to a past window would empty the panel.
    supabase.from('jobs' as any)
      .select('id,job_number,job_title,required_date,status,priority,customers(name)')
      .eq('company_id', companyId).is('deleted_at', null)
      .not('required_date', 'is', null)
      .lt('required_date', iso(today))
      .not('status', 'in', '("completed","dispatched","cancelled")')
      .order('required_date').limit(20),
    supabase.from('report_job_costing_variance' as any).select('*').eq('company_id', companyId)
      .gte('order_date', from).lte('order_date', to)
      .order('costed_at', { ascending: false }).limit(200),
    (supabase as any).rpc('get_wastage_breakdown', { p_company_id: companyId, p_from: from, p_to: to }),
    supabase.from('report_job_turnaround' as any).select('*').eq('company_id', companyId)
      .gte('order_date', from).lte('order_date', to)
      .order('order_date', { ascending: false }).limit(300),
    supabase.from('jobs' as any).select('status').eq('company_id', companyId)
      .is('deleted_at', null).gte('created_at', from).lt('created_at', toNext),
  ])

  const statusCounts = ((statusRes.data ?? []) as any[]).reduce((acc: Record<string, number>, j: any) => {
    acc[j.status] = (acc[j.status] || 0) + 1
    return acc
  }, {})

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-2xl font-bold text-[var(--color-text-primary)]">Reports &amp; Analytics</h1>
        <p className="text-sm text-[var(--color-text-muted)] mt-0.5">
          {from === to ? from : `${from} to ${to}`}
        </p>
      </div>
      <ReportDateRange from={from} to={to} />
      <ReportsClient
        kpi={kpiRes.data || null}
        monthly={(monthlyRes.data ?? []) as any[]}
        customers={(customerRes.data ?? []) as any[]}
        financial={(financialRes.data ?? []) as any[]}
        machines={(machineRes.data ?? []) as any[]}
        qc={(qcRes.data ?? []) as any[]}
        overdueJobs={(overdueRes.data ?? []) as any[]}
        costingVariance={(costingRes.data ?? []) as any[]}
        wastage={(wastageRes.data ?? []) as any[]}
        turnaround={(turnaroundRes.data ?? []) as any[]}
        statusCounts={statusCounts}
        from={from}
        to={to}
      />
    </div>
  )
}
