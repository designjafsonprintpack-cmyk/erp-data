'use client'
import { RefreshCw, Activity } from 'lucide-react'
import Link from 'next/link'
import { useStageQueue } from './useStageQueue'
import { QueueBoard } from './QueueBoard'

/**
 * One shop-floor stage's work list — what the Printing / Lamination /
 * Die Cutting / Hot Foil / Folder Gluing / Packing pages render.
 *
 * Every job that has reached this stage shows up on its own, with its planned
 * date, and Start / Complete right on the card. Nothing has to be "added" here
 * first; the queue is derived from the job's workflow.
 *
 * The machine-centric Floor view still exists for assigning work to a specific
 * press and watching it run — linked from the header rather than replaced.
 */
export function StageQueueClient({ stageSlug, stageLabel }: { stageSlug: string; stageLabel: string }) {
  const { ready, blocked, inProgress, loading, actingOn, reload, act } =
    useStageQueue(`/api/v1/production/stage-queue?stage=${stageSlug}`)

  const total = ready.length + blocked.length + inProgress.length

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2">
        <span className="text-xs text-[var(--color-text-muted)] tabular-nums">
          {loading ? 'Loading…' : `${total} job${total === 1 ? '' : 's'} at this stage`}
        </span>
        <div className="ml-auto flex items-center gap-2">
          <Link href={`/dashboard/production/floor?stage=${stageSlug}`}
            className="flex items-center gap-1.5 h-11 md:h-8 px-3 md:px-2.5 rounded-md border border-[var(--color-border)] text-xs text-[var(--color-text-secondary)] hover:bg-[var(--color-bg-elevated)] transition-colors">
            <Activity size={14} /> Floor View
          </Link>
          <button onClick={reload} disabled={loading}
            className="flex items-center gap-1.5 h-11 md:h-8 px-3 md:px-2.5 rounded-md border border-[var(--color-border)] text-xs text-[var(--color-text-secondary)] hover:bg-[var(--color-bg-elevated)] transition-colors disabled:opacity-50">
            <RefreshCw size={14} className={loading ? 'animate-spin' : ''} /> Refresh
          </button>
        </div>
      </div>

      <QueueBoard
        ready={ready} blocked={blocked} inProgress={inProgress}
        loading={loading} actingOn={actingOn} onAct={act}
        showStageName={false}
        emptyTitle={`No job at ${stageLabel} right now`}
        emptyDescription={`Jobs appear here on their own once their workflow reaches ${stageLabel} — nothing needs to be added. If a job should be here but isn't, open it and check which stage it is standing on.`}
      />
    </div>
  )
}

export default StageQueueClient
