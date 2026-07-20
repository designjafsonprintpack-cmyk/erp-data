'use client'
import { useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { ArrowLeft, ArrowRight, Printer, Check, X, FileText, RefreshCw, Link as LinkIcon, History } from 'lucide-react'
import { cn } from '@/lib/utils/cn'
import { formatDate, formatDateTime } from '@/lib/utils/format'
import { toast } from '@/components/ui/Toast'
import { Modal } from '@/components/ui/Modal'
import { QT_STATUS_CONFIG } from '@/modules/sales/quotations/types/quotation.types'

interface QItem { id: string; line_no: number; product_desc: string; size_l: number | null; size_w: number | null; size_h: number | null; quantity: number; no_of_colors: number | null; unit_price: number; subtotal: number }
interface Quotation { id: string; quotation_number: string; status: string; valid_until: string | null; discount_percent: number; notes: string | null; terms_conditions: string | null; subtotal: number; tax_amount: number; discount_amount: number; total_amount: number; revision: number; created_at: string; approval_token: string | null; approval_token_expires_at: string | null; approval_responded_at: string | null; approval_ip: string | null; customers: { name: string; customer_code: string; email: string | null; phone: string | null } | null; quotation_items: QItem[] }

const STATUS_ACTIONS: Record<string, { label: string; next: string; color: string }[]> = {
  draft:    [{ label: 'Mark Sent', next: 'sent', color: 'bg-[var(--color-info)] text-white' }],
  sent:     [{ label: 'Approve', next: 'approved', color: 'bg-[var(--color-success)] text-white' }, { label: 'Reject', next: 'rejected', color: 'bg-[var(--color-danger)] text-white' }],
  approved: [],
  rejected: [{ label: 'Reactivate', next: 'draft', color: 'bg-[var(--color-accent)] text-white' }],
}

export default function QuotationDetailClient({ quotation: initial }: { quotation: Quotation }) {
  const router = useRouter()
  const [qt, setQt] = useState(initial)
  const [loading, setLoading] = useState(false)
  const [convertModal, setConvertModal] = useState(false)
  const [requiredDate, setRequiredDate] = useState('')
  const [versionsModal, setVersionsModal] = useState(false)

  const cfg = QT_STATUS_CONFIG[qt.status] || QT_STATUS_CONFIG.draft

  const updateStatus = async (status: string) => {
    setLoading(true)
    try {
      const res = await fetch(`/api/v1/quotations/${qt.id}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ status }) })
      if (!res.ok) { const e = await res.json(); throw new Error(e.error) }
      const { data } = await res.json()
      setQt(prev => ({ ...prev, status: data.status }))
      toast.success('Status updated')
    } catch (e: any) { toast.error(e.message || 'Failed') }
    finally { setLoading(false) }
  }

  const copyApprovalLink = async () => {
    const url = `${window.location.origin}/approve/${qt.approval_token}`
    try {
      await navigator.clipboard.writeText(url)
      toast.success('Approval link copied — share it with the customer')
    } catch {
      toast.error('Could not copy link')
    }
  }

  const convertToSO = async () => {
    setLoading(true)
    try {
      const res = await fetch(`/api/v1/quotations/${qt.id}/convert`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ required_date: requiredDate || null }) })
      if (!res.ok) { const e = await res.json(); throw new Error(e.error) }
      const { data } = await res.json()
      toast.success('Converted to Sales Order!')
      router.push(`/dashboard/sales-orders/${data.id}`)
    } catch (e: any) { toast.error(e.message || 'Conversion failed') }
    finally { setLoading(false); setConvertModal(false) }
  }

  return (
    <div className="max-w-5xl space-y-5">
      {/* Header */}
      <div className="flex items-center gap-3">
        <Link href="/dashboard/quotations" className="w-8 h-8 flex items-center justify-center rounded-md border border-[var(--color-border)] text-[var(--color-text-muted)] hover:bg-[var(--color-bg-elevated)] transition-colors">
          <ArrowLeft size={15} />
        </Link>
        <div className="flex-1">
          <div className="flex items-center gap-3">
            <h1 className="text-2xl font-bold text-[var(--color-text-primary)]">{qt.quotation_number}</h1>
            <span className={cn('text-xs px-2.5 py-1 rounded-full border font-medium', cfg.color)}>{cfg.label}</span>
            {qt.revision > 1 && <span className="text-xs text-[var(--color-text-muted)] bg-[var(--color-bg-elevated)] border border-[var(--color-border)] px-2 py-0.5 rounded">Rev {qt.revision}</span>}
          </div>
          <p className="text-sm text-[var(--color-text-muted)] mt-0.5">{qt.customers?.name} · Created {formatDateTime(qt.created_at)}</p>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={() => setVersionsModal(true)}
            className="flex items-center gap-1.5 px-3 h-8 rounded-md border border-[var(--color-border)] text-sm text-[var(--color-text-secondary)] hover:bg-[var(--color-bg-elevated)] transition-colors">
            <History size={13} /> Version History
          </button>
          {qt.status === 'sent' && qt.approval_token && !qt.approval_responded_at && (
            <button onClick={copyApprovalLink}
              className="flex items-center gap-1.5 px-3 h-8 rounded-md border border-[var(--color-border)] text-sm text-[var(--color-text-secondary)] hover:bg-[var(--color-bg-elevated)] transition-colors">
              <LinkIcon size={13} /> Copy Approval Link
            </button>
          )}
          {STATUS_ACTIONS[qt.status]?.map(action => (
            <button key={action.next} onClick={() => updateStatus(action.next)} disabled={loading}
              className={cn('flex items-center gap-1.5 px-3 h-8 rounded-md text-sm font-medium hover:opacity-90 disabled:opacity-50 transition-colors', action.color)}>
              {action.label}
            </button>
          ))}
          {qt.status === 'approved' && (
            <button onClick={() => setConvertModal(true)} disabled={loading}
              className="flex items-center gap-1.5 px-4 h-8 rounded-md bg-[var(--color-success)] text-white text-sm font-medium hover:opacity-90 transition-colors">
              <ArrowRight size={14} /> Convert to SO
            </button>
          )}
        </div>
      </div>

      {/* Customer + Summary */}
      <div className="grid grid-cols-2 gap-4">
        <div className="rounded-xl border border-[var(--color-border)] bg-[var(--color-bg-secondary)] p-5">
          <h3 className="text-xs font-semibold text-[var(--color-text-muted)] uppercase tracking-wider mb-3">Customer</h3>
          <p className="text-base font-semibold text-[var(--color-text-primary)]">{qt.customers?.name}</p>
          <p className="text-sm text-[var(--color-text-muted)]">{qt.customers?.customer_code}</p>
          {qt.customers?.phone && <p className="text-sm text-[var(--color-text-secondary)] mt-1">{qt.customers.phone}</p>}
          {qt.customers?.email && <p className="text-sm text-[var(--color-text-secondary)]">{qt.customers.email}</p>}
        </div>
        <div className="rounded-xl border border-[var(--color-border)] bg-[var(--color-bg-secondary)] p-5">
          <h3 className="text-xs font-semibold text-[var(--color-text-muted)] uppercase tracking-wider mb-3">Summary</h3>
          <div className="space-y-2">
            {[
              { label: 'Valid Until', value: qt.valid_until ? formatDate(qt.valid_until) : '—' },
              { label: 'Items', value: qt.quotation_items.length },
              { label: 'Discount', value: qt.discount_percent ? `${qt.discount_percent}%` : '—' },
            ].map(f => (
              <div key={f.label} className="flex justify-between text-sm">
                <span className="text-[var(--color-text-muted)]">{f.label}</span>
                <span className="text-[var(--color-text-primary)]">{f.value}</span>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Line items */}
      <div className="rounded-xl border border-[var(--color-border)] bg-[var(--color-bg-secondary)] overflow-hidden">
        <div className="px-5 py-4 border-b border-[var(--color-border)] bg-[var(--color-bg-elevated)]">
          <h2 className="text-sm font-semibold text-[var(--color-text-primary)]">Line Items</h2>
        </div>
        <div className="divide-y divide-[var(--color-border-subtle)]">
          {qt.quotation_items.map((item, idx) => (
            <div key={item.id} className={cn('px-5 py-3.5 grid grid-cols-12 gap-3 items-center', idx % 2 === 1 && 'bg-[var(--color-bg-elevated)]/15')}>
              <div className="col-span-1 text-xs text-[var(--color-text-muted)]">#{item.line_no}</div>
              <div className="col-span-4">
                <p className="text-sm font-medium text-[var(--color-text-primary)]">{item.product_desc}</p>
                {(item.size_l || item.size_w || item.size_h) && (
                  <p className="text-xs text-[var(--color-text-muted)] mt-0.5">{[item.size_l, item.size_w, item.size_h].filter(Boolean).join(' × ')} mm</p>
                )}
              </div>
              <div className="col-span-2 text-sm text-[var(--color-text-secondary)]">
                {item.quantity} pcs {item.no_of_colors ? `· ${item.no_of_colors}C` : ''}
              </div>
              <div className="col-span-2 text-sm text-[var(--color-text-secondary)]">
                PKR {Number(item.unit_price).toLocaleString()}
              </div>
              <div className="col-span-3 text-right text-sm font-semibold text-[var(--color-text-primary)]">
                PKR {Number(item.subtotal).toLocaleString()}
              </div>
            </div>
          ))}
        </div>
        {/* Totals */}
        <div className="px-5 py-4 border-t border-[var(--color-border)] bg-[var(--color-bg-elevated)]/50 flex justify-end">
          <div className="w-64 space-y-2">
            <div className="flex justify-between text-sm text-[var(--color-text-secondary)]">
              <span>Subtotal</span><span>PKR {Number(qt.subtotal).toLocaleString()}</span>
            </div>
            {Number(qt.discount_amount) > 0 && (
              <div className="flex justify-between text-sm text-[var(--color-danger)]">
                <span>Discount ({qt.discount_percent}%)</span><span>- PKR {Number(qt.discount_amount).toLocaleString()}</span>
              </div>
            )}
            <div className="flex justify-between text-base font-bold text-[var(--color-text-primary)] pt-2 border-t border-[var(--color-border)]">
              <span>Total</span><span>PKR {Number(qt.total_amount).toLocaleString()}</span>
            </div>
          </div>
        </div>
      </div>

      {qt.notes && (
        <div className="rounded-xl border border-[var(--color-border)] bg-[var(--color-bg-secondary)] p-5">
          <h3 className="text-xs font-semibold text-[var(--color-text-muted)] uppercase tracking-wider mb-2">Notes</h3>
          <p className="text-sm text-[var(--color-text-secondary)]">{qt.notes}</p>
        </div>
      )}

      {/* Convert to SO Modal */}
      <Modal open={convertModal} onClose={() => setConvertModal(false)} title="Convert to Sales Order" size="sm"
        footer={
          <>
            <button onClick={() => setConvertModal(false)} className="px-4 h-9 rounded-md border border-[var(--color-border)] text-sm text-[var(--color-text-secondary)] hover:bg-[var(--color-bg-elevated)] transition-colors">Cancel</button>
            <button onClick={convertToSO} disabled={loading} className="flex items-center gap-2 px-4 h-9 rounded-md bg-[var(--color-success)] text-white text-sm font-medium hover:opacity-90 disabled:opacity-50 transition-colors">
              <ArrowRight size={14} /> {loading ? 'Converting…' : 'Convert to SO'}
            </button>
          </>
        }>
        <div className="space-y-4">
          <p className="text-sm text-[var(--color-text-secondary)]">
            This will create a Sales Order from quotation <strong>{qt.quotation_number}</strong> and mark it as converted.
          </p>
          <div className="space-y-1.5">
            <label className="text-sm font-medium text-[var(--color-text-primary)]">Required Delivery Date</label>
            <input type="date" value={requiredDate} onChange={e => setRequiredDate(e.target.value)}
              className="w-full h-9 px-3 rounded-md border text-sm bg-[var(--color-bg-elevated)] text-[var(--color-text-primary)] border-[var(--color-border)] focus:outline-none focus:border-[var(--color-accent)] focus:ring-1 focus:ring-[var(--color-accent)] transition-colors" />
          </div>
        </div>
      </Modal>

      <Modal open={versionsModal} onClose={() => setVersionsModal(false)} title="Version History" size="xl">
        <VersionHistoryView quotationId={qt.id} />
      </Modal>
    </div>
  )
}

interface VersionSnapshot {
  id: string; version_number: number; created_at: string | null; is_current?: boolean
  users?: { full_name: string } | null
  snapshot: {
    header: { status: string; subtotal: number; discount_percent: number; total_amount: number; notes: string | null; terms_conditions: string | null }
    items: { product_desc: string; quantity: number; unit_price: number; subtotal: number }[]
  }
}

const fmt = (n: number) => `PKR ${Number(n || 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`

function VersionHistoryView({ quotationId }: { quotationId: string }) {
  const [versions, setVersions] = useState<VersionSnapshot[]>([])
  const [loading, setLoading] = useState(true)
  const [leftIdx, setLeftIdx] = useState(1)
  const [rightIdx, setRightIdx] = useState(0)

  useState(() => {
    fetch(`/api/v1/quotations/${quotationId}/versions`)
      .then(r => r.json())
      .then(json => setVersions(json.data ?? []))
      .finally(() => setLoading(false))
  })

  if (loading) return <p className="text-sm text-[var(--color-text-muted)] text-center py-10">Loading…</p>
  if (versions.length <= 1) {
    return <p className="text-sm text-[var(--color-text-muted)] text-center py-10">This quotation has only one version so far — a new version is captured every time items or pricing are edited.</p>
  }

  const left = versions[leftIdx]
  const right = versions[rightIdx]

  // Diff items by description — printing quotations don't have a stable
  // line-item ID across edits (items are wholesale-replaced on each save,
  // not patched in place), so description is the practical join key.
  const leftItems = new Map(left.snapshot.items.map(i => [i.product_desc, i]))
  const rightItems = new Map(right.snapshot.items.map(i => [i.product_desc, i]))
  const allDescs = Array.from(new Set([...Array.from(leftItems.keys()), ...Array.from(rightItems.keys())]))

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3">
        <select value={leftIdx} onChange={e => setLeftIdx(parseInt(e.target.value))}
          className="h-9 px-3 rounded-md border text-sm bg-[var(--color-bg-elevated)] text-[var(--color-text-primary)] border-[var(--color-border)]">
          {versions.map((v, i) => <option key={v.id} value={i}>v{v.version_number}{v.is_current ? ' (current)' : ''} — {v.created_at ? new Date(v.created_at).toLocaleDateString('en-PK') : 'now'}</option>)}
        </select>
        <span className="text-xs text-[var(--color-text-muted)]">compared to</span>
        <select value={rightIdx} onChange={e => setRightIdx(parseInt(e.target.value))}
          className="h-9 px-3 rounded-md border text-sm bg-[var(--color-bg-elevated)] text-[var(--color-text-primary)] border-[var(--color-border)]">
          {versions.map((v, i) => <option key={v.id} value={i}>v{v.version_number}{v.is_current ? ' (current)' : ''} — {v.created_at ? new Date(v.created_at).toLocaleDateString('en-PK') : 'now'}</option>)}
        </select>
      </div>

      <div className="grid grid-cols-2 gap-3 text-sm">
        {[right, left].map((v, col) => (
          <div key={col} className="rounded-lg border border-[var(--color-border)] p-3">
            <p className="text-xs font-semibold text-[var(--color-text-muted)] uppercase mb-2">v{v.version_number}{v.is_current ? ' (current)' : ''}</p>
            <p className="text-[var(--color-text-secondary)]">Total: <b className="text-[var(--color-text-primary)]">{fmt(v.snapshot.header.total_amount)}</b></p>
            <p className="text-[var(--color-text-secondary)]">Discount: {v.snapshot.header.discount_percent || 0}%</p>
            <p className="text-[var(--color-text-secondary)]">Status: <span className="capitalize">{v.snapshot.header.status}</span></p>
          </div>
        ))}
      </div>

      <div className="rounded-lg border border-[var(--color-border)] overflow-hidden">
        <div className="grid grid-cols-12 gap-2 px-3 py-2 bg-[var(--color-bg-elevated)] text-xs font-semibold text-[var(--color-text-muted)] uppercase">
          <div className="col-span-6">Item</div>
          <div className="col-span-3 text-right">v{right.version_number}</div>
          <div className="col-span-3 text-right">v{left.version_number}</div>
        </div>
        <div className="divide-y divide-[var(--color-border-subtle)]">
          {allDescs.map(desc => {
            const r = rightItems.get(desc)
            const l = leftItems.get(desc)
            const added = !r && l
            const removed = r && !l
            const changed = r && l && (r.quantity !== l.quantity || r.unit_price !== l.unit_price)
            return (
              <div key={desc} className={cn('grid grid-cols-12 gap-2 px-3 py-2 items-center text-sm',
                added && 'bg-[var(--color-success)]/5', removed && 'bg-[var(--color-danger)]/5', changed && 'bg-[var(--color-warning)]/5')}>
                <div className="col-span-6 text-[var(--color-text-primary)] truncate">
                  {desc} {added && <span className="text-[var(--color-success)] text-xs ml-1">(new)</span>}
                  {removed && <span className="text-[var(--color-danger)] text-xs ml-1">(removed)</span>}
                </div>
                <div className="col-span-3 text-right text-[var(--color-text-secondary)]">
                  {r ? `${r.quantity.toLocaleString()} × ${fmt(r.unit_price)}` : '—'}
                </div>
                <div className={cn('col-span-3 text-right', changed ? 'text-[var(--color-warning)] font-medium' : 'text-[var(--color-text-secondary)]')}>
                  {l ? `${l.quantity.toLocaleString()} × ${fmt(l.unit_price)}` : '—'}
                </div>
              </div>
            )
          })}
        </div>
      </div>
    </div>
  )
}
