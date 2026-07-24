'use client'
import { useState } from 'react'
import Link from 'next/link'
import { Plus, Search, FileText, ChevronRight, ArrowRight } from 'lucide-react'
import { cn } from '@/lib/utils/cn'
import { formatDate } from '@/lib/utils/format'
import { QT_STATUS_CONFIG } from '@/modules/sales/quotations/types/quotation.types'

interface QT { id: string; quotation_number: string; status: string; total_amount: number; valid_until: string | null; created_at: string; customers: { name: string; customer_code: string } | null }

const STATUS_FILTERS = ['all', 'draft', 'sent', 'approved', 'rejected', 'converted']

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

  const handleSearch = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = e.target.value; setSearch(val)
    clearTimeout((window as any)._qtTimer)
    ;(window as any)._qtTimer = setTimeout(() => doFetch(val, status), 350)
  }

  const handleStatus = (s: string) => { setStatus(s); doFetch(search, s) }

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3">
        <div className="relative flex-1 max-w-md">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-[var(--color-text-muted)]" />
          <input value={search} onChange={handleSearch} placeholder="Search quotation number…"
            className="w-full h-9 pl-9 pr-3 rounded-md border border-[var(--color-border)] bg-[var(--color-bg-elevated)] text-sm text-[var(--color-text-primary)] placeholder:text-[var(--color-text-muted)] focus:outline-none focus:border-[var(--color-accent)] focus:ring-1 focus:ring-[var(--color-accent)] transition-colors" />
        </div>
        <div className="flex items-center gap-1">
          {STATUS_FILTERS.map(s => (
            <button key={s} onClick={() => handleStatus(s)}
              className={cn('px-3 h-8 rounded-md text-xs font-medium capitalize transition-all border', status === s ? 'bg-[var(--color-accent)] text-white border-transparent' : 'bg-[var(--color-bg-secondary)] text-[var(--color-text-secondary)] border-[var(--color-border)] hover:text-[var(--color-text-primary)]')}>
              {s}
            </button>
          ))}
        </div>
        <Link href="/dashboard/quotations/new" className="flex items-center gap-1.5 px-4 h-9 rounded-md bg-[var(--color-accent)] text-white text-sm font-medium hover:bg-[var(--color-accent-hover)] transition-colors flex-shrink-0">
          <Plus size={15} /> New Quotation
        </Link>
      </div>

      <div className="rounded-xl border border-[var(--color-border)] bg-[var(--color-bg-secondary)]">
        <div className="grid grid-cols-12 gap-3 px-5 py-2.5 bg-[var(--color-bg-elevated)] border-b border-[var(--color-border)] text-xs font-semibold text-[var(--color-text-muted)] uppercase tracking-wider sticky top-[var(--header-height)] z-10 rounded-t-xl">
          <div className="col-span-2">Number</div>
          <div className="col-span-3">Customer</div>
          <div className="col-span-2">Status</div>
          <div className="col-span-2">Valid Until</div>
          <div className="col-span-2 text-right">Total</div>
          <div className="col-span-1 text-right">Action</div>
        </div>
        <div className="divide-y divide-[var(--color-border-subtle)]">
          {data.map((qt, idx) => {
            const cfg = QT_STATUS_CONFIG[qt.status] || QT_STATUS_CONFIG.draft
            return (
              <div key={qt.id} className={cn('grid grid-cols-12 gap-3 px-5 py-3.5 items-center hover:bg-[var(--color-bg-elevated)]/40 transition-colors', idx % 2 === 1 && 'bg-[var(--color-bg-elevated)]/15')}>
                <div className="col-span-2 font-mono text-sm text-[var(--color-accent)]">{qt.quotation_number}</div>
                <div className="col-span-3 min-w-0">
                  <p className="text-sm font-medium text-[var(--color-text-primary)] truncate">{qt.customers?.name ?? '—'}</p>
                  <p className="text-xs text-[var(--color-text-muted)]">{qt.customers?.customer_code}</p>
                </div>
                <div className="col-span-2">
                  <span className={cn('text-xs px-2 py-0.5 rounded-full border font-medium', cfg.color)}>{cfg.label}</span>
                </div>
                <div className="col-span-2 text-sm text-[var(--color-text-secondary)]">{qt.valid_until ? formatDate(qt.valid_until) : '—'}</div>
                <div className="col-span-2 text-right text-sm font-semibold text-[var(--color-text-primary)]">
                  PKR {Number(qt.total_amount).toLocaleString()}
                </div>
                <div className="col-span-1 flex justify-end">
                  <Link href={`/dashboard/quotations/${qt.id}`} className="w-7 h-7 flex items-center justify-center rounded-md text-[var(--color-text-muted)] hover:bg-[var(--color-bg-elevated)] hover:text-[var(--color-accent)] transition-colors">
                    <ChevronRight size={15} />
                  </Link>
                </div>
              </div>
            )
          })}
        </div>
        {data.length === 0 && (
          <div className="flex flex-col items-center py-16">
            <FileText size={32} className="text-[var(--color-text-muted)] opacity-30 mb-3" />
            <p className="text-sm text-[var(--color-text-primary)]">No quotations found</p>
          </div>
        )}
      </div>
    </div>
  )
}
