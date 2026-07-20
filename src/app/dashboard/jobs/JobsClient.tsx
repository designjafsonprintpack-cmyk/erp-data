'use client'
import { useState, useCallback } from 'react'
import Link from 'next/link'
import { Plus, Search, Briefcase, AlertTriangle, Clock, PauseCircle, RefreshCw, LayoutGrid, List } from 'lucide-react'
import { cn } from '@/lib/utils/cn'
import { toast } from '@/components/ui/Toast'
import { JOB_STATUS_CONFIG, JOB_PRIORITY_CONFIG, type JobStatus, type JobPriority } from '@/modules/jobs/types/job.types'
import { formatDate } from '@/lib/utils/format'
import JobsKanban from './JobsKanban'

interface Job {
  id: string; job_number: string; job_title: string; status: JobStatus
  priority: JobPriority; quantity: number; required_date: string | null
  order_date: string; is_on_hold: boolean; is_repeat: boolean; created_at: string
  customers?: { name: string; customer_code: string } | null
  workflow_templates?: { name: string } | null
}

const STATUS_TABS: { key: string; label: string }[] = [
  { key: '', label: 'All' },
  { key: 'new', label: 'New' },
  { key: 'in_progress', label: 'In Progress' },
  { key: 'on_hold', label: 'On Hold' },
  { key: 'completed', label: 'Completed' },
  { key: 'dispatched', label: 'Dispatched' },
]

function urgencyColor(required_date: string | null, status: JobStatus): string {
  if (!required_date || ['completed','dispatched','cancelled'].includes(status)) return ''
  const days = Math.ceil((new Date(required_date).getTime() - Date.now()) / 86400000)
  if (days < 0) return 'border-l-4 border-l-[var(--color-danger)]'
  if (days <= 2) return 'border-l-4 border-l-[var(--color-danger)]'
  if (days <= 5) return 'border-l-4 border-l-[var(--color-warning)]'
  return ''
}

function daysLabel(required_date: string | null, status: JobStatus): { text: string; cls: string } | null {
  if (!required_date || ['completed','dispatched','cancelled'].includes(status)) return null
  const days = Math.ceil((new Date(required_date).getTime() - Date.now()) / 86400000)
  if (days < 0) return { text: `${Math.abs(days)}d overdue`, cls: 'text-[var(--color-danger)]' }
  if (days === 0) return { text: 'Due today', cls: 'text-[var(--color-danger)]' }
  if (days <= 2) return { text: `${days}d left`, cls: 'text-[var(--color-warning)]' }
  return { text: `${days}d`, cls: 'text-[var(--color-text-muted)]' }
}

export default function JobsClient({ initialJobs, initialTotal }: { initialJobs: Job[]; initialTotal: number }) {
  const [jobs, setJobs] = useState(initialJobs)
  const [total, setTotal] = useState(initialTotal)
  const [search, setSearch] = useState('')
  const [activeStatus, setActiveStatus] = useState('')
  const [loading, setLoading] = useState(false)
  const [view, setView] = useState<'list' | 'kanban'>('list')

  const handleKanbanStatusChange = async (jobId: string, newStatus: JobStatus) => {
    const prevJobs = jobs
    setJobs(prev => prev.map(j => j.id === jobId ? { ...j, status: newStatus } : j))
    try {
      const res = await fetch(`/api/v1/jobs/${jobId}`, {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: newStatus }),
      })
      if (!res.ok) throw new Error()
      toast.success('Job status updated')
    } catch {
      setJobs(prevJobs) // revert on failure
      toast.error('Failed to update status')
    }
  }

  const fetchJobs = useCallback(async (q: string, status: string) => {
    setLoading(true)
    try {
      const params = new URLSearchParams({ limit: '50' })
      if (q) params.set('search', q)
      if (status) params.set('status', status)
      const res = await fetch(`/api/v1/jobs?${params}`)
      const json = await res.json()
      setJobs(json.data ?? [])
      setTotal(json.total ?? 0)
    } catch { toast.error('Failed to load jobs') }
    finally { setLoading(false) }
  }, [])

  const handleSearch = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = e.target.value
    setSearch(val)
    setTimeout(() => fetchJobs(val, activeStatus), 350)
  }

  const handleStatusTab = (status: string) => {
    setActiveStatus(status)
    fetchJobs(search, status)
  }

  return (
    <div className="space-y-4">
      {/* Toolbar */}
      <div className="flex items-center gap-3 flex-wrap">
        <div className="relative flex-1 min-w-48 max-w-md">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-[var(--color-text-muted)]" />
          <input value={search} onChange={handleSearch} placeholder="Search by job number, title…"
            className="w-full h-9 pl-9 pr-3 rounded-md border border-[var(--color-border)] bg-[var(--color-bg-elevated)] text-sm text-[var(--color-text-primary)] placeholder:text-[var(--color-text-muted)] focus:outline-none focus:border-[var(--color-accent)] focus:ring-1 focus:ring-[var(--color-accent)] transition-colors" />
        </div>
        <Link href="/dashboard/jobs/new"
          className="flex items-center gap-1.5 px-4 h-9 rounded-md bg-[var(--color-accent)] text-white text-sm font-medium hover:bg-[var(--color-accent-hover)] transition-colors flex-shrink-0">
          <Plus size={15} /> New Job
        </Link>
      </div>

      {/* Status tabs */}
      <div className="flex items-center gap-1 flex-wrap">
        {STATUS_TABS.map(tab => (
          <button key={tab.key} onClick={() => handleStatusTab(tab.key)}
            className={cn('px-3 h-7 rounded-md text-xs font-medium transition-all border',
              activeStatus === tab.key
                ? 'bg-[var(--color-accent)] text-white border-transparent'
                : 'bg-[var(--color-bg-secondary)] text-[var(--color-text-secondary)] border-[var(--color-border)] hover:text-[var(--color-text-primary)]')}>
            {tab.label}
          </button>
        ))}
        {total > 0 && <span className="text-xs text-[var(--color-text-muted)] ml-2">{total} jobs</span>}
        <div className="flex items-center gap-1 ml-auto bg-[var(--color-bg-secondary)] border border-[var(--color-border)] rounded-lg p-0.5">
          <button onClick={() => setView('list')} title="List view"
            className={cn('w-7 h-6 flex items-center justify-center rounded-md transition-colors', view === 'list' ? 'bg-[var(--color-accent)] text-white' : 'text-[var(--color-text-muted)] hover:text-[var(--color-text-primary)]')}>
            <List size={13} />
          </button>
          <button onClick={() => setView('kanban')} title="Kanban view"
            className={cn('w-7 h-6 flex items-center justify-center rounded-md transition-colors', view === 'kanban' ? 'bg-[var(--color-accent)] text-white' : 'text-[var(--color-text-muted)] hover:text-[var(--color-text-primary)]')}>
            <LayoutGrid size={13} />
          </button>
        </div>
      </div>

      {view === 'kanban' ? (
        <JobsKanban jobs={jobs} onStatusChange={handleKanbanStatusChange} />
      ) : (
      <div className="rounded-xl border border-[var(--color-border)] bg-[var(--color-bg-secondary)] overflow-hidden">
        {/* Column headers */}
        <div className="grid grid-cols-12 gap-3 px-5 py-2.5 bg-[var(--color-bg-elevated)] border-b border-[var(--color-border)] text-xs font-semibold text-[var(--color-text-muted)] uppercase tracking-wider">
          <div className="col-span-1">Job #</div>
          <div className="col-span-3">Title / Customer</div>
          <div className="col-span-2">Status</div>
          <div className="col-span-1">Priority</div>
          <div className="col-span-1">Qty</div>
          <div className="col-span-2">Workflow</div>
          <div className="col-span-1">Due Date</div>
          <div className="col-span-1 text-right">Days</div>
        </div>

        <div className={cn('divide-y divide-[var(--color-border-subtle)]', loading && 'opacity-60')}>
          {jobs.map((job, idx) => {
            const statusCfg = JOB_STATUS_CONFIG[job.status] || JOB_STATUS_CONFIG.new
            const priorityCfg = JOB_PRIORITY_CONFIG[job.priority] || JOB_PRIORITY_CONFIG.normal
            const urgency = urgencyColor(job.required_date, job.status)
            const days = daysLabel(job.required_date, job.status)

            return (
              <Link key={job.id} href={`/dashboard/jobs/${job.id}`}
                className={cn('grid grid-cols-12 gap-3 px-5 py-3.5 items-center hover:bg-[var(--color-bg-elevated)]/50 transition-colors group',
                  idx % 2 === 1 && 'bg-[var(--color-bg-elevated)]/15', urgency)}>
                {/* Job # */}
                <div className="col-span-1">
                  <div className="flex items-center gap-1.5">
                    <span className="text-xs font-mono font-semibold text-[var(--color-accent)] group-hover:underline">{job.job_number}</span>
                    {job.is_repeat && <RefreshCw size={10} className="text-[var(--color-text-muted)]" />}
                  </div>
                </div>
                {/* Title / Customer */}
                <div className="col-span-3 min-w-0">
                  <p className="text-sm font-medium text-[var(--color-text-primary)] truncate">{job.job_title}</p>
                  <p className="text-xs text-[var(--color-text-muted)] truncate">{job.customers?.name || '—'}</p>
                </div>
                {/* Status */}
                <div className="col-span-2">
                  <span className={cn('inline-flex items-center gap-1.5 text-xs px-2 py-0.5 rounded-full border font-medium', statusCfg.color)}>
                    <span className={cn('w-1.5 h-1.5 rounded-full flex-shrink-0', statusCfg.dot)} />
                    {statusCfg.label}
                    {job.is_on_hold && <PauseCircle size={10} />}
                  </span>
                </div>
                {/* Priority */}
                <div className="col-span-1">
                  <span className={cn('text-xs font-medium', priorityCfg.color)}>{priorityCfg.label}</span>
                </div>
                {/* Qty */}
                <div className="col-span-1">
                  <span className="text-sm text-[var(--color-text-secondary)]">{job.quantity.toLocaleString()}</span>
                </div>
                {/* Workflow */}
                <div className="col-span-2">
                  <span className="text-xs text-[var(--color-text-muted)] truncate">{job.workflow_templates?.name || '—'}</span>
                </div>
                {/* Due date */}
                <div className="col-span-1">
                  <span className="text-xs text-[var(--color-text-secondary)]">
                    {job.required_date ? formatDate(job.required_date, { day: 'numeric', month: 'short' }) : '—'}
                  </span>
                </div>
                {/* Days remaining */}
                <div className="col-span-1 text-right">
                  {days && (
                    <span className={cn('text-xs font-medium', days.cls)}>{days.text}</span>
                  )}
                </div>
              </Link>
            )
          })}
        </div>

        {jobs.length === 0 && !loading && (
          <div className="flex flex-col items-center py-16">
            <Briefcase size={32} className="text-[var(--color-text-muted)] opacity-30 mb-3" />
            <p className="text-sm font-medium text-[var(--color-text-primary)] mb-1">
              {search || activeStatus ? 'No jobs found' : 'No jobs yet'}
            </p>
            <p className="text-xs text-[var(--color-text-muted)]">
              {search || activeStatus ? 'Try a different filter' : 'Create your first job to get started'}
            </p>
          </div>
        )}
      </div>
      )}

      {view === 'list' && total > 25 && (
        <p className="text-xs text-[var(--color-text-muted)] text-center">Showing {jobs.length} of {total} jobs</p>
      )}
    </div>
  )
}
