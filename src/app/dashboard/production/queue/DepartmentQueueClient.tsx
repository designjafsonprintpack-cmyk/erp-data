'use client'
import { useState, useEffect, useCallback } from 'react'
import { Play, CheckCircle2, SkipForward, AlertTriangle, Clock, RefreshCw } from 'lucide-react'
import { cn } from '@/lib/utils/cn'
import { toast } from '@/components/ui/Toast'
import { EmptyState } from '@/components/ui/EmptyState'
import { formatTimeAgo } from '@/lib/utils/format'
import { JOB_PRIORITY_CONFIG } from '@/modules/jobs/types/job.types'
import Link from 'next/link'

interface QueueEntry {
  stage_progress_id: string; job_id: string; job_number: string; job_title: string
  customer_name: string | null; priority: string; required_date: string | null
  stage_name: string; started_at: string | null; blocked_reason?: string
}
interface Department { id: string; name: string; code: string }

export default function DepartmentQueueClient({ departments, initialDepartmentId }: { departments: Department[]; initialDepartmentId: string }) {
  const [departmentId, setDepartmentId] = useState(initialDepartmentId || departments[0]?.id || '')
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
        <div className="divide-y divide-[var(--color-border-subtle)] max-h-72 overflow-y-auto">
          {entries.map(e => {
            const pcfg = JOB_PRIORITY_CONFIG[e.priority as keyof typeof JOB_PRIORITY_CONFIG]
            return (
              <div key={e.stage_progress_id} className="px-3 py-2">
                <div className="flex items-center gap-2">
                  <Link href={`/dashboard/jobs/${e.job_id}`} className="text-xs font-medium text-[var(--color-text-primary)] hover:text-[var(--color-accent)] truncate">
                    {e.job_number} — {e.job_title}
                  </Link>
                  {pcfg && <span className={cn('text-[10px] font-medium flex-shrink-0', pcfg.color)}>{pcfg.label}</span>}
                </div>
                <div className="flex items-center gap-1.5 mt-0.5 text-[11px] text-[var(--color-text-muted)]">
                  <span>{e.stage_name}</span>
                  {e.customer_name && <span>· {e.customer_name}</span>}
                  {e.started_at && <span>· {formatTimeAgo(e.started_at)}</span>}
                </div>
                {e.blocked_reason && (
                  <p className="text-[11px] text-[var(--color-danger)] mt-1 flex items-start gap-1">
                    <AlertTriangle size={10} className="mt-0.5 flex-shrink-0" /> {e.blocked_reason}
                  </p>
                )}
                <div className="mt-1.5">{renderAction(e)}</div>
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
          className="h-8 px-2.5 rounded-md border text-xs bg-[var(--color-bg-elevated)] text-[var(--color-text-primary)] border-[var(--color-border)]">
          <option value="">Select a department…</option>
          {departments.map(d => <option key={d.id} value={d.id}>{d.name}</option>)}
        </select>
        <button onClick={load} disabled={loading}
          className="flex items-center gap-1.5 h-8 px-2.5 rounded-md border border-[var(--color-border)] text-xs text-[var(--color-text-secondary)] hover:bg-[var(--color-bg-elevated)] transition-colors disabled:opacity-50">
          <RefreshCw size={14} className={loading ? 'animate-spin' : ''} /> Refresh
        </button>
      </div>

      {!departmentId ? (
        <EmptyState title="No department selected" description="Pick a department above, or ask an admin to assign one to your user in Settings > Users" />
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-3 items-start">
          <Section
            title="In Progress" icon={<Clock size={13} />} entries={inProgress}
            tone="bg-[var(--color-info)]/10 text-[var(--color-info)]"
            renderAction={e => (
              <button onClick={() => act(e, 'complete')} disabled={actingOn === e.stage_progress_id}
                className="flex items-center gap-1 h-7 px-2.5 rounded-md bg-[var(--color-success)] text-white text-[11px] font-medium hover:opacity-90 disabled:opacity-50 transition-opacity">
                <CheckCircle2 size={11} /> Complete
              </button>
            )}
          />
          <Section
            title="Ready to Start" icon={<Play size={13} />} entries={ready}
            tone="bg-[var(--color-success)]/10 text-[var(--color-success)]"
            renderAction={e => (
              <div className="flex items-center gap-1.5">
                <button onClick={() => act(e, 'start')} disabled={actingOn === e.stage_progress_id}
                  className="flex items-center gap-1 h-7 px-2.5 rounded-md bg-[var(--color-accent)] text-white text-[11px] font-medium hover:bg-[var(--color-accent-hover)] disabled:opacity-50 transition-colors">
                  <Play size={11} /> Start
                </button>
                <button onClick={() => act(e, 'skip')} disabled={actingOn === e.stage_progress_id}
                  title="Skip this stage"
                  className="flex items-center gap-1 h-7 px-2 rounded-md border border-[var(--color-border)] text-[var(--color-text-muted)] text-[11px] hover:bg-[var(--color-bg-elevated)] disabled:opacity-50 transition-colors">
                  <SkipForward size={11} />
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
