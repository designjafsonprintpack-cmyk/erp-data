'use client'
import { useState, useEffect } from 'react'
import Link from 'next/link'
import { ArrowLeft, Pencil, FileText, Calendar, User, CheckCircle, XCircle, Printer, Truck, Receipt } from 'lucide-react'
import { cn } from '@/lib/utils/cn'
import { toast } from '@/components/ui/Toast'
import { formatDate, formatDateTime } from '@/lib/utils/format'
import { SO_STATUS_CONFIG } from '@/modules/sales/sales-orders/types/so.types'
import { ConfirmDialog } from '@/components/ui/Modal'
import { useRouter } from 'next/navigation'

interface SOItem { id: string; line_no: number; product_desc: string; size_l: number | null; size_w: number | null; size_h: number | null; quantity: number; no_of_colors: number | null; unit_price: number; subtotal: number; notes: string | null }
interface FulfillmentRow { sales_order_item_id: string; ordered_qty: number; dispatched_qty: number; invoiced_qty: number }
interface SO {
  id: string; so_number: string; status: string; order_date: string; required_date: string | null
  discount_percent: number; discount_amount: number; subtotal: number; tax_amount: number; total_amount: number
  special_instructions: string | null; created_at: string
  customers: { name: string; customer_code: string; email: string | null; phone: string | null } | null
  sales_order_items: SOItem[]
}

export default function SODetailClient({ so }: { so: SO }) {
  const router = useRouter()
  const [cancelOpen, setCancelOpen] = useState(false)
  const [loading, setLoading] = useState(false)
  const [fulfillment, setFulfillment] = useState<Record<string, FulfillmentRow>>({})

  useEffect(() => {
    fetch(`/api/v1/sales-orders/${so.id}/fulfillment`)
      .then(r => r.json())
      .then(json => {
        const map: Record<string, FulfillmentRow> = {}
        for (const row of (json.data ?? []) as FulfillmentRow[]) map[row.sales_order_item_id] = row
        setFulfillment(map)
      })
      .catch(() => {})
  }, [so.id])
  const cfg = SO_STATUS_CONFIG[so.status] || SO_STATUS_CONFIG.confirmed

  const isUrgent = so.required_date && new Date(so.required_date) <= new Date(Date.now() + 3 * 86400000) && !['completed', 'dispatched', 'cancelled'].includes(so.status)

  const cancelSO = async () => {
    setLoading(true)
    try {
      const res = await fetch(`/api/v1/sales-orders/${so.id}`, {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: 'cancelled' }),
      })
      if (!res.ok) throw new Error()
      toast.success('Sales Order cancelled')
      router.refresh()
    } catch { toast.error('Failed to cancel') }
    finally { setLoading(false); setCancelOpen(false) }
  }

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Link href="/dashboard/sales-orders" className="w-8 h-8 flex items-center justify-center rounded-md border border-[var(--color-border)] text-[var(--color-text-muted)] hover:bg-[var(--color-bg-elevated)] transition-colors">
            <ArrowLeft size={15} />
          </Link>
          <div>
            <div className="flex items-center gap-3">
              <h1 className="text-2xl font-bold text-[var(--color-text-primary)] font-mono">{so.so_number}</h1>
              <span className={cn('text-xs px-2.5 py-1 rounded-full border font-medium', cfg.color)}>{cfg.label}</span>
              {isUrgent && <span className="text-xs text-[var(--color-danger)] bg-[var(--color-danger)]/10 border border-[var(--color-danger)]/20 px-2 py-0.5 rounded-full">⚠️ Urgent</span>}
            </div>
            <p className="text-sm text-[var(--color-text-muted)] mt-0.5">Created {formatDateTime(so.created_at)}</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={() => window.open(`/api/v1/print/so?id=${so.id}`, '_blank')} className="flex items-center gap-1.5 px-3 h-8 rounded-md border border-[var(--color-border)] text-sm text-[var(--color-text-secondary)] hover:bg-[var(--color-bg-elevated)] transition-colors">
            <Printer size={14} /> Print
          </button>
          {!['cancelled', 'dispatched'].includes(so.status) && (
            <Link href={`/dashboard/sales-orders/${so.id}/edit`} className="flex items-center gap-1.5 px-3 h-8 rounded-md border border-[var(--color-border)] text-sm text-[var(--color-text-secondary)] hover:bg-[var(--color-bg-elevated)] transition-colors">
              <Pencil size={14} /> Edit
            </Link>
          )}
          {!['cancelled', 'dispatched', 'completed'].includes(so.status) && (
            <button onClick={() => setCancelOpen(true)} className="flex items-center gap-1.5 px-3 h-8 rounded-md border border-[var(--color-danger)]/30 text-sm text-[var(--color-danger)] hover:bg-[var(--color-danger)]/10 transition-colors">
              <XCircle size={14} /> Cancel
            </button>
          )}
        </div>
      </div>

      {/* Info cards */}
      <div className="grid grid-cols-3 gap-4">
        {/* Customer */}
        <div className="rounded-xl border border-[var(--color-border)] bg-[var(--color-bg-secondary)] p-4">
          <div className="flex items-center gap-2 mb-3">
            <User size={14} className="text-[var(--color-text-muted)]" />
            <span className="text-xs font-semibold text-[var(--color-text-muted)] uppercase tracking-wider">Customer</span>
          </div>
          <p className="text-sm font-semibold text-[var(--color-text-primary)]">{so.customers?.name}</p>
          <p className="text-xs text-[var(--color-text-muted)] mt-0.5 font-mono">{so.customers?.customer_code}</p>
          {so.customers?.email && <p className="text-xs text-[var(--color-text-secondary)] mt-1">{so.customers.email}</p>}
          {so.customers?.phone && <p className="text-xs text-[var(--color-text-secondary)]">{so.customers.phone}</p>}
        </div>

        {/* Dates */}
        <div className="rounded-xl border border-[var(--color-border)] bg-[var(--color-bg-secondary)] p-4">
          <div className="flex items-center gap-2 mb-3">
            <Calendar size={14} className="text-[var(--color-text-muted)]" />
            <span className="text-xs font-semibold text-[var(--color-text-muted)] uppercase tracking-wider">Dates</span>
          </div>
          <div className="space-y-2">
            <div>
              <p className="text-xs text-[var(--color-text-muted)]">Order Date</p>
              <p className="text-sm font-medium text-[var(--color-text-primary)]">{formatDate(so.order_date)}</p>
            </div>
            <div>
              <p className="text-xs text-[var(--color-text-muted)]">Required By</p>
              <p className={cn('text-sm font-medium', isUrgent ? 'text-[var(--color-danger)]' : 'text-[var(--color-text-primary)]')}>
                {so.required_date ? formatDate(so.required_date) : '—'}
              </p>
            </div>
          </div>
        </div>

        {/* Financials */}
        <div className="rounded-xl border border-[var(--color-border)] bg-[var(--color-bg-secondary)] p-4">
          <div className="flex items-center gap-2 mb-3">
            <FileText size={14} className="text-[var(--color-text-muted)]" />
            <span className="text-xs font-semibold text-[var(--color-text-muted)] uppercase tracking-wider">Financials</span>
          </div>
          <div className="space-y-1.5">
            <div className="flex justify-between text-sm">
              <span className="text-[var(--color-text-secondary)]">Subtotal</span>
              <span className="text-[var(--color-text-primary)]">PKR {Number(so.subtotal).toLocaleString()}</span>
            </div>
            {so.discount_percent > 0 && (
              <div className="flex justify-between text-sm">
                <span className="text-[var(--color-text-secondary)]">Discount ({so.discount_percent}%)</span>
                <span className="text-[var(--color-danger)]">- PKR {Number(so.discount_amount).toLocaleString()}</span>
              </div>
            )}
            <div className="flex justify-between text-base font-bold border-t border-[var(--color-border)] pt-1.5 mt-1.5">
              <span className="text-[var(--color-text-primary)]">Total</span>
              <span className="text-[var(--color-accent)]">PKR {Number(so.total_amount).toLocaleString()}</span>
            </div>
          </div>
        </div>
      </div>

      {/* Special instructions */}
      {so.special_instructions && (
        <div className="rounded-xl border border-[var(--color-warning)]/20 bg-[var(--color-warning)]/5 px-5 py-3">
          <p className="text-xs font-semibold text-[var(--color-warning)] uppercase tracking-wider mb-1">Special Instructions</p>
          <p className="text-sm text-[var(--color-text-primary)]">{so.special_instructions}</p>
        </div>
      )}

      {/* Line items */}
      <div className="rounded-xl border border-[var(--color-border)] bg-[var(--color-bg-secondary)] overflow-hidden">
        <div className="px-5 py-3.5 border-b border-[var(--color-border)] bg-[var(--color-bg-elevated)]">
          <h2 className="text-sm font-semibold text-[var(--color-text-primary)]">Line Items ({so.sales_order_items.length})</h2>
        </div>
        <div className="grid gap-0" style={{ gridTemplateColumns: '2.5fr 1fr 1fr 1fr 1fr 1fr 1.5fr' }}>
          {/* Header */}
          <div className="contents">
            {['Description', 'Size (mm)', 'Qty', 'Colors', 'Unit Price', 'Subtotal', 'Fulfillment'].map((h, i) => (
              <div key={i} className="px-5 py-2 bg-[var(--color-bg-elevated)]/60 border-b border-[var(--color-border-subtle)] text-xs font-semibold text-[var(--color-text-muted)] uppercase tracking-wider">{h}</div>
            ))}
          </div>
          {so.sales_order_items.map((item, idx) => (
            <div key={item.id} className={cn('contents', idx % 2 === 1 && 'bg-[var(--color-bg-elevated)]/10')}>
              <div className="px-5 py-3 flex items-center border-b border-[var(--color-border-subtle)]">
                <div>
                  <p className="text-sm font-medium text-[var(--color-text-primary)]">{item.product_desc}</p>
                  {item.notes && <p className="text-xs text-[var(--color-text-muted)] mt-0.5">{item.notes}</p>}
                </div>
              </div>
              <div className="px-5 py-3 flex items-center border-b border-[var(--color-border-subtle)]">
                <span className="text-sm text-[var(--color-text-secondary)]">
                  {[item.size_l, item.size_w, item.size_h].filter(Boolean).join(' × ') || '—'}
                </span>
              </div>
              <div className="px-5 py-3 flex items-center border-b border-[var(--color-border-subtle)]">
                <span className="text-sm font-medium text-[var(--color-text-primary)]">{item.quantity.toLocaleString()}</span>
              </div>
              <div className="px-5 py-3 flex items-center border-b border-[var(--color-border-subtle)]">
                <span className="text-sm text-[var(--color-text-secondary)]">{item.no_of_colors ?? '—'}</span>
              </div>
              <div className="px-5 py-3 flex items-center border-b border-[var(--color-border-subtle)]">
                <span className="text-sm text-[var(--color-text-primary)]">{Number(item.unit_price).toLocaleString()}</span>
              </div>
              <div className="px-5 py-3 flex items-center border-b border-[var(--color-border-subtle)]">
                <span className="text-sm font-semibold text-[var(--color-text-primary)]">{Number(item.subtotal).toLocaleString()}</span>
              </div>
              <div className="px-5 py-3 flex items-center border-b border-[var(--color-border-subtle)]">
                {(() => {
                  const f = fulfillment[item.id]
                  if (!f) return <span className="text-xs text-[var(--color-text-muted)]">—</span>
                  const dispatchedPct = item.quantity > 0 ? Math.min(100, Math.round((f.dispatched_qty / item.quantity) * 100)) : 0
                  const invoicedPct = item.quantity > 0 ? Math.min(100, Math.round((f.invoiced_qty / item.quantity) * 100)) : 0
                  return (
                    <div className="space-y-1 w-full max-w-[140px]">
                      <div className="flex items-center gap-1.5 text-xs">
                        <Truck size={11} className={dispatchedPct >= 100 ? 'text-[var(--color-success)]' : 'text-[var(--color-text-muted)]'} />
                        <span className={dispatchedPct >= 100 ? 'text-[var(--color-success)]' : 'text-[var(--color-text-secondary)]'}>
                          {f.dispatched_qty.toLocaleString()} / {item.quantity.toLocaleString()}
                        </span>
                      </div>
                      <div className="flex items-center gap-1.5 text-xs">
                        <Receipt size={11} className={invoicedPct >= 100 ? 'text-[var(--color-success)]' : 'text-[var(--color-text-muted)]'} />
                        <span className={invoicedPct >= 100 ? 'text-[var(--color-success)]' : 'text-[var(--color-text-secondary)]'}>
                          {f.invoiced_qty.toLocaleString()} / {item.quantity.toLocaleString()}
                        </span>
                      </div>
                    </div>
                  )
                })()}
              </div>
            </div>
          ))}
        </div>
      </div>

      <ConfirmDialog
        open={cancelOpen} onClose={() => setCancelOpen(false)} onConfirm={cancelSO}
        title="Cancel Sales Order"
        message={`Cancel ${so.so_number}? This will mark the order as cancelled. This action cannot be undone.`}
        confirmLabel="Cancel Order" loading={loading}
      />
    </div>
  )
}
