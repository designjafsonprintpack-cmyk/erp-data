'use client'
import { useState, useEffect } from 'react'
import Link from 'next/link'
import { ArrowLeft, Pencil, FileText, Calendar, User, CheckCircle, XCircle, Printer, Truck, Receipt, RefreshCw } from 'lucide-react'
import { cn } from '@/lib/utils/cn'
import { toast } from '@/components/ui/Toast'
import { MoneyGate } from '@/components/ui/MoneyGate'
import { formatDate, formatDateTime } from '@/lib/utils/format'
import { SO_STATUS_CONFIG } from '@/modules/sales/sales-orders/types/so.types'
import { ConfirmDialog } from '@/components/ui/Modal'
import { useRouter } from 'next/navigation'

interface SOItem { id: string; line_no: number; product_desc: string; size_l: number | null; size_w: number | null; size_h: number | null; quantity: number; no_of_colors: number | null; unit_price: number; subtotal: number; notes: string | null
  /** 141 — bhara hua = REPEAT. Embed HINTED aata hai, warna query hi nakaam. */
  repeat_of_job_id?: string | null
  jobs?: { job_number: string; job_title: string } | null
  /** Is line se jo job BANI. Confirm par khud banti hai (repeat lines par). */
  created_jobs?: { id: string; job_number: string; status: string; deleted_at: string | null }[] | null }
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
  const [confirmOpen, setConfirmOpen] = useState(false)
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

  // Jis line ki job ban chuki hai. Soft-delete hui job ginti mein nahi — warna
  // ek delete ki hui job us line ko hamesha ke liye "ho chuki" dikhati rehti.
  const jobOf = (item: SOItem) => (item.created_jobs ?? []).find(j => !j.deleted_at) || null
  const pendingLines = so.sales_order_items.filter(i => !jobOf(i))
  const repeatPending = pendingLines.filter(i => i.repeat_of_job_id).length
  const newPending    = pendingLines.filter(i => !i.repeat_of_job_id).length

  /**
   * Confirm — aur isi par repeat lines ki jobs ban jati hain.
   * Confirmed SO par bhi chalaya ja sakta hai: route sirf wohi lines banata hai
   * jinki job abhi nahi bani, is liye baad mein joRi gayi line bhi pakri jati
   * hai aur dobara dabane se kuch dohra nahi hota.
   */
  const confirmSO = async () => {
    setLoading(true)
    try {
      const res = await fetch(`/api/v1/sales-orders/${so.id}/confirm`, { method: 'POST' })
      const json = await res.json()
      if (!res.ok) throw new Error(json.error || 'Failed to confirm')
      const d = json.data
      // Ginti ke saath batao — "ho gaya" se ye pata nahi chalta ke kitni jobs
      // bani aur kitni ab bhi haath se banani hain.
      const bits: string[] = []
      if (d.created.length) bits.push(`${d.created.length} job ban gayi (${d.created.map((c: any) => c.job_number).join(', ')})`)
      if (d.pending.length) bits.push(`${d.pending.length} nayi carton line ki job haath se banani hai`)
      if (d.failed.length)  bits.push(`${d.failed.length} line par job nahi ban saki`)
      if (d.failed.length) toast.error(bits.join(' · '))
      else toast.success(bits.length ? bits.join(' · ') : 'Sales Order confirmed')
      router.refresh()
    } catch (e: any) { toast.error(e.message || 'Failed to confirm') }
    finally { setLoading(false); setConfirmOpen(false) }
  }

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
              {isUrgent && <span className="text-xs text-[var(--color-danger)] bg-[color:color-mix(in_srgb,var(--color-danger)_10%,transparent)] border border-[color:color-mix(in_srgb,var(--color-danger)_20%,transparent)] px-2 py-0.5 rounded-full">⚠️ Urgent</span>}
            </div>
            <p className="text-sm text-[var(--color-text-muted)] mt-0.5">Created {formatDateTime(so.created_at)}</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {/* CONFIRM — draft ka asal maqsad yehi hai. Dabate hi har repeat line
              ki job khud ban jati hai. Confirmed SO par button tab bhi rehta
              hai jab kisi line ki job baqi ho (line baad mein joRi gayi, ya
              pehli dafa kuch nakaam hua) — route dohra kuch nahi banata. */}
          {so.status !== 'cancelled' && (so.status === 'draft' || repeatPending > 0) && (
            <button onClick={() => setConfirmOpen(true)} disabled={loading}
              className="flex items-center gap-1.5 px-3 h-11 md:h-8 rounded-md bg-[var(--color-accent)] text-[var(--color-on-accent)] text-sm font-medium hover:bg-[var(--color-accent-hover)] disabled:opacity-60 transition-colors">
              <CheckCircle size={14} /> {so.status === 'draft' ? 'Confirm' : `Create ${repeatPending} job${repeatPending === 1 ? '' : 's'}`}
            </button>
          )}
          {/* Chhapa hua SO ab priced document nahi raha — us par koi rate, koi
              subtotal, koi total nahi. Is liye MoneyGate hata diya gaya: ye
              kaghaz production aur customer ke liye order ki tasdeeq hai, aur
              planning, store aur dispatch ko bhi ye nikalna parta hai. Rate
              wapas aaya to gate yahan AUR route par, dono jagah lagta hai. */}
          <button onClick={() => window.open(`/api/v1/print/so?id=${so.id}`, '_blank')} className="flex items-center gap-1.5 px-3 h-11 md:h-8 rounded-md border border-[var(--color-border)] text-sm text-[var(--color-text-secondary)] hover:bg-[var(--color-bg-elevated)] transition-colors">
            <Printer size={14} /> Print
          </button>
          {!['cancelled', 'dispatched'].includes(so.status) && (
            <Link href={`/dashboard/sales-orders/${so.id}/edit`} className="flex items-center gap-1.5 px-3 h-8 rounded-md border border-[var(--color-border)] text-sm text-[var(--color-text-secondary)] hover:bg-[var(--color-bg-elevated)] transition-colors">
              <Pencil size={14} /> Edit
            </Link>
          )}
          {!['cancelled', 'dispatched', 'completed'].includes(so.status) && (
            <button onClick={() => setCancelOpen(true)} className="flex items-center gap-1.5 px-3 h-11 md:h-8 rounded-md border border-[color:color-mix(in_srgb,var(--color-danger)_30%,transparent)] text-sm text-[var(--color-danger)] hover:bg-[color:color-mix(in_srgb,var(--color-danger)_10%,transparent)] transition-colors">
              <XCircle size={14} /> Cancel
            </button>
          )}
        </div>
      </div>

      {/* Info cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
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

        {/* Financials — the whole card, heading included. */}
        <MoneyGate scope="sales" hide>
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
        </MoneyGate>
      </div>

      {/* Special instructions */}
      {so.special_instructions && (
        <div className="rounded-xl border border-[color:color-mix(in_srgb,var(--color-warning)_20%,transparent)] bg-[color:color-mix(in_srgb,var(--color-warning)_5%,transparent)] px-5 py-3">
          <p className="text-xs font-semibold text-[var(--color-warning)] uppercase tracking-wider mb-1">Special Instructions</p>
          <p className="text-sm text-[var(--color-text-primary)]">{so.special_instructions}</p>
        </div>
      )}

      {/* Line items */}
      <div className="rounded-xl border border-[var(--color-border)] bg-[var(--color-bg-secondary)] overflow-hidden">
        <div className="px-5 py-3.5 border-b border-[var(--color-border)] bg-[var(--color-bg-elevated)]">
          <h2 className="text-sm font-semibold text-[var(--color-text-primary)]">Line Items ({so.sales_order_items.length})</h2>
          {/* Wahi ginti jo SO banate waqt dikhti hai, taake baad mein kholne
              par bhi ek nazar mein pata chale. */}
          {so.sales_order_items.length > 0 && (() => {
            const rep = so.sales_order_items.filter(i => i.repeat_of_job_id).length
            const nw = so.sales_order_items.length - rep
            return (
              <span className="ml-2 text-xs text-[var(--color-text-muted)]">
                {rep > 0 && <span className="text-[var(--color-info)] font-medium">{rep} repeat</span>}
                {rep > 0 && nw > 0 && ' · '}
                {nw > 0 && <span className="text-[var(--color-text-secondary)] font-medium">{nw} new</span>}
              </span>
            )
          })()}
        </div>
        <div className="grid gap-0" style={{ gridTemplateColumns: '2.5fr 1fr 1fr 1fr 1fr 1fr 1.5fr' }}>
          {/* Header */}
          <div className="contents">
            {['Description', 'Size (mm)', 'Qty', 'Colors', 'Unit Price', 'Subtotal', 'Fulfillment'].map((h, i) => (
              <div key={i} className="px-5 py-2 bg-[color:color-mix(in_srgb,var(--color-bg-elevated)_60%,transparent)] border-b border-[var(--color-border-subtle)] text-xs font-semibold text-[var(--color-text-muted)] uppercase tracking-wider">{h}</div>
            ))}
          </div>
          {so.sales_order_items.map((item, idx) => (
            <div key={item.id} className={cn('contents', idx % 2 === 1 && 'bg-[color:color-mix(in_srgb,var(--color-bg-elevated)_10%,transparent)]')}>
              <div className="px-5 py-3 flex items-center border-b border-[var(--color-border-subtle)]">
                <div>
                  <p className="text-sm font-medium text-[var(--color-text-primary)]">{item.product_desc}</p>
                  {/* Repeat hai ya naya — aur repeat hai to KIS carton ka. */}
                  <p className="mt-0.5 flex items-center gap-1.5 flex-wrap">
                    {item.repeat_of_job_id ? (
                      <>
                        <span className="inline-flex items-center gap-1 text-[10px] px-1.5 py-0.5 rounded border font-medium
                          text-[var(--color-info)]
                          bg-[color:color-mix(in_srgb,var(--color-info)_10%,transparent)]
                          border-[color:color-mix(in_srgb,var(--color-info)_30%,transparent)]">
                          <RefreshCw size={9} /> Repeat
                        </span>
                        {item.jobs?.job_number && (
                          <Link href={`/dashboard/jobs/${item.repeat_of_job_id}`}
                            className="text-[11px] font-mono text-[var(--color-accent)] hover:underline">
                            {item.jobs.job_number}
                          </Link>
                        )}
                      </>
                    ) : (
                      <span className="text-[10px] px-1.5 py-0.5 rounded border font-medium
                        text-[var(--color-text-muted)] bg-[var(--color-bg-elevated)] border-[var(--color-border)]">
                        New
                      </span>
                    )}
                    {/* IS line ki job ban chuki ya nahi. Pehle SO se ye dekhne
                        ka koi tareeqa hi nahi tha — saat line wali SO par ek
                        line ki job bhool jana bohot asaan tha.
                        Nayi carton line par job khud nahi banti: us par `ups`
                        chahiye, jo §4 ke mutabiq hamesha estimator ka apna
                        faisla hai. Is liye yahan seedha New Job ka raasta. */}
                    {jobOf(item) ? (
                      <Link href={`/dashboard/jobs/${jobOf(item)!.id}`}
                        className="inline-flex items-center gap-1 text-[10px] px-1.5 py-0.5 rounded border font-medium font-mono
                          text-[var(--color-success)]
                          bg-[color:color-mix(in_srgb,var(--color-success)_10%,transparent)]
                          border-[color:color-mix(in_srgb,var(--color-success)_30%,transparent)] hover:underline">
                        <CheckCircle size={9} /> {jobOf(item)!.job_number}
                      </Link>
                    ) : so.status !== 'cancelled' && !item.repeat_of_job_id ? (
                      <Link href="/dashboard/jobs/new"
                        className="inline-flex items-center gap-1 text-[10px] px-1.5 py-0.5 rounded border font-medium
                          text-[var(--color-warning)]
                          bg-[color:color-mix(in_srgb,var(--color-warning)_10%,transparent)]
                          border-[color:color-mix(in_srgb,var(--color-warning)_30%,transparent)] hover:underline">
                        Job banao
                      </Link>
                    ) : null}
                  </p>
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
                <MoneyGate scope="sales">
                  <span className="text-sm text-[var(--color-text-primary)]">{Number(item.unit_price).toLocaleString()}</span>
                </MoneyGate>
              </div>
              <div className="px-5 py-3 flex items-center border-b border-[var(--color-border-subtle)]">
                <MoneyGate scope="sales">
                  <span className="text-sm font-semibold text-[var(--color-text-primary)]">{Number(item.subtotal).toLocaleString()}</span>
                </MoneyGate>
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

      {/* Confirm ke nateeje ginn kar dikhaye jate hain — "confirm karein?"
          poochna kaafi nahi jab us par jobs ban rahi hon. Nayi carton wali
          lines ka bhi zikr hai, warna wo khamoshi se reh jati hain. */}
      <ConfirmDialog
        open={confirmOpen} onClose={() => setConfirmOpen(false)} onConfirm={confirmSO}
        title={so.status === 'draft' ? `Confirm ${so.so_number}?` : 'Create the pending jobs?'}
        message={[
          so.status === 'draft'
            ? 'Confirm hone ke baad ye order production ka hukm ban jata hai.'
            : 'Is order ki jin lines ki job abhi nahi bani, sirf wohi banengi.',
          repeatPending > 0
            ? `${repeatPending} repeat line ki job KHUD ban jayegi — purani job se saare specs, artwork aur board demand ke saath.`
            : 'Koi repeat line baqi nahi — is order par khud koi job nahi banegi.',
          newPending > 0
            ? `${newPending} nayi carton line ki job haath se banani hogi (ups aur die number chahiye).`
            : '',
        ].filter(Boolean).join('\n\n')}
        confirmLabel={so.status === 'draft' ? 'Confirm' : 'Create jobs'} loading={loading}
      />
      <ConfirmDialog
        open={cancelOpen} onClose={() => setCancelOpen(false)} onConfirm={cancelSO}
        title="Cancel Sales Order"
        message={`Cancel ${so.so_number}? This will mark the order as cancelled. This action cannot be undone.`}
        confirmLabel="Cancel Order" loading={loading}
      />
    </div>
  )
}
