'use client'
import { Play, CheckCircle2, SkipForward, AlertTriangle, Clock, CalendarClock } from 'lucide-react'
import Link from 'next/link'
import { cn } from '@/lib/utils/cn'
import { EmptyState } from '@/components/ui/EmptyState'
import { formatTimeAgo, planLabel } from '@/lib/utils/format'
import { JOB_PRIORITY_CONFIG } from '@/modules/jobs/types/job.types'
import type { QueueEntry, QueueAction } from './useStageQueue'

interface Props {
  ready: QueueEntry[]
  blocked: QueueEntry[]
  inProgress: QueueEntry[]
  loading: boolean
  actingOn: string | null
  onAct: (entry: QueueEntry, action: QueueAction) => void
  /** Show which department owns each stage — only useful in a mixed list. */
  showDepartment?: boolean
  /** Show the stage name on each card — noise on a single-stage page. */
  showStageName?: boolean
  emptyTitle: string
  emptyDescription: string
}

/**
 * In Progress | Ready to Start | Blocked — the three-column work board shared
 * by the Department Queue and every per-stage production page, so a job card
 * looks and behaves the same wherever the shop sees it.
 *
 * Operator-sized touch targets on mobile (h-14) collapsing to desktop h-7,
 * per the control-height convention.
 */
export function QueueBoard({
  ready, blocked, inProgress, loading, actingOn, onAct,
  showDepartment = false, showStageName = true, emptyTitle, emptyDescription,
}: Props) {
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
                  {showStageName && <span>{e.stage_name}</span>}
                  {showDepartment && e.department_name && <span>· {e.department_name}</span>}
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

  if (!loading && ready.length === 0 && blocked.length === 0 && inProgress.length === 0) {
    return <EmptyState title={emptyTitle} description={emptyDescription} />
  }

  return (
    <div className="grid grid-cols-1 lg:grid-cols-3 gap-3 items-start">
      <Section
        title="In Progress" icon={<Clock size={13} />} entries={inProgress}
        tone="bg-[var(--color-info)]/10 text-[var(--color-info)]"
        renderAction={e => (
          <button onClick={() => onAct(e, 'complete')} disabled={actingOn === e.stage_progress_id}
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
            <button onClick={() => onAct(e, 'start')} disabled={actingOn === e.stage_progress_id}
              className="flex items-center justify-center gap-1.5 h-14 md:h-7 flex-1 md:flex-none px-4 md:px-2.5 rounded-lg md:rounded-md bg-[var(--color-accent)] text-white text-sm md:text-[11px] font-semibold md:font-medium hover:bg-[var(--color-accent-hover)] disabled:opacity-50 transition-colors">
              <Play size={16} className="md:hidden" /><Play size={11} className="hidden md:block" /> Start
            </button>
            {/* Only optional stages can be skipped — matches the Job Detail
                workflow panel, which has always gated Skip this way. */}
            {e.is_optional && (
              <button onClick={() => onAct(e, 'skip')} disabled={actingOn === e.stage_progress_id}
                title="Skip this stage" aria-label="Skip this stage"
                className="flex items-center justify-center gap-1 h-14 w-14 md:h-7 md:w-auto md:px-2 rounded-lg md:rounded-md border border-[var(--color-border)] text-[var(--color-text-muted)] text-[11px] hover:bg-[var(--color-bg-elevated)] disabled:opacity-50 transition-colors flex-shrink-0">
                <SkipForward size={16} className="md:hidden" /><SkipForward size={11} className="hidden md:block" />
              </button>
            )}
          </div>
        )}
      />
      <Section
        title="Blocked" icon={<AlertTriangle size={13} />} entries={blocked}
        tone="bg-[var(--color-danger)]/10 text-[var(--color-danger)]"
        renderAction={() => null}
      />
    </div>
  )
}

export default QueueBoard
