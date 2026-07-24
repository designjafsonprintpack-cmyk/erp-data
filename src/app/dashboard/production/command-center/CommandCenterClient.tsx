'use client'
import { useState, useEffect, useCallback } from 'react'
import { Briefcase, Cpu, AlertTriangle, CalendarClock, RefreshCw, Clock } from 'lucide-react'
import { cn } from '@/lib/utils/cn'
import { toast } from '@/components/ui/Toast'
import Link from 'next/link'

interface Kpis { jobs_in_progress: number; machines_running: number; machines_total: number; overdue_jobs: number }
interface MachineEntry {
  machine_id: string; machine_name: string; machine_type: string
  current_job: { job_id: string; job_number: string; job_title: string; stage_name: string | null; status: string } | null
  next_job: { job_number: string; job_title: string; scheduled_start: string | null } | null
}
interface Alert { type: 'blocked' | 'overdue'; job_number: string; job_title: string; detail: string }
interface TrendPoint { label: string; sheets: number }

type Period = 'week' | 'month' | 'year'

const kpiCards = [
  { key: 'jobs_in_progress', label: 'Jobs In Progress', icon: Briefcase },
  { key: 'machines_running', label: 'Machines Running', icon: Cpu, suffix: (k: Kpis) => `/${k.machines_total}` },
  { key: 'overdue_jobs', label: 'Overdue Jobs', icon: CalendarClock },
] as const

export default function CommandCenterClient() {
  const [kpis, setKpis] = useState<Kpis | null>(null)
  const [machines, setMachines] = useState<MachineEntry[]>([])
  const [alerts, setAlerts] = useState<Alert[]>([])
  const [trend, setTrend] = useState<TrendPoint[]>([])
  const [period, setPeriod] = useState<Period>('week')
  const [loading, setLoading] = useState(true)

  const load = useCallback(async (p: Period) => {
    setLoading(true)
    try {
      const res = await fetch(`/api/v1/production/command-center?period=${p}`)
      if (!res.ok) throw new Error()
      const { data } = await res.json()
      setKpis(data.kpis)
      setMachines(data.machines ?? [])
      setAlerts(data.alerts ?? [])
      setTrend(data.sheets_trend ?? [])
    } catch {
      toast.error('Failed to load dashboard')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { load(period) }, [period, load])

  const maxSheets = Math.max(1, ...trend.map(t => t.sheets))

  return (
    <div className="space-y-5">
      <div className="flex justify-end">
        <button onClick={() => load(period)} disabled={loading}
          className="flex items-center gap-1.5 h-9 px-3 rounded-md border border-[var(--color-border)] text-sm text-[var(--color-text-secondary)] hover:bg-[var(--color-bg-elevated)] transition-colors disabled:opacity-50">
          <RefreshCw size={14} className={loading ? 'animate-spin' : ''} /> Refresh
        </button>
      </div>

      {/* KPI strip */}
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
        {kpiCards.map(c => {
          const Icon = c.icon
          const value = kpis ? (kpis as any)[c.key] : '—'
          const suffix = kpis && 'suffix' in c ? c.suffix(kpis) : ''
          return (
            <div key={c.key} className="rounded-lg bg-[var(--color-bg-secondary)] p-4">
              <div className="flex items-center gap-2 text-[var(--color-text-muted)] mb-1.5">
                <Icon size={14} />
                <span className="text-xs">{c.label}</span>
              </div>
              <p className="text-2xl font-medium text-[var(--color-text-primary)]">{value}{suffix}</p>
            </div>
          )
        })}
      </div>

      {/* Machine grid */}
      <div className="rounded-xl border border-[var(--color-border)] bg-[var(--color-bg-secondary)] overflow-hidden">
        <div className="px-4 py-2.5 border-b border-[var(--color-border)]">
          <span className="text-sm font-semibold text-[var(--color-text-primary)]">Machines</span>
        </div>
        {machines.length === 0 ? (
          <p className="px-4 py-6 text-sm text-[var(--color-text-muted)] text-center">No machines configured</p>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 p-4">
            {machines.map(m => (
              <div key={m.machine_id} className="rounded-lg border border-[var(--color-border)] p-3">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-sm font-medium text-[var(--color-text-primary)]">{m.machine_name}</span>
                  <span className={cn('w-2 h-2 rounded-full', m.current_job ? 'bg-[var(--color-success)]' : 'bg-[var(--color-border)]')} />
                </div>
                {m.current_job ? (
                  <Link href={`/dashboard/jobs/${m.current_job.job_id}`} className="block text-xs text-[var(--color-text-secondary)] hover:text-[var(--color-accent)]">
                    <span className="font-medium">{m.current_job.job_number}</span> — {m.current_job.job_title}
                    {m.current_job.stage_name && <span className="block text-[var(--color-text-muted)] mt-0.5">{m.current_job.stage_name} · {m.current_job.status}</span>}
                  </Link>
                ) : (
                  <p className="text-xs text-[var(--color-text-muted)]">Idle</p>
                )}
                {m.next_job && (
                  <p className="text-xs text-[var(--color-text-muted)] mt-2 pt-2 border-t border-[var(--color-border-subtle)] flex items-center gap-1">
                    <Clock size={11} /> Next: {m.next_job.job_number}
                  </p>
                )}
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* Alerts feed */}
        <div className="rounded-xl border border-[var(--color-border)] bg-[var(--color-bg-secondary)] overflow-hidden">
          <div className="px-4 py-2.5 border-b border-[var(--color-border)] flex items-center gap-2">
            <AlertTriangle size={15} className="text-[var(--color-danger)]" />
            <span className="text-sm font-semibold text-[var(--color-text-primary)]">Alerts</span>
            <span className="text-xs text-[var(--color-text-muted)]">({alerts.length})</span>
          </div>
          {alerts.length === 0 ? (
            <p className="px-4 py-6 text-sm text-[var(--color-text-muted)] text-center">Nothing needs attention</p>
          ) : (
            <div className="divide-y divide-[var(--color-border-subtle)] max-h-80 overflow-y-auto">
              {alerts.map((a, i) => (
                <div key={i} className="px-4 py-2.5">
                  <div className="flex items-center gap-2">
                    <span className={cn('text-[10px] px-1.5 py-0.5 rounded-full font-medium uppercase',
                      a.type === 'overdue' ? 'bg-[var(--color-danger)]/10 text-[var(--color-danger)]' : 'bg-[var(--color-warning)]/10 text-[var(--color-warning)]')}>
                      {a.type}
                    </span>
                    <span className="text-sm font-medium text-[var(--color-text-primary)]">{a.job_number}</span>
                  </div>
                  <p className="text-xs text-[var(--color-text-muted)] mt-0.5">{a.detail}</p>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Sheets printed trend */}
        <div className="rounded-xl border border-[var(--color-border)] bg-[var(--color-bg-secondary)] overflow-hidden">
          <div className="px-4 py-2.5 border-b border-[var(--color-border)] flex items-center justify-between">
            <span className="text-sm font-semibold text-[var(--color-text-primary)]">Sheets Printed</span>
            <div className="flex items-center gap-1">
              {(['week', 'month', 'year'] as Period[]).map(p => (
                <button key={p} onClick={() => setPeriod(p)}
                  className={cn('h-7 px-2.5 rounded-md text-xs font-medium capitalize transition-colors',
                    period === p ? 'bg-[var(--color-accent)] text-white' : 'text-[var(--color-text-muted)] hover:bg-[var(--color-bg-elevated)]')}>
                  {p}
                </button>
              ))}
            </div>
          </div>
          <div className="p-4">
            {trend.length === 0 ? (
              <p className="text-sm text-[var(--color-text-muted)] text-center py-6">No printing completed yet</p>
            ) : (
              <div className="flex items-end gap-1.5 h-40">
                {trend.map((t, i) => (
                  <div key={i} className="flex-1 flex flex-col items-center gap-1.5" title={`${t.label}: ${t.sheets} sheets`}>
                    <span className="text-[10px] text-[var(--color-text-muted)]">{t.sheets > 0 ? t.sheets : ''}</span>
                    <div className="w-full bg-[var(--color-accent)] rounded-t-sm transition-all"
                      style={{ height: `${Math.max(2, (t.sheets / maxSheets) * 100)}%` }} />
                    <span className="text-[10px] text-[var(--color-text-muted)] whitespace-nowrap">{t.label}</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
