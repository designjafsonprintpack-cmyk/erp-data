'use client'
import { useState, useEffect } from 'react'
import Link from 'next/link'
import {
  TrendingUp, TrendingDown, AlertTriangle, CheckCircle2, Clock,
  Briefcase, DollarSign, Cpu, Shield, Users, BarChart3, Activity,
  ArrowUpRight, ArrowDownRight, RefreshCw, Package, Download, Sliders, Trash2, Timer, Layers
} from 'lucide-react'
import { cn } from '@/lib/utils/cn'
import { ScrollRow } from '@/components/ui/ScrollRow'
import { formatDate } from '@/lib/utils/format'
import { exportToExcel } from '@/lib/utils/exportToExcel'
import { Modal } from '@/components/ui/Modal'

/* ─── Types ──────────────────────────────────────────────────────────────────── */
interface KPI {
  /** Present on the old get_dashboard_kpis; the ranged one sends from/to. */
  period_days?: number
  from?: string
  to?: string
  jobs: { total: number; completed: number; in_progress: number; on_hold: number; overdue: number }
  revenue: { invoiced: number; collected: number; outstanding: number; overdue: number }
  production: { machines_running: number; dispatched_today: number; qc_pass_rate: number }
  /** Both added by get_dashboard_kpis_range (migration 098) — optional so a
   *  response from the older function still type-checks. */
  wastage?: { total_quantity: number; events: number }
  on_time?: { delivered: number; on_time: number }
  top_customers: { name: string; job_count: number; value: number }[] | null
}
interface MonthlyRow { month: string; month_label: string; jobs_created: number; jobs_completed: number; jobs_dispatched: number; jobs_cancelled: number; jobs_on_hold: number; total_quantity: number; total_quoted_value: number; avg_turnaround_days: number | null; on_time_pct: number | null }
interface CustomerRow { customer_id: string; customer_name: string; customer_code: string; total_jobs: number; completed_jobs: number; total_invoiced: number; total_paid: number; total_outstanding: number }
interface FinancialRow { month: string; month_label: string; invoice_count: number; total_invoiced: number; total_collected: number; total_outstanding: number; overdue_count: number; overdue_amount: number }
interface MachineRow { machine_id: string; machine_name: string; machine_type: string; total_assignments: number; completed: number; currently_running: number; queued: number; total_actual_minutes: number; avg_job_minutes: number }
interface QCRow { month: string; month_label: string; total_inspections: number; passed: number; failed: number; conditional: number; pass_rate_pct: number; total_defects: number; reprint_requests: number }
interface OverdueJob { id: string; job_number: string; job_title: string; required_date: string; status: string; priority: string; customers?: { name: string } | null }
interface CostingVarianceRow { costing_id: string; job_id: string; job_number: string; job_title: string; customer_name: string | null; order_date: string; quantity: number; quoted_amount: number | null; total_cost: number; margin_amount: number | null; margin_pct: number | null; variance_amount: number | null; variance_pct: number | null; budget_status: 'not_quoted' | 'over_budget' | 'under_budget' | 'on_budget'; costed_at: string | null }

interface WastageRow { reason_category: string; reason_name: string; machine_name: string; wastage_events: number; total_quantity: number; jobs_affected: number }
interface DowntimeRow { machine_name: string; category: string; events: number; total_minutes: number; avg_minutes: number; still_down: number }
interface BoardRow { board_name: string; gsm: number | null; sheets_issued: number; jobs_count: number; issue_count: number; est_value: number }
interface GsmVarianceRow { job_id: string; job_number: string; job_title: string; customer_name: string | null; order_date: string; planned_gsm: number; issued_gsm: number; sheets_issued: number; gsm_diff: number }
interface ReprintRow { reprint_id: string; original_job_id: string; original_job_number: string; original_job_title: string; customer_name: string | null; reprint_job_number: string | null; reason: string | null; status: string; quantity: number; reprint_cost: number | null; requested_at: string }
interface FunnelRow { customer_id: string; customer_name: string; customer_code: string; quotes_raised: number; quotes_value: number; won: number; won_value: number; lost: number; lost_value: number; open_quotes: number; open_value: number; win_rate_pct: number | null }
interface ProfitRow { customer_id: string; customer_name: string; customer_code: string; costed_jobs: number; uncosted_jobs: number; total_quoted: number; total_cost: number; total_margin: number; margin_pct: number | null }
interface TurnaroundRow {
  id: string; job_number: string; job_title: string; status: string; customer_name: string | null
  order_date: string; required_date: string | null; completed_date: string | null
  turnaround_days: number | null; days_variance: number | null; delivered_on_time: boolean | null
  qc_result: string | null
}

/** Bar colours for the jobs-by-status breakdown, matching JOB_STATUS_CONFIG. */
const STATUS_COLOR: Record<string, string> = {
  new: 'var(--color-accent)',
  in_progress: 'var(--color-warning)',
  on_hold: 'var(--color-danger)',
  completed: 'var(--color-success)',
  dispatched: 'var(--color-info)',
  cancelled: 'var(--color-text-muted)',
}

const PKR = (n: number) => `PKR ${Math.round(n).toLocaleString('en-PK')}`
const PCT = (n: number | null) => n != null ? `${n}%` : '—'

/* ─── Mini bar chart ─────────────────────────────────────────────────────────── */
function MiniBar({ value, max, color = 'var(--color-accent)' }: { value: number; max: number; color?: string }) {
  const pct = max > 0 ? Math.min(100, (value / max) * 100) : 0
  return (
    <div className="h-1.5 bg-[var(--color-bg-elevated)] rounded-full overflow-hidden w-full">
      <div className="h-full rounded-full transition-all" style={{ width: `${pct}%`, background: color }} />
    </div>
  )
}

/* ─── Stat Card ──────────────────────────────────────────────────────────────── */
function StatCard({ label, value, sub, icon: Icon, color, trend }: {
  label: string; value: string | number; sub?: string
  icon: any; color: string; trend?: 'up' | 'down' | 'neutral'
}) {
  return (
    <div className="rounded-xl border border-[var(--color-border)] bg-[var(--color-bg-secondary)] p-5">
      <div className="flex items-start justify-between mb-3">
        <div className="w-10 h-10 rounded-lg flex items-center justify-center flex-shrink-0"
          style={{ background: `color-mix(in srgb, ${color} 12%, transparent)` }}>
          <Icon size={18} style={{ color }} />
        </div>
        {trend && (
          <span className={cn('text-xs font-medium flex items-center gap-0.5',
            trend === 'up' ? 'text-[var(--color-success)]' : trend === 'down' ? 'text-[var(--color-danger)]' : 'text-[var(--color-text-muted)]')}>
            {trend === 'up' ? <ArrowUpRight size={13} /> : trend === 'down' ? <ArrowDownRight size={13} /> : null}
          </span>
        )}
      </div>
      <p className="text-2xl font-bold text-[var(--color-text-primary)] leading-tight">{value}</p>
      <p className="text-sm text-[var(--color-text-muted)] mt-0.5">{label}</p>
      {sub && <p className="text-xs text-[var(--color-text-muted)] mt-1 opacity-70">{sub}</p>}
    </div>
  )
}

/* ─── Section wrapper ────────────────────────────────────────────────────────── */
function Section({ title, icon: Icon, children, className }: { title: string; icon: any; children: React.ReactNode; className?: string }) {
  return (
    <div className={cn('rounded-xl border border-[var(--color-border)] bg-[var(--color-bg-secondary)] overflow-hidden', className)}>
      <div className="flex items-center gap-2 px-5 py-3.5 border-b border-[var(--color-border)] bg-[var(--color-bg-elevated)]">
        <Icon size={15} className="text-[var(--color-accent)]" />
        <h2 className="text-sm font-semibold text-[var(--color-text-primary)]">{title}</h2>
      </div>
      <div className="p-5">{children}</div>
    </div>
  )
}

type Tab = 'overview' | 'production' | 'turnaround' | 'wastage' | 'materials' | 'customers' | 'financial' | 'quality' | 'costing' | 'custom'

/* ─── Main Component ─────────────────────────────────────────────────────────── */
export default function ReportsClient({ kpi, monthly, customers, financial, machines, qc, overdueJobs, costingVariance, wastage, turnaround, statusCounts, downtime, board, gsmVariance, reprints, funnel, profitability, from, to }: {
  kpi: KPI | null; monthly: MonthlyRow[]; customers: CustomerRow[]
  financial: FinancialRow[]; machines: MachineRow[]; qc: QCRow[]; overdueJobs: OverdueJob[]
  costingVariance: CostingVarianceRow[]
  wastage: WastageRow[]; turnaround: TurnaroundRow[]
  statusCounts: Record<string, number>
  downtime: DowntimeRow[]; board: BoardRow[]
  gsmVariance: GsmVarianceRow[]; reprints: ReprintRow[]
  funnel: FunnelRow[]; profitability: ProfitRow[]
  from: string; to: string
}) {
  const [tab, setTab] = useState<Tab>('overview')
  const [drillDown, setDrillDown] = useState<{ title: string; kind: 'invoices' | 'defects'; rows: any[]; loading: boolean } | null>(null)

  // Drill-down: click a chart segment to see the underlying records instead
  // of just the aggregate number. Reuses the existing list APIs (invoices,
  // qc/defects) with the extra from/to and defect_type filters added for
  // this — no new endpoints needed.
  const drillIntoMonth = async (monthIso: string, monthLabel: string) => {
    setDrillDown({ title: `Invoices — ${monthLabel}`, kind: 'invoices', rows: [], loading: true })
    const from = monthIso.slice(0, 10)
    const toDate = new Date(monthIso); toDate.setMonth(toDate.getMonth() + 1)
    const to = toDate.toISOString().slice(0, 10)
    try {
      const res = await fetch(`/api/v1/finance/invoices?from=${from}&to=${to}`)
      const json = await res.json()
      setDrillDown({ title: `Invoices — ${monthLabel}`, kind: 'invoices', rows: json.data ?? [], loading: false })
    } catch { setDrillDown(prev => prev ? { ...prev, loading: false } : null) }
  }

  const drillIntoDefectType = async (defectType: string, days: number) => {
    const label = defectType.replace(/_/g, ' ')
    setDrillDown({ title: `Defects — ${label}`, kind: 'defects', rows: [], loading: true })
    const from = new Date(Date.now() - days * 86400000).toISOString().slice(0, 10)
    try {
      const res = await fetch(`/api/v1/qc/defects?defect_type=${encodeURIComponent(defectType)}&from=${from}`)
      const json = await res.json()
      setDrillDown({ title: `Defects — ${label}`, kind: 'defects', rows: json.data ?? [], loading: false })
    } catch { setDrillDown(prev => prev ? { ...prev, loading: false } : null) }
  }

  const maxMonthlyJobs = Math.max(...monthly.map(m => m.jobs_created), 1)
  const maxCustomerJobs = Math.max(...customers.map(c => c.total_jobs), 1)
  const maxMachineAsgn  = Math.max(...machines.map(m => m.total_assignments), 1)
  const maxFinancial    = Math.max(...financial.map(f => f.total_invoiced), 1)

  // ─── Wastage roll-ups ─────────────────────────────────────────────────────
  // The function returns one row per reason × machine. The shop reads it two
  // ways — "which reason is costing us most" and "which press is worst" — so
  // both are rolled up here rather than making anyone add it up by eye.
  const wastageTotal = wastage.reduce((s, w) => s + Number(w.total_quantity || 0), 0)
  // Generic so the downtime tab can reuse it — the shape is the same question
  // asked of a different number ("group these rows and total them").
  // The trailing comma in <T,> is required in a .tsx file, or it parses as JSX.
  const rollup = <T,>(rows: T[], key: (r: T) => string, qty: (r: T) => number, events: (r: T) => number) => {
    const map = new Map<string, { label: string; qty: number; events: number }>()
    for (const r of rows) {
      const label = key(r)
      const cur = map.get(label) ?? { label, qty: 0, events: 0 }
      cur.qty += Number(qty(r) || 0)
      cur.events += Number(events(r) || 0)
      map.set(label, cur)
    }
    // Array.from, not [...map.values()] — the repo's tsconfig target predates
    // downlevelIteration, so spreading a Map iterator does not compile.
    return Array.from(map.values()).sort((a, b) => b.qty - a.qty)
  }
  const wq = (w: WastageRow) => Number(w.total_quantity)
  const we = (w: WastageRow) => Number(w.wastage_events)
  const wastageByReason  = rollup(wastage, w => w.reason_name, wq, we)
  const wastageByMachine = rollup(wastage, w => w.machine_name, wq, we)
  const maxWastageReason  = Math.max(...wastageByReason.map(r => r.qty), 1)
  const maxWastageMachine = Math.max(...wastageByMachine.map(r => r.qty), 1)

  // ─── Turnaround / on-time ─────────────────────────────────────────────────
  // Only jobs that actually finished AND had a promised date can be judged, so
  // everything else is excluded rather than counted as on-time.
  const judged     = turnaround.filter(t => t.delivered_on_time !== null)
  const onTimeCount = judged.filter(t => t.delivered_on_time).length
  const onTimePct  = judged.length ? Math.round((onTimeCount / judged.length) * 1000) / 10 : null
  const completedT = turnaround.filter(t => t.turnaround_days != null)
  const avgTurnaround = completedT.length
    ? Math.round((completedT.reduce((s, t) => s + Number(t.turnaround_days), 0) / completedT.length) * 10) / 10
    : null
  const lateJobs = judged.filter(t => !t.delivered_on_time)
    .sort((a, b) => Number(b.days_variance ?? 0) - Number(a.days_variance ?? 0))

  const statusTotal = Object.values(statusCounts).reduce((a, b) => a + b, 0)

  // ─── Downtime ─────────────────────────────────────────────────────────────
  // The split that matters: a breakdown is a maintenance problem, but
  // material_shortage / no_operator mean the press was fine and we failed to
  // feed it. Those are ours to fix and they get called out separately.
  const NOT_MACHINE_FAULT = new Set(['material_shortage', 'no_operator'])
  const downtimeMinutes = downtime.reduce((s, d) => s + Number(d.total_minutes || 0), 0)
  const avoidableMinutes = downtime.filter(d => NOT_MACHINE_FAULT.has(d.category))
    .reduce((s, d) => s + Number(d.total_minutes || 0), 0)
  const stillDown = downtime.reduce((s, d) => s + Number(d.still_down || 0), 0)
  const downtimeByCategory = rollup(
    downtime, d => d.category, d => Number(d.total_minutes), d => Number(d.events),
  )
  const maxDowntimeCat = Math.max(...downtimeByCategory.map(d => d.qty), 1)
  const hrs = (min: number) => `${Math.round((min / 60) * 10) / 10} h`

  // ─── Materials ────────────────────────────────────────────────────────────
  const boardSheets = board.reduce((s, b) => s + Number(b.sheets_issued || 0), 0)
  const boardValue  = board.reduce((s, b) => s + Number(b.est_value || 0), 0)
  const maxBoardSheets = Math.max(...board.map(b => Number(b.sheets_issued || 0)), 1)
  // A negative diff means a LIGHTER board than planned actually ran.
  const lighterCount = gsmVariance.filter(g => Number(g.gsm_diff) < 0).length

  // ─── Reprints ─────────────────────────────────────────────────────────────
  const reprintCost = reprints.reduce((s, r) => s + Number(r.reprint_cost || 0), 0)
  const reprintQty  = reprints.reduce((s, r) => s + Number(r.quantity || 0), 0)
  const uncosted    = reprints.filter(r => r.reprint_cost == null).length

  // ─── Quotation funnel ─────────────────────────────────────────────────────
  const fSum = (k: keyof FunnelRow) => funnel.reduce((s, f) => s + Number(f[k] || 0), 0)
  const quotesRaised = fSum('quotes_raised')
  const quotesWon    = fSum('won')
  const quotesLost   = fSum('lost')
  const quotesOpen   = fSum('open_quotes')
  // Open quotes are excluded from the denominator — nothing has been lost yet.
  const decided      = quotesWon + quotesLost
  const winRate      = decided ? Math.round((quotesWon / decided) * 1000) / 10 : null
  const wonValue     = fSum('won_value')
  const openValue    = fSum('open_value')

  // ─── Customer profitability ───────────────────────────────────────────────
  const pSum = (k: keyof ProfitRow) => profitability.reduce((s, p) => s + Number(p[k] || 0), 0)
  const totalMargin   = pSum('total_margin')
  const totalCost     = pSum('total_cost')
  const totalQuotedP  = pSum('total_quoted')
  const uncostedJobs  = pSum('uncosted_jobs')
  const overallMarginPct = totalQuotedP ? Math.round((totalMargin / totalQuotedP) * 1000) / 10 : null
  const lossMakers = profitability.filter(p => p.costed_jobs > 0 && Number(p.total_margin) < 0)
  // "Biggest by revenue" and "biggest by margin" being different customers is
  // the entire reason this report exists — so both are named.
  const topByRevenue = profitability.slice().sort((a, b) => Number(b.total_quoted) - Number(a.total_quoted))[0]
  const topByMargin  = profitability.find(p => p.costed_jobs > 0)   // already ordered by margin DESC

  // Returns an export function for the given tab, or null if that tab has
  // nothing meaningful to export (overview is a KPI dashboard, not a table).
  const exportForTab = (t: Tab): (() => void) | null => {
    switch (t) {
      case 'production':
        return () => exportToExcel(
          monthly.map(m => ({ Month: m.month_label, 'Jobs Created': m.jobs_created, 'Jobs Completed': m.jobs_completed, 'Jobs Dispatched': m.jobs_dispatched, 'Jobs Cancelled': m.jobs_cancelled, 'On Hold': m.jobs_on_hold, 'Total Quantity': m.total_quantity, 'Quoted Value (PKR)': m.total_quoted_value, 'Avg Turnaround (days)': m.avg_turnaround_days, 'On-Time %': m.on_time_pct })),
          'production-report', 'Monthly Production')
      case 'customers':
        // One sheet, so revenue and margin are merged per customer rather than
        // exported as two files that have to be matched up by hand.
        return () => exportToExcel(
          customers.map(c => {
            const p = profitability.find(x => x.customer_id === c.customer_id)
            const f = funnel.find(x => x.customer_id === c.customer_id)
            return {
              Customer: c.customer_name, Code: c.customer_code,
              'Total Jobs': c.total_jobs, 'Completed Jobs': c.completed_jobs,
              'Invoiced (PKR)': c.total_invoiced, 'Paid (PKR)': c.total_paid, 'Outstanding (PKR)': c.total_outstanding,
              'Costed Jobs': p?.costed_jobs ?? 0, 'Uncosted Jobs': p?.uncosted_jobs ?? 0,
              'Cost (PKR)': p?.total_cost ?? 0, 'Margin (PKR)': p?.total_margin ?? 0, 'Margin %': p?.margin_pct ?? '',
              'Quotes Raised': f?.quotes_raised ?? 0, 'Quotes Won': f?.won ?? 0, 'Win %': f?.win_rate_pct ?? '',
            }
          }),
          `customer-report-${from}-to-${to}`, 'Customer Sales')
      case 'financial':
        return () => exportToExcel(
          financial.map(f => ({ Month: f.month_label, Invoices: f.invoice_count, 'Invoiced (PKR)': f.total_invoiced, 'Collected (PKR)': f.total_collected, 'Outstanding (PKR)': f.total_outstanding, 'Overdue Count': f.overdue_count, 'Overdue Amount (PKR)': f.overdue_amount })),
          'financial-report', 'Financial')
      case 'quality':
        return () => exportToExcel(
          qc.map(q => ({ Month: q.month_label, Inspections: q.total_inspections, Passed: q.passed, Failed: q.failed, Conditional: q.conditional, 'Pass Rate %': q.pass_rate_pct, Defects: q.total_defects, Reprints: q.reprint_requests })),
          'qc-report', 'Quality')
      case 'costing':
        return () => exportToExcel(
          costingVariance.map(c => ({ 'Job #': c.job_number, Title: c.job_title, Customer: c.customer_name ?? '—', 'Order Date': c.order_date, Quoted: c.quoted_amount, 'Actual Cost': c.total_cost, Margin: c.margin_amount, 'Margin %': c.margin_pct, 'Variance': c.variance_amount, 'Variance %': c.variance_pct, Status: c.budget_status })),
          'costing-variance-report', 'Costing Variance')
      case 'wastage':
        return () => exportToExcel(
          wastage.map(w => ({ Category: w.reason_category, Reason: w.reason_name, Machine: w.machine_name, Events: w.wastage_events, 'Total Quantity': w.total_quantity, 'Jobs Affected': w.jobs_affected })),
          `wastage-report-${from}-to-${to}`, 'Wastage')
      case 'materials':
        return () => exportToExcel(
          board.map(b => ({ Board: b.board_name, GSM: b.gsm ?? '—', 'Sheets Issued': b.sheets_issued, Jobs: b.jobs_count, Issues: b.issue_count, 'Est. Value (PKR)': b.est_value })),
          `board-consumption-${from}-to-${to}`, 'Board Consumption')
      case 'turnaround':
        return () => exportToExcel(
          turnaround.map(t => ({ 'Job #': t.job_number, Title: t.job_title, Customer: t.customer_name ?? '—', Status: t.status, 'Order Date': t.order_date, 'Required Date': t.required_date ?? '—', 'Completed Date': t.completed_date ?? '—', 'Turnaround (days)': t.turnaround_days, 'Days Early/Late': t.days_variance, 'On Time': t.delivered_on_time === null ? '—' : t.delivered_on_time ? 'Yes' : 'No', 'QC Result': t.qc_result ?? '—' })),
          `turnaround-report-${from}-to-${to}`, 'Turnaround')
      default:
        return null
    }
  }

  return (
    <div className="space-y-4">
      {/* Tabs */}
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-2.5">
        <ScrollRow className="md:flex-1" wrap role="tablist" activeSelector="[data-tab-active='true']" activeKey={tab} contentClassName="gap-1 -mx-1 px-1">
          {([
            ['overview',   'Overview',    BarChart3],
            ['production', 'Production',  Cpu],
            ['turnaround', 'Turnaround',  Timer],
            ['wastage',    'Wastage',     Trash2],
            ['materials',  'Materials',   Package],
            ['customers',  'Customers',   Users],
            ['financial',  'Financial',   DollarSign],
            ['quality',    'Quality',     Shield],
            ['costing',    'Costing',     TrendingDown],
            ['custom',     'Custom Report', Sliders],
          ] as const).map(([key, label, Icon]) => (
            <button key={key} onClick={() => setTab(key)} role="tab" aria-selected={tab === key} data-tab-active={tab === key}
              className={cn('flex items-center gap-1.5 px-3 md:px-4 h-11 md:h-8 rounded-md text-sm font-medium border transition-all flex-shrink-0 whitespace-nowrap',
                tab === key ? 'bg-[var(--color-accent)] text-[var(--color-on-accent)] border-transparent' : 'border-[var(--color-border)] text-[var(--color-text-secondary)] hover:text-[var(--color-text-primary)]')}>
              <Icon size={13} />{label}
            </button>
          ))}
          {/* Was a hardcoded "Last 30 days" — the range is now whatever the
              picker above says, so it echoes that instead of lying. */}
          <span className="hidden md:inline text-xs text-[var(--color-text-muted)] ml-2 flex-shrink-0 whitespace-nowrap">
            {from === to ? from : `${from} → ${to}`}
          </span>
        </ScrollRow>
        {exportForTab(tab) && (
          <button onClick={() => exportForTab(tab)!()}
            className="flex items-center justify-center gap-1.5 px-3 h-11 md:h-8 rounded-md border border-[var(--color-border)] text-sm text-[var(--color-text-secondary)] hover:bg-[var(--color-bg-elevated)] transition-colors flex-shrink-0">
            <Download size={13} /> Export to Excel
          </button>
        )}
      </div>

      {/* ── OVERVIEW TAB ─────────────────────────────────────────────────────── */}
      {tab === 'overview' && (
        <div className="space-y-4">
          {/* KPI Cards */}
          <div className="grid grid-cols-2 xl:grid-cols-4 gap-3 md:gap-4">
            <StatCard label="Total Jobs" value={kpi?.jobs.total ?? 0} sub={`${kpi?.jobs.completed ?? 0} completed`} icon={Briefcase} color="var(--color-accent)" />
            <StatCard label="Revenue Invoiced" value={PKR(kpi?.revenue.invoiced ?? 0)} sub={`${PKR(kpi?.revenue.collected ?? 0)} collected`} icon={TrendingUp} color="var(--color-success)" trend="up" />
            <StatCard label="Outstanding" value={PKR(kpi?.revenue.outstanding ?? 0)} sub={kpi?.revenue.overdue ? `${PKR(kpi.revenue.overdue)} overdue` : undefined} icon={DollarSign} color={(kpi?.revenue.overdue ?? 0) > 0 ? 'var(--color-danger)' : 'var(--color-text-muted)'} />
            <StatCard label="Machines Running" value={kpi?.production.machines_running ?? 0} sub={`QC pass rate: ${PCT(kpi?.production.qc_pass_rate ?? null)}`} icon={Cpu} color="var(--color-warning)" />
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-3 gap-3 md:gap-4">
            <StatCard label="In Progress" value={kpi?.jobs.in_progress ?? 0} icon={Activity} color="var(--color-warning)" />
            <StatCard label="On Hold" value={kpi?.jobs.on_hold ?? 0} icon={Clock} color="var(--color-text-muted)" />
            <StatCard label="Overdue Jobs" value={kpi?.jobs.overdue ?? 0} icon={AlertTriangle} color={(kpi?.jobs.overdue ?? 0) > 0 ? 'var(--color-danger)' : 'var(--color-success)'} />
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-3 md:gap-4">
            {/* Top Customers */}
            <Section title="Top Customers (by job count)" icon={Users}>
              {!kpi?.top_customers?.length ? (
                <p className="text-sm text-[var(--color-text-muted)] text-center py-4">No data yet</p>
              ) : (
                <div className="space-y-3">
                  {kpi.top_customers.map((c, i) => (
                    <div key={i}>
                      <div className="flex items-center justify-between mb-1">
                        <span className="text-sm text-[var(--color-text-primary)] truncate max-w-[60%]">{c.name}</span>
                        <div className="text-right flex-shrink-0">
                          <span className="text-sm font-semibold text-[var(--color-text-primary)]">{c.job_count} jobs</span>
                          {c.value > 0 && <span className="text-xs text-[var(--color-text-muted)] ml-2">{PKR(c.value)}</span>}
                        </div>
                      </div>
                      <MiniBar value={c.job_count} max={kpi.top_customers![0].job_count} />
                    </div>
                  ))}
                </div>
              )}
            </Section>

            {/* Overdue Jobs */}
            <Section title={`Overdue Jobs (${overdueJobs.length})`} icon={AlertTriangle}>
              {overdueJobs.length === 0 ? (
                <div className="flex flex-col items-center py-4">
                  <CheckCircle2 size={24} className="text-[var(--color-success)] mb-1" />
                  <p className="text-sm text-[var(--color-text-muted)]">No overdue jobs!</p>
                </div>
              ) : (
                <div className="space-y-2 max-h-48 overflow-y-auto">
                  {overdueJobs.map(job => {
                    const days = Math.ceil((Date.now() - new Date(job.required_date).getTime()) / 86400000)
                    return (
                      <Link key={job.id} href={`/dashboard/jobs/${job.id}`}
                        className="flex items-center justify-between hover:bg-[var(--color-bg-elevated)] rounded-lg px-2 py-1.5 transition-colors">
                        <div className="min-w-0">
                          <span className="text-xs font-mono text-[var(--color-accent)]">{job.job_number}</span>
                          <span className="text-xs text-[var(--color-text-secondary)] ml-2 truncate">{job.job_title}</span>
                        </div>
                        <span className="text-xs font-semibold text-[var(--color-danger)] flex-shrink-0 ml-2">{days}d late</span>
                      </Link>
                    )
                  })}
                </div>
              )}
            </Section>
          </div>

          {/* Jobs by status — the `jobs_status` report existed in the API since
              the start but was never rendered anywhere. */}
          {statusTotal > 0 && (
            <Section title={`Jobs by Status (${statusTotal})`} icon={Briefcase}>
              <div className="space-y-3">
                {Object.entries(statusCounts)
                  .sort((a, b) => b[1] - a[1])
                  .map(([status, count]) => {
                    const cfg = STATUS_COLOR[status] ?? 'var(--color-text-muted)'
                    return (
                      <div key={status}>
                        <div className="flex items-baseline justify-between gap-3 mb-1">
                          <span className="text-sm text-[var(--color-text-primary)] capitalize">{status.replace(/_/g, ' ')}</span>
                          <span className="text-sm font-semibold text-[var(--color-text-primary)]">
                            {count}
                            <span className="text-xs text-[var(--color-text-muted)] font-normal ml-1.5">
                              {Math.round((count / statusTotal) * 100)}%
                            </span>
                          </span>
                        </div>
                        <MiniBar value={count} max={statusTotal} color={cfg} />
                      </div>
                    )
                  })}
              </div>
            </Section>
          )}
        </div>
      )}

      {/* ── TURNAROUND TAB ───────────────────────────────────────────────────── */}
      {tab === 'turnaround' && (
        <div className="space-y-4">
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 md:gap-4">
            <StatCard label="On-Time Delivery" value={onTimePct != null ? `${onTimePct}%` : '—'}
              sub={judged.length ? `${onTimeCount} of ${judged.length} judged` : 'Nothing finished yet'}
              icon={CheckCircle2} color="var(--color-success)" />
            <StatCard label="Avg Turnaround" value={avgTurnaround != null ? `${avgTurnaround} days` : '—'}
              sub="Order date to completion" icon={Timer} color="var(--color-accent)" />
            <StatCard label="Delivered Late" value={lateJobs.length}
              sub="Past the promised date" icon={AlertTriangle} color="var(--color-danger)" />
            <StatCard label="Jobs in Range" value={turnaround.length}
              sub="By order date" icon={Briefcase} color="var(--color-info)" />
          </div>

          {judged.length === 0 && (
            <div className="rounded-xl border border-[var(--color-border)] bg-[var(--color-bg-secondary)] p-5 text-sm text-[var(--color-text-muted)]">
              On-time % only counts jobs that have both a required date and a completed date.
              Nothing in this range has both yet.
            </div>
          )}

          {lateJobs.length > 0 && (
            <Section title="Late Deliveries — worst first" icon={AlertTriangle}>
              <div className="overflow-x-auto">
                <table className="w-full text-sm min-w-[640px]">
                  <thead>
                    <tr className="text-left text-xs text-[var(--color-text-muted)] border-b border-[var(--color-border)]">
                      <th className="pb-2 font-medium">Job</th>
                      <th className="pb-2 font-medium">Customer</th>
                      <th className="pb-2 font-medium text-right">Promised</th>
                      <th className="pb-2 font-medium text-right">Delivered</th>
                      <th className="pb-2 font-medium text-right">Days Late</th>
                    </tr>
                  </thead>
                  <tbody>
                    {lateJobs.slice(0, 25).map(t => (
                      <tr key={t.id} className="border-b border-[var(--color-border)] last:border-0">
                        <td className="py-2">
                          <Link href={`/dashboard/jobs/${t.id}`} className="font-mono text-xs text-[var(--color-accent)] hover:underline">{t.job_number}</Link>
                          <span className="block text-xs text-[var(--color-text-muted)] truncate max-w-[220px]">{t.job_title}</span>
                        </td>
                        <td className="py-2 text-[var(--color-text-secondary)]">{t.customer_name ?? '—'}</td>
                        <td className="py-2 text-right text-[var(--color-text-secondary)]">{t.required_date ? formatDate(t.required_date) : '—'}</td>
                        <td className="py-2 text-right text-[var(--color-text-secondary)]">{t.completed_date ? formatDate(t.completed_date) : '—'}</td>
                        <td className="py-2 text-right font-semibold text-[var(--color-danger)]">+{t.days_variance}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </Section>
          )}
        </div>
      )}

      {/* ── WASTAGE TAB ──────────────────────────────────────────────────────── */}
      {tab === 'wastage' && (
        <div className="space-y-4">
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 md:gap-4">
            <StatCard label="Total Wastage" value={Math.round(wastageTotal).toLocaleString('en-PK')}
              sub="Sheets / units recorded" icon={Trash2} color="var(--color-danger)" />
            <StatCard label="Wastage Events" value={wastage.reduce((s, w) => s + Number(w.wastage_events || 0), 0)}
              sub="Times it was recorded" icon={Activity} color="var(--color-warning)" />
            <StatCard label="Reasons" value={wastageByReason.length}
              sub="Distinct causes" icon={AlertTriangle} color="var(--color-info)" />
            <StatCard label="Worst Reason" value={wastageByReason[0]?.label ?? '—'}
              sub={wastageByReason[0] ? `${Math.round(wastageByReason[0].qty).toLocaleString('en-PK')} units` : 'Nothing recorded'}
              icon={TrendingDown} color="var(--color-danger)" />
          </div>

          {wastage.length === 0 ? (
            <div className="rounded-xl border border-[var(--color-border)] bg-[var(--color-bg-secondary)] p-8 text-center">
              <Trash2 size={28} className="text-[var(--color-text-muted)] opacity-30 mx-auto mb-2" />
              <p className="text-sm text-[var(--color-text-muted)]">No wastage recorded in this range.</p>
            </div>
          ) : (
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
              <Section title="By Reason" icon={AlertTriangle}>
                <div className="space-y-3">
                  {wastageByReason.map(r => (
                    <div key={r.label}>
                      <div className="flex items-baseline justify-between gap-3 mb-1">
                        <span className="text-sm text-[var(--color-text-primary)] truncate">{r.label}</span>
                        <span className="text-sm font-semibold text-[var(--color-text-primary)] flex-shrink-0">
                          {Math.round(r.qty).toLocaleString('en-PK')}
                          <span className="text-xs text-[var(--color-text-muted)] font-normal ml-1.5">
                            {wastageTotal > 0 ? `${Math.round((r.qty / wastageTotal) * 100)}%` : ''}
                          </span>
                        </span>
                      </div>
                      <MiniBar value={r.qty} max={maxWastageReason} color="var(--color-danger)" />
                    </div>
                  ))}
                </div>
              </Section>

              <Section title="By Machine" icon={Cpu}>
                <div className="space-y-3">
                  {wastageByMachine.map(r => (
                    <div key={r.label}>
                      <div className="flex items-baseline justify-between gap-3 mb-1">
                        <span className="text-sm text-[var(--color-text-primary)] truncate">{r.label}</span>
                        <span className="text-sm font-semibold text-[var(--color-text-primary)] flex-shrink-0">
                          {Math.round(r.qty).toLocaleString('en-PK')}
                        </span>
                      </div>
                      <MiniBar value={r.qty} max={maxWastageMachine} color="var(--color-warning)" />
                    </div>
                  ))}
                </div>
              </Section>
            </div>
          )}

          {wastage.length > 0 && (
            <Section title="Reason × Machine detail" icon={BarChart3}>
              <div className="overflow-x-auto">
                <table className="w-full text-sm min-w-[640px]">
                  <thead>
                    <tr className="text-left text-xs text-[var(--color-text-muted)] border-b border-[var(--color-border)]">
                      <th className="pb-2 font-medium">Category</th>
                      <th className="pb-2 font-medium">Reason</th>
                      <th className="pb-2 font-medium">Machine</th>
                      <th className="pb-2 font-medium text-right">Events</th>
                      <th className="pb-2 font-medium text-right">Jobs</th>
                      <th className="pb-2 font-medium text-right">Quantity</th>
                    </tr>
                  </thead>
                  <tbody>
                    {wastage.map((w, i) => (
                      <tr key={`${w.reason_name}-${w.machine_name}-${i}`} className="border-b border-[var(--color-border)] last:border-0">
                        <td className="py-2 text-[var(--color-text-muted)] capitalize">{w.reason_category?.replace(/_/g, ' ')}</td>
                        <td className="py-2 text-[var(--color-text-primary)]">{w.reason_name}</td>
                        <td className="py-2 text-[var(--color-text-secondary)]">{w.machine_name}</td>
                        <td className="py-2 text-right text-[var(--color-text-secondary)]">{w.wastage_events}</td>
                        <td className="py-2 text-right text-[var(--color-text-secondary)]">{w.jobs_affected}</td>
                        <td className="py-2 text-right font-semibold text-[var(--color-text-primary)]">{Math.round(Number(w.total_quantity)).toLocaleString('en-PK')}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </Section>
          )}
        </div>
      )}

      {/* ── MATERIALS TAB ────────────────────────────────────────────────────── */}
      {tab === 'materials' && (
        <div className="space-y-4">
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 md:gap-4">
            <StatCard label="Sheets Issued" value={Math.round(boardSheets).toLocaleString('en-PK')}
              sub="From store to jobs" icon={Package} color="var(--color-accent)" />
            <StatCard label="Board Value" value={PKR(boardValue)}
              sub="At stock unit cost" icon={DollarSign} color="var(--color-info)" />
            <StatCard label="GSM Mismatches" value={gsmVariance.length}
              sub={gsmVariance.length ? `${lighterCount} ran lighter than planned` : 'Plan matched every time'}
              icon={AlertTriangle} color={gsmVariance.length ? 'var(--color-warning)' : 'var(--color-success)'} />
            <StatCard label="Board Types Used" value={board.length}
              sub="Type × GSM combinations" icon={Layers} color="var(--color-text-muted)" />
          </div>

          {board.length === 0 ? (
            <div className="rounded-xl border border-[var(--color-border)] bg-[var(--color-bg-secondary)] p-8 text-center">
              <Package size={28} className="text-[var(--color-text-muted)] opacity-30 mx-auto mb-2" />
              <p className="text-sm text-[var(--color-text-muted)]">No board issued in this range.</p>
            </div>
          ) : (
            <Section title="Board Consumption — by type and weight" icon={Package}>
              <div className="overflow-x-auto">
                <table className="w-full text-sm min-w-[640px]">
                  <thead>
                    <tr className="text-left text-xs text-[var(--color-text-muted)] border-b border-[var(--color-border)]">
                      <th className="pb-2 font-medium">Board</th>
                      <th className="pb-2 font-medium text-right">GSM</th>
                      <th className="pb-2 font-medium">Share</th>
                      <th className="pb-2 font-medium text-right">Sheets</th>
                      <th className="pb-2 font-medium text-right">Jobs</th>
                      <th className="pb-2 font-medium text-right">Est. Value</th>
                    </tr>
                  </thead>
                  <tbody>
                    {board.map((b, i) => (
                      <tr key={`${b.board_name}-${b.gsm}-${i}`} className="border-b border-[var(--color-border)] last:border-0">
                        <td className="py-2 text-[var(--color-text-primary)]">{b.board_name}</td>
                        <td className="py-2 text-right font-mono text-xs text-[var(--color-text-secondary)]">{b.gsm ?? '—'}</td>
                        <td className="py-2 pr-4 w-[22%]"><MiniBar value={Number(b.sheets_issued)} max={maxBoardSheets} /></td>
                        <td className="py-2 text-right font-semibold text-[var(--color-text-primary)]">{Math.round(Number(b.sheets_issued)).toLocaleString('en-PK')}</td>
                        <td className="py-2 text-right text-[var(--color-text-secondary)]">{b.jobs_count}</td>
                        <td className="py-2 text-right text-[var(--color-text-secondary)]">{PKR(Number(b.est_value))}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </Section>
          )}

          <Section title={`Planned vs Issued GSM (${gsmVariance.length})`} icon={AlertTriangle}>
            {gsmVariance.length === 0 ? (
              <div className="flex flex-col items-center py-4">
                <CheckCircle2 size={24} className="text-[var(--color-success)] mb-1" />
                <p className="text-sm text-[var(--color-text-muted)]">Every job ran on the weight it was planned for.</p>
              </div>
            ) : (
              <>
                <p className="text-xs text-[var(--color-text-muted)] mb-3 leading-relaxed">
                  The customer approved one weight and a different one ran. Not necessarily wrong —
                  purchasing may have substituted deliberately — but each row is a quoted cost that
                  no longer matches what was used.
                </p>
                <div className="overflow-x-auto">
                  <table className="w-full text-sm min-w-[640px]">
                    <thead>
                      <tr className="text-left text-xs text-[var(--color-text-muted)] border-b border-[var(--color-border)]">
                        <th className="pb-2 font-medium">Job</th>
                        <th className="pb-2 font-medium">Customer</th>
                        <th className="pb-2 font-medium text-right">Planned</th>
                        <th className="pb-2 font-medium text-right">Issued</th>
                        <th className="pb-2 font-medium text-right">Diff</th>
                        <th className="pb-2 font-medium text-right">Sheets</th>
                      </tr>
                    </thead>
                    <tbody>
                      {gsmVariance.slice(0, 50).map(g => (
                        <tr key={`${g.job_id}-${g.issued_gsm}`} className="border-b border-[var(--color-border)] last:border-0">
                          <td className="py-2">
                            <Link href={`/dashboard/jobs/${g.job_id}`} className="font-mono text-xs text-[var(--color-accent)] hover:underline">{g.job_number}</Link>
                            <span className="block text-xs text-[var(--color-text-muted)] truncate max-w-[200px]">{g.job_title}</span>
                          </td>
                          <td className="py-2 text-[var(--color-text-secondary)]">{g.customer_name ?? '—'}</td>
                          <td className="py-2 text-right font-mono text-xs text-[var(--color-text-secondary)]">{g.planned_gsm}</td>
                          <td className="py-2 text-right font-mono text-xs text-[var(--color-text-primary)] font-semibold">{g.issued_gsm}</td>
                          <td className={cn('py-2 text-right font-semibold', Number(g.gsm_diff) < 0 ? 'text-[var(--color-warning)]' : 'text-[var(--color-info)]')}>
                            {Number(g.gsm_diff) > 0 ? '+' : ''}{g.gsm_diff}
                          </td>
                          <td className="py-2 text-right text-[var(--color-text-secondary)]">{Math.round(Number(g.sheets_issued)).toLocaleString('en-PK')}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </>
            )}
          </Section>
        </div>
      )}

      {/* ── PRODUCTION TAB ───────────────────────────────────────────────────── */}
      {tab === 'production' && (
        <div className="space-y-4">
          {/* Monthly production bar chart */}
          <Section title="Monthly Job Volume" icon={BarChart3}>
            {monthly.length === 0 ? (
              <p className="text-sm text-[var(--color-text-muted)] text-center py-8">No data yet</p>
            ) : (
              <div className="space-y-1">
                {/* Bar chart */}
                <div className="flex items-end gap-2 h-32 mb-3">
                  {[...monthly].reverse().map((row, i) => {
                    const h = maxMonthlyJobs > 0 ? (row.jobs_created / maxMonthlyJobs) * 100 : 0
                    const hc = maxMonthlyJobs > 0 ? (row.jobs_completed / maxMonthlyJobs) * 100 : 0
                    return (
                      <div key={i} className="flex-1 flex flex-col items-center gap-1" title={`${row.month_label}: ${row.jobs_created} created, ${row.jobs_completed} completed`}>
                        <div className="w-full flex items-end gap-0.5 h-24">
                          <div className="flex-1 rounded-t-sm" style={{ height: `${h}%`, background: 'var(--color-accent)', opacity: 0.4 }} />
                          <div className="flex-1 rounded-t-sm" style={{ height: `${hc}%`, background: 'var(--color-success)' }} />
                        </div>
                        <span className="text-xs text-[var(--color-text-muted)] text-center">{row.month_label.split(' ')[0]}</span>
                      </div>
                    )
                  })}
                </div>
                <div className="flex items-center gap-4 text-xs text-[var(--color-text-muted)]">
                  <span className="flex items-center gap-1.5"><span className="w-3 h-3 rounded-sm inline-block" style={{ background: 'var(--color-accent)', opacity: 0.4 }} />Created</span>
                  <span className="flex items-center gap-1.5"><span className="w-3 h-3 rounded-sm inline-block" style={{ background: 'var(--color-success)' }} />Completed</span>
                </div>
              </div>
            )}
          </Section>

          {/* Monthly table */}
          <Section title="Production Summary Table" icon={Activity}>
            <div className="overflow-x-auto">
              <table className="w-full min-w-[640px] text-sm">
                <thead>
                  <tr className="border-b border-[var(--color-border)]">
                    {['Month','Created','Completed','Dispatched','Qty','Avg Days','On-Time %'].map(h => (
                      <th key={h} className="text-left py-2 px-2 text-xs font-semibold text-[var(--color-text-muted)] uppercase tracking-wider">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-[var(--color-border-subtle)]">
                  {monthly.map((row, i) => (
                    <tr key={i} className={cn('hover:bg-[color:color-mix(in_srgb,var(--color-bg-elevated)_30%,transparent)]', i % 2 === 1 && 'bg-[color:color-mix(in_srgb,var(--color-bg-elevated)_15%,transparent)]')}>
                      <td className="py-2.5 px-2 font-medium text-[var(--color-text-primary)]">{row.month_label}</td>
                      <td className="py-2.5 px-2 text-[var(--color-text-secondary)]">{row.jobs_created}</td>
                      <td className="py-2.5 px-2 text-[var(--color-success)]">{row.jobs_completed}</td>
                      <td className="py-2.5 px-2 text-[var(--color-info)]">{row.jobs_dispatched ?? 0}</td>
                      <td className="py-2.5 px-2 text-[var(--color-text-secondary)]">{row.total_quantity?.toLocaleString()}</td>
                      <td className="py-2.5 px-2 text-[var(--color-text-secondary)]">{row.avg_turnaround_days ? `${Math.round(row.avg_turnaround_days)}d` : '—'}</td>
                      <td className="py-2.5 px-2">
                        <span className={cn('font-semibold', row.on_time_pct != null && row.on_time_pct >= 80 ? 'text-[var(--color-success)]' : 'text-[var(--color-warning)]')}>
                          {PCT(row.on_time_pct)}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Section>

          {/* Machine Utilization */}
          <Section title="Machine Utilization" icon={Cpu}>
            {machines.length === 0 ? (
              <p className="text-sm text-[var(--color-text-muted)] text-center py-6">No machine data</p>
            ) : (
              <div className="space-y-3">
                {machines.map(m => (
                  <div key={m.machine_id}>
                    <div className="flex items-center justify-between mb-1.5">
                      <div>
                        <span className="text-sm font-medium text-[var(--color-text-primary)]">{m.machine_name}</span>
                        <span className="text-xs text-[var(--color-text-muted)] ml-2 capitalize">{m.machine_type?.replace('_',' ')}</span>
                        {m.currently_running > 0 && (
                          <span className="text-xs text-[var(--color-success)] ml-2 flex items-center gap-0.5 inline-flex">
                            <span className="w-1.5 h-1.5 bg-[var(--color-success)] rounded-full animate-pulse" />Running
                          </span>
                        )}
                      </div>
                      <div className="text-right text-xs text-[var(--color-text-muted)]">
                        <span className="font-semibold text-[var(--color-text-primary)]">{m.completed}</span> done
                        {m.total_actual_minutes > 0 && <span className="ml-2">{Math.round(m.total_actual_minutes / 60)}h total</span>}
                      </div>
                    </div>
                    <MiniBar value={m.completed} max={maxMachineAsgn} color="var(--color-accent)" />
                    <div className="flex items-center gap-3 mt-1 text-xs text-[var(--color-text-muted)]">
                      <span>{m.total_assignments} total</span>
                      {m.queued > 0 && <span className="text-[var(--color-accent)]">{m.queued} queued</span>}
                      {m.avg_job_minutes > 0 && <span>avg {Math.round(m.avg_job_minutes)}m/job</span>}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </Section>

          {/* Machine downtime — machine_downtime_log has existed since 050 and
              nothing has ever read it. */}
          <Section title="Machine Downtime" icon={AlertTriangle}>
            {downtime.length === 0 ? (
              <div className="flex flex-col items-center py-4">
                <CheckCircle2 size={24} className="text-[var(--color-success)] mb-1" />
                <p className="text-sm text-[var(--color-text-muted)]">No downtime recorded in this range.</p>
              </div>
            ) : (
              <div className="space-y-5">
                <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                  <div className="rounded-lg border border-[var(--color-border)] bg-[var(--color-bg-elevated)] p-3">
                    <p className="text-xs text-[var(--color-text-muted)]">Total downtime</p>
                    <p className="text-xl font-bold text-[var(--color-text-primary)]">{hrs(downtimeMinutes)}</p>
                  </div>
                  <div className="rounded-lg border p-3
                    bg-[color:color-mix(in_srgb,var(--color-warning)_10%,transparent)]
                    border-[color:color-mix(in_srgb,var(--color-warning)_25%,transparent)]">
                    <p className="text-xs text-[var(--color-text-muted)]">Not a machine fault</p>
                    <p className="text-xl font-bold text-[var(--color-warning)]">{hrs(avoidableMinutes)}</p>
                    <p className="text-xs text-[var(--color-text-muted)] mt-0.5">Material shortage or no operator</p>
                  </div>
                  <div className="rounded-lg border border-[var(--color-border)] bg-[var(--color-bg-elevated)] p-3">
                    <p className="text-xs text-[var(--color-text-muted)]">Still down now</p>
                    <p className={cn('text-xl font-bold', stillDown > 0 ? 'text-[var(--color-danger)]' : 'text-[var(--color-text-primary)]')}>{stillDown}</p>
                  </div>
                </div>

                <div className="space-y-3">
                  {downtimeByCategory.map(d => (
                    <div key={d.label}>
                      <div className="flex items-baseline justify-between gap-3 mb-1">
                        <span className="text-sm text-[var(--color-text-primary)] capitalize">{d.label.replace(/_/g, ' ')}</span>
                        <span className="text-sm font-semibold text-[var(--color-text-primary)]">
                          {hrs(d.qty)}
                          <span className="text-xs text-[var(--color-text-muted)] font-normal ml-1.5">{d.events}×</span>
                        </span>
                      </div>
                      <MiniBar value={d.qty} max={maxDowntimeCat}
                        color={NOT_MACHINE_FAULT.has(d.label) ? 'var(--color-warning)' : 'var(--color-danger)'} />
                    </div>
                  ))}
                </div>

                <div className="overflow-x-auto">
                  <table className="w-full text-sm min-w-[560px]">
                    <thead>
                      <tr className="text-left text-xs text-[var(--color-text-muted)] border-b border-[var(--color-border)]">
                        <th className="pb-2 font-medium">Machine</th>
                        <th className="pb-2 font-medium">Category</th>
                        <th className="pb-2 font-medium text-right">Events</th>
                        <th className="pb-2 font-medium text-right">Total</th>
                        <th className="pb-2 font-medium text-right">Avg</th>
                      </tr>
                    </thead>
                    <tbody>
                      {downtime.map((d, i) => (
                        <tr key={`${d.machine_name}-${d.category}-${i}`} className="border-b border-[var(--color-border)] last:border-0">
                          <td className="py-2 text-[var(--color-text-primary)]">{d.machine_name}</td>
                          <td className="py-2 text-[var(--color-text-secondary)] capitalize">{d.category?.replace(/_/g, ' ')}</td>
                          <td className="py-2 text-right text-[var(--color-text-secondary)]">
                            {d.events}{Number(d.still_down) > 0 && <span className="text-[var(--color-danger)] ml-1">({d.still_down} open)</span>}
                          </td>
                          <td className="py-2 text-right font-semibold text-[var(--color-text-primary)]">{hrs(Number(d.total_minutes))}</td>
                          <td className="py-2 text-right text-[var(--color-text-secondary)]">{hrs(Number(d.avg_minutes))}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
          </Section>
        </div>
      )}

      {/* ── CUSTOMERS TAB ────────────────────────────────────────────────────── */}
      {tab === 'customers' && (
        <div className="space-y-4">
        <Section title="Customer Sales Report" icon={Users}>
          {customers.length === 0 ? (
            <p className="text-sm text-[var(--color-text-muted)] text-center py-8">No customer data</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[640px] text-sm">
                <thead>
                  <tr className="border-b border-[var(--color-border)]">
                    {['Customer','Code','Total Jobs','Completed','Invoiced','Collected','Outstanding'].map(h => (
                      <th key={h} className="text-left py-2 px-3 text-xs font-semibold text-[var(--color-text-muted)] uppercase tracking-wider">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-[var(--color-border-subtle)]">
                  {customers.map((c, i) => (
                    <tr key={c.customer_id} className={cn('hover:bg-[color:color-mix(in_srgb,var(--color-bg-elevated)_30%,transparent)]', i % 2 === 1 && 'bg-[color:color-mix(in_srgb,var(--color-bg-elevated)_15%,transparent)]')}>
                      <td className="py-2.5 px-3 font-medium text-[var(--color-text-primary)]">{c.customer_name}</td>
                      <td className="py-2.5 px-3 text-xs font-mono text-[var(--color-text-muted)]">{c.customer_code}</td>
                      <td className="py-2.5 px-3 text-[var(--color-text-secondary)]">{c.total_jobs}</td>
                      <td className="py-2.5 px-3 text-[var(--color-success)]">{c.completed_jobs}</td>
                      <td className="py-2.5 px-3 text-[var(--color-text-primary)]">{PKR(c.total_invoiced)}</td>
                      <td className="py-2.5 px-3 text-[var(--color-success)]">{PKR(c.total_paid)}</td>
                      <td className="py-2.5 px-3">
                        <span className={cn('font-semibold', c.total_outstanding > 0 ? 'text-[var(--color-danger)]' : 'text-[var(--color-success)]')}>
                          {c.total_outstanding > 0 ? PKR(c.total_outstanding) : 'Clear'}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
                <tfoot>
                  <tr className="border-t-2 border-[var(--color-border)] font-bold">
                    <td colSpan={4} className="py-2.5 px-3 text-[var(--color-text-muted)]">TOTAL</td>
                    <td className="py-2.5 px-3 text-[var(--color-text-primary)]">{PKR(customers.reduce((s, c) => s + c.total_invoiced, 0))}</td>
                    <td className="py-2.5 px-3 text-[var(--color-success)]">{PKR(customers.reduce((s, c) => s + c.total_paid, 0))}</td>
                    <td className="py-2.5 px-3 text-[var(--color-danger)]">{PKR(customers.reduce((s, c) => s + c.total_outstanding, 0))}</td>
                  </tr>
                </tfoot>
              </table>
            </div>
          )}
        </Section>

        {/* Profitability — the point being that this ranking and the revenue
            ranking above are usually NOT the same order. */}
        <Section title="Customer Profitability" icon={TrendingUp}>
          {profitability.length === 0 ? (
            <p className="text-sm text-[var(--color-text-muted)] text-center py-8">No jobs in this range</p>
          ) : (
            <div className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                <div className="rounded-lg border border-[var(--color-border)] bg-[var(--color-bg-elevated)] p-3">
                  <p className="text-xs text-[var(--color-text-muted)]">Total margin</p>
                  <p className={cn('text-xl font-bold', totalMargin >= 0 ? 'text-[var(--color-success)]' : 'text-[var(--color-danger)]')}>{PKR(totalMargin)}</p>
                  <p className="text-xs text-[var(--color-text-muted)] mt-0.5">
                    {overallMarginPct != null ? `${overallMarginPct}% of quoted` : 'Nothing costed yet'} · cost {PKR(totalCost)}
                  </p>
                </div>
                <div className="rounded-lg border border-[var(--color-border)] bg-[var(--color-bg-elevated)] p-3">
                  <p className="text-xs text-[var(--color-text-muted)]">Biggest by revenue vs by margin</p>
                  <p className="text-sm font-semibold text-[var(--color-text-primary)] truncate">{topByRevenue?.customer_name ?? '—'}</p>
                  <p className="text-sm font-semibold text-[var(--color-success)] truncate">{topByMargin?.customer_name ?? '—'}</p>
                </div>
                <div className={cn('rounded-lg border p-3',
                  uncostedJobs > 0
                    ? 'bg-[color:color-mix(in_srgb,var(--color-warning)_10%,transparent)] border-[color:color-mix(in_srgb,var(--color-warning)_25%,transparent)]'
                    : 'bg-[var(--color-bg-elevated)] border-[var(--color-border)]')}>
                  <p className="text-xs text-[var(--color-text-muted)]">Jobs not costed</p>
                  <p className={cn('text-xl font-bold', uncostedJobs > 0 ? 'text-[var(--color-warning)]' : 'text-[var(--color-text-primary)]')}>{uncostedJobs}</p>
                  <p className="text-xs text-[var(--color-text-muted)] mt-0.5">Margin above excludes these</p>
                </div>
              </div>

              {lossMakers.length > 0 && (
                <div className="rounded-lg border p-3 text-sm
                  bg-[color:color-mix(in_srgb,var(--color-danger)_10%,transparent)]
                  border-[color:color-mix(in_srgb,var(--color-danger)_25%,transparent)]">
                  <span className="font-semibold text-[var(--color-danger)]">{lossMakers.length} customer{lossMakers.length > 1 ? 's' : ''} at a loss:</span>
                  <span className="text-[var(--color-text-secondary)]"> {lossMakers.map(l => l.customer_name).join(', ')}</span>
                </div>
              )}

              <div className="overflow-x-auto">
                <table className="w-full min-w-[720px] text-sm">
                  <thead>
                    <tr className="border-b border-[var(--color-border)]">
                      {['Customer','Costed Jobs','Quoted','Cost','Margin','Margin %'].map(h => (
                        <th key={h} className="text-left py-2 px-3 text-xs font-semibold text-[var(--color-text-muted)] uppercase tracking-wider">{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[var(--color-border-subtle)]">
                    {profitability.map((p, i) => (
                      <tr key={p.customer_id} className={cn('hover:bg-[color:color-mix(in_srgb,var(--color-bg-elevated)_30%,transparent)]', i % 2 === 1 && 'bg-[color:color-mix(in_srgb,var(--color-bg-elevated)_15%,transparent)]')}>
                        <td className="py-2.5 px-3 font-medium text-[var(--color-text-primary)]">
                          {p.customer_name}
                          {p.uncosted_jobs > 0 && <span className="text-xs text-[var(--color-text-muted)] ml-2">({p.uncosted_jobs} uncosted)</span>}
                        </td>
                        <td className="py-2.5 px-3 text-[var(--color-text-secondary)]">{p.costed_jobs}</td>
                        <td className="py-2.5 px-3 text-[var(--color-text-secondary)]">{PKR(Number(p.total_quoted))}</td>
                        <td className="py-2.5 px-3 text-[var(--color-text-secondary)]">{PKR(Number(p.total_cost))}</td>
                        <td className={cn('py-2.5 px-3 font-semibold', Number(p.total_margin) >= 0 ? 'text-[var(--color-success)]' : 'text-[var(--color-danger)]')}>
                          {PKR(Number(p.total_margin))}
                        </td>
                        <td className="py-2.5 px-3 text-[var(--color-text-secondary)]">{PCT(p.margin_pct)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </Section>

        {/* Quotation win rate — quotations.status has been recorded since 013
            and never counted. */}
        <Section title="Quotation Win Rate" icon={Briefcase}>
          {funnel.length === 0 ? (
            <p className="text-sm text-[var(--color-text-muted)] text-center py-8">No quotations raised in this range</p>
          ) : (
            <div className="space-y-4">
              <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
                <div className="rounded-lg border border-[var(--color-border)] bg-[var(--color-bg-elevated)] p-3">
                  <p className="text-xs text-[var(--color-text-muted)]">Win rate</p>
                  <p className="text-xl font-bold text-[var(--color-text-primary)]">{winRate != null ? `${winRate}%` : '—'}</p>
                  <p className="text-xs text-[var(--color-text-muted)] mt-0.5">{quotesWon} of {decided} decided</p>
                </div>
                <div className="rounded-lg border border-[var(--color-border)] bg-[var(--color-bg-elevated)] p-3">
                  <p className="text-xs text-[var(--color-text-muted)]">Quotes raised</p>
                  <p className="text-xl font-bold text-[var(--color-text-primary)]">{quotesRaised}</p>
                  <p className="text-xs text-[var(--color-text-muted)] mt-0.5">Latest revision only</p>
                </div>
                <div className="rounded-lg border border-[var(--color-border)] bg-[var(--color-bg-elevated)] p-3">
                  <p className="text-xs text-[var(--color-text-muted)]">Won value</p>
                  <p className="text-xl font-bold text-[var(--color-success)]">{PKR(wonValue)}</p>
                </div>
                <div className="rounded-lg border border-[var(--color-border)] bg-[var(--color-bg-elevated)] p-3">
                  <p className="text-xs text-[var(--color-text-muted)]">Still open</p>
                  <p className="text-xl font-bold text-[var(--color-warning)]">{quotesOpen}</p>
                  <p className="text-xs text-[var(--color-text-muted)] mt-0.5">{PKR(openValue)} in play</p>
                </div>
              </div>

              <div className="overflow-x-auto">
                <table className="w-full min-w-[720px] text-sm">
                  <thead>
                    <tr className="border-b border-[var(--color-border)]">
                      {['Customer','Quotes','Won','Lost','Open','Won Value','Win %'].map(h => (
                        <th key={h} className="text-left py-2 px-3 text-xs font-semibold text-[var(--color-text-muted)] uppercase tracking-wider">{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[var(--color-border-subtle)]">
                    {funnel.map((f, i) => (
                      <tr key={f.customer_id} className={cn('hover:bg-[color:color-mix(in_srgb,var(--color-bg-elevated)_30%,transparent)]', i % 2 === 1 && 'bg-[color:color-mix(in_srgb,var(--color-bg-elevated)_15%,transparent)]')}>
                        <td className="py-2.5 px-3 font-medium text-[var(--color-text-primary)]">{f.customer_name}</td>
                        <td className="py-2.5 px-3 text-[var(--color-text-secondary)]">{f.quotes_raised}</td>
                        <td className="py-2.5 px-3 text-[var(--color-success)]">{f.won}</td>
                        <td className="py-2.5 px-3 text-[var(--color-danger)]">{f.lost}</td>
                        <td className="py-2.5 px-3 text-[var(--color-warning)]">{f.open_quotes}</td>
                        <td className="py-2.5 px-3 text-[var(--color-text-primary)]">{PKR(Number(f.won_value))}</td>
                        <td className="py-2.5 px-3">
                          <span className={cn('font-semibold', f.win_rate_pct != null && f.win_rate_pct >= 50 ? 'text-[var(--color-success)]' : 'text-[var(--color-warning)]')}>
                            {PCT(f.win_rate_pct)}
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </Section>
        </div>
      )}

      {/* ── FINANCIAL TAB ────────────────────────────────────────────────────── */}
      {tab === 'financial' && (
        <div className="space-y-4">
          {/* Revenue bar chart */}
          <Section title="Monthly Revenue (last 6 months)" icon={DollarSign}>
            {financial.length === 0 ? (
              <p className="text-sm text-[var(--color-text-muted)] text-center py-8">No financial data</p>
            ) : (
              <>
                <div className="flex items-end gap-2 h-32 mb-3">
                  {[...financial].reverse().map((row, i) => {
                    const h  = maxFinancial > 0 ? (row.total_invoiced / maxFinancial) * 100 : 0
                    const hc = maxFinancial > 0 ? (row.total_collected / maxFinancial) * 100 : 0
                    return (
                      <button key={i} onClick={() => drillIntoMonth(row.month, row.month_label)}
                        className="flex-1 flex flex-col items-center gap-1 group cursor-pointer">
                        <div className="w-full flex items-end gap-0.5 h-24">
                          <div className="flex-1 rounded-t-sm group-hover:opacity-70 transition-opacity" style={{ height: `${h}%`, background: 'var(--color-accent)', opacity: 0.35 }} />
                          <div className="flex-1 rounded-t-sm group-hover:opacity-80 transition-opacity" style={{ height: `${hc}%`, background: 'var(--color-success)' }} />
                        </div>
                        <span className="text-xs text-[var(--color-text-muted)] group-hover:text-[var(--color-accent)] transition-colors">{row.month_label.split(' ')[0]}</span>
                      </button>
                    )
                  })}
                </div>
                <div className="flex items-center gap-4 text-xs text-[var(--color-text-muted)]">
                  <span className="flex items-center gap-1.5"><span className="w-3 h-3 rounded-sm inline-block" style={{ background: 'var(--color-accent)', opacity: 0.35 }} />Invoiced</span>
                  <span className="flex items-center gap-1.5"><span className="w-3 h-3 rounded-sm inline-block" style={{ background: 'var(--color-success)' }} />Collected</span>
                </div>
              </>
            )}
          </Section>

          {/* Financial table */}
          <Section title="Monthly Financial Summary" icon={BarChart3}>
            <div className="overflow-x-auto">
              <table className="w-full min-w-[640px] text-sm">
                <thead>
                  <tr className="border-b border-[var(--color-border)]">
                    {['Month','Invoices','Invoiced','Collected','Outstanding','Overdue'].map(h => (
                      <th key={h} className="text-left py-2 px-3 text-xs font-semibold text-[var(--color-text-muted)] uppercase tracking-wider">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-[var(--color-border-subtle)]">
                  {financial.map((row, i) => (
                    <tr key={i} className={cn('hover:bg-[color:color-mix(in_srgb,var(--color-bg-elevated)_30%,transparent)]', i % 2 === 1 && 'bg-[color:color-mix(in_srgb,var(--color-bg-elevated)_15%,transparent)]')}>
                      <td className="py-2.5 px-3 font-medium text-[var(--color-text-primary)]">{row.month_label}</td>
                      <td className="py-2.5 px-3 text-[var(--color-text-secondary)]">{row.invoice_count}</td>
                      <td className="py-2.5 px-3 text-[var(--color-text-primary)]">{PKR(row.total_invoiced)}</td>
                      <td className="py-2.5 px-3 text-[var(--color-success)]">{PKR(row.total_collected)}</td>
                      <td className="py-2.5 px-3 text-[var(--color-text-secondary)]">{PKR(row.total_outstanding)}</td>
                      <td className="py-2.5 px-3">
                        {row.overdue_amount > 0 ? (
                          <span className="text-[var(--color-danger)] font-medium">{PKR(row.overdue_amount)}</span>
                        ) : <span className="text-[var(--color-success)]">—</span>}
                      </td>
                    </tr>
                  ))}
                </tbody>
                <tfoot>
                  <tr className="border-t-2 border-[var(--color-border)] font-bold">
                    <td className="py-2.5 px-3 text-[var(--color-text-muted)]">TOTAL</td>
                    <td className="py-2.5 px-3">{financial.reduce((s, r) => s + r.invoice_count, 0)}</td>
                    <td className="py-2.5 px-3">{PKR(financial.reduce((s, r) => s + r.total_invoiced, 0))}</td>
                    <td className="py-2.5 px-3 text-[var(--color-success)]">{PKR(financial.reduce((s, r) => s + r.total_collected, 0))}</td>
                    <td className="py-2.5 px-3">{PKR(financial.reduce((s, r) => s + r.total_outstanding, 0))}</td>
                    <td className="py-2.5 px-3 text-[var(--color-danger)]">{PKR(financial.reduce((s, r) => s + r.overdue_amount, 0))}</td>
                  </tr>
                </tfoot>
              </table>
            </div>
          </Section>
        </div>
      )}

      {/* ── QUALITY TAB ──────────────────────────────────────────────────────── */}
      {tab === 'quality' && (
        <div className="space-y-4">
          {/* QC pass rate visual */}
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-3 md:gap-4">
            {qc.length > 0 ? (() => {
              const latest = qc[0]
              const totalInsp = qc.reduce((s, r) => s + r.total_inspections, 0)
              const totalPassed = qc.reduce((s, r) => s + r.passed, 0)
              const overallRate = totalInsp > 0 ? Math.round(totalPassed / totalInsp * 100) : 0
              const totalDefects = qc.reduce((s, r) => s + r.total_defects, 0)
              const totalReprints = qc.reduce((s, r) => s + r.reprint_requests, 0)
              return (
                <>
                  <StatCard label="Overall Pass Rate" value={`${overallRate}%`} sub={`${totalInsp} inspections`} icon={Shield}
                    color={overallRate >= 90 ? 'var(--color-success)' : overallRate >= 75 ? 'var(--color-warning)' : 'var(--color-danger)'} />
                  <StatCard label="Total Defects" value={totalDefects} sub="across all inspections" icon={AlertTriangle}
                    color={totalDefects === 0 ? 'var(--color-success)' : 'var(--color-warning)'} />
                  <StatCard label="Re-print Requests" value={totalReprints} sub="total re-prints" icon={RefreshCw}
                    color={totalReprints === 0 ? 'var(--color-success)' : 'var(--color-danger)'} />
                </>
              )
            })() : (
              <div className="col-span-3 text-center py-8 text-sm text-[var(--color-text-muted)]">No QC data yet</div>
            )}
          </div>

          <Section title="Monthly QC Analysis" icon={Shield}>
            {qc.length === 0 ? (
              <p className="text-sm text-[var(--color-text-muted)] text-center py-6">No data yet</p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full min-w-[640px] text-sm">
                  <thead>
                    <tr className="border-b border-[var(--color-border)]">
                      {['Month','Inspections','Passed','Failed','Conditional','Pass Rate','Defects','Re-prints'].map(h => (
                        <th key={h} className="text-left py-2 px-3 text-xs font-semibold text-[var(--color-text-muted)] uppercase tracking-wider">{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[var(--color-border-subtle)]">
                    {qc.map((row, i) => (
                      <tr key={i} className={cn('hover:bg-[color:color-mix(in_srgb,var(--color-bg-elevated)_30%,transparent)]', i % 2 === 1 && 'bg-[color:color-mix(in_srgb,var(--color-bg-elevated)_15%,transparent)]')}>
                        <td className="py-2.5 px-3 font-medium text-[var(--color-text-primary)]">{row.month_label}</td>
                        <td className="py-2.5 px-3 text-[var(--color-text-secondary)]">{row.total_inspections}</td>
                        <td className="py-2.5 px-3 text-[var(--color-success)]">{row.passed}</td>
                        <td className="py-2.5 px-3 text-[var(--color-danger)]">{row.failed}</td>
                        <td className="py-2.5 px-3 text-[var(--color-warning)]">{row.conditional}</td>
                        <td className="py-2.5 px-3">
                          <div className="flex items-center gap-2">
                            <span className={cn('font-semibold', (row.pass_rate_pct ?? 0) >= 90 ? 'text-[var(--color-success)]' : (row.pass_rate_pct ?? 0) >= 75 ? 'text-[var(--color-warning)]' : 'text-[var(--color-danger)]')}>
                              {PCT(row.pass_rate_pct)}
                            </span>
                            <div className="w-16">
                              <MiniBar value={row.pass_rate_pct ?? 0} max={100}
                                color={(row.pass_rate_pct ?? 0) >= 90 ? 'var(--color-success)' : 'var(--color-warning)'} />
                            </div>
                          </div>
                        </td>
                        <td className="py-2.5 px-3 text-[var(--color-text-secondary)]">{row.total_defects}</td>
                        <td className="py-2.5 px-3">
                          {row.reprint_requests > 0 ? <span className="text-[var(--color-danger)]">{row.reprint_requests}</span> : <span className="text-[var(--color-success)]">—</span>}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </Section>

          {/* What reprints cost. QC has always counted them; nothing ever put a
              number on them. */}
          <Section title={`Reprint Cost (${reprints.length})`} icon={RefreshCw}>
            {reprints.length === 0 ? (
              <div className="flex flex-col items-center py-4">
                <CheckCircle2 size={24} className="text-[var(--color-success)] mb-1" />
                <p className="text-sm text-[var(--color-text-muted)]">No reprints in this range.</p>
              </div>
            ) : (
              <div className="space-y-4">
                <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                  <div className="rounded-lg border p-3
                    bg-[color:color-mix(in_srgb,var(--color-danger)_10%,transparent)]
                    border-[color:color-mix(in_srgb,var(--color-danger)_25%,transparent)]">
                    <p className="text-xs text-[var(--color-text-muted)]">Cost of reprints</p>
                    <p className="text-xl font-bold text-[var(--color-danger)]">{PKR(reprintCost)}</p>
                    <p className="text-xs text-[var(--color-text-muted)] mt-0.5">Work done twice, billed once</p>
                  </div>
                  <div className="rounded-lg border border-[var(--color-border)] bg-[var(--color-bg-elevated)] p-3">
                    <p className="text-xs text-[var(--color-text-muted)]">Units reprinted</p>
                    <p className="text-xl font-bold text-[var(--color-text-primary)]">{Math.round(reprintQty).toLocaleString('en-PK')}</p>
                  </div>
                  <div className="rounded-lg border border-[var(--color-border)] bg-[var(--color-bg-elevated)] p-3">
                    <p className="text-xs text-[var(--color-text-muted)]">Not costed yet</p>
                    <p className="text-xl font-bold text-[var(--color-text-primary)]">{uncosted}</p>
                    <p className="text-xs text-[var(--color-text-muted)] mt-0.5">Real cost is higher than shown</p>
                  </div>
                </div>

                <div className="overflow-x-auto">
                  <table className="w-full text-sm min-w-[720px]">
                    <thead>
                      <tr className="text-left text-xs text-[var(--color-text-muted)] border-b border-[var(--color-border)]">
                        <th className="pb-2 font-medium">Original Job</th>
                        <th className="pb-2 font-medium">Customer</th>
                        <th className="pb-2 font-medium">Reason</th>
                        <th className="pb-2 font-medium">Reprint Job</th>
                        <th className="pb-2 font-medium">Status</th>
                        <th className="pb-2 font-medium text-right">Qty</th>
                        <th className="pb-2 font-medium text-right">Cost</th>
                      </tr>
                    </thead>
                    <tbody>
                      {reprints.map(r => (
                        <tr key={r.reprint_id} className="border-b border-[var(--color-border)] last:border-0">
                          <td className="py-2">
                            <Link href={`/dashboard/jobs/${r.original_job_id}`} className="font-mono text-xs text-[var(--color-accent)] hover:underline">{r.original_job_number}</Link>
                            <span className="block text-xs text-[var(--color-text-muted)] truncate max-w-[180px]">{r.original_job_title}</span>
                          </td>
                          <td className="py-2 text-[var(--color-text-secondary)]">{r.customer_name ?? '—'}</td>
                          <td className="py-2 text-[var(--color-text-secondary)] max-w-[200px] truncate" title={r.reason ?? ''}>{r.reason ?? '—'}</td>
                          <td className="py-2 font-mono text-xs text-[var(--color-text-secondary)]">{r.reprint_job_number ?? 'Not raised'}</td>
                          <td className="py-2 text-[var(--color-text-secondary)] capitalize">{r.status?.replace(/_/g, ' ')}</td>
                          <td className="py-2 text-right text-[var(--color-text-secondary)]">{Math.round(Number(r.quantity)).toLocaleString('en-PK')}</td>
                          <td className="py-2 text-right font-semibold text-[var(--color-text-primary)]">
                            {r.reprint_cost != null ? PKR(Number(r.reprint_cost)) : <span className="text-[var(--color-text-muted)] font-normal">—</span>}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
          </Section>
        </div>
      )}

      {/* ── COSTING TAB ──────────────────────────────────────────────────────── */}
      {tab === 'costing' && (
        <div className="space-y-4">
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-3 md:gap-4">
            {costingVariance.length > 0 ? (() => {
              const totalQuoted = costingVariance.reduce((s, r) => s + (r.quoted_amount ?? 0), 0)
              const totalActual = costingVariance.reduce((s, r) => s + r.total_cost, 0)
              const overCount = costingVariance.filter(r => r.budget_status === 'over_budget').length
              const avgMargin = (() => {
                const withMargin = costingVariance.filter(r => r.margin_pct != null)
                return withMargin.length > 0 ? withMargin.reduce((s, r) => s + (r.margin_pct ?? 0), 0) / withMargin.length : null
              })()
              return (
                <>
                  <StatCard label="Avg Margin" value={avgMargin != null ? `${avgMargin.toFixed(1)}%` : '—'} sub={`${costingVariance.length} costed jobs`} icon={TrendingUp}
                    color={avgMargin != null && avgMargin >= 0 ? 'var(--color-success)' : 'var(--color-danger)'} />
                  <StatCard label="Over Budget Jobs" value={overCount} sub="cost exceeded quote" icon={AlertTriangle}
                    color={overCount === 0 ? 'var(--color-success)' : 'var(--color-danger)'} />
                  <StatCard label="Quoted vs Actual" value={PKR(totalActual)} sub={`quoted ${PKR(totalQuoted)}`} icon={DollarSign} color="var(--color-accent)" />
                </>
              )
            })() : (
              <div className="col-span-3 text-center py-8 text-sm text-[var(--color-text-muted)]">No costed jobs yet</div>
            )}
          </div>

          <Section title="Job Costing Variance" icon={TrendingDown}>
            {costingVariance.length === 0 ? (
              <p className="text-sm text-[var(--color-text-muted)] text-center py-8">No costing data yet</p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full min-w-[640px] text-sm">
                  <thead>
                    <tr className="border-b border-[var(--color-border)]">
                      {['Job #','Customer','Quoted','Actual Cost','Margin','Variance','Status'].map(h => (
                        <th key={h} className="text-left py-2 px-3 text-xs font-semibold text-[var(--color-text-muted)] uppercase tracking-wider">{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[var(--color-border-subtle)]">
                    {costingVariance.map((row, i) => (
                      <tr key={row.costing_id} className={cn('hover:bg-[color:color-mix(in_srgb,var(--color-bg-elevated)_30%,transparent)]', i % 2 === 1 && 'bg-[color:color-mix(in_srgb,var(--color-bg-elevated)_15%,transparent)]')}>
                        <td className="py-2.5 px-3">
                          <Link href={`/dashboard/jobs/${row.job_id}`} className="font-medium text-[var(--color-accent)] hover:underline">{row.job_number}</Link>
                          <div className="text-xs text-[var(--color-text-muted)]">{row.job_title}</div>
                        </td>
                        <td className="py-2.5 px-3 text-[var(--color-text-secondary)]">{row.customer_name ?? '—'}</td>
                        <td className="py-2.5 px-3 text-[var(--color-text-secondary)]">{row.quoted_amount != null ? PKR(row.quoted_amount) : '—'}</td>
                        <td className="py-2.5 px-3 text-[var(--color-text-primary)]">{PKR(row.total_cost)}</td>
                        <td className="py-2.5 px-3">
                          <span className={cn('font-semibold', (row.margin_amount ?? 0) >= 0 ? 'text-[var(--color-success)]' : 'text-[var(--color-danger)]')}>
                            {row.margin_amount != null ? PKR(row.margin_amount) : '—'}{row.margin_pct != null && ` (${row.margin_pct.toFixed(1)}%)`}
                          </span>
                        </td>
                        <td className="py-2.5 px-3">
                          {row.variance_amount != null ? (
                            <span className={cn('font-semibold flex items-center gap-1', row.variance_amount >= 0 ? 'text-[var(--color-success)]' : 'text-[var(--color-danger)]')}>
                              {row.variance_amount >= 0 ? <ArrowUpRight size={13} /> : <ArrowDownRight size={13} />}
                              {PKR(Math.abs(row.variance_amount))}
                            </span>
                          ) : '—'}
                        </td>
                        <td className="py-2.5 px-3">
                          <span className={cn('px-2 py-0.5 rounded-full text-xs font-medium',
                            row.budget_status === 'over_budget' ? 'bg-[color:color-mix(in_srgb,var(--color-danger)_12%,transparent)] text-[var(--color-danger)]' :
                            row.budget_status === 'under_budget' ? 'bg-[color:color-mix(in_srgb,var(--color-success)_12%,transparent)] text-[var(--color-success)]' :
                            row.budget_status === 'on_budget' ? 'bg-[color:color-mix(in_srgb,var(--color-accent)_12%,transparent)] text-[var(--color-accent)]' :
                            'bg-[var(--color-bg-elevated)] text-[var(--color-text-muted)]')}>
                            {row.budget_status.replace('_', ' ')}
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </Section>
        </div>
      )}

      {tab === 'custom' && <CustomReportBuilder />}

      <Modal open={!!drillDown} onClose={() => setDrillDown(null)} title={drillDown?.title || ''} size="lg">
        {drillDown?.loading ? (
          <p className="text-sm text-[var(--color-text-muted)] text-center py-8">Loading…</p>
        ) : !drillDown?.rows.length ? (
          <p className="text-sm text-[var(--color-text-muted)] text-center py-8">No records found.</p>
        ) : (
          <>
            <div className="max-h-96 overflow-y-auto divide-y divide-[var(--color-border-subtle)]">
              {drillDown.kind === 'invoices' && drillDown.rows.map((inv: any) => (
                <div key={inv.id} className="py-2.5 flex items-center justify-between gap-3">
                  <div className="min-w-0">
                    <p className="text-sm text-[var(--color-text-primary)] font-mono">{inv.invoice_number}</p>
                    <p className="text-xs text-[var(--color-text-muted)] truncate">{inv.customers?.name}</p>
                  </div>
                  <div className="text-right flex-shrink-0 text-xs">
                    <p className="text-[var(--color-text-primary)] font-medium">{PKR(inv.total_amount)}</p>
                    <p className="text-[var(--color-text-muted)] capitalize">{inv.status}</p>
                  </div>
                </div>
              ))}
            </div>
            <Link href="/dashboard/finance" className="block text-center text-xs text-[var(--color-accent)] hover:underline pt-3 mt-1 border-t border-[var(--color-border-subtle)]">
              Open Finance module for full detail
            </Link>
          </>
        )}
      </Modal>
    </div>
  )
}

interface EntityColumn { key: string; label: string }

function CustomReportBuilder() {
  const [entities, setEntities] = useState<Record<string, EntityColumn[]>>({})
  const [entity, setEntity] = useState('jobs')
  const [dateFrom, setDateFrom] = useState('')
  const [dateTo, setDateTo] = useState('')
  const [status, setStatus] = useState('')
  const [selectedCols, setSelectedCols] = useState<Set<string>>(new Set())
  const [rows, setRows] = useState<Record<string, any>[]>([])
  const [loading, setLoading] = useState(false)
  const [hasRun, setHasRun] = useState(false)

  useEffect(() => {
    fetch('/api/v1/reports/custom?meta=entities')
      .then(r => r.json())
      .then(json => {
        setEntities(json.data ?? {})
        const cols = json.data?.jobs?.map((c: EntityColumn) => c.key) ?? []
        setSelectedCols(new Set(cols))
      })
  }, [])

  const columns = entities[entity] ?? []

  const changeEntity = (e: string) => {
    setEntity(e)
    setSelectedCols(new Set((entities[e] ?? []).map(c => c.key)))
    setRows([])
    setHasRun(false)
  }

  const toggleCol = (key: string) => {
    setSelectedCols(prev => {
      const next = new Set(prev)
      next.has(key) ? next.delete(key) : next.add(key)
      return next
    })
  }

  const run = async () => {
    setLoading(true)
    try {
      const res = await fetch('/api/v1/reports/custom', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ entity, date_from: dateFrom || undefined, date_to: dateTo || undefined, status: status || undefined }),
      })
      const json = await res.json()
      setRows(json.data ?? [])
      setHasRun(true)
    } finally { setLoading(false) }
  }

  const exportRows = () => {
    const visibleCols = columns.filter(c => selectedCols.has(c.key))
    const shaped = rows.map(r => Object.fromEntries(visibleCols.map(c => [c.label, r[c.key]])))
    exportToExcel(shaped, `custom-report-${entity}`, entity)
  }

  return (
    <div className="space-y-4">
      <div className="rounded-xl border border-[var(--color-border)] bg-[var(--color-bg-secondary)] p-4 space-y-4">
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-3">
          <div className="space-y-1.5">
            <label htmlFor="reportsclient-1" className="text-xs font-medium text-[var(--color-text-muted)]">Report On</label>
            <select id="reportsclient-1" value={entity} onChange={e => changeEntity(e.target.value)}
              className="w-full h-9 px-3 rounded-md border text-sm bg-[var(--color-bg-elevated)] text-[var(--color-text-primary)] border-[var(--color-border)]">
              {Object.keys(entities).map(key => <option key={key} value={key}>{key.replace(/_/g, ' ')}</option>)}
            </select>
          </div>
          <div className="space-y-1.5">
            <label htmlFor="reportsclient-2" className="text-xs font-medium text-[var(--color-text-muted)]">From</label>
            <input id="reportsclient-2" type="date" value={dateFrom} onChange={e => setDateFrom(e.target.value)}
              className="w-full h-9 px-3 rounded-md border text-sm bg-[var(--color-bg-elevated)] text-[var(--color-text-primary)] border-[var(--color-border)]" />
          </div>
          <div className="space-y-1.5">
            <label htmlFor="reportsclient-3" className="text-xs font-medium text-[var(--color-text-muted)]">To</label>
            <input id="reportsclient-3" type="date" value={dateTo} onChange={e => setDateTo(e.target.value)}
              className="w-full h-9 px-3 rounded-md border text-sm bg-[var(--color-bg-elevated)] text-[var(--color-text-primary)] border-[var(--color-border)]" />
          </div>
          <div className="space-y-1.5">
            <label htmlFor="reportsclient-4" className="text-xs font-medium text-[var(--color-text-muted)]">Status (optional)</label>
            <input id="reportsclient-4" value={status} onChange={e => setStatus(e.target.value)} placeholder="e.g. completed"
              className="w-full h-9 px-3 rounded-md border text-sm bg-[var(--color-bg-elevated)] text-[var(--color-text-primary)] border-[var(--color-border)]" />
          </div>
        </div>

        <div>
          <label className="text-xs font-medium text-[var(--color-text-muted)] mb-2 block">Columns</label>
          <div className="flex flex-wrap gap-2">
            {columns.map(c => (
              <button key={c.key} onClick={() => toggleCol(c.key)}
                className={cn('px-3 h-7 rounded-full text-xs font-medium border transition-all',
                  selectedCols.has(c.key) ? 'bg-[var(--color-accent)] text-[var(--color-on-accent)] border-transparent' : 'border-[var(--color-border)] text-[var(--color-text-muted)]')}>
                {c.label}
              </button>
            ))}
          </div>
        </div>

        <div className="flex gap-2">
          <button onClick={run} disabled={loading}
            className="flex items-center gap-1.5 px-4 h-9 rounded-md bg-[var(--color-accent)] text-[var(--color-on-accent)] text-sm font-medium hover:bg-[var(--color-accent-hover)] disabled:opacity-50 transition-colors">
            {loading ? 'Running…' : 'Run Report'}
          </button>
          {rows.length > 0 && (
            <button onClick={exportRows}
              className="flex items-center gap-1.5 px-4 h-9 rounded-md border border-[var(--color-border)] text-sm text-[var(--color-text-secondary)] hover:bg-[var(--color-bg-elevated)] transition-colors">
              <Download size={14} /> Export to Excel
            </button>
          )}
        </div>
      </div>

      {hasRun && (
        rows.length === 0 ? (
          <p className="text-sm text-[var(--color-text-muted)] text-center py-10">No results for this filter.</p>
        ) : (
          <div className="rounded-xl border border-[var(--color-border)] bg-[var(--color-bg-secondary)] overflow-x-auto">
            <table className="w-full min-w-[640px] text-sm">
              <thead>
                <tr className="border-b border-[var(--color-border)] bg-[var(--color-bg-elevated)]">
                  {columns.filter(c => selectedCols.has(c.key)).map(c => (
                    <th key={c.key} className="text-left py-2.5 px-3 text-xs font-semibold text-[var(--color-text-muted)] uppercase whitespace-nowrap">{c.label}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-[var(--color-border-subtle)]">
                {rows.map((row, i) => (
                  <tr key={i} className={cn('hover:bg-[color:color-mix(in_srgb,var(--color-bg-elevated)_30%,transparent)]', i % 2 === 1 && 'bg-[color:color-mix(in_srgb,var(--color-bg-elevated)_15%,transparent)]')}>
                    {columns.filter(c => selectedCols.has(c.key)).map(c => (
                      <td key={c.key} className="py-2 px-3 text-[var(--color-text-secondary)] whitespace-nowrap">{String(row[c.key] ?? '—')}</td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
            <p className="text-xs text-[var(--color-text-muted)] px-3 py-2 border-t border-[var(--color-border-subtle)]">{rows.length} rows (max 500)</p>
          </div>
        )
      )}
    </div>
  )
}
