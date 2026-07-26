'use client'
import { useState } from 'react'
import Link from 'next/link'
import { Plus, ShoppingCart } from 'lucide-react'
import { cn } from '@/lib/utils/cn'
import { formatDate } from '@/lib/utils/format'
import { SO_STATUS_CONFIG } from '@/modules/sales/sales-orders/types/so.types'
import { DataList, type DataListColumn } from '@/components/ui/DataList'
import { Toolbar } from '@/components/ui/Toolbar'
import { TabStrip } from '@/components/ui/TabStrip'

interface SO { id: string; so_number: string; status: string; total_amount: number; required_date: string | null; order_date: string; customers: { name: string; customer_code: string } | null }

const STATUS_FILTERS = ['all', 'confirmed', 'in_production', 'completed', 'dispatched', 'cancelled']

function isUrgent(so: SO): boolean {
  return Boolean(
    so.required_date &&
    new Date(so.required_date) <= new Date(Date.now() + 3 * 86400000) &&
    !['completed', 'dispatched', 'cancelled'].includes(so.status)
  )
}

const COLUMNS: DataListColumn<SO>[] = [
  {
    key: 'number', header: 'SO Number', span: 2, role: 'identity',
    render: so => <span className="font-mono text-sm text-[var(--color-accent)]">{so.so_number}</span>,
  },
  {
    key: 'customer', header: 'Customer', span: 3, role: 'title',
    render: so => (
      <span className="block min-w-0">
        <span className="block text-sm font-medium text-[var(--color-text-primary)] truncate">{so.customers?.name ?? '—'}</span>
        <span className="block text-xs text-[var(--color-text-muted)]">{so.customers?.customer_code}</span>
      </span>
    ),
  },
  {
    key: 'status', header: 'Status', span: 2, role: 'status',
    render: so => {
      const cfg = SO_STATUS_CONFIG[so.status] || SO_STATUS_CONFIG.confirmed
      return <span className={cn('text-xs px-2 py-0.5 rounded-full border font-medium', cfg.color)}>{cfg.label}</span>
    },
  },
  {
    key: 'ordered', header: 'Order Date', span: 2, role: 'desktop',
    render: so => <span className="text-sm text-[var(--color-text-secondary)]">{formatDate(so.order_date)}</span>,
  },
  {
    key: 'required', header: 'Required By', span: 2, role: 'meta', label: 'Required by',
    render: so =>
      so.required_date ? (
        <span className={cn('text-sm', isUrgent(so) ? 'text-[var(--color-danger)] font-medium' : 'text-[var(--color-text-secondary)]')}>
          {formatDate(so.required_date)}{isUrgent(so) && ' ⚠️'}
        </span>
      ) : <span className="text-sm text-[var(--color-text-secondary)]">—</span>,
  },
  {
    key: 'total', header: 'Total', span: 1, role: 'meta', label: 'Total', align: 'right',
    render: so => (
      <span className="text-sm font-semibold text-[var(--color-text-primary)]">
        {Number(so.total_amount).toLocaleString()}
      </span>
    ),
  },
]

export default function SalesOrdersClient({ initialData, initialTotal }: { initialData: SO[]; initialTotal: number }) {
  const [data, setData] = useState(initialData)
  const [total, setTotal] = useState(initialTotal)
  const [search, setSearch] = useState('')
  const [status, setStatus] = useState('all')
  const [loading, setLoading] = useState(false)

  const doFetch = async (q: string, s: string) => {
    setLoading(true)
    try {
      const params = new URLSearchParams({ search: q, ...(s !== 'all' ? { status: s } : {}), limit: '50' })
      const res = await fetch(`/api/v1/sales-orders?${params}`)
      const json = await res.json()
      setData(json.data ?? [])
      setTotal(json.total ?? 0)
    } finally { setLoading(false) }
  }

  const handleSearch = (val: string) => {
    setSearch(val)
    clearTimeout((window as any)._soTimer)
    ;(window as any)._soTimer = setTimeout(() => doFetch(val, status), 350)
  }

  const handleStatus = (s: string) => { setStatus(s); doFetch(search, s) }

  return (
    <div className="space-y-4">
      <Toolbar
        search={{ value: search, onChange: handleSearch, placeholder: 'Search SO number…' }}
        actions={
          <Link href="/dashboard/sales-orders/new" className="flex items-center justify-center gap-1.5 px-4 h-11 md:h-9 rounded-md bg-[var(--color-accent)] text-[var(--color-on-accent)] text-sm font-medium hover:bg-[var(--color-accent-hover)] transition-colors">
            <Plus size={15} /> New SO
          </Link>
        }
      />

      <TabStrip
        tabs={STATUS_FILTERS.map(s => ({ key: s, label: <span className="capitalize">{s.replace('_', ' ')}</span> }))}
        active={status}
        onChange={handleStatus}
        trailing={total > 0 ? <span className="text-xs text-[var(--color-text-muted)]">{total} orders</span> : undefined}
      />

      <div className={cn(loading && 'opacity-60')}>
        <DataList<SO>
          rows={data}
          columns={COLUMNS}
          getRowId={so => so.id}
          rowHref={so => `/dashboard/sales-orders/${so.id}`}
          stickyHeader
          empty={
            <div className="flex flex-col items-center py-16">
              <ShoppingCart size={32} className="text-[var(--color-text-muted)] opacity-30 mb-3" />
              <p className="text-sm text-[var(--color-text-primary)]">No sales orders found</p>
            </div>
          }
        />
      </div>
    </div>
  )
}
