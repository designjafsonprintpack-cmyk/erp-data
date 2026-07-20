'use client'
import { useState, useEffect } from 'react'
import Link from 'next/link'
import {
  TrendingUp, TrendingDown, AlertTriangle, CheckCircle2, Clock,
  Briefcase, DollarSign, Cpu, Shield, Users, BarChart3, Activity,
  ArrowUpRight, ArrowDownRight, RefreshCw, Package, Download, Sliders
} from 'lucide-react'
import { cn } from '@/lib/utils/cn'
import { formatDate } from '@/lib/utils/format'
import { exportToExcel } from '@/lib/utils/exportToExcel'

/* ─── Types ──────────────────────────────────────────────────────────────────── */
interface KPI {
  period_days: number
  jobs: { total: number; completed: number; in_progress: number; on_hold: number; overdue: number }
  revenue: { invoiced: number; collected: number; outstanding: number; overdue: number }
  production: { machines_running: number; dispatched_today: number; qc_pass_rate: number }
  top_customers: { name: string; job_count: number; value: number }[] | null
}
interface MonthlyRow { month: string; month_label: string; jobs_created: number; jobs_completed: number; jobs_dispatched: number; jobs_cancelled: number; jobs_on_hold: number; total_quantity: number; total_quoted_value: number; avg_turnaround_days: number | null; on_time_pct: number | null }
interface CustomerRow { customer_id: string; customer_name: string; customer_code: string; total_jobs: number; completed_jobs: number; total_invoiced: number; total_paid: number; total_outstanding: number }
interface FinancialRow { month: string; month_label: string; invoice_count: number; total_invoiced: number; total_collected: number; total_outstanding: number; overdue_count: number; overdue_amount: number }
interface MachineRow { machine_id: string; machine_name: string; machine_type: string; total_assignments: number; completed: number; currently_running: number; queued: number; total_actual_minutes: number; avg_job_minutes: number }
interface QCRow { month: string; month_label: string; total_inspections: number; passed: number; failed: number; conditional: number; pass_rate_pct: number; total_defects: number; reprint_requests: number }
interface OverdueJob { id: string; job_number: string; job_title: string; required_date: string; status: string; priority: string; customers?: { name: string } | null }

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

type Tab = 'overview' | 'production' | 'customers' | 'financial' | 'quality' | 'custom'

/* ─── Main Component ─────────────────────────────────────────────────────────── */
export default function ReportsClient({ kpi, monthly, customers, financial, machines, qc, overdueJobs }: {
  kpi: KPI | null; monthly: MonthlyRow[]; customers: CustomerRow[]
  financial: FinancialRow[]; machines: MachineRow[]; qc: QCRow[]; overdueJobs: OverdueJob[]
}) {
  const [tab, setTab] = useState<Tab>('overview')

  const maxMonthlyJobs = Math.max(...monthly.map(m => m.jobs_created), 1)
  const maxCustomerJobs = Math.max(...customers.map(c => c.total_jobs), 1)
  const maxMachineAsgn  = Math.max(...machines.map(m => m.total_assignments), 1)
  const maxFinancial    = Math.max(...financial.map(f => f.total_invoiced), 1)

  // Returns an export function for the given tab, or null if that tab has
  // nothing meaningful to export (overview is a KPI dashboard, not a table).
  const exportForTab = (t: Tab): (() => void) | null => {
    switch (t) {
      case 'production':
        return () => exportToExcel(
          monthly.map(m => ({ Month: m.month_label, 'Jobs Created': m.jobs_created, 'Jobs Completed': m.jobs_completed, 'Jobs Dispatched': m.jobs_dispatched, 'Jobs Cancelled': m.jobs_cancelled, 'On Hold': m.jobs_on_hold, 'Total Quantity': m.total_quantity, 'Quoted Value (PKR)': m.total_quoted_value, 'Avg Turnaround (days)': m.avg_turnaround_days, 'On-Time %': m.on_time_pct })),
          'production-report', 'Monthly Production')
      case 'customers':
        return () => exportToExcel(
          customers.map(c => ({ Customer: c.customer_name, Code: c.customer_code, 'Total Jobs': c.total_jobs, 'Completed Jobs': c.completed_jobs, 'Invoiced (PKR)': c.total_invoiced, 'Paid (PKR)': c.total_paid, 'Outstanding (PKR)': c.total_outstanding })),
          'customer-report', 'Customer Sales')
      case 'financial':
        return () => exportToExcel(
          financial.map(f => ({ Month: f.month_label, Invoices: f.invoice_count, 'Invoiced (PKR)': f.total_invoiced, 'Collected (PKR)': f.total_collected, 'Outstanding (PKR)': f.total_outstanding, 'Overdue Count': f.overdue_count, 'Overdue Amount (PKR)': f.overdue_amount })),
          'financial-report', 'Financial')
      case 'quality':
        return () => exportToExcel(
          qc.map(q => ({ Month: q.month_label, Inspections: q.total_inspections, Passed: q.passed, Failed: q.failed, Conditional: q.conditional, 'Pass Rate %': q.pass_rate_pct, Defects: q.total_defects, Reprints: q.reprint_requests })),
          'qc-report', 'Quality')
      default:
        return null
    }
  }

  return (
    <div className="space-y-4">
      {/* Tabs */}
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div className="flex items-center gap-1 flex-wrap">
          {([
            ['overview',   'Overview',    BarChart3],
            ['production', 'Production',  Cpu],
            ['customers',  'Customers',   Users],
            ['financial',  'Financial',   DollarSign],
            ['quality',    'Quality',     Shield],
            ['custom',     'Custom Report', Sliders],
          ] as const).map(([key, label, Icon]) => (
            <button key={key} onClick={() => setTab(key)}
              className={cn('flex items-center gap-1.5 px-4 h-8 rounded-md text-sm font-medium border transition-all',
                tab === key ? 'bg-[var(--color-accent)] text-white border-transparent' : 'border-[var(--color-border)] text-[var(--color-text-secondary)] hover:text-[var(--color-text-primary)]')}>
              <Icon size={13} />{label}
            </button>
          ))}
          <span className="text-xs text-[var(--color-text-muted)] ml-2">Last 30 days</span>
        </div>
        {exportForTab(tab) && (
          <button onClick={() => exportForTab(tab)!()}
            className="flex items-center gap-1.5 px-3 h-8 rounded-md border border-[var(--color-border)] text-sm text-[var(--color-text-secondary)] hover:bg-[var(--color-bg-elevated)] transition-colors">
            <Download size={13} /> Export to Excel
          </button>
        )}
      </div>

      {/* ── OVERVIEW TAB ─────────────────────────────────────────────────────── */}
      {tab === 'overview' && (
        <div className="space-y-4">
          {/* KPI Cards */}
          <div className="grid grid-cols-4 gap-4">
            <StatCard label="Total Jobs" value={kpi?.jobs.total ?? 0} sub={`${kpi?.jobs.completed ?? 0} completed`} icon={Briefcase} color="var(--color-accent)" />
            <StatCard label="Revenue Invoiced" value={PKR(kpi?.revenue.invoiced ?? 0)} sub={`${PKR(kpi?.revenue.collected ?? 0)} collected`} icon={TrendingUp} color="var(--color-success)" trend="up" />
            <StatCard label="Outstanding" value={PKR(kpi?.revenue.outstanding ?? 0)} sub={kpi?.revenue.overdue ? `${PKR(kpi.revenue.overdue)} overdue` : undefined} icon={DollarSign} color={(kpi?.revenue.overdue ?? 0) > 0 ? 'var(--color-danger)' : 'var(--color-text-muted)'} />
            <StatCard label="Machines Running" value={kpi?.production.machines_running ?? 0} sub={`QC pass rate: ${PCT(kpi?.production.qc_pass_rate ?? null)}`} icon={Cpu} color="var(--color-warning)" />
          </div>

          <div className="grid grid-cols-3 gap-4">
            <StatCard label="In Progress" value={kpi?.jobs.in_progress ?? 0} icon={Activity} color="var(--color-warning)" />
            <StatCard label="On Hold" value={kpi?.jobs.on_hold ?? 0} icon={Clock} color="var(--color-text-muted)" />
            <StatCard label="Overdue Jobs" value={kpi?.jobs.overdue ?? 0} icon={AlertTriangle} color={(kpi?.jobs.overdue ?? 0) > 0 ? 'var(--color-danger)' : 'var(--color-success)'} />
          </div>

          <div className="grid grid-cols-2 gap-4">
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
        </div>
      )}

      {/* ── PRODUCTION TAB ───────────────────────────────────────────────────── */}
      {tab === 'production' && (
        <div className="space-y-4">
          {/* Monthly production bar chart */}
          <Section title="Monthly Job Volume (last 6 months)" icon={BarChart3}>
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
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-[var(--color-border)]">
                    {['Month','Created','Completed','Dispatched','Qty','Avg Days','On-Time %'].map(h => (
                      <th key={h} className="text-left py-2 px-2 text-xs font-semibold text-[var(--color-text-muted)] uppercase tracking-wider">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-[var(--color-border-subtle)]">
                  {monthly.map((row, i) => (
                    <tr key={i} className={cn('hover:bg-[var(--color-bg-elevated)]/30', i % 2 === 1 && 'bg-[var(--color-bg-elevated)]/15')}>
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
        </div>
      )}

      {/* ── CUSTOMERS TAB ────────────────────────────────────────────────────── */}
      {tab === 'customers' && (
        <Section title="Customer Sales Report" icon={Users}>
          {customers.length === 0 ? (
            <p className="text-sm text-[var(--color-text-muted)] text-center py-8">No customer data</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-[var(--color-border)]">
                    {['Customer','Code','Total Jobs','Completed','Invoiced','Collected','Outstanding'].map(h => (
                      <th key={h} className="text-left py-2 px-3 text-xs font-semibold text-[var(--color-text-muted)] uppercase tracking-wider">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-[var(--color-border-subtle)]">
                  {customers.map((c, i) => (
                    <tr key={c.customer_id} className={cn('hover:bg-[var(--color-bg-elevated)]/30', i % 2 === 1 && 'bg-[var(--color-bg-elevated)]/15')}>
                      <td className="py-2.5 px-3 font-medium text-[var(--color-text-primary)]">{c.customer_name}</td>
                      <td className="py-2.5 px-3 text-xs font-mono text-[var(--color-text-muted)]">{c.customer_code}</td>
                      <td className="py-2.5 px-3 text-[var(--color-text-secondary)]">{c.total_jobs}</td>
                      <td className="py-2.5 px-3 text-[var(--color-success)]">{c.completed_jobs}</td>
                      <td className="py-2.5 px-3 text-[var(--color-text-primary)]">{PKR(c.total_invoiced)}</td>
                      <td className="py-2.5 px-3 text-[var(--color-success)]">{PKR(c.total_paid)}</td>
                      <td className="py-2.5 px-3">
                        <span className={cn('font-semibold', c.total_outstanding > 0 ? 'text-[var(--color-danger)]' : 'text-[var(--color-success)]')}>
                          {c.total_outstanding > 0 ? PKR(c.total_outstanding) : '✓ Clear'}
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
                      <div key={i} className="flex-1 flex flex-col items-center gap-1">
                        <div className="w-full flex items-end gap-0.5 h-24">
                          <div className="flex-1 rounded-t-sm" style={{ height: `${h}%`, background: 'var(--color-accent)', opacity: 0.35 }} />
                          <div className="flex-1 rounded-t-sm" style={{ height: `${hc}%`, background: 'var(--color-success)' }} />
                        </div>
                        <span className="text-xs text-[var(--color-text-muted)]">{row.month_label.split(' ')[0]}</span>
                      </div>
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
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-[var(--color-border)]">
                    {['Month','Invoices','Invoiced','Collected','Outstanding','Overdue'].map(h => (
                      <th key={h} className="text-left py-2 px-3 text-xs font-semibold text-[var(--color-text-muted)] uppercase tracking-wider">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-[var(--color-border-subtle)]">
                  {financial.map((row, i) => (
                    <tr key={i} className={cn('hover:bg-[var(--color-bg-elevated)]/30', i % 2 === 1 && 'bg-[var(--color-bg-elevated)]/15')}>
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
          <div className="grid grid-cols-3 gap-4">
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
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-[var(--color-border)]">
                      {['Month','Inspections','Passed','Failed','Conditional','Pass Rate','Defects','Re-prints'].map(h => (
                        <th key={h} className="text-left py-2 px-3 text-xs font-semibold text-[var(--color-text-muted)] uppercase tracking-wider">{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[var(--color-border-subtle)]">
                    {qc.map((row, i) => (
                      <tr key={i} className={cn('hover:bg-[var(--color-bg-elevated)]/30', i % 2 === 1 && 'bg-[var(--color-bg-elevated)]/15')}>
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
        </div>
      )}

      {tab === 'custom' && <CustomReportBuilder />}
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
        <div className="grid grid-cols-4 gap-3">
          <div className="space-y-1.5">
            <label className="text-xs font-medium text-[var(--color-text-muted)]">Report On</label>
            <select value={entity} onChange={e => changeEntity(e.target.value)}
              className="w-full h-9 px-3 rounded-md border text-sm bg-[var(--color-bg-elevated)] text-[var(--color-text-primary)] border-[var(--color-border)]">
              {Object.keys(entities).map(key => <option key={key} value={key}>{key.replace(/_/g, ' ')}</option>)}
            </select>
          </div>
          <div className="space-y-1.5">
            <label className="text-xs font-medium text-[var(--color-text-muted)]">From</label>
            <input type="date" value={dateFrom} onChange={e => setDateFrom(e.target.value)}
              className="w-full h-9 px-3 rounded-md border text-sm bg-[var(--color-bg-elevated)] text-[var(--color-text-primary)] border-[var(--color-border)]" />
          </div>
          <div className="space-y-1.5">
            <label className="text-xs font-medium text-[var(--color-text-muted)]">To</label>
            <input type="date" value={dateTo} onChange={e => setDateTo(e.target.value)}
              className="w-full h-9 px-3 rounded-md border text-sm bg-[var(--color-bg-elevated)] text-[var(--color-text-primary)] border-[var(--color-border)]" />
          </div>
          <div className="space-y-1.5">
            <label className="text-xs font-medium text-[var(--color-text-muted)]">Status (optional)</label>
            <input value={status} onChange={e => setStatus(e.target.value)} placeholder="e.g. completed"
              className="w-full h-9 px-3 rounded-md border text-sm bg-[var(--color-bg-elevated)] text-[var(--color-text-primary)] border-[var(--color-border)]" />
          </div>
        </div>

        <div>
          <label className="text-xs font-medium text-[var(--color-text-muted)] mb-2 block">Columns</label>
          <div className="flex flex-wrap gap-2">
            {columns.map(c => (
              <button key={c.key} onClick={() => toggleCol(c.key)}
                className={cn('px-3 h-7 rounded-full text-xs font-medium border transition-all',
                  selectedCols.has(c.key) ? 'bg-[var(--color-accent)] text-white border-transparent' : 'border-[var(--color-border)] text-[var(--color-text-muted)]')}>
                {c.label}
              </button>
            ))}
          </div>
        </div>

        <div className="flex gap-2">
          <button onClick={run} disabled={loading}
            className="flex items-center gap-1.5 px-4 h-9 rounded-md bg-[var(--color-accent)] text-white text-sm font-medium hover:bg-[var(--color-accent-hover)] disabled:opacity-50 transition-colors">
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
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-[var(--color-border)] bg-[var(--color-bg-elevated)]">
                  {columns.filter(c => selectedCols.has(c.key)).map(c => (
                    <th key={c.key} className="text-left py-2.5 px-3 text-xs font-semibold text-[var(--color-text-muted)] uppercase whitespace-nowrap">{c.label}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-[var(--color-border-subtle)]">
                {rows.map((row, i) => (
                  <tr key={i} className={cn('hover:bg-[var(--color-bg-elevated)]/30', i % 2 === 1 && 'bg-[var(--color-bg-elevated)]/15')}>
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
