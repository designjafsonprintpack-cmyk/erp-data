'use client'
import { useState, useCallback } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { Plus, ChevronRight, Users, Undo2 } from 'lucide-react'
import { DataList, type DataListColumn } from '@/components/ui/DataList'
import { Toolbar } from '@/components/ui/Toolbar'
import { TabStrip } from '@/components/ui/TabStrip'
import { cn } from '@/lib/utils/cn'
import { toast } from '@/components/ui/Toast'
import { Badge } from '@/components/ui'
import { Pagination } from '@/components/ui/Pagination'

/** Rows per page. The server-rendered first page in page.tsx uses the same number. */
const PAGE_SIZE = 50

interface Customer {
  id: string; customer_code: string; name: string; business_type: string; pipeline_stage: string
  email: string | null; phone: string | null; mobile: string | null
  industry: string | null; payment_terms: number; is_active: boolean
  /** PostgREST returns an embedded aggregate as [{ count }]. Jobs are hard
   *  deleted in this schema, so this needs no deleted_at filter. */
  jobs?: { count: number }[]
}

const jobCount = (c: Customer) => c.jobs?.[0]?.count ?? 0

const BIZ_COLORS: Record<string, string> = {
  company: 'text-[var(--color-accent)] bg-[color:color-mix(in_srgb,var(--color-accent)_10%,transparent)] border-[color:color-mix(in_srgb,var(--color-accent)_20%,transparent)]',
  individual: 'text-[var(--color-success)] bg-[color:color-mix(in_srgb,var(--color-success)_10%,transparent)] border-[color:color-mix(in_srgb,var(--color-success)_20%,transparent)]',
  government: 'text-[var(--color-warning)] bg-[color:color-mix(in_srgb,var(--color-warning)_10%,transparent)] border-[color:color-mix(in_srgb,var(--color-warning)_20%,transparent)]',
}

/**
 * The Deleted tab is a real tab rather than a stage, because it changes WHICH
 * rows are fetched (`?deleted=1`), not how they are filtered. Before this
 * existed, a customer deleted by mistake could only be brought back by editing
 * the database by hand — which is what "Ags Molasses" and its 4 jobs needed.
 */
const DELETED_TAB = '__deleted__'

const STAGE_TABS = [
  { value: '', label: 'All' },
  { value: 'lead', label: 'Leads' },
  { value: 'prospect', label: 'Prospects' },
  { value: 'customer', label: 'Customers' },
  { value: DELETED_TAB, label: 'Deleted' },
]
const STAGE_BADGE: Record<string, string> = {
  lead: 'text-[var(--color-text-muted)] bg-[var(--color-bg-elevated)] border-[var(--color-border)]',
  prospect: 'text-[var(--color-warning)] bg-[color:color-mix(in_srgb,var(--color-warning)_10%,transparent)] border-[color:color-mix(in_srgb,var(--color-warning)_20%,transparent)]',
  customer: 'text-[var(--color-success)] bg-[color:color-mix(in_srgb,var(--color-success)_10%,transparent)] border-[color:color-mix(in_srgb,var(--color-success)_20%,transparent)]',
}


const CUSTOMER_COLUMNS: DataListColumn<Customer>[] = [
  {
    key: 'code', header: 'Code', span: 1, role: 'desktop',
    render: c => <span className="text-xs font-mono text-[var(--color-text-muted)]">{c.customer_code}</span>,
  },
  {
    key: 'name', header: 'Name', span: 3, role: 'identity',
    render: c => (
      <span className="flex items-center gap-2 min-w-0">
        <span className="w-8 h-8 rounded-full bg-[color:color-mix(in_srgb,var(--color-accent)_10%,transparent)] border border-[color:color-mix(in_srgb,var(--color-accent)_20%,transparent)] flex items-center justify-center flex-shrink-0">
          <span className="text-xs font-bold text-[var(--color-accent)]">{c.name.charAt(0).toUpperCase()}</span>
        </span>
        <span className="min-w-0">
          <span className="block text-sm font-medium text-[var(--color-text-primary)] truncate">{c.name}</span>
          <span className="block md:hidden text-xs font-mono text-[var(--color-text-muted)]">{c.customer_code}</span>
        </span>
      </span>
    ),
  },
  {
    key: 'type', header: 'Type / Industry', span: 2, role: 'status',
    render: c => (
      <span className="block">
        <span className="flex items-center gap-1.5 flex-wrap justify-end md:justify-start">
          <span className={cn('text-xs px-2 py-0.5 rounded-full border font-medium capitalize', BIZ_COLORS[c.business_type] || BIZ_COLORS.company)}>
            {c.business_type}
          </span>
          {c.pipeline_stage !== 'customer' && (
            <span className={cn('text-xs px-2 py-0.5 rounded-full border font-medium capitalize', STAGE_BADGE[c.pipeline_stage] || STAGE_BADGE.lead)}>
              {c.pipeline_stage}
            </span>
          )}
        </span>
        {c.industry && <span className="hidden md:block text-xs text-[var(--color-text-muted)] mt-0.5 truncate">{c.industry}</span>}
      </span>
    ),
  },
  {
    key: 'contact', header: 'Contact', span: 2, role: 'meta', label: 'Contact',
    render: c => <span className="text-sm text-[var(--color-text-secondary)]">{c.mobile || c.phone || '—'}</span>,
  },
  {
    // span 2 → 1 to make room for Jobs; the address was already truncated and
    // the 12-column total is unchanged.
    key: 'email', header: 'Email', span: 1, role: 'meta', label: 'Email',
    render: c => <span className="text-sm text-[var(--color-text-secondary)] truncate">{c.email || '—'}</span>,
  },
  {
    key: 'jobs', header: 'Jobs', span: 1, role: 'meta', label: 'Jobs', align: 'right',
    render: c => {
      const n = jobCount(c)
      return (
        <span className={cn('text-sm font-semibold', n > 0 ? 'text-[var(--color-text-primary)]' : 'text-[var(--color-text-muted)]')}>
          {n}
        </span>
      )
    },
  },
  {
    key: 'terms', header: 'Terms', span: 1, role: 'meta', label: 'Terms',
    render: c => <span className="text-sm text-[var(--color-text-secondary)]">{c.payment_terms}d</span>,
  },
  {
    key: 'open', header: 'Action', span: 1, role: 'desktop', align: 'right',
    render: () => (
      <span className="inline-flex w-7 h-7 items-center justify-center rounded-md text-[var(--color-text-muted)]">
        <ChevronRight size={15} />
      </span>
    ),
  },
]

/**
 * On the Deleted tab the chevron is useless — the row is already gone from
 * every other screen — so it becomes the way back. The column is swapped
 * rather than appended so the 12-column total stays exactly as it was.
 *
 * `role: 'meta'` instead of `'desktop'`, because on a phone a desktop-only
 * column is not rendered at all and Restore would be unreachable there.
 */
function customerColumns(
  deleted: boolean,
  onRestore: (c: Customer) => void,
): DataListColumn<Customer>[] {
  if (!deleted) return CUSTOMER_COLUMNS
  return [
    ...CUSTOMER_COLUMNS.slice(0, -1),
    {
      key: 'restore', header: 'Restore', span: 1, role: 'meta', label: 'Restore', align: 'right',
      render: c => (
        <button
          type="button"
          onClick={e => {
            // The whole row is a link to the customer. Without both of these the
            // click navigates instead of restoring.
            e.preventDefault()
            e.stopPropagation()
            onRestore(c)
          }}
          className="inline-flex items-center gap-1.5 px-2.5 h-8 rounded-md border border-[var(--color-border)] text-xs font-medium text-[var(--color-text-primary)] hover:bg-[var(--color-bg-elevated)] transition-colors"
        >
          <Undo2 size={13} /> Restore
        </button>
      ),
    },
  ]
}

export default function CustomersClient({ initialCustomers, initialTotal }: { initialCustomers: Customer[]; initialTotal: number }) {
  const router = useRouter()
  const [customers, setCustomers] = useState(initialCustomers)
  const [total, setTotal] = useState(initialTotal)
  const [page, setPage] = useState(1)
  const [search, setSearch] = useState('')
  const [stageFilter, setStageFilter] = useState('')
  const [loading, setLoading] = useState(false)
  const [showForm, setShowForm] = useState(false)
  const showDeleted = stageFilter === DELETED_TAB

  // Replaces the list rather than appending — numbered pages, not Load More.
  const doSearch = useCallback(async (q: string, stage: string, pageNo: number) => {
    setLoading(true)
    try {
      const params = new URLSearchParams({ search: q, limit: String(PAGE_SIZE), page: String(pageNo) })
      // Deleted is a different SET of rows, not a pipeline_stage value — sending
      // it as `stage` would filter live customers by a stage nothing has.
      if (stage === DELETED_TAB) params.set('deleted', '1')
      else if (stage) params.set('stage', stage)
      const res = await fetch(`/api/v1/customers?${params.toString()}`)
      const json = await res.json()
      setCustomers((json.data ?? []) as Customer[])
      setTotal(json.total ?? 0)
      setPage(pageNo)
    } catch { toast.error('Search failed') }
    finally { setLoading(false) }
  }, [])

  const handleRestore = async (c: Customer) => {
    setLoading(true)
    try {
      const res = await fetch(`/api/v1/customers/${c.id}`, { method: 'POST' })
      const json = await res.json().catch(() => ({}))
      if (!res.ok) { toast.error(json?.error || 'Restore failed'); return }
      toast.success(`${c.name} restored`)
      // Refetch rather than splicing — the row has left this list entirely.
      doSearch(search, stageFilter, page)
      router.refresh()
    } catch { toast.error('Restore failed') }
    finally { setLoading(false) }
  }

  const handleSearch = (val: string) => {
    setSearch(val)
    setTimeout(() => doSearch(val, stageFilter, 1), 350)
  }

  const handleStageFilter = (stage: string) => {
    setStageFilter(stage)
    doSearch(search, stage, 1)
  }

  return (
    <div className="space-y-4">
      {/* Toolbar */}
      <Toolbar
        search={{ value: search, onChange: handleSearch, placeholder: 'Search by name, code, email, phone…' }}
        actions={
          <Link href="/dashboard/customers/new"
            className="flex items-center justify-center gap-1.5 px-4 h-11 md:h-9 rounded-md bg-[var(--color-accent)] text-[var(--color-on-accent)] text-sm font-medium hover:bg-[var(--color-accent-hover)] transition-colors">
            <Plus size={15} /> New Customer
          </Link>
        }
      />

      {/* Stage filter tabs */}
      <TabStrip
        tabs={STAGE_TABS.map(t => ({ key: t.value, label: t.label }))}
        active={stageFilter}
        onChange={handleStageFilter}
      />

      {/* Table */}
      <div className={cn(loading && 'opacity-60')}>
        <DataList<Customer>
          rows={customers}
          columns={customerColumns(showDeleted, handleRestore)}
          getRowId={c => c.id}
          rowHref={c => `/dashboard/customers/${c.id}`}
          stickyHeader
          empty={
            <div className="flex flex-col items-center py-16">
              <Users size={32} className="text-[var(--color-text-muted)] opacity-30 mb-3" />
              <p className="text-sm font-medium text-[var(--color-text-primary)] mb-1">
                {showDeleted ? 'Nothing deleted' : search ? 'No results found' : 'No customers yet'}
              </p>
              <p className="text-xs text-[var(--color-text-muted)]">
                {showDeleted
                  ? 'Deleted customers show up here so you can bring them back'
                  : search ? 'Try a different search' : 'Add your first customer to get started'}
              </p>
            </div>
          }
        />
      </div>

      <Pagination
        page={page}
        total={total}
        pageSize={PAGE_SIZE}
        loading={loading}
        onPageChange={p => doSearch(search, stageFilter, p)}
        noun="customers"
      />
    </div>
  )
}
