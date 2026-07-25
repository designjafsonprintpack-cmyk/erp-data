'use client'
import { useState } from 'react'
import Link from 'next/link'
import { Plus, FileText, ChevronRight } from 'lucide-react'
import { cn } from '@/lib/utils/cn'
import { formatDate } from '@/lib/utils/format'
import { QT_STATUS_CONFIG } from '@/modules/sales/quotations/types/quotation.types'
import { DataList, type DataListColumn } from '@/components/ui/DataList'
import { Toolbar } from '@/components/ui/Toolbar'
import { TabStrip } from '@/components/ui/TabStrip'

interface QT { id: string; quotation_number: string; status: string; total_amount: number; valid_until: string | null; created_at: string; customers: { name: string; customer_code: string } | null }

const STATUS_FILTERS = ['all', 'draft', 'sent', 'approved', 'rejected', 'converted']

const COLUMNS: DataListColumn<QT>[] = [
  {
    key: 'number', header: 'Number', span: 2, role: 'identity',
    render: qt => <span className="font-mono text-sm text-[var(--color-accent)]">{qt.quotation_number}</span>,
  },
  {
    key: 'customer', header: 'Customer', span: 3, role: 'title',
    render: qt => (
      <span className="block min-w-0">
        <span className="block text-sm font-medium text-[var(--color-text-primary)] truncate">{qt.customers?.name ?? '—'}</span>
        <span className="block text-xs text-[var(--color-text-muted)]">{qt.customers?.customer_code}</span>
      </span>
    ),
  },
  {
    key: 'status', header: 'Status', span: 2, role: 'status',
    render: qt => {
      const cfg = QT_STATUS_CONFIG[qt.status] || QT_STATUS_CONFIG.draft
      return <span className={cn('text-xs px-2 py-0.5 rounded-full border font-medium', cfg.color)}>{cfg.label}</span>
    },
  },
  {
    key: 'valid', header: 'Valid Until', span: 2, role: 'meta', label: 'Valid until',
    render: qt => <span className="text-sm text-[var(--color-text-secondary)]">{qt.valid_until ? formatDate(qt.valid_until) : '—'}</span>,
  },
  {
    key: 'total', header: 'Total', span: 2, role: 'meta', label: 'Total', align: 'right',
    render: qt => (
      <span className="text-sm font-semibold text-[var(--color-text-primary)]">
        PKR {Number(qt.total_amount).toLocaleString()}
      </span>
    ),
  },
  {
    // Whole row already links to the detail page; the chevron is a visual
    // affordance on desktop and redundant on the card.
    key: 'open', header: 'Action', span: 1, role: 'desktop', align: 'right',
    render: () => (
      <span className="inline-flex w-7 h-7 items-center justify-center rounded-md text-[var(--color-text-muted)]">
        <ChevronRight size={15} />
      </span>
    ),
  },
]

export default function QuotationsClient({ initialData, initialTotal }: { initialData: QT[]; initialTotal: number }) {
  const [data, setData] = useState(initialData)
  const [total, setTotal] = useState(initialTotal)
  const [search, setSearch] = useState('')
  const [status, setStatus] = useState('all')
  const [loading, setLoading] = useState(false)

  const doFetch = async (q: string, s: string) => {
    setLoading(true)
    try {
      const params = new URLSearchParams({ search: q, ...(s !== 'all' ? { status: s } : {}), limit: '50' })
      const res = await fetch(`/api/v1/quotations?${params}`)
      const json = await res.json()
      setData(json.data ?? [])
      setTotal(json.total ?? 0)
    } finally { setLoading(false) }
  }

  const handleSearch = (val: string) => {
    setSearch(val)
    clearTimeout((window as any)._qtTimer)
    ;(window as any)._qtTimer = setTimeout(() => doFetch(val, status), 350)
  }

  const handleStatus = (s: string) => { setStatus(s); doFetch(search, s) }

  return (
    <div className="space-y-4">
      <Toolbar
        search={{ value: search, onChange: handleSearch, placeholder: 'Search quotation number…' }}
        actions={
          <Link href="/dashboard/quotations/new" className="flex items-center justify-center gap-1.5 px-4 h-11 md:h-9 rounded-md bg-[var(--color-accent)] text-white text-sm font-medium hover:bg-[var(--color-accent-hover)] transition-colors">
            <Plus size={15} /> New Quotation
          </Link>
        }
      />

      <TabStrip
        tabs={STATUS_FILTERS.map(s => ({ key: s, label: <span className="capitalize">{s}</span> }))}
        active={status}
        onChange={handleStatus}
        trailing={total > 0 ? <span className="text-xs text-[var(--color-text-muted)]">{total} quotations</span> : undefined}
      />

      <div className={cn(loading && 'opacity-60')}>
        <DataList<QT>
          rows={data}
          columns={COLUMNS}
          getRowId={qt => qt.id}
          rowHref={qt => `/dashboard/quotations/${qt.id}`}
          stickyHeader
          empty={
            <div className="flex flex-col items-center py-16">
              <FileText size={32} className="text-[var(--color-text-muted)] opacity-30 mb-3" />
              <p className="text-sm text-[var(--color-text-primary)]">No quotations found</p>
            </div>
          }
        />
      </div>
    </div>
  )
}
