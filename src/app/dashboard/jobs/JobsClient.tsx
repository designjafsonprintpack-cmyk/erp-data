'use client'
import { useState, useCallback, useEffect, useRef } from 'react'
import Link from 'next/link'
import { Plus, Briefcase, PauseCircle, RefreshCw, LayoutGrid, List, Download, Rows3, Rows2 } from 'lucide-react'
import { cn } from '@/lib/utils/cn'
import { toast } from '@/components/ui/Toast'
import { JOB_STATUS_CONFIG, JOB_PRIORITY_CONFIG, jobStatusChip, type JobStatus, type JobPriority } from '@/modules/jobs/types/job.types'
import { formatDate } from '@/lib/utils/format'
import JobsKanban from './JobsKanban'
import { exportToExcel } from '@/lib/utils/exportToExcel'
import { DataList, type DataListColumn } from '@/components/ui/DataList'
import { Toolbar } from '@/components/ui/Toolbar'
import { TabStrip } from '@/components/ui/TabStrip'
import { JobThumbStrip, useJobThumbnails, type JobThumbData } from '@/components/artwork/ArtworkThumb'
import { Pagination } from '@/components/ui/Pagination'
import { useListPageSize } from '@/lib/hooks/usePageSize'
import { formatBoxSize, formatSheetSize } from '@/lib/utils/formatJobSize'

// Rows per page is the shared preference now (10/20/30/40/50, picked from the
// pager itself) rather than a constant living here. page.tsx renders its first
// page at LIST_PAGE_SIZE, the default — a browser set to anything else refetches
// once on hydration, which is what useListPageSize + the effect below handle.

/**
 * Row height on the Jobs list. The artwork thumbnail is worth its space when
 * you are looking for a job by its picture and pure cost when you are scrolling
 * past a hundred of them — so it is a choice, not a verdict.
 *
 *   compact      40x52 thumb, py-2   → ~68px per row
 *   comfortable  60x77 thumb, py-3.5 → ~105px per row (the original)
 *
 * Compact is the default because the list is now 100 rows deep. Persisted, like
 * the Artwork page's list/grid toggle — a working preference, not a per-visit one.
 */
type Density = 'compact' | 'comfortable'
const JOBS_DENSITY_KEY = 'jafson.jobs.density'

interface Job {
  id: string; job_number: string; job_title: string; status: JobStatus
  priority: JobPriority; quantity: number; required_date: string | null
  /** Box and sheet dimensions — shown as their own column since Mehboob asked
   *  for "LxWxH aur sheet size WxH" on the list. Nullable: 70 of 479 live jobs
   *  carry no size at all. */
  size_l?: number | null; size_w?: number | null; size_h?: number | null
  sheet_width_in?: number | null; sheet_height_in?: number | null
  order_date: string; is_on_hold: boolean; is_repeat: boolean; created_at: string
  repeat_kind: string | null; job_kind: string | null
  current_stage_id?: string | null
  /** Live workflow stage name, resolved server-side from current_stage_id. */
  current_stage_name?: string | null
  customers?: { name: string; customer_code: string } | null
  workflow_templates?: { name: string } | null
}

/**
 * Mehboob asked for **New** to be the tab you land on, not All.
 *
 * All still exists and still sits first — it is the widest view and belongs at
 * the left. Only the DEFAULT moved: the 478 completed legacy jobs dominate All,
 * so opening Jobs used to mean scrolling past last year's work to find this
 * week's. page.tsx renders its first page already filtered to `new` so the
 * default costs no extra request.
 */
const DEFAULT_STATUS_TAB = 'new'

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


/**
 * A factory (not a constant) so the thumbnail column can close over the
 * per-job lookup — same shape as USER_COLUMNS in UsersClient.tsx.
 *
 * SPAN BUDGET: these spans total 12, and DataList prepends a span-1 selection
 * column (this is the only list in the app that passes `selection`), so the row
 * needs 13 track units. DataList widens the grid to match rather than have the
 * last column wrap — so columns here are free to keep their declared widths,
 * but the total is 13 with selection, not 12. Don't "correct" it back to 12 by
 * shrinking a column: status and stage both clip badly at span 1.
 */
const jobColumns = (thumbs: Record<string, JobThumbData[]>, density: Density): DataListColumn<Job>[] => [
  {
    key: 'job_number', header: 'Job #', span: 1, role: 'identity',
    render: j => (
      <span className="inline-flex items-center gap-1.5">
        <span className="text-xs font-mono font-semibold text-[var(--color-accent)]">{j.job_number}</span>
        {/* Badla hua repeat amber mein: us par purani plates dobara lag sakti
            hain jo nayi artwork se mel na khayen. */}
        {j.is_repeat && (
          <RefreshCw size={10}
            className={cn('flex-shrink-0', j.repeat_kind === 'changed'
              ? 'text-[var(--color-warning)]' : 'text-[var(--color-text-muted)]')} />
        )}
      </span>
    ),
  },
  {
    // Widened 2 -> 3; the thumbnail needs the room.
    key: 'title', header: 'Title / Customer', span: 3, role: 'title',
    render: j => {
      return (
        <span className="flex items-center gap-2.5 min-w-0">
          {/* max={1}: this tile shares a 3-of-12 column with the title and the
              customer name, so a second 60px tile would squeeze the title to
              nothing. A job with two designs gets a "+1" chip instead — the
              second design is never silently dropped, just not drawn here. */}
          <JobThumbStrip
            designs={thumbs[j.id]}
            size={density === 'compact' ? 'xs' : 'sm'}
            max={1}
            fallbackName={j.job_title}
          />
          <span className="block min-w-0">
            <span className="block text-sm font-medium text-[var(--color-text-primary)] truncate">{j.job_title}</span>
            <span className="block text-xs text-[var(--color-text-muted)] truncate">{j.customers?.name || '—'}</span>
          </span>
        </span>
      )
    },
  },
  {
    key: 'status', header: 'Status', span: 2, role: 'status',
    render: j => {
      const cfg = jobStatusChip(j)
      return (
        <span className={cn('inline-flex items-center gap-1.5 text-xs px-2 py-0.5 rounded-full border font-medium', cfg.color)}>
          <span className={cn('w-1.5 h-1.5 rounded-full flex-shrink-0', cfg.dot)} />
          {cfg.label}
          {j.is_on_hold && <PauseCircle size={10} />}
        </span>
      )
    },
  },
  {
    key: 'priority', header: 'Priority', span: 1, role: 'meta', label: 'Priority',
    render: j => {
      const cfg = JOB_PRIORITY_CONFIG[j.priority] || JOB_PRIORITY_CONFIG.normal
      return <span className={cn('text-xs font-medium', cfg.color)}>{cfg.label}</span>
    },
  },
  {
    key: 'qty', header: 'Qty', span: 1, role: 'meta', label: 'Qty',
    render: j => <span className="text-sm text-[var(--color-text-secondary)]">{j.quantity.toLocaleString()}</span>,
  },
  {
    // Box size over sheet size, stacked in one column rather than two.
    // The row already carries 8 columns plus selection; two more would push
    // every text column to a truncating width. Stacking mirrors
    // "Title / Customer" right above it.
    key: 'size', header: 'Size / Sheet', span: 2, role: 'meta', label: 'Size',
    render: j => {
      const box = formatBoxSize(j)
      const sheet = formatSheetSize(j)
      if (!box && !sheet) return <span className="text-xs text-[var(--color-text-muted)]">—</span>
      return (
        <span className="block leading-tight">
          <span className="block text-xs text-[var(--color-text-secondary)] whitespace-nowrap">{box ?? '—'}</span>
          {sheet && (
            <span className="block text-[10px] text-[var(--color-text-muted)] whitespace-nowrap">Sheet {sheet}</span>
          )}
        </span>
      )
    },
  },
  {
    // Was the workflow TEMPLATE name — the same value on nearly every row and
    // no help in knowing what a job is waiting on. The live stage is the thing
    // people actually walk over to ask about; the template name is still on
    // the job's own page (and kept here as the cell's tooltip).
    key: 'stage', header: 'Stage', span: 2, role: 'meta', label: 'Stage',
    render: j => {
      const done = ['completed', 'dispatched'].includes(j.status)
      return (
        <span
          title={j.workflow_templates?.name ? `Workflow: ${j.workflow_templates.name}` : undefined}
          className={cn('text-xs truncate',
            done ? 'text-[var(--color-success)]'
              : j.current_stage_name ? 'text-[var(--color-text-secondary)]'
              : 'text-[var(--color-text-muted)]')}
        >
          {done ? 'Done' : j.current_stage_name || '—'}
        </span>
      )
    },
  },
  {
    key: 'due', header: 'Due Date', span: 1, role: 'meta', label: 'Due',
    render: j => (
      <span className="text-xs text-[var(--color-text-secondary)]">
        {j.required_date ? formatDate(j.required_date, { day: 'numeric', month: 'short' }) : '—'}
      </span>
    ),
  },
  {
    key: 'days', header: 'Days', span: 1, role: 'meta', label: 'Time left', align: 'right',
    render: j => {
      const d = daysLabel(j.required_date, j.status)
      return d ? <span className={cn('text-xs font-medium', d.cls)}>{d.text}</span> : <span className="text-xs text-[var(--color-text-muted)]">—</span>
    },
  },
]

export default function JobsClient({ initialJobs, initialTotal }: { initialJobs: Job[]; initialTotal: number }) {
  const [jobs, setJobs] = useState(initialJobs)
  const thumbs = useJobThumbnails(jobs.map(j => j.id))
  const [total, setTotal] = useState(initialTotal)
  const [page, setPage] = useState(1)
  const [search, setSearch] = useState('')
  const [activeStatus, setActiveStatus] = useState(DEFAULT_STATUS_TAB)
  const [loading, setLoading] = useState(false)
  const pageSize = useListPageSize()
  const [view, setView] = useState<'list' | 'kanban'>('list')
  const [density, setDensity] = useState<Density>('compact')
  useEffect(() => {
    const saved = localStorage.getItem(JOBS_DENSITY_KEY)
    if (saved === 'compact' || saved === 'comfortable') setDensity(saved)
  }, [])
  const changeDensity = (d: Density) => {
    setDensity(d)
    localStorage.setItem(JOBS_DENSITY_KEY, d)
  }
  // Bulk selection — currently used for exporting a chosen subset. No bulk
  // status mutation on Jobs on purpose: status moves through the stage
  // engine, and a blind bulk status write would bypass its gating.
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const toggleSelect = (id: string) => setSelected(p => { const n = new Set(p); n.has(id) ? n.delete(id) : n.add(id); return n })
  const allSelected = jobs.length > 0 && jobs.every(j => selected.has(j.id))
  const toggleSelectAll = () => setSelected(allSelected ? new Set() : new Set(jobs.map(j => j.id)))

  const exportJobs = (rows: typeof jobs) => {
    if (!rows.length) { toast.error('Nothing to export'); return }
    exportToExcel(rows.map(j => ({
      'Job #': j.job_number,
      'Title': j.job_title,
      'Customer': j.customers?.name ?? '',
      'Size (L x W x H)': formatBoxSize(j) ?? '',
      'Sheet (W x H)': formatSheetSize(j) ?? '',
      'Status': j.status,
      'Priority': j.priority,
      'Quantity': j.quantity,
      'Workflow': j.workflow_templates?.name ?? '',
      'Order Date': j.order_date,
      'Due Date': j.required_date ?? '',
      'On Hold': j.is_on_hold ? 'Yes' : 'No',
      'Repeat': j.is_repeat ? (j.repeat_kind === 'changed' ? 'With changes' : 'Exact') : 'No',
    })), 'jobs-export')
  }

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

  // Each page REPLACES the list now rather than appending to it — that is the
  // difference between Load More and numbered pages, and it also means the DOM
  // never holds more than PAGE_SIZE rows however deep you go.
  const fetchJobs = useCallback(async (q: string, status: string, pageNo: number) => {
    setLoading(true)
    try {
      const params = new URLSearchParams({ limit: String(pageSize), page: String(pageNo) })
      if (q) params.set('search', q)
      if (status) params.set('status', status)
      const res = await fetch(`/api/v1/jobs?${params}`)
      const json = await res.json()
      setJobs((json.data ?? []) as Job[])
      setTotal(json.total ?? 0)
      setPage(pageNo)
      // Rows from the page we just left must not stay ticked — the ids aren't
      // on screen any more, and Export would silently include them.
      setSelected(new Set())
    } catch { toast.error('Failed to load jobs') }
    finally { setLoading(false) }
  }, [pageSize])

  const handleSearch = (val: string) => {
    setSearch(val)
    setTimeout(() => fetchJobs(val, activeStatus, 1), 350)
  }

  const handleStatusTab = (status: string) => {
    setActiveStatus(status)
    fetchJobs(search, status, 1)
  }

  // Rows-per-page changed (or this browser remembers a size other than the one
  // page.tsx server-rendered) — re-read page 1 at the new size. Same reasoning
  // as useServerPagedList; Jobs has its own fetcher so it needs its own copy.
  const lastPageSize = useRef(pageSize)
  useEffect(() => {
    if (lastPageSize.current === pageSize) return
    lastPageSize.current = pageSize
    fetchJobs(search, activeStatus, 1)
    // search/activeStatus are read at fire time on purpose — a size change must
    // not also re-run when the filter changes; the filter has its own handler.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pageSize, fetchJobs])

  return (
    <div className="space-y-4">
      {/* Toolbar */}
      <Toolbar
        search={{ value: search, onChange: handleSearch, placeholder: 'Search by job number, title, or size (190x100x45)…' }}
        actions={
          <>
            <button onClick={() => exportJobs(selected.size ? jobs.filter(j => selected.has(j.id)) : jobs)}
              title={selected.size ? `Export ${selected.size} selected` : 'Export current list'}
              className="flex items-center justify-center gap-1.5 px-3 h-11 md:h-9 rounded-md border border-[var(--color-border)] text-sm text-[var(--color-text-secondary)] hover:bg-[var(--color-bg-elevated)] transition-colors">
              <Download size={14} /> Export{selected.size ? ` (${selected.size})` : ''}
            </button>
            <Link href="/dashboard/jobs/new"
              className="flex items-center justify-center gap-1.5 px-4 h-11 md:h-9 rounded-md bg-[var(--color-accent)] text-[var(--color-on-accent)] text-sm font-medium hover:bg-[var(--color-accent-hover)] transition-colors">
              <Plus size={15} /> New Job
            </Link>
          </>
        }
      />

      {/* Status tabs */}
      <div className="flex items-center gap-2">
        <TabStrip
          className="flex-1 min-w-0"
          tabs={STATUS_TABS.map(t => ({ key: t.key, label: t.label }))}
          active={activeStatus}
          onChange={handleStatusTab}
          trailing={total > 0 ? <span className="text-xs text-[var(--color-text-muted)]">{total} jobs</span> : undefined}
        />
        {/* Row height. md+ because that is where the table (and its thumbnail
            column) exists at all — mobile renders cards, which ignore density. */}
        {view === 'list' && (
          <div className="hidden md:flex items-center gap-1 flex-shrink-0 bg-[var(--color-bg-secondary)] border border-[var(--color-border)] rounded-lg p-0.5">
            <button onClick={() => changeDensity('compact')} title="Compact rows — smaller artwork thumbnail" aria-label="Compact rows"
              aria-pressed={density === 'compact'}
              className={cn('w-7 h-6 flex items-center justify-center rounded-md transition-colors', density === 'compact' ? 'bg-[var(--color-accent)] text-[var(--color-on-accent)]' : 'text-[var(--color-text-muted)] hover:text-[var(--color-text-primary)]')}>
              <Rows3 size={13} />
            </button>
            <button onClick={() => changeDensity('comfortable')} title="Comfortable rows — larger artwork thumbnail" aria-label="Comfortable rows"
              aria-pressed={density === 'comfortable'}
              className={cn('w-7 h-6 flex items-center justify-center rounded-md transition-colors', density === 'comfortable' ? 'bg-[var(--color-accent)] text-[var(--color-on-accent)]' : 'text-[var(--color-text-muted)] hover:text-[var(--color-text-primary)]')}>
              <Rows2 size={13} />
            </button>
          </div>
        )}

        {/* Kanban needs horizontal room by nature, so the toggle is desktop-only */}
        <div className="hidden lg:flex items-center gap-1 flex-shrink-0 bg-[var(--color-bg-secondary)] border border-[var(--color-border)] rounded-lg p-0.5">
          <button onClick={() => setView('list')} title="List view" aria-label="List view"
            className={cn('w-7 h-6 flex items-center justify-center rounded-md transition-colors', view === 'list' ? 'bg-[var(--color-accent)] text-[var(--color-on-accent)]' : 'text-[var(--color-text-muted)] hover:text-[var(--color-text-primary)]')}>
            <List size={13} />
          </button>
          <button onClick={() => setView('kanban')} title="Kanban view" aria-label="Kanban view"
            className={cn('w-7 h-6 flex items-center justify-center rounded-md transition-colors', view === 'kanban' ? 'bg-[var(--color-accent)] text-[var(--color-on-accent)]' : 'text-[var(--color-text-muted)] hover:text-[var(--color-text-primary)]')}>
            <LayoutGrid size={13} />
          </button>
        </div>
      </div>

      {view === 'kanban' ? (
        <JobsKanban jobs={jobs} onStatusChange={handleKanbanStatusChange} thumbnails={thumbs} />
      ) : (
        <div className={cn(loading && 'opacity-60')}>
          <DataList<Job>
            rows={jobs}
            columns={jobColumns(thumbs, density)}
            density={density}
            getRowId={j => j.id}
            rowHref={j => `/dashboard/jobs/${j.id}`}
            rowClassName={j => urgencyColor(j.required_date, j.status)}
            selection={{
              selectedIds: selected,
              onToggle: toggleSelect,
              onToggleAll: toggleSelectAll,
              allSelected,
            }}
            stickyHeader
            empty={
              <div className="flex flex-col items-center py-16">
                <Briefcase size={32} className="text-[var(--color-text-muted)] opacity-30 mb-3" />
                <p className="text-sm font-medium text-[var(--color-text-primary)] mb-1">
                  {search || activeStatus ? 'No jobs found' : 'No jobs yet'}
                </p>
                <p className="text-xs text-[var(--color-text-muted)]">
                  {search || activeStatus ? 'Try a different filter' : 'Create your first job to get started'}
                </p>
              </div>
            }
          />
        </div>
      )}

      {view === 'list' && (
        <Pagination
          page={page}
          total={total}
          pageSize={pageSize}
          loading={loading}
          onPageChange={p => fetchJobs(search, activeStatus, p)}
          noun="jobs"
        />
      )}
    </div>
  )
}
