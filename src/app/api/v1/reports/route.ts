import { NextResponse, type NextRequest } from 'next/server'
import { createSupabaseServerClient } from '@/lib/supabase/server'
import { getCompanyId } from '@/lib/utils/getCompanyId'
import { withErrorHandling } from '@/lib/utils/apiHandler'

export const GET = withErrorHandling(async function GET(req: NextRequest) {
  const supabase = createSupabaseServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const companyId = await getCompanyId(user, supabase)
  const { searchParams } = new URL(req.url)
  const type = searchParams.get('type') || 'kpi'
  const days = parseInt(searchParams.get('days') || '30')
  const from = searchParams.get('from') || new Date(Date.now() - days * 86400000).toISOString().slice(0, 10)
  const to   = searchParams.get('to')   || new Date().toISOString().slice(0, 10)

  switch (type) {

    // ── KPI Dashboard ──────────────────────────────────────────────────────────
    case 'kpi': {
      const { data, error } = await (supabase as any).rpc('get_dashboard_kpis', {
        p_company_id: companyId,
        p_days: days,
      })
      if (error) return NextResponse.json({ error: error.message }, { status: 500 })
      return NextResponse.json({ data })
    }

    // ── Monthly Production ─────────────────────────────────────────────────────
    case 'monthly_production': {
      const { data, error } = await supabase
        .from('report_monthly_production' as any)
        .select('*')
        .eq('company_id', companyId)
        .limit(12)
      if (error) return NextResponse.json({ error: error.message }, { status: 500 })
      return NextResponse.json({ data: data ?? [] })
    }

    // ── Job Turnaround ─────────────────────────────────────────────────────────
    case 'turnaround': {
      const { data, error } = await supabase
        .from('report_job_turnaround' as any)
        .select('*')
        .eq('company_id', companyId)
        .gte('created_at', from)
        .lte('created_at', to + 'T23:59:59')
        .order('created_at', { ascending: false })
        .limit(100)
      if (error) return NextResponse.json({ error: error.message }, { status: 500 })
      return NextResponse.json({ data: data ?? [] })
    }

    // ── Customer Sales ─────────────────────────────────────────────────────────
    case 'customer_sales': {
      const { data, error } = await supabase
        .from('report_customer_sales' as any)
        .select('*')
        .eq('company_id', companyId)
        .order('total_jobs', { ascending: false })
        .limit(50)
      if (error) return NextResponse.json({ error: error.message }, { status: 500 })
      return NextResponse.json({ data: data ?? [] })
    }

    // ── Financial Summary ──────────────────────────────────────────────────────
    case 'financial': {
      const { data, error } = await supabase
        .from('report_financial_summary' as any)
        .select('*')
        .eq('company_id', companyId)
        .limit(12)
      if (error) return NextResponse.json({ error: error.message }, { status: 500 })
      return NextResponse.json({ data: data ?? [] })
    }

    // ── Machine Utilization ────────────────────────────────────────────────────
    case 'machines': {
      const { data, error } = await supabase
        .from('report_machine_utilization' as any)
        .select('*')
        .eq('company_id', companyId)
        .order('total_assignments', { ascending: false })
      if (error) return NextResponse.json({ error: error.message }, { status: 500 })
      return NextResponse.json({ data: data ?? [] })
    }

    // ── QC Analysis ───────────────────────────────────────────────────────────
    case 'qc': {
      const { data, error } = await supabase
        .from('report_qc_analysis' as any)
        .select('*')
        .eq('company_id', companyId)
        .limit(12)
      if (error) return NextResponse.json({ error: error.message }, { status: 500 })
      return NextResponse.json({ data: data ?? [] })
    }

    // ── Wastage Summary ───────────────────────────────────────────────────────
    case 'wastage': {
      const { data, error } = await supabase
        .from('report_wastage_summary' as any)
        .select('*')
        .eq('company_id', companyId)
        .limit(50)
      if (error) return NextResponse.json({ error: error.message }, { status: 500 })
      return NextResponse.json({ data: data ?? [] })
    }

    // ── Jobs by Status (for pie chart) ────────────────────────────────────────
    case 'jobs_status': {
      const { data, error } = await supabase
        .from('jobs' as any)
        .select('status')
        .eq('company_id', companyId)
        .is('deleted_at', null)
        .gte('created_at', from)
      if (error) return NextResponse.json({ error: error.message }, { status: 500 })
      const grouped = (data ?? []).reduce((acc: Record<string, number>, j: any) => {
        acc[j.status] = (acc[j.status] || 0) + 1
        return acc
      }, {})
      return NextResponse.json({ data: grouped })
    }

    // ── Overdue Jobs ───────────────────────────────────────────────────────────
    case 'overdue': {
      const { data, error } = await supabase
        .from('jobs' as any)
        .select('id,job_number,job_title,required_date,status,priority,customers(name)')
        .eq('company_id', companyId)
        .is('deleted_at', null)
        .not('required_date', 'is', null)
        .lt('required_date', new Date().toISOString().slice(0, 10))
        .not('status', 'in', '("completed","dispatched","cancelled")')
        .order('required_date')
        .limit(50)
      if (error) return NextResponse.json({ error: error.message }, { status: 500 })
      return NextResponse.json({ data: data ?? [] })
    }

    default:
      return NextResponse.json({ error: 'Unknown report type' }, { status: 400 })
  }
})
