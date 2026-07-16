'use client'
import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { ArrowLeft, Plus, Trash2, Save, Calculator } from 'lucide-react'
import Link from 'next/link'
import { cn } from '@/lib/utils/cn'
import { toast } from '@/components/ui/Toast'

interface Customer { id: string; name: string; customer_code: string }
interface BoardType { id: string; name: string }

interface LineItem {
  product_desc: string; size_l: string; size_w: string; size_h: string
  quantity: string; no_of_colors: string; unit_price: string; notes: string
}

const EMPTY_LINE: LineItem = { product_desc: '', size_l: '', size_w: '', size_h: '', quantity: '', no_of_colors: '4', unit_price: '', notes: '' }

interface Props {
  mode: 'new' | 'edit'
  customers: Customer[]
  boardTypes: BoardType[]
  initialData?: any
}

export default function SOFormClient({ mode, customers, boardTypes, initialData }: Props) {
  const router = useRouter()
  const [loading, setLoading] = useState(false)
  const [form, setForm] = useState({
    customer_id: initialData?.customer_id ?? '',
    order_date: initialData?.order_date ?? new Date().toISOString().split('T')[0],
    required_date: initialData?.required_date ?? '',
    discount_percent: String(initialData?.discount_percent ?? '0'),
    special_instructions: initialData?.special_instructions ?? '',
  })
  const [items, setItems] = useState<LineItem[]>(
    initialData?.sales_order_items?.map((i: any) => ({
      product_desc: i.product_desc, size_l: String(i.size_l ?? ''),
      size_w: String(i.size_w ?? ''), size_h: String(i.size_h ?? ''),
      quantity: String(i.quantity), no_of_colors: String(i.no_of_colors ?? '4'),
      unit_price: String(i.unit_price), notes: i.notes ?? '',
    })) ?? [{ ...EMPTY_LINE }]
  )

  const setF = (k: string, v: string) => setForm(p => ({ ...p, [k]: v }))
  const setItem = (idx: number, k: string, v: string) => setItems(prev => prev.map((it, i) => i === idx ? { ...it, [k]: v } : it))
  const addLine = () => setItems(prev => [...prev, { ...EMPTY_LINE }])
  const removeLine = (idx: number) => setItems(prev => prev.filter((_, i) => i !== idx))

  const subtotal = items.reduce((sum, it) => sum + (parseFloat(it.quantity || '0') * parseFloat(it.unit_price || '0')), 0)
  const discountAmt = subtotal * (parseFloat(form.discount_percent || '0') / 100)
  const total = subtotal - discountAmt

  const inputCls = 'w-full h-9 px-3 rounded-md border text-sm bg-[var(--color-bg-elevated)] text-[var(--color-text-primary)] border-[var(--color-border)] placeholder:text-[var(--color-text-muted)] focus:outline-none focus:border-[var(--color-accent)] focus:ring-1 focus:ring-[var(--color-accent)] transition-colors'

  const save = async () => {
    if (!form.customer_id) { toast.error('Please select a customer'); return }
    if (!items.some(it => it.product_desc)) { toast.error('Add at least one line item'); return }
    setLoading(true)
    try {
      const payload = {
        ...form,
        discount_percent: parseFloat(form.discount_percent || '0'),
        subtotal, discount_amount: discountAmt, total_amount: total, tax_amount: 0,
        status: 'confirmed',
        items: items.filter(it => it.product_desc).map(it => ({
          ...it,
          size_l: it.size_l ? parseFloat(it.size_l) : null,
          size_w: it.size_w ? parseFloat(it.size_w) : null,
          size_h: it.size_h ? parseFloat(it.size_h) : null,
          quantity: parseInt(it.quantity || '0'),
          no_of_colors: it.no_of_colors ? parseInt(it.no_of_colors) : null,
          unit_price: parseFloat(it.unit_price || '0'),
        })),
      }
      const isNew = mode === 'new'
      const res = await fetch(isNew ? '/api/v1/sales-orders' : `/api/v1/sales-orders/${initialData?.id}`, {
        method: isNew ? 'POST' : 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })
      if (!res.ok) { const e = await res.json(); throw new Error(e.error) }
      const { data } = await res.json()
      toast.success(isNew ? 'Sales Order created' : 'Sales Order updated')
      router.push(`/dashboard/sales-orders/${data.id}`)
    } catch (e: any) { toast.error(e.message || 'Failed to save') }
    finally { setLoading(false) }
  }

  return (
    <div className="max-w-5xl space-y-5">
      {/* Header */}
      <div className="flex items-center gap-3">
        <Link href="/dashboard/sales-orders" className="w-8 h-8 flex items-center justify-center rounded-md border border-[var(--color-border)] text-[var(--color-text-muted)] hover:bg-[var(--color-bg-elevated)] transition-colors">
          <ArrowLeft size={15} />
        </Link>
        <div>
          <h1 className="text-2xl font-bold text-[var(--color-text-primary)]">{mode === 'new' ? 'New Sales Order' : `Edit ${initialData?.so_number}`}</h1>
          <p className="text-sm text-[var(--color-text-muted)] mt-0.5">{mode === 'new' ? 'SO number will be auto-generated' : 'Update sales order details'}</p>
        </div>
      </div>

      {/* Customer & Dates */}
      <div className="rounded-xl border border-[var(--color-border)] bg-[var(--color-bg-secondary)] overflow-hidden">
        <div className="px-5 py-3.5 border-b border-[var(--color-border)] bg-[var(--color-bg-elevated)]">
          <h2 className="text-sm font-semibold text-[var(--color-text-primary)]">Order Information</h2>
        </div>
        <div className="p-5 grid grid-cols-3 gap-4">
          <div className="col-span-2 space-y-1.5">
            <label className="text-sm font-medium text-[var(--color-text-primary)]">Customer <span className="text-[var(--color-danger)]">*</span></label>
            <select className={inputCls} value={form.customer_id} onChange={e => setF('customer_id', e.target.value)}>
              <option value="">Select customer…</option>
              {customers.map(c => <option key={c.id} value={c.id}>{c.name} ({c.customer_code})</option>)}
            </select>
          </div>
          <div className="space-y-1.5">
            <label className="text-sm font-medium text-[var(--color-text-primary)]">Order Date</label>
            <input type="date" className={inputCls} value={form.order_date} onChange={e => setF('order_date', e.target.value)} />
          </div>
          <div className="space-y-1.5">
            <label className="text-sm font-medium text-[var(--color-text-primary)]">Required By Date</label>
            <input type="date" className={inputCls} value={form.required_date} onChange={e => setF('required_date', e.target.value)} />
          </div>
          <div className="space-y-1.5">
            <label className="text-sm font-medium text-[var(--color-text-primary)]">Discount %</label>
            <input type="number" min="0" max="100" className={inputCls} value={form.discount_percent} onChange={e => setF('discount_percent', e.target.value)} placeholder="0" />
          </div>
          <div className="col-span-2 space-y-1.5">
            <label className="text-sm font-medium text-[var(--color-text-primary)]">Special Instructions</label>
            <input className={inputCls} value={form.special_instructions} onChange={e => setF('special_instructions', e.target.value)} placeholder="Any special requirements for this order…" />
          </div>
        </div>
      </div>

      {/* Line Items */}
      <div className="rounded-xl border border-[var(--color-border)] bg-[var(--color-bg-secondary)] overflow-hidden">
        <div className="flex items-center justify-between px-5 py-3.5 border-b border-[var(--color-border)] bg-[var(--color-bg-elevated)]">
          <h2 className="text-sm font-semibold text-[var(--color-text-primary)]">Line Items</h2>
          <button onClick={addLine} className="flex items-center gap-1.5 px-3 h-7 rounded-md bg-[var(--color-accent)] text-white text-xs font-medium hover:bg-[var(--color-accent-hover)] transition-colors">
            <Plus size={12} /> Add Line
          </button>
        </div>

        {/* Column headers */}
        <div className="grid gap-2 px-5 py-2 bg-[var(--color-bg-elevated)]/50 border-b border-[var(--color-border-subtle)] text-xs font-semibold text-[var(--color-text-muted)] uppercase tracking-wider" style={{ gridTemplateColumns: '3fr 1fr 1fr 1fr 1.5fr 1fr 1.5fr 1.5fr auto' }}>
          <div>Description</div><div>L (mm)</div><div>W (mm)</div><div>H (mm)</div><div>Qty</div><div>Colors</div><div>Unit Price</div><div className="text-right">Subtotal</div><div />
        </div>

        <div className="divide-y divide-[var(--color-border-subtle)]">
          {items.map((item, idx) => {
            const lineTotal = parseFloat(item.quantity || '0') * parseFloat(item.unit_price || '0')
            return (
              <div key={idx} className="grid gap-2 px-5 py-3 items-center" style={{ gridTemplateColumns: '3fr 1fr 1fr 1fr 1.5fr 1fr 1.5fr 1.5fr auto' }}>
                <input className={cn(inputCls, 'h-8')} value={item.product_desc} onChange={e => setItem(idx, 'product_desc', e.target.value)} placeholder={`Item ${idx + 1} description`} />
                <input type="number" className={cn(inputCls, 'h-8')} value={item.size_l} onChange={e => setItem(idx, 'size_l', e.target.value)} placeholder="Length" />
                <input type="number" className={cn(inputCls, 'h-8')} value={item.size_w} onChange={e => setItem(idx, 'size_w', e.target.value)} placeholder="Width" />
                <input type="number" className={cn(inputCls, 'h-8')} value={item.size_h} onChange={e => setItem(idx, 'size_h', e.target.value)} placeholder="Height" />
                <input type="number" className={cn(inputCls, 'h-8')} value={item.quantity} onChange={e => setItem(idx, 'quantity', e.target.value)} placeholder="0" />
                <input type="number" min="1" max="8" className={cn(inputCls, 'h-8')} value={item.no_of_colors} onChange={e => setItem(idx, 'no_of_colors', e.target.value)} placeholder="4" />
                <input type="number" className={cn(inputCls, 'h-8')} value={item.unit_price} onChange={e => setItem(idx, 'unit_price', e.target.value)} placeholder="0.00" />
                <div className="h-8 flex items-center justify-end">
                  <span className="text-sm font-semibold text-[var(--color-text-primary)]">{lineTotal.toLocaleString('en-PK', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}</span>
                </div>
                <button onClick={() => removeLine(idx)} disabled={items.length === 1} className="w-7 h-7 flex items-center justify-center rounded text-[var(--color-text-muted)] hover:bg-[var(--color-danger)]/10 hover:text-[var(--color-danger)] disabled:opacity-30 transition-colors">
                  <Trash2 size={13} />
                </button>
              </div>
            )
          })}
        </div>

        {/* Totals */}
        <div className="border-t border-[var(--color-border)] px-5 py-4 flex justify-end">
          <div className="w-72 space-y-2">
            <div className="flex justify-between text-sm">
              <span className="text-[var(--color-text-secondary)]">Subtotal</span>
              <span className="text-[var(--color-text-primary)] font-medium">PKR {subtotal.toLocaleString('en-PK', { minimumFractionDigits: 0 })}</span>
            </div>
            {parseFloat(form.discount_percent || '0') > 0 && (
              <div className="flex justify-between text-sm">
                <span className="text-[var(--color-text-secondary)]">Discount ({form.discount_percent}%)</span>
                <span className="text-[var(--color-danger)]">- PKR {discountAmt.toLocaleString('en-PK', { minimumFractionDigits: 0 })}</span>
              </div>
            )}
            <div className="flex justify-between text-base font-bold border-t border-[var(--color-border)] pt-2 mt-2">
              <span className="text-[var(--color-text-primary)]">Total</span>
              <span className="text-[var(--color-accent)]">PKR {total.toLocaleString('en-PK', { minimumFractionDigits: 0 })}</span>
            </div>
          </div>
        </div>
      </div>

      {/* Actions */}
      <div className="flex items-center justify-end gap-3">
        <Link href="/dashboard/sales-orders" className="px-4 h-9 rounded-md border border-[var(--color-border)] text-sm text-[var(--color-text-secondary)] hover:bg-[var(--color-bg-elevated)] transition-colors">
          Cancel
        </Link>
        <button onClick={save} disabled={loading || !form.customer_id}
          className="flex items-center gap-2 px-5 h-9 rounded-md bg-[var(--color-accent)] text-white text-sm font-medium hover:bg-[var(--color-accent-hover)] disabled:opacity-50 transition-colors">
          <Save size={15} /> {loading ? 'Saving…' : mode === 'new' ? 'Create Sales Order' : 'Save Changes'}
        </button>
      </div>
    </div>
  )
}
