'use client'
import { useState, useCallback } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { Plus, Search, Building2, Phone, Mail, ChevronRight, Users, SlidersHorizontal } from 'lucide-react'
import { cn } from '@/lib/utils/cn'
import { toast } from '@/components/ui/Toast'
import { Badge } from '@/components/ui'

interface Customer {
  id: string; customer_code: string; name: string; business_type: string; pipeline_stage: string
  email: string | null; phone: string | null; mobile: string | null
  industry: string | null; payment_terms: number; is_active: boolean
}

const BIZ_COLORS: Record<string, string> = {
  company: 'text-[var(--color-accent)] bg-[var(--color-accent)]/10 border-[var(--color-accent)]/20',
  individual: 'text-[var(--color-success)] bg-[var(--color-success)]/10 border-[var(--color-success)]/20',
  government: 'text-[var(--color-warning)] bg-[var(--color-warning)]/10 border-[var(--color-warning)]/20',
}

const STAGE_TABS = [
  { value: '', label: 'All' },
  { value: 'lead', label: 'Leads' },
  { value: 'prospect', label: 'Prospects' },
  { value: 'customer', label: 'Customers' },
]
const STAGE_BADGE: Record<string, string> = {
  lead: 'text-[var(--color-text-muted)] bg-[var(--color-bg-elevated)] border-[var(--color-border)]',
  prospect: 'text-[var(--color-warning)] bg-[var(--color-warning)]/10 border-[var(--color-warning)]/20',
  customer: 'text-[var(--color-success)] bg-[var(--color-success)]/10 border-[var(--color-success)]/20',
}

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

  const handleSearch = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = e.target.value
    setSearch(val)
    const timer = setTimeout(() => doSearch(val, stageFilter), 350)
    return () => clearTimeout(timer)
  }

  const handleStageFilter = (stage: string) => {
    setStageFilter(stage)
    doSearch(search, stage)
  }

  return (
    <div className="space-y-4">
      {/* Toolbar */}
      <div className="flex items-center gap-3">
        <div className="relative flex-1 max-w-md">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-[var(--color-text-muted)]" />
          <input
            value={search}
            onChange={handleSearch}
            placeholder="Search by name, code, email, phone…"
            className="w-full h-9 pl-9 pr-3 rounded-md border border-[var(--color-border)] bg-[var(--color-bg-elevated)] text-sm text-[var(--color-text-primary)] placeholder:text-[var(--color-text-muted)] focus:outline-none focus:border-[var(--color-accent)] focus:ring-1 focus:ring-[var(--color-accent)] transition-colors"
          />
        </div>
        <Link href="/dashboard/customers/new"
          className="flex items-center gap-1.5 px-4 h-9 rounded-md bg-[var(--color-accent)] text-white text-sm font-medium hover:bg-[var(--color-accent-hover)] transition-colors flex-shrink-0">
          <Plus size={15} /> New Customer
        </Link>
      </div>

      {/* Stage filter tabs */}
      <div className="flex items-center gap-1 bg-[var(--color-bg-secondary)] border border-[var(--color-border)] rounded-lg p-1 w-fit">
        {STAGE_TABS.map(t => (
          <button key={t.value} onClick={() => handleStageFilter(t.value)}
            className={cn('px-3 h-7 rounded-md text-xs font-medium transition-colors',
              stageFilter === t.value
                ? 'bg-[var(--color-accent)] text-white'
                : 'text-[var(--color-text-secondary)] hover:bg-[var(--color-bg-elevated)]')}>
            {t.label}
          </button>
        ))}
      </div>

      {/* Table */}
      <div className="rounded-xl border border-[var(--color-border)] bg-[var(--color-bg-secondary)] overflow-hidden">
        {/* Header */}
        <div className="grid grid-cols-12 gap-3 px-5 py-2.5 bg-[var(--color-bg-elevated)] border-b border-[var(--color-border)] text-xs font-semibold text-[var(--color-text-muted)] uppercase tracking-wider">
          <div className="col-span-1">Code</div>
          <div className="col-span-3">Name</div>
          <div className="col-span-2">Type / Industry</div>
          <div className="col-span-2">Contact</div>
          <div className="col-span-2">Email</div>
          <div className="col-span-1">Terms</div>
          <div className="col-span-1 text-right">Action</div>
        </div>

        {/* Rows */}
        <div className="divide-y divide-[var(--color-border-subtle)]">
          {customers.map((c, idx) => (
            <div key={c.id} className={cn('grid grid-cols-12 gap-3 px-5 py-3.5 items-center hover:bg-[var(--color-bg-elevated)]/40 transition-colors group', idx % 2 === 1 && 'bg-[var(--color-bg-elevated)]/15')}>
              <div className="col-span-1">
                <span className="text-xs font-mono text-[var(--color-text-muted)]">{c.customer_code}</span>
              </div>
              <div className="col-span-3 flex items-center gap-2 min-w-0">
                <div className="w-8 h-8 rounded-full bg-[var(--color-accent)]/10 border border-[var(--color-accent)]/20 flex items-center justify-center flex-shrink-0">
                  <span className="text-xs font-bold text-[var(--color-accent)]">{c.name.charAt(0).toUpperCase()}</span>
                </div>
                <div className="min-w-0">
                  <p className="text-sm font-medium text-[var(--color-text-primary)] truncate">{c.name}</p>
                </div>
              </div>
              <div className="col-span-2">
                <div className="flex items-center gap-1.5 flex-wrap">
                  <span className={cn('text-xs px-2 py-0.5 rounded-full border font-medium capitalize', BIZ_COLORS[c.business_type] || BIZ_COLORS.company)}>
                    {c.business_type}
                  </span>
                  {c.pipeline_stage !== 'customer' && (
                    <span className={cn('text-xs px-2 py-0.5 rounded-full border font-medium capitalize', STAGE_BADGE[c.pipeline_stage] || STAGE_BADGE.lead)}>
                      {c.pipeline_stage}
                    </span>
                  )}
                </div>
                {c.industry && <p className="text-xs text-[var(--color-text-muted)] mt-0.5 truncate">{c.industry}</p>}
              </div>
              <div className="col-span-2 text-sm text-[var(--color-text-secondary)]">
                {c.mobile || c.phone || '—'}
              </div>
              <div className="col-span-2 text-sm text-[var(--color-text-secondary)] truncate">
                {c.email || '—'}
              </div>
              <div className="col-span-1 text-sm text-[var(--color-text-secondary)]">
                {c.payment_terms}d
              </div>
              <div className="col-span-1 flex justify-end">
                <Link href={`/dashboard/customers/${c.id}`}
                  className="w-7 h-7 flex items-center justify-center rounded-md text-[var(--color-text-muted)] hover:bg-[var(--color-bg-elevated)] hover:text-[var(--color-accent)] transition-colors">
                  <ChevronRight size={15} />
                </Link>
              </div>
            </div>
          ))}
        </div>

        {customers.length === 0 && (
          <div className="flex flex-col items-center py-16">
            <Users size={32} className="text-[var(--color-text-muted)] opacity-30 mb-3" />
            <p className="text-sm font-medium text-[var(--color-text-primary)] mb-1">{search ? 'No results found' : 'No customers yet'}</p>
            <p className="text-xs text-[var(--color-text-muted)]">{search ? 'Try a different search' : 'Add your first customer to get started'}</p>
          </div>
        )}
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
