'use client'
import { useState } from 'react'
import Link from 'next/link'
import { RefreshCw, PauseCircle, GripVertical } from 'lucide-react'
import { cn } from '@/lib/utils/cn'
import { JOB_STATUS_CONFIG, JOB_PRIORITY_CONFIG, type JobStatus, type JobPriority } from '@/modules/jobs/types/job.types'
import { formatDate } from '@/lib/utils/format'
import { JobThumbStrip, type JobThumbData } from '@/components/artwork/ArtworkThumb'
import { formatJobSizeLine } from '@/lib/utils/formatJobSize'

interface Job {
  id: string; job_number: string; job_title: string; status: JobStatus
  priority: JobPriority; quantity: number; required_date: string | null
  size_l?: number | null; size_w?: number | null; size_h?: number | null
  sheet_width_in?: number | null; sheet_height_in?: number | null
  order_date: string; is_on_hold: boolean; is_repeat: boolean; created_at: string
  customers?: { name: string; customer_code: string } | null
  workflow_templates?: { name: string } | null
}

const KANBAN_COLUMNS: { key: JobStatus; label: string }[] = [
  { key: 'new', label: 'New' },
  { key: 'in_progress', label: 'In Progress' },
  { key: 'on_hold', label: 'On Hold' },
  { key: 'completed', label: 'Completed' },
  { key: 'dispatched', label: 'Dispatched' },
]

function daysLabel(required_date: string | null, status: JobStatus): { text: string; cls: string } | null {
  if (!required_date || ['completed', 'dispatched', 'cancelled'].includes(status)) return null
  const days = Math.ceil((new Date(required_date).getTime() - Date.now()) / 86400000)
  if (days < 0) return { text: `${Math.abs(days)}d overdue`, cls: 'text-[var(--color-danger)]' }
  if (days === 0) return { text: 'Due today', cls: 'text-[var(--color-danger)]' }
  if (days <= 2) return { text: `${days}d left`, cls: 'text-[var(--color-warning)]' }
  return { text: `${days}d`, cls: 'text-[var(--color-text-muted)]' }
}

export function JobsKanban({ jobs, onStatusChange, thumbnails }: { jobs: Job[]; onStatusChange: (jobId: string, newStatus: JobStatus) => void; thumbnails: Record<string, JobThumbData[]> }) {
  const [draggingId, setDraggingId] = useState<string | null>(null)
  const [dragOverCol, setDragOverCol] = useState<JobStatus | null>(null)

  const handleDrop = (status: JobStatus) => {
    if (draggingId) {
      const job = jobs.find(j => j.id === draggingId)
      if (job && job.status !== status) onStatusChange(draggingId, status)
    }
    setDraggingId(null)
    setDragOverCol(null)
  }

  return (
    <div className="flex gap-3 overflow-x-auto pb-2">
      {KANBAN_COLUMNS.map(col => {
        const colJobs = jobs.filter(j => j.status === col.key)
        const statusCfg = JOB_STATUS_CONFIG[col.key]

        return (
          <div
            key={col.key}
            onDragOver={(e) => { e.preventDefault(); setDragOverCol(col.key) }}
            onDragLeave={() => setDragOverCol(prev => (prev === col.key ? null : prev))}
            onDrop={(e) => { e.preventDefault(); handleDrop(col.key) }}
            className={cn(
              'flex-shrink-0 w-72 rounded-xl border bg-[var(--color-bg-secondary)] transition-colors',
              dragOverCol === col.key ? 'border-[var(--color-accent)]' : 'border-[var(--color-border)]'
            )}
          >
            <div className="flex items-center justify-between px-3.5 py-2.5 border-b border-[var(--color-border)]">
              <div className="flex items-center gap-2">
                <span className={cn('w-1.5 h-1.5 rounded-full flex-shrink-0', statusCfg.dot)} />
                <span className="text-xs font-semibold text-[var(--color-text-primary)] uppercase tracking-wider">{col.label}</span>
              </div>
              <span className="text-xs text-[var(--color-text-muted)]">{colJobs.length}</span>
            </div>

            <div className="p-2 space-y-2 min-h-24 max-h-[70dvh] overflow-y-auto">
              {colJobs.map(job => {
                const priorityCfg = JOB_PRIORITY_CONFIG[job.priority] || JOB_PRIORITY_CONFIG.normal
                const days = daysLabel(job.required_date, job.status)

                return (
                  <div
                    key={job.id}
                    draggable
                    onDragStart={() => setDraggingId(job.id)}
                    onDragEnd={() => { setDraggingId(null); setDragOverCol(null) }}
                    className={cn(
                      'rounded-lg border border-[var(--color-border)] bg-[var(--color-bg-elevated)] p-3 cursor-grab active:cursor-grabbing transition-opacity',
                      draggingId === job.id && 'opacity-40'
                    )}
                  >
                    <div className="flex items-start justify-between gap-1.5 mb-1.5">
                      <Link href={`/dashboard/jobs/${job.id}`} className="text-xs font-mono font-semibold text-[var(--color-accent)] hover:underline">
                        {job.job_number}
                      </Link>
                      <div className="flex items-center gap-1 flex-shrink-0">
                        {job.is_repeat && <RefreshCw size={10} className="text-[var(--color-text-muted)]" />}
                        {job.is_on_hold && <PauseCircle size={10} className="text-[var(--color-danger)]" />}
                        <GripVertical size={12} className="text-[var(--color-text-muted)]" />
                      </div>
                    </div>

                    <Link href={`/dashboard/jobs/${job.id}`} className="flex items-center gap-2 mb-2">
                      <JobThumbStrip
                        size="sm"
                        designs={thumbnails[job.id]}
                        fallbackName={job.job_title}
                      />
                      <span className="min-w-0">
                        <p className="text-sm font-medium text-[var(--color-text-primary)] truncate">{job.job_title}</p>
                        <p className="text-xs text-[var(--color-text-muted)] truncate">{job.customers?.name || '—'}</p>
                        {/* Kanban is the same Jobs page under a different view;
                            switching to it should not lose the size. */}
                        {formatJobSizeLine(job) && (
                          <p className="text-xs text-[var(--color-text-secondary)] truncate">{formatJobSizeLine(job)}</p>
                        )}
                      </span>
                    </Link>

                    <div className="flex items-center justify-between">
                      <span className={cn('text-xs font-medium', priorityCfg.color)}>{priorityCfg.label}</span>
                      <span className="text-xs text-[var(--color-text-secondary)]">{job.quantity.toLocaleString()}</span>
                    </div>

                    <div className="flex items-center justify-between mt-1.5 pt-1.5 border-t border-[var(--color-border-subtle)]">
                      <span className="text-xs text-[var(--color-text-muted)]">
                        {job.required_date ? formatDate(job.required_date, { day: 'numeric', month: 'short' }) : '—'}
                      </span>
                      {days && <span className={cn('text-xs font-medium', days.cls)}>{days.text}</span>}
                    </div>
                  </div>
                )
              })}

              {colJobs.length === 0 && (
                <div className="flex items-center justify-center py-8">
                  <p className="text-xs text-[var(--color-text-muted)]">No jobs</p>
                </div>
              )}
            </div>
          </div>
        )
      })}
    </div>
  )
}

export default JobsKanban
