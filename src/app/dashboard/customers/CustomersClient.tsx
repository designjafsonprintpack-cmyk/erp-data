'use client'
import { useState, useCallback } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { Plus, ChevronRight, Users } from 'lucide-react'
import { DataList, type DataListColumn } from '@/components/ui/DataList'
import { Toolbar } from '@/components/ui/Toolbar'
import { TabStrip } from '@/components/ui/TabStrip'
import { cn } from '@/lib/utils/cn'
import { toast } from '@/components/ui/Toast'
import { Badge } from '@/components/ui'

interface Customer {
  id: string; customer_code: string; name: string; business_type: string; pipeline_stage: string
  email: string | null; phone: string | null; mobile: string | null
  industry: string | null; payment_terms: number; is_active: boolean
}

const BIZ_COLORS: Record<string, string> = {
  company: 'text-[var(--color-accent)] bg-[color:color-mix(in_srgb,var(--color-accent)_10%,transparent)] border-[color:color-mix(in_srgb,var(--color-accent)_20%,transparent)]',
  individual: 'text-[var(--color-success)] bg-[color:color-mix(in_srgb,var(--color-success)_10%,transparent)] border-[color:color-mix(in_srgb,var(--color-success)_20%,transparent)]',
  government: 'text-[var(--color-warning)] bg-[color:color-mix(in_srgb,var(--color-warning)_10%,transparent)] border-[color:color-mix(in_srgb,var(--color-warning)_20%,transparent)]',
}

const STAGE_TABS = [
  { value: '', label: 'All' },
  { value: 'lead', label: 'Leads' },
  { value: 'prospect', label: 'Prospects' },
  { value: 'customer', label: 'Customers' },
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
    key: 'email', header: 'Email', span: 2, role: 'meta', label: 'Email',
    render: c => <span className="text-sm text-[var(--color-text-secondary)] truncate">{c.email || '—'}</span>,
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

export default function CustomersClient({ initialCustomers, initialTotal }: { initialCustomers: Customer[]; initialTotal: number }) {
  const router = useRouter()
  const [customers, setCustomers] = useState(initialCustomers)
  const [total, setTotal] = useState(initialTotal)
  const [search, setSearch] = useState('')
  const [stageFilter, setStageFilter] = useState('')
  const [loading, setLoading] = useState(false)
  const [showForm, setShowForm] = useState(false)

  const doSearch = useCallback(async (q: string, stage: string) => {
    setLoading(true)
    try {
      const params = new URLSearchParams({ search: q, limit: '50' })
      if (stage) params.set('stage', stage)
      const res = await fetch(`/api/v1/customers?${params.toString()}`)
      const json = await res.json()
      setCustomers(json.data ?? [])
      setTotal(json.total ?? 0)
    } catch { toast.error('Search failed') }
    finally { setLoading(false) }
  }, [])

  const handleSearch = (val: string) => {
    setSearch(val)
    setTimeout(() => doSearch(val, stageFilter), 350)
  }

  const handleStageFilter = (stage: string) => {
    setStageFilter(stage)
    doSearch(search, stage)
  }

  return (
    <div className="space-y-4">
      {/* Toolbar */}
      <Toolbar
        search={{ value: search, onChange: handleSearch, placeholder: 'Search by name, code, email, phone…' }}
        actions={
          <Link href="/dashboard/customers/new"
            className="flex items-center justify-center gap-1.5 px-4 h-11 md:h-9 rounded-md bg-[var(--color-accent)] text-white text-sm font-medium hover:bg-[var(--color-accent-hover)] transition-colors">
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
          columns={CUSTOMER_COLUMNS}
          getRowId={c => c.id}
          rowHref={c => `/dashboard/customers/${c.id}`}
          stickyHeader
          empty={
            <div className="flex flex-col items-center py-16">
              <Users size={32} className="text-[var(--color-text-muted)] opacity-30 mb-3" />
              <p className="text-sm font-medium text-[var(--color-text-primary)] mb-1">{search ? 'No results found' : 'No customers yet'}</p>
              <p className="text-xs text-[var(--color-text-muted)]">{search ? 'Try a different search' : 'Add your first customer to get started'}</p>
            </div>
          }
        />
      </div>

      {/* Pagination hint */}
      {total > 25 && (
        <p className="text-xs text-[var(--color-text-muted)] text-center">
          Showing {customers.length} of {total} customers
        </p>
      )}
    </div>
  )
}
