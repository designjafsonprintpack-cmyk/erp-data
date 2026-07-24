'use client'
import { useState, useEffect, useCallback } from 'react'
import Link from 'next/link'
import { Cog, ArrowLeft, AlertTriangle, Clock } from 'lucide-react'
import { cn } from '@/lib/utils/cn'
import { toast } from '@/components/ui/Toast'
import DepartmentQueueClient from './production/queue/DepartmentQueueClient'

interface StatCard {
  label: string; value: string | number; iconEl: React.ReactNode; bgColor: string; card: string; badge?: string
}
interface MachineJob {
  job_id: string; job_number: string; job_title: string; customer_name: string | null
  assignment_status: string; stage_name: string | null
}
interface Machine { machine_id: string; machine_name: string; machine_type: string; jobs: MachineJob[] }
interface RecentJob {
  id: string; job_number: string; job_title: string; status: string; priority: string
  created_at: string; customers: { name: string } | null
}
interface Department { id: string; name: string; code: string }
interface Alert { type: 'blocked' | 'overdue'; job_number: string; job_title: string; detail: string }
interface TrendPoint { label: string; sheets: number }

const STATUS_LABEL: Record<string, string> = {
  running: 'Running', queued: 'Queued', paused: 'Paused',
  new: 'New', in_progress: 'In Progress', on_hold: 'On Hold',
  completed: 'Completed', dispatched: 'Dispatched', cancelled: 'Cancelled',
}

type Selection = { type: 'machine'; id: string; label: string } | { type: 'card'; key: string; label: string } | null

// One shared header treatment for every panel on the dashboard — the mix of
// header styles was a big part of why the old layout read as messy.
function PanelHeader({ children, right }: { children: React.ReactNode; right?: React.ReactNode }) {
  return (
    <div className="px-3 h-8 border-b border-[var(--color-border)] flex items-center justify-between flex-shrink-0">
      <span className="text-[11px] font-semibold uppercase tracking-wider text-[var(--color-text-muted)] flex items-center gap-1.5">{children}</span>
      {right}
    </div>
  )
}

export default function DashboardPanel({ stats, machines, recentJobs, departments, initialDepartmentId }: {
  stats: StatCard[]; machines: Machine[]; recentJobs: RecentJob[]
  departments: Department[]; initialDepartmentId: string
}) {
  const [selection, setSelection] = useState<Selection>(null)
  const [cardItems, setCardItems] = useState<any[]>([])
  const [cardType, setCardType] = useState<'jobs' | 'customers'>('jobs')
  const [cardLoading, setCardLoading] = useState(false)

  const selectedMachine = selection?.type === 'machine' ? machines.find(m => m.machine_id === selection.id) || null : null

  useEffect(() => {
    if (selection?.type !== 'card') return
    setCardLoading(true)
    fetch(`/api/v1/dashboard/card-jobs?card=${selection.key}`)
      .then(res => res.json())
      .then(({ data }) => { setCardItems(data?.items ?? []); setCardType(data?.type ?? 'jobs') })
      .catch(() => toast.error('Failed to load'))
      .finally(() => setCardLoading(false))
  }, [selection])

  const [alerts, setAlerts] = useState<Alert[]>([])
  const [trend, setTrend] = useState<TrendPoint[]>([])
  const [period, setPeriod] = useState<'week' | 'month' | 'year'>('week')
  const loadCommandData = useCallback(async (p: 'week' | 'month' | 'year') => {
    try {
      const res = await fetch(`/api/v1/production/command-center?period=${p}`)
      const { data } = await res.json()
      setAlerts(data?.alerts ?? [])
      setTrend(data?.sheets_trend ?? [])
    } catch { /* best-effort — dashboard already has plenty else on screen */ }
  }, [])
  useEffect(() => { loadCommandData(period) }, [period, loadCommandData])
  const maxSheets = Math.max(1, ...trend.map(t => t.sheets))

  const jobRow = (href: string, primary: string, secondary: string, right: string) => (
    <Link key={href + primary} href={href} className="flex items-center justify-between px-3 py-1.5 hover:bg-[var(--color-bg-elevated)]/50 transition-colors">
      <div className="min-w-0">
        <span className="text-xs font-medium text-[var(--color-accent)]">{primary}</span>
        <p className="text-[11px] text-[var(--color-text-muted)] truncate">{secondary}</p>
      </div>
      <span className="text-[11px] text-[var(--color-text-secondary)] flex-shrink-0 ml-2">{right}</span>
    </Link>
  )

  return (
    <div className="space-y-3">
      {/* ─── Row 1: KPI band (one container, cells divided by hairlines) + graph ── */}
      <div className="grid grid-cols-1 xl:grid-cols-3 gap-3 items-stretch">
        <div className="xl:col-span-2 rounded-lg border border-[var(--color-border)] overflow-hidden">
          <div className="grid grid-cols-3 sm:grid-cols-4 gap-px bg-[var(--color-border)]">
            {stats.map(stat => {
              const isSelected = selection?.type === 'card' && selection.key === stat.card
              return (
                <button
                  key={stat.card}
                  onClick={() => setSelection(isSelected ? null : { type: 'card', key: stat.card, label: stat.label })}
                  className={cn(
                    'text-left p-2.5 transition-colors relative',
                    isSelected
                      ? 'bg-[var(--color-accent)]/10'
                      : 'bg-[var(--color-bg-secondary)] hover:bg-[var(--color-bg-elevated)]'
                  )}
                >
                  {isSelected && <span className="absolute left-0 top-0 bottom-0 w-0.5 bg-[var(--color-accent)]" />}
                  <div className="flex items-center gap-1.5 mb-1">
                    {stat.iconEl}
                    <span className="text-[11px] text-[var(--color-text-muted)] leading-tight truncate">{stat.label}</span>
                    {stat.badge && <span className="w-1.5 h-1.5 rounded-full bg-[var(--color-danger)] flex-shrink-0" />}
                  </div>
                  <div className="text-xl font-semibold text-[var(--color-text-primary)] leading-none tabular-nums">{stat.value}</div>
                </button>
              )
            })}
          </div>
        </div>

        <div className="rounded-lg border border-[var(--color-border)] bg-[var(--color-bg-secondary)] flex flex-col overflow-hidden">
          <PanelHeader right={
            <div className="flex items-center gap-0.5">
              {(['week', 'month', 'year'] as const).map(p => (
                <button key={p} onClick={() => setPeriod(p)}
                  className={cn('h-5 px-1.5 rounded text-[10px] font-medium capitalize transition-colors',
                    period === p ? 'bg-[var(--color-accent)] text-white' : 'text-[var(--color-text-muted)] hover:bg-[var(--color-bg-elevated)]')}>
                  {p}
                </button>
              ))}
            </div>
          }>
            Sheets Printed
          </PanelHeader>
          <div className="p-3 flex-1 flex items-end">
            {trend.length === 0 ? (
              <p className="text-[11px] text-[var(--color-text-muted)] text-center w-full py-6">No printing completed yet</p>
            ) : (
              <div className="flex items-end gap-1 h-24 w-full">
                {trend.map((t, i) => (
                  <div key={i} className="flex-1 flex flex-col items-center gap-0.5 min-w-0" title={`${t.label}: ${t.sheets} sheets`}>
                    <span className="text-[9px] text-[var(--color-text-muted)] tabular-nums">{t.sheets > 0 ? t.sheets : ''}</span>
                    <div className="w-full bg-[var(--color-accent)] rounded-t-sm transition-all"
                      style={{ height: `${Math.max(3, (t.sheets / maxSheets) * 72)}px` }} />
                    <span className="text-[9px] text-[var(--color-text-muted)] whitespace-nowrap">{t.label}</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* ─── Row 2: Machines | Recent Jobs | Alerts — equal-height panels ──────── */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-3">
        <div className="rounded-lg border border-[var(--color-border)] bg-[var(--color-bg-secondary)] flex flex-col overflow-hidden h-[264px]">
          <PanelHeader><Cog size={11} /> Machines</PanelHeader>
          <div className="p-2 grid grid-cols-2 gap-1.5 content-start overflow-y-auto">
            {machines.length === 0 && (
              <div className="col-span-full text-center text-[11px] text-[var(--color-text-muted)] py-4">No machines configured yet.</div>
            )}
            {machines.map(m => {
              const jobCount = m.jobs.length
              const isSelected = selection?.type === 'machine' && selection.id === m.machine_id
              return (
                <button
                  key={m.machine_id}
                  onClick={() => setSelection(isSelected ? null : { type: 'machine', id: m.machine_id, label: m.machine_name })}
                  className={cn(
                    'text-left rounded-md border px-2 py-1.5 transition-colors flex items-center justify-between gap-1.5',
                    isSelected
                      ? 'border-[var(--color-accent)] bg-[var(--color-accent)]/10'
                      : 'border-[var(--color-border)] hover:bg-[var(--color-bg-elevated)]'
                  )}
                >
                  <span className="text-xs font-medium text-[var(--color-text-primary)] truncate">{m.machine_name}</span>
                  {jobCount > 0 ? (
                    <span className="text-[10px] font-semibold text-[var(--color-success)] tabular-nums flex-shrink-0">{jobCount}</span>
                  ) : (
                    <span className="w-1.5 h-1.5 rounded-full bg-[var(--color-border)] flex-shrink-0" />
                  )}
                </button>
              )
            })}
          </div>
        </div>

        <div className="rounded-lg border border-[var(--color-border)] bg-[var(--color-bg-secondary)] flex flex-col overflow-hidden h-[264px]">
          <PanelHeader right={selection && (
            <button onClick={() => setSelection(null)} className="text-[var(--color-text-muted)] hover:text-[var(--color-text-primary)]">
              <ArrowLeft size={12} />
            </button>
          )}>
            {selection ? (selection.type === 'machine' ? `Jobs — ${selection.label}` : selection.label) : 'Recent Jobs'}
          </PanelHeader>
          <div className="divide-y divide-[var(--color-border-subtle)] overflow-y-auto">
            {selectedMachine ? (
              selectedMachine.jobs.length === 0 ? (
                <div className="text-center text-[11px] text-[var(--color-text-muted)] py-6">No jobs currently on this machine.</div>
              ) : (
                selectedMachine.jobs.map(j => jobRow(`/dashboard/jobs/${j.job_id}`, j.job_number, `${j.job_title} — ${j.customer_name || '—'}`, STATUS_LABEL[j.assignment_status] || j.assignment_status))
              )
            ) : selection?.type === 'card' ? (
              cardLoading ? (
                <div className="text-center text-[11px] text-[var(--color-text-muted)] py-6">Loading…</div>
              ) : cardItems.length === 0 ? (
                <div className="text-center text-[11px] text-[var(--color-text-muted)] py-6">Nothing here right now.</div>
              ) : cardType === 'customers' ? (
                cardItems.map((c: any) => jobRow(`/dashboard/customers/${c.id}`, c.name, c.phone || c.email || '', ''))
              ) : (
                cardItems.map((j: any) => jobRow(`/dashboard/jobs/${j.id}`, j.job_number, `${j.job_title} — ${j.customers?.name || '—'}`, STATUS_LABEL[j.status] || j.status))
              )
            ) : (
              recentJobs.length === 0 ? (
                <div className="text-center text-[11px] text-[var(--color-text-muted)] py-6">No jobs yet.</div>
              ) : (
                recentJobs.map(j => jobRow(`/dashboard/jobs/${j.id}`, j.job_number, `${j.job_title} — ${j.customers?.name || '—'}`, STATUS_LABEL[j.status] || j.status))
              )
            )}
          </div>
        </div>

        <div className="rounded-lg border border-[var(--color-border)] bg-[var(--color-bg-secondary)] flex flex-col overflow-hidden h-[264px]">
          <PanelHeader right={<span className="text-[10px] text-[var(--color-text-muted)] tabular-nums">{alerts.length}</span>}>
            <AlertTriangle size={11} className="text-[var(--color-danger)]" /> Alerts
          </PanelHeader>
          {alerts.length === 0 ? (
            <p className="text-[11px] text-[var(--color-text-muted)] text-center py-6">Nothing needs attention</p>
          ) : (
            <div className="divide-y divide-[var(--color-border-subtle)] overflow-y-auto">
              {alerts.map((a, i) => (
                <div key={i} className="px-3 py-1.5">
                  <div className="flex items-center gap-1.5">
                    <span className={cn('text-[9px] px-1 py-px rounded font-semibold uppercase tracking-wide flex-shrink-0',
                      a.type === 'overdue' ? 'bg-[var(--color-danger)]/10 text-[var(--color-danger)]' : 'bg-[var(--color-warning)]/10 text-[var(--color-warning)]')}>
                      {a.type}
                    </span>
                    <span className="text-xs font-medium text-[var(--color-text-primary)] truncate">{a.job_number}</span>
                  </div>
                  <p className="text-[11px] text-[var(--color-text-muted)] mt-0.5 leading-snug">{a.detail}</p>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* ─── Row 3: Department Queue ────────────────────────────────────────────── */}
      <div>
        <h2 className="text-[11px] font-semibold uppercase tracking-wider text-[var(--color-text-muted)] mb-2 flex items-center gap-1.5">
          <Clock size={11} /> Department Queue
        </h2>
        <DepartmentQueueClient departments={departments} initialDepartmentId={initialDepartmentId} />
      </div>
    </div>
  )
}
