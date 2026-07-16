'use client'
import { useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { ArrowLeft, Plus, Trash2, Save, Calculator } from 'lucide-react'
import { cn } from '@/lib/utils/cn'
import { toast } from '@/components/ui/Toast'

interface Customer { id: string; name: string; customer_code: string }
interface BoardType { id: string; name: string }
interface LineItem { product_desc: string; size_l: string; size_w: string; size_h: string; quantity: string; no_of_colors: string; board_type_id: string; unit_price: string; notes: string }

const EMPTY_LINE: LineItem = { product_desc: '', size_l: '', size_w: '', size_h: '', quantity: '1', no_of_colors: '4', board_type_id: '', unit_price: '0', notes: '' }

interface Props { mode: 'new' | 'edit'; customers: Customer[]; boardTypes: BoardType[]; initialData?: any }

export default function QuotationFormClient({ mode, customers, boardTypes, initialData }: Props) {
  const router = useRouter()
  const [form, setForm] = useState({
    customer_id: initialData?.customer_id || '',
    valid_until: initialData?.valid_until || '',
    discount_percent: String(initialData?.discount_percent || '0'),
    notes: initialData?.notes || '',
    terms_conditions: initialData?.terms_conditions || '',
  })
  const [items, setItems] = useState<LineItem[]>(
    initialData?.quotation_items?.map((i: any) => ({
      product_desc: i.product_desc, size_l: String(i.size_l || ''), size_w: String(i.size_w || ''),
      size_h: String(i.size_h || ''), quantity: String(i.quantity), no_of_colors: String(i.no_of_colors || 4),
      board_type_id: i.board_type_id || '', unit_price: String(i.unit_price), notes: i.notes || '',
    })) || [{ ...EMPTY_LINE }]
  )
  const [loading, setLoading] = useState(false)

  const set = (k: string, v: string) => setForm(p => ({ ...p, [k]: v }))
  const setItem = (idx: number, k: keyof LineItem, v: string) => setItems(prev => prev.map((item, i) => i === idx ? { ...item, [k]: v } : item))
  const addLine = () => setItems(prev => [...prev, { ...EMPTY_LINE }])
  const removeLine = (idx: number) => setItems(prev => prev.filter((_, i) => i !== idx))

  const inputCls = 'w-full h-9 px-2.5 rounded-md border text-sm bg-[var(--color-bg-elevated)] text-[var(--color-text-primary)] border-[var(--color-border)] focus:outline-none focus:border-[var(--color-accent)] focus:ring-1 focus:ring-[var(--color-accent)] transition-colors'

  // Computed totals
  const subtotal = items.reduce((sum, item) => sum + (parseFloat(item.quantity || '0') * parseFloat(item.unit_price || '0')), 0)
  const discountAmt = subtotal * (parseFloat(form.discount_percent || '0') / 100)
  const total = subtotal - discountAmt

  const save = async (status = 'draft') => {
    if (!form.customer_id) { toast.error('Please select a customer'); return }
    if (!items.some(i => i.product_desc)) { toast.error('Add at least one line item'); return }
    setLoading(true)
    try {
      const payload = {
        ...form,
        discount_percent: parseFloat(form.discount_percent || '0'),
        subtotal, discount_amount: discountAmt, tax_amount: 0, total_amount: total,
        status,
        items: items.filter(i => i.product_desc).map(item => ({
          product_desc: item.product_desc,
          size_l: item.size_l ? parseFloat(item.size_l) : null,
          size_w: item.size_w ? parseFloat(item.size_w) : null,
          size_h: item.size_h ? parseFloat(item.size_h) : null,
          quantity: parseFloat(item.quantity || '1'),
          no_of_colors: parseInt(item.no_of_colors || '4'),
          board_type_id: item.board_type_id || null,
          unit_price: parseFloat(item.unit_price || '0'),
          subtotal: parseFloat(item.quantity || '1') * parseFloat(item.unit_price || '0'),
          notes: item.notes || null,
        })),
      }
      const url = mode === 'new' ? '/api/v1/quotations' : `/api/v1/quotations/${initialData?.id}`
      const res = await fetch(url, { method: mode === 'new' ? 'POST' : 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) })
      if (!res.ok) { const e = await res.json(); throw new Error(e.error) }
      const { data } = await res.json()
      toast.success(mode === 'new' ? 'Quotation created' : 'Quotation updated')
      router.push(`/dashboard/quotations/${data.id}`)
    } catch (e: any) { toast.error(e.message || 'Failed') }
    finally { setLoading(false) }
  }

  return (
    <div className="max-w-6xl space-y-6">
      <div className="flex items-center gap-3">
        <Link href="/dashboard/quotations" className="w-8 h-8 flex items-center justify-center rounded-md border border-[var(--color-border)] text-[var(--color-text-muted)] hover:bg-[var(--color-bg-elevated)] transition-colors">
          <ArrowLeft size={15} />
        </Link>
        <div>
          <h1 className="text-2xl font-bold text-[var(--color-text-primary)]">{mode === 'new' ? 'New Quotation' : 'Edit Quotation'}</h1>
          <p className="text-sm text-[var(--color-text-muted)] mt-0.5">Quotation number will be auto-generated</p>
        </div>
      </div>

      {/* Header fields */}
      <div className="rounded-xl border border-[var(--color-border)] bg-[var(--color-bg-secondary)] overflow-hidden">
        <div className="px-5 py-4 border-b border-[var(--color-border)] bg-[var(--color-bg-elevated)]">
          <h2 className="text-sm font-semibold text-[var(--color-text-primary)]">Quotation Details</h2>
        </div>
        <div className="p-5 grid grid-cols-3 gap-4">
          <div className="space-y-1.5">
            <label className="text-sm font-medium text-[var(--color-text-primary)]">Customer <span className="text-[var(--color-danger)]">*</span></label>
            <select className={inputCls} value={form.customer_id} onChange={e => set('customer_id', e.target.value)}>
              <option value="">Select customer…</option>
              {customers.map(c => <option key={c.id} value={c.id}>{c.name} ({c.customer_code})</option>)}
            </select>
          </div>
          <div className="space-y-1.5">
            <label className="text-sm font-medium text-[var(--color-text-primary)]">Valid Until</label>
            <input type="date" className={inputCls} value={form.valid_until} onChange={e => set('valid_until', e.target.value)} />
          </div>
          <div className="space-y-1.5">
            <label className="text-sm font-medium text-[var(--color-text-primary)]">Discount %</label>
            <input type="number" className={inputCls} value={form.discount_percent} onChange={e => set('discount_percent', e.target.value)} min="0" max="100" step="0.5" />
          </div>
          <div className="space-y-1.5">
            <label className="text-sm font-medium text-[var(--color-text-primary)]">Notes</label>
            <input className={inputCls} value={form.notes} onChange={e => set('notes', e.target.value)} placeholder="Customer-visible notes" />
          </div>
          <div className="col-span-2 space-y-1.5">
            <label className="text-sm font-medium text-[var(--color-text-primary)]">Terms & Conditions</label>
            <input className={inputCls} value={form.terms_conditions} onChange={e => set('terms_conditions', e.target.value)} placeholder="Payment terms, delivery conditions, etc." />
          </div>
        </div>
      </div>

      {/* Line items */}
      <div className="rounded-xl border border-[var(--color-border)] bg-[var(--color-bg-secondary)] overflow-hidden">
        <div className="flex items-center justify-between px-5 py-4 border-b border-[var(--color-border)] bg-[var(--color-bg-elevated)]">
          <h2 className="text-sm font-semibold text-[var(--color-text-primary)]">Line Items</h2>
          <button onClick={addLine} className="flex items-center gap-1.5 px-3 h-8 rounded-md border border-[var(--color-border)] text-sm text-[var(--color-text-secondary)] hover:bg-[var(--color-bg-elevated)] hover:text-[var(--color-text-primary)] transition-colors">
            <Plus size={14} /> Add Line
          </button>
        </div>

        {/* Column headers */}
        <div className="grid grid-cols-12 gap-2 px-4 py-2 bg-[var(--color-bg-elevated)]/50 border-b border-[var(--color-border-subtle)] text-xs font-semibold text-[var(--color-text-muted)] uppercase tracking-wider">
          <div className="col-span-3">Description</div>
          <div className="col-span-3">L × W × H (mm)</div>
          <div className="col-span-1">Qty</div>
          <div className="col-span-1">Colors</div>
          <div className="col-span-1">Board Type</div>
          <div className="col-span-1">Unit Price</div>
          <div className="col-span-1 text-right">Subtotal</div>
          <div className="col-span-1"></div>
        </div>

        <div className="divide-y divide-[var(--color-border-subtle)]">
          {items.map((item, idx) => {
            const lineTotal = parseFloat(item.quantity || '0') * parseFloat(item.unit_price || '0')
            return (
              <div key={idx} className="grid grid-cols-12 gap-2 px-4 py-3 items-center">
                <div className="col-span-3">
                  <input className={inputCls} value={item.product_desc} onChange={e => setItem(idx, 'product_desc', e.target.value)} placeholder="Product description *" />
                </div>
                <div className="col-span-3 flex items-center gap-1">
                  <input className={cn(inputCls, 'text-center')} type="number" value={item.size_l} onChange={e => setItem(idx, 'size_l', e.target.value)} placeholder="L" />
                  <span className="text-[var(--color-text-muted)] flex-shrink-0 text-xs">×</span>
                  <input className={cn(inputCls, 'text-center')} type="number" value={item.size_w} onChange={e => setItem(idx, 'size_w', e.target.value)} placeholder="W" />
                  <span className="text-[var(--color-text-muted)] flex-shrink-0 text-xs">×</span>
                  <input className={cn(inputCls, 'text-center')} type="number" value={item.size_h} onChange={e => setItem(idx, 'size_h', e.target.value)} placeholder="H" />
                </div>
                <div className="col-span-1">
                  <input className={inputCls} type="number" value={item.quantity} onChange={e => setItem(idx, 'quantity', e.target.value)} placeholder="Qty" />
                </div>
                <div className="col-span-1">
                  <input className={inputCls} type="number" value={item.no_of_colors} onChange={e => setItem(idx, 'no_of_colors', e.target.value)} min="1" max="8" />
                </div>
                <div className="col-span-1">
                  <select className={inputCls} value={item.board_type_id} onChange={e => setItem(idx, 'board_type_id', e.target.value)}>
                    <option value="">Select board…</option>
                    {boardTypes.map(b => <option key={b.id} value={b.id}>{b.name}</option>)}
                  </select>
                </div>
                <div className="col-span-1">
                  <input className={inputCls} type="number" value={item.unit_price} onChange={e => setItem(idx, 'unit_price', e.target.value)} placeholder="0.00" />
                </div>
                <div className="col-span-1 text-right">
                  <span className="text-sm font-semibold text-[var(--color-text-primary)]">
                    {lineTotal > 0 ? `PKR ${lineTotal.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}` : '—'}
                  </span>
                </div>
                <div className="col-span-1 flex justify-end">
                  {items.length > 1 && (
                    <button onClick={() => removeLine(idx)} className="w-7 h-7 flex items-center justify-center rounded text-[var(--color-text-muted)] hover:bg-[var(--color-danger)]/10 hover:text-[var(--color-danger)] transition-colors">
                      <Trash2 size={13} />
                    </button>
                  )}
                </div>
              </div>
            )
          })}
        </div>

        {/* Totals */}
        <div className="px-5 py-4 border-t border-[var(--color-border)] bg-[var(--color-bg-elevated)]/50">
          <div className="flex justify-end">
            <div className="w-72 space-y-2">
              <div className="flex justify-between text-sm text-[var(--color-text-secondary)]">
                <span>Subtotal</span>
                <span>PKR {subtotal.toLocaleString(undefined, { minimumFractionDigits: 2 })}</span>
              </div>
              {discountAmt > 0 && (
                <div className="flex justify-between text-sm text-[var(--color-danger)]">
                  <span>Discount ({form.discount_percent}%)</span>
                  <span>- PKR {discountAmt.toLocaleString(undefined, { minimumFractionDigits: 2 })}</span>
                </div>
              )}
              <div className="flex justify-between text-base font-bold text-[var(--color-text-primary)] pt-2 border-t border-[var(--color-border)]">
                <span>Total</span>
                <span>PKR {total.toLocaleString(undefined, { minimumFractionDigits: 2 })}</span>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Actions */}
      <div className="flex items-center gap-3 justify-end">
        <Link href="/dashboard/quotations" className="px-4 h-9 rounded-md border border-[var(--color-border)] text-sm text-[var(--color-text-secondary)] hover:bg-[var(--color-bg-elevated)] transition-colors">Cancel</Link>
        <button onClick={() => save('draft')} disabled={loading}
          className="flex items-center gap-2 px-4 h-9 rounded-md border border-[var(--color-border)] text-sm text-[var(--color-text-secondary)] hover:bg-[var(--color-bg-elevated)] disabled:opacity-50 transition-colors">
          Save as Draft
        </button>
        <button onClick={() => save('sent')} disabled={loading}
          className="flex items-center gap-2 px-5 h-9 rounded-md bg-[var(--color-accent)] text-white text-sm font-medium hover:bg-[var(--color-accent-hover)] disabled:opacity-50 transition-colors">
          <Save size={15} /> {loading ? 'Saving…' : 'Save & Mark Sent'}
        </button>
      </div>
    </div>
  )
}
