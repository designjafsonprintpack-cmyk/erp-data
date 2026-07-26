'use client'
import { useState, useEffect, useCallback } from 'react'
import { Play, CheckCircle2, SkipForward, AlertTriangle, Clock, RefreshCw, CalendarClock } from 'lucide-react'
import { cn } from '@/lib/utils/cn'
import { toast } from '@/components/ui/Toast'
import { EmptyState } from '@/components/ui/EmptyState'
import { formatDate, formatTimeAgo } from '@/lib/utils/format'
import { JOB_PRIORITY_CONFIG } from '@/modules/jobs/types/job.types'
import Link from 'next/link'

interface QueueEntry {
  stage_progress_id: string; job_id: string; job_number: string; job_title: string
  customer_name: string | null; priority: string; required_date: string | null
  stage_name: string; started_at: string | null; blocked_reason?: string
  planned_date: string | null; department_name: string | null
}
interface Department { id: string; name: string; code: string }

// "Planned aaj / kal / 27 Jul" — a bare date makes the floor do the mental
// arithmetic, and today-vs-tomorrow is the only distinction that changes what
// anyone does next.
const planLabel = (date: string): string => {
  const today = new Date(); today.setHours(0, 0, 0, 0)
  const d = new Date(`${date}T00:00:00`)
  const days = Math.round((d.getTime() - today.getTime()) / 86400000)
  if (days === 0) return 'Planned today'
  if (days === 1) return 'Planned tomorrow'
  if (days === -1) return 'Planned yesterday'
  if (days < 0) return `Planned ${formatDate(date)} (${Math.abs(days)}d late)`
  return `Planned ${formatDate(date)}`
}

export default function DepartmentQueueClient({ departments, initialDepartmentId }: { departments: Department[]; initialDepartmentId: string }) {
  // No department on the user (owner / admin / superadmin, or simply not set)
  // → show the whole plant rather than silently landing on whichever
  // department happens to sort first and looking empty.
  const [departmentId, setDepartmentId] = useState(initialDepartmentId || 'all')
  const [ready, setReady] = useState<QueueEntry[]>([])
  const [blocked, setBlocked] = useState<QueueEntry[]>([])
  const [inProgress, setInProgress] = useState<QueueEntry[]>([])
  const [loading, setLoading] = useState(true)
  const [actingOn, setActingOn] = useState<string | null>(null)

  const load = useCallback(async () => {
    if (!departmentId) { setLoading(false); return }
    setLoading(true)
    try {
      const res = await fetch(`/api/v1/production/department-queue?department_id=${departmentId}`)
      const { data } = await res.json()
      setReady(data.ready ?? [])
      setBlocked(data.blocked ?? [])
      setInProgress(data.in_progress ?? [])
    } catch {
      toast.error('Failed to load queue')
    } finally {
      setLoading(false)
    }
  }, [departmentId])

  useEffect(() => { load() }, [load])

  const act = async (entry: QueueEntry, action: 'start' | 'complete' | 'skip') => {
    setActingOn(entry.stage_progress_id)
    try {
      const res = await fetch(`/api/v1/jobs/${entry.job_id}/workflow`, {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ stage_progress_id: entry.stage_progress_id, action }),
      })
      const json = await res.json()
      if (!res.ok) throw new Error(json.error || 'Failed')
      toast.success(action === 'start' ? 'Stage started' : action === 'complete' ? 'Stage completed' : 'Stage skipped')
      if (Array.isArray(json.warnings)) json.warnings.forEach((w: string) => toast.warning(w))
      await load()
    } catch (e: any) {
      toast.error(e.message || 'Failed')
    } finally {
      setActingOn(null)
    }
  }

  const Section = ({ title, icon, entries, tone, renderAction }: {
    title: string; icon: React.ReactNode; entries: QueueEntry[]; tone: string
    renderAction: (e: QueueEntry) => React.ReactNode
  }) => (
    <div className="rounded-lg border border-[var(--color-border)] bg-[var(--color-bg-secondary)] overflow-hidden flex flex-col">
      <div className={cn('px-3 h-8 border-b border-[var(--color-border)] flex items-center gap-1.5', tone)}>
        {icon}
        <span className="text-[11px] font-semibold uppercase tracking-wider">{title}</span>
        <span className="text-[10px] opacity-70 tabular-nums ml-auto">{entries.length}</span>
      </div>
      {entries.length === 0 ? (
        <p className="px-3 py-4 text-xs text-[var(--color-text-muted)] text-center">Nothing here</p>
      ) : (
        <div className="divide-y divide-[var(--color-border-subtle)] max-h-96 md:max-h-72 overflow-y-auto">
          {entries.map(e => {
            const pcfg = JOB_PRIORITY_CONFIG[e.priority as keyof typeof JOB_PRIORITY_CONFIG]
            return (
              <div key={e.stage_progress_id} className="px-3 py-3 md:py-2">
                <div className="flex items-center gap-2">
                  <Link href={`/dashboard/jobs/${e.job_id}`} className="text-sm md:text-xs font-medium text-[var(--color-text-primary)] hover:text-[var(--color-accent)] truncate py-0.5 md:py-0">
                    {e.job_number} — {e.job_title}
                  </Link>
                  {pcfg && <span className={cn('text-[10px] font-medium flex-shrink-0', pcfg.color)}>{pcfg.label}</span>}
                </div>
                <div className="flex items-center gap-1.5 mt-0.5 text-[11px] text-[var(--color-text-muted)] flex-wrap">
                  <span>{e.stage_name}</span>
                  {departmentId === 'all' && e.department_name && <span>· {e.department_name}</span>}
                  {e.customer_name && <span>· {e.customer_name}</span>}
                  {e.started_at && <span>· {formatTimeAgo(e.started_at)}</span>}
                </div>
                {e.planned_date && (
                  <p className="text-[11px] text-[var(--color-accent)] mt-0.5 flex items-center gap-1">
                    <CalendarClock size={10} className="flex-shrink-0" /> {planLabel(e.planned_date)}
                  </p>
                )}
                {e.blocked_reason && (
                  <p className="text-[11px] text-[var(--color-danger)] mt-1 flex items-start gap-1">
                    <AlertTriangle size={10} className="mt-0.5 flex-shrink-0" /> {e.blocked_reason}
                  </p>
                )}
                <div className="mt-2 md:mt-1.5">{renderAction(e)}</div>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3">
        <select value={departmentId} onChange={e => setDepartmentId(e.target.value)}
          className="h-11 md:h-8 px-3 md:px-2.5 rounded-md border text-sm md:text-xs bg-[var(--color-bg-elevated)] text-[var(--color-text-primary)] border-[var(--color-border)] flex-1 md:flex-none min-w-0">
          <option value="all">All departments</option>
          {departments.map(d => <option key={d.id} value={d.id}>{d.name}</option>)}
        </select>
        <button onClick={load} disabled={loading}
          className="flex items-center gap-1.5 h-11 md:h-8 px-3 md:px-2.5 rounded-md border border-[var(--color-border)] text-xs text-[var(--color-text-secondary)] hover:bg-[var(--color-bg-elevated)] transition-colors disabled:opacity-50">
          <RefreshCw size={14} className={loading ? 'animate-spin' : ''} /> Refresh
        </button>
      </div>

      {!loading && ready.length === 0 && blocked.length === 0 && inProgress.length === 0 ? (
        <EmptyState
          title="Nothing in this queue"
          description={departmentId === 'all'
            ? 'No job is sitting at any workflow stage right now — either everything is finished, or jobs are being created without a workflow template.'
            : 'No job is at a stage this department owns. If that looks wrong, check Settings > Workflow Engine — a stage with no department assigned never shows up here.'}
        />
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-3 items-start">
          <Section
            title="In Progress" icon={<Clock size={13} />} entries={inProgress}
            tone="bg-[var(--color-info)]/10 text-[var(--color-info)]"
            renderAction={e => (
              <button onClick={() => act(e, 'complete')} disabled={actingOn === e.stage_progress_id}
                className="flex items-center justify-center gap-1.5 h-14 md:h-7 w-full md:w-auto px-4 md:px-2.5 rounded-lg md:rounded-md bg-[var(--color-success)] text-white text-sm md:text-[11px] font-semibold md:font-medium hover:opacity-90 disabled:opacity-50 transition-opacity">
                <CheckCircle2 size={16} className="md:hidden" /><CheckCircle2 size={11} className="hidden md:block" /> Complete
              </button>
            )}
          />
          <Section
            title="Ready to Start" icon={<Play size={13} />} entries={ready}
            tone="bg-[var(--color-success)]/10 text-[var(--color-success)]"
            renderAction={e => (
              <div className="flex items-center gap-2 md:gap-1.5">
                <button onClick={() => act(e, 'start')} disabled={actingOn === e.stage_progress_id}
                  className="flex items-center justify-center gap-1.5 h-14 md:h-7 flex-1 md:flex-none px-4 md:px-2.5 rounded-lg md:rounded-md bg-[var(--color-accent)] text-white text-sm md:text-[11px] font-semibold md:font-medium hover:bg-[var(--color-accent-hover)] disabled:opacity-50 transition-colors">
                  <Play size={16} className="md:hidden" /><Play size={11} className="hidden md:block" /> Start
                </button>
                <button onClick={() => act(e, 'skip')} disabled={actingOn === e.stage_progress_id}
                  title="Skip this stage" aria-label="Skip this stage"
                  className="flex items-center justify-center gap-1 h-14 w-14 md:h-7 md:w-auto md:px-2 rounded-lg md:rounded-md border border-[var(--color-border)] text-[var(--color-text-muted)] text-[11px] hover:bg-[var(--color-bg-elevated)] disabled:opacity-50 transition-colors flex-shrink-0">
                  <SkipForward size={16} className="md:hidden" /><SkipForward size={11} className="hidden md:block" />
                </button>
              </div>
            )}
          />
          <Section
            title="Blocked" icon={<AlertTriangle size={13} />} entries={blocked}
            tone="bg-[var(--color-danger)]/10 text-[var(--color-danger)]"
            renderAction={() => null}
          />
        </div>
      )}
    </div>
  )
}
