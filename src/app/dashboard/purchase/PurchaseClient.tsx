'use client'
import { useState } from 'react'
import { ShoppingCart, Plus, ChevronDown, ChevronRight, Trash2, Check, Send, Scale } from 'lucide-react'
import { cn } from '@/lib/utils/cn'
import { toast } from '@/components/ui/Toast'
import { Modal } from '@/components/ui/Modal'
import { formatDate, formatDateTime } from '@/lib/utils/format'

interface POItem { id: string; line_no: number; description: string; specification: string | null; quantity: number; unit_price: number; subtotal: number; quantity_received: number }
interface PO {
  id: string; po_number: string; status: string; order_date: string; expected_date: string | null
  subtotal: number; tax_amount: number; total_amount: number; notes: string | null; created_at: string
  vendors?: { name: string; vendor_code: string } | null
  purchase_order_items?: POItem[]
}
interface Vendor { id: string; name: string; vendor_code: string }

const STATUS_CFG = {
  draft:               { label: 'Draft',               color: 'text-[var(--color-text-muted)] bg-[var(--color-bg-elevated)] border-[var(--color-border)]' },
  sent:                { label: 'Sent',                 color: 'text-[var(--color-info)] bg-[var(--color-info)]/10 border-[var(--color-info)]/20' },
  confirmed:           { label: 'Confirmed',            color: 'text-[var(--color-accent)] bg-[var(--color-accent)]/10 border-[var(--color-accent)]/20' },
  partially_received:  { label: 'Partially Received',  color: 'text-[var(--color-warning)] bg-[var(--color-warning)]/10 border-[var(--color-warning)]/20' },
  received:            { label: 'Received',             color: 'text-[var(--color-success)] bg-[var(--color-success)]/10 border-[var(--color-success)]/20' },
  cancelled:           { label: 'Cancelled',            color: 'text-[var(--color-muted)] bg-[var(--color-bg-elevated)] border-[var(--color-border)]' },
}

const EMPTY_LINE = { description: '', specification: '', quantity: '1', unit_price: '0', notes: '' }
const inputCls = 'w-full h-9 px-3 rounded-md border text-sm bg-[var(--color-bg-elevated)] text-[var(--color-text-primary)] border-[var(--color-border)] placeholder:text-[var(--color-text-muted)] focus:outline-none focus:border-[var(--color-accent)] focus:ring-1 focus:ring-[var(--color-accent)] transition-colors'

export default function PurchaseClient({ initialPOs, vendors }: { initialPOs: PO[]; vendors: Vendor[] }) {
  const [pos, setPOs] = useState(initialPOs)
  const [expanded, setExpanded] = useState<Set<string>>(new Set())
  const [filterStatus, setFilterStatus] = useState('')
  const [newPOModal, setNewPOModal] = useState(false)
  const [receiveModal, setReceiveModal] = useState<PO | null>(null)
  const [matchModal, setMatchModal] = useState<PO | null>(null)
  const [loading, setLoading] = useState(false)
  const [newVendorModal, setNewVendorModal] = useState(false)

  const [poForm, setPOForm] = useState({ vendor_id: '', order_date: new Date().toISOString().slice(0, 10), expected_date: '', notes: '', terms: '', tax_rate: '0' })
  const [lineItems, setLineItems] = useState([{ ...EMPTY_LINE }])
  const [receiveQtys, setReceiveQtys] = useState<Record<string, string>>({})
  const [vendorForm, setVendorForm] = useState({ name: '', contact_person: '', email: '', phone: '', mobile: '', address: '', ntn: '', payment_terms: '30' })

  const toggle = (id: string) => setExpanded(prev => { const n = new Set(prev); n.has(id) ? n.delete(id) : n.add(id); return n })
  const filtered = filterStatus ? pos.filter(p => p.status === filterStatus) : pos

  const addLine = () => setLineItems(p => [...p, { ...EMPTY_LINE }])
  const removeLine = (idx: number) => setLineItems(p => p.filter((_, i) => i !== idx))
  const setLine = (idx: number, k: string, v: string) => setLineItems(p => p.map((l, i) => i === idx ? { ...l, [k]: v } : l))

  const subtotal = lineItems.reduce((s, l) => s + (parseFloat(l.quantity || '0') * parseFloat(l.unit_price || '0')), 0)
  const taxRate  = parseFloat(poForm.tax_rate || '0') / 100
  const total    = subtotal * (1 + taxRate)

  const createPO = async () => {
    if (!poForm.vendor_id) { toast.error('Vendor required'); return }
    if (!lineItems.some(l => l.description)) { toast.error('Add at least one line item'); return }
    setLoading(true)
    try {
      const res = await fetch('/api/v1/purchase-orders', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...poForm, items: lineItems.filter(l => l.description) }),
      })
      if (!res.ok) { const e = await res.json(); throw new Error(e.error) }
      const { data } = await res.json()
      const vendor = vendors.find(v => v.id === poForm.vendor_id)
      setPOs(prev => [{ ...data, vendors: vendor || null, purchase_order_items: [] }, ...prev])
      setNewPOModal(false)
      setPOForm({ vendor_id: '', order_date: new Date().toISOString().slice(0, 10), expected_date: '', notes: '', terms: '', tax_rate: '0' })
      setLineItems([{ ...EMPTY_LINE }])
      toast.success(`PO ${data.po_number} created`)
    } catch (e: any) { toast.error(e.message || 'Failed') }
    finally { setLoading(false) }
  }

  const updateStatus = async (poId: string, status: string) => {
    try {
      await fetch(`/api/v1/purchase-orders/${poId}`, {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ status }),
      })
      setPOs(prev => prev.map(p => p.id === poId ? { ...p, status } : p))
      toast.success('Status updated')
    } catch { toast.error('Failed') }
  }

  const receiveGoods = async () => {
    if (!receiveModal) return
    setLoading(true)
    try {
      const items = (receiveModal.purchase_order_items || []).map(item => ({
        id: item.id, quantity_received: parseFloat(receiveQtys[item.id] ?? String(item.quantity)),
      }))
      const res = await fetch(`/api/v1/purchase-orders/${receiveModal.id}`, {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'receive', items }),
      })
      if (!res.ok) throw new Error()
      const { data } = await res.json()
      setPOs(prev => prev.map(p => p.id === receiveModal.id ? { ...p, status: (data as any).status } : p))
      setReceiveModal(null)
      toast.success('Goods received')
    } catch { toast.error('Failed') }
    finally { setLoading(false) }
  }

  const createVendor = async () => {
    if (!vendorForm.name) { toast.error('Vendor name required'); return }
    setLoading(true)
    try {
      const res = await fetch('/api/v1/vendors', {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(vendorForm),
      })
      if (!res.ok) { const e = await res.json(); throw new Error(e.error) }
      toast.success('Vendor created')
      setNewVendorModal(false)
      setVendorForm({ name: '', contact_person: '', email: '', phone: '', mobile: '', address: '', ntn: '', payment_terms: '30' })
    } catch (e: any) { toast.error(e.message || 'Failed') }
    finally { setLoading(false) }
  }

  return (
    <div className="space-y-4">
      {/* Toolbar */}
      <div className="flex items-center gap-2 flex-wrap">
        <div className="flex items-center gap-1 flex-wrap">
          {['', 'draft', 'sent', 'confirmed', 'partially_received', 'received'].map(s => (
            <button key={s} onClick={() => setFilterStatus(s)}
              className={cn('px-3 h-7 rounded-md text-xs font-medium border transition-all',
                filterStatus === s ? 'bg-[var(--color-accent)] text-white border-transparent' : 'border-[var(--color-border)] text-[var(--color-text-secondary)] hover:text-[var(--color-text-primary)]')}>
              {s === '' ? 'All' : STATUS_CFG[s as keyof typeof STATUS_CFG]?.label}
            </button>
          ))}
        </div>
        <div className="ml-auto flex items-center gap-2">
          <button onClick={() => setNewVendorModal(true)}
            className="flex items-center gap-1.5 px-3 h-9 rounded-md border border-[var(--color-border)] text-sm text-[var(--color-text-secondary)] hover:bg-[var(--color-bg-elevated)] transition-colors">
            <Plus size={14} /> New Vendor
          </button>
          <button onClick={() => setNewPOModal(true)}
            className="flex items-center gap-1.5 px-4 h-9 rounded-md bg-[var(--color-accent)] text-white text-sm font-medium hover:bg-[var(--color-accent-hover)] transition-colors">
            <Plus size={15} /> New PO
          </button>
        </div>
      </div>

      {/* PO List */}
      <div className="rounded-xl border border-[var(--color-border)] bg-[var(--color-bg-secondary)] overflow-hidden">
        {filtered.length === 0 ? (
          <div className="p-12 text-center">
            <ShoppingCart size={28} className="text-[var(--color-text-muted)] opacity-30 mx-auto mb-2" />
            <p className="text-sm text-[var(--color-text-muted)]">No purchase orders yet</p>
          </div>
        ) : (
          <div className="divide-y divide-[var(--color-border-subtle)]">
            {filtered.map(po => {
              const statusCfg = STATUS_CFG[po.status as keyof typeof STATUS_CFG] || STATUS_CFG.draft
              const isOpen = expanded.has(po.id)
              const items = po.purchase_order_items || []
              return (
                <div key={po.id}>
                  <div className="flex items-center gap-4 px-5 py-3.5 hover:bg-[var(--color-bg-elevated)]/30">
                    <button onClick={() => toggle(po.id)} className="text-[var(--color-text-muted)] flex-shrink-0">
                      {isOpen ? <ChevronDown size={16} /> : <ChevronRight size={16} />}
                    </button>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-semibold font-mono text-[var(--color-accent)]">{po.po_number}</span>
                        <span className="text-sm text-[var(--color-text-primary)]">{po.vendors?.name}</span>
                        <span className="text-xs text-[var(--color-text-muted)]">({po.vendors?.vendor_code})</span>
                      </div>
                      <div className="flex items-center gap-3 mt-0.5 text-xs text-[var(--color-text-muted)]">
                        <span>{items.length} item{items.length !== 1 ? 's' : ''}</span>
                        <span>Order: {formatDate(po.order_date)}</span>
                        {po.expected_date && <span>Expected: {formatDate(po.expected_date)}</span>}
                      </div>
                    </div>
                    <div className="text-right flex-shrink-0">
                      <p className="text-sm font-bold text-[var(--color-text-primary)]">PKR {po.total_amount.toLocaleString(undefined, { minimumFractionDigits: 2 })}</p>
                    </div>
                    <div className="flex items-center gap-2 flex-shrink-0">
                      <span className={cn('text-xs px-2.5 py-1 rounded-full border font-medium', statusCfg.color)}>{statusCfg.label}</span>
                      {po.status === 'draft' && (
                        <button onClick={() => updateStatus(po.id, 'sent')}
                          className="flex items-center gap-1 px-2.5 h-7 rounded border border-[var(--color-info)]/30 text-xs text-[var(--color-info)] hover:bg-[var(--color-info)]/10 transition-colors">
                          <Send size={11} /> Send
                        </button>
                      )}
                      {po.status === 'sent' && (
                        <button onClick={() => updateStatus(po.id, 'confirmed')}
                          className="flex items-center gap-1 px-2.5 h-7 rounded border border-[var(--color-accent)]/30 text-xs text-[var(--color-accent)] hover:bg-[var(--color-accent)]/10 transition-colors">
                          <Check size={11} /> Confirm
                        </button>
                      )}
                      {['confirmed','partially_received'].includes(po.status) && (
                        <button onClick={() => { setReceiveModal(po); const q: Record<string,string> = {}; items.forEach(i => { q[i.id] = String(i.quantity - i.quantity_received) }); setReceiveQtys(q) }}
                          className="flex items-center gap-1 px-2.5 h-7 rounded bg-[var(--color-success)] text-white text-xs font-medium hover:opacity-90 transition-colors">
                          <Check size={11} /> Receive
                        </button>
                      )}
                      {['confirmed','partially_received','received'].includes(po.status) && (
                        <button onClick={() => setMatchModal(po)}
                          className="flex items-center gap-1 px-2.5 h-7 rounded border border-[var(--color-border)] text-xs text-[var(--color-text-secondary)] hover:bg-[var(--color-bg-elevated)] transition-colors">
                          <Scale size={11} /> 3-Way Match
                        </button>
                      )}
                    </div>
                  </div>

                  {isOpen && items.length > 0 && (
                    <div className="border-t border-[var(--color-border-subtle)] bg-[var(--color-bg-elevated)]/30">
                      <div className="grid grid-cols-12 gap-3 px-10 py-2 text-xs font-semibold text-[var(--color-text-muted)] uppercase tracking-wider border-b border-[var(--color-border-subtle)]">
                        <div className="col-span-4">Description</div>
                        <div className="col-span-3">Specification</div>
                        <div className="col-span-1 text-right">Qty</div>
                        <div className="col-span-2 text-right">Unit Price</div>
                        <div className="col-span-2 text-right">Subtotal</div>
                      </div>
                      {items.map(item => (
                        <div key={item.id} className="grid grid-cols-12 gap-3 px-10 py-2.5 text-sm border-b border-[var(--color-border-subtle)] last:border-0 items-center">
                          <div className="col-span-4 text-[var(--color-text-primary)]">{item.description}</div>
                          <div className="col-span-3 text-xs text-[var(--color-text-muted)]">{item.specification || '—'}</div>
                          <div className="col-span-1 text-right text-[var(--color-text-secondary)]">{item.quantity}</div>
                          <div className="col-span-2 text-right text-[var(--color-text-secondary)]">PKR {item.unit_price.toLocaleString(undefined, { minimumFractionDigits: 2 })}</div>
                          <div className="col-span-2 text-right font-medium text-[var(--color-text-primary)]">PKR {item.subtotal.toLocaleString(undefined, { minimumFractionDigits: 2 })}</div>
                        </div>
                      ))}
                      <div className="flex justify-end px-10 py-2.5 text-sm">
                        <div className="space-y-1">
                          <div className="flex justify-between gap-12 text-[var(--color-text-muted)]"><span>Subtotal</span><span>PKR {po.subtotal.toLocaleString(undefined, { minimumFractionDigits: 2 })}</span></div>
                          {po.tax_amount > 0 && <div className="flex justify-between gap-12 text-[var(--color-text-muted)]"><span>Tax</span><span>PKR {po.tax_amount.toLocaleString(undefined, { minimumFractionDigits: 2 })}</span></div>}
                          <div className="flex justify-between gap-12 font-bold text-[var(--color-text-primary)] border-t border-[var(--color-border)] pt-1"><span>Total</span><span>PKR {po.total_amount.toLocaleString(undefined, { minimumFractionDigits: 2 })}</span></div>
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        )}
      </div>

      {/* New PO Modal */}
      <Modal open={newPOModal} onClose={() => setNewPOModal(false)} title="New Purchase Order" size="xl"
        footer={
          <>
            <button onClick={() => setNewPOModal(false)} className="px-4 h-9 rounded-md border border-[var(--color-border)] text-sm text-[var(--color-text-secondary)] hover:bg-[var(--color-bg-elevated)] transition-colors">Cancel</button>
            <button onClick={createPO} disabled={loading || !poForm.vendor_id}
              className="px-4 h-9 rounded-md bg-[var(--color-accent)] text-white text-sm font-medium hover:bg-[var(--color-accent-hover)] disabled:opacity-50 transition-colors">
              {loading ? 'Creating…' : 'Create PO'}
            </button>
          </>
        }>
        <div className="space-y-5">
          <div className="grid grid-cols-3 gap-3">
            <div className="space-y-1.5">
              <label className="text-sm font-medium text-[var(--color-text-primary)]">Vendor <span className="text-[var(--color-danger)]">*</span></label>
              <select className={inputCls} value={poForm.vendor_id} onChange={e => setPOForm(p => ({ ...p, vendor_id: e.target.value }))}>
                <option value="">Select vendor…</option>
                {vendors.map(v => <option key={v.id} value={v.id}>{v.name} ({v.vendor_code})</option>)}
              </select>
            </div>
            <div className="space-y-1.5">
              <label className="text-sm font-medium text-[var(--color-text-primary)]">Order Date</label>
              <input type="date" className={inputCls} value={poForm.order_date} onChange={e => setPOForm(p => ({ ...p, order_date: e.target.value }))} />
            </div>
            <div className="space-y-1.5">
              <label className="text-sm font-medium text-[var(--color-text-primary)]">Expected Date</label>
              <input type="date" className={inputCls} value={poForm.expected_date} onChange={e => setPOForm(p => ({ ...p, expected_date: e.target.value }))} />
            </div>
          </div>

          {/* Line items */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <span className="text-sm font-medium text-[var(--color-text-primary)]">Line Items</span>
              <button onClick={addLine} className="text-xs text-[var(--color-accent)] hover:underline flex items-center gap-1"><Plus size={12} /> Add Line</button>
            </div>
            <div className="grid grid-cols-12 gap-2 px-1 py-1 text-xs font-semibold text-[var(--color-text-muted)] uppercase tracking-wider">
              <div className="col-span-4">Description</div>
              <div className="col-span-3">Specification</div>
              <div className="col-span-1">Qty</div>
              <div className="col-span-2">Unit Price</div>
              <div className="col-span-2 text-right">Subtotal</div>
            </div>
            <div className="space-y-1.5">
              {lineItems.map((item, idx) => {
                const lineTotal = parseFloat(item.quantity || '0') * parseFloat(item.unit_price || '0')
                return (
                  <div key={idx} className="grid grid-cols-12 gap-2 items-center">
                    <div className="col-span-4"><input className={inputCls} value={item.description} onChange={e => setLine(idx, 'description', e.target.value)} placeholder="Item description *" /></div>
                    <div className="col-span-3"><input className={inputCls} value={item.specification} onChange={e => setLine(idx, 'specification', e.target.value)} placeholder="Spec / grade" /></div>
                    <div className="col-span-1"><input type="number" className={inputCls} value={item.quantity} onChange={e => setLine(idx, 'quantity', e.target.value)} /></div>
                    <div className="col-span-2"><input type="number" className={inputCls} value={item.unit_price} onChange={e => setLine(idx, 'unit_price', e.target.value)} placeholder="0.00" /></div>
                    <div className="col-span-2 flex items-center justify-between">
                      <span className="text-sm font-medium text-[var(--color-text-primary)]">{lineTotal > 0 ? `PKR ${lineTotal.toLocaleString(undefined, { minimumFractionDigits: 0 })}` : '—'}</span>
                      {lineItems.length > 1 && <button onClick={() => removeLine(idx)} className="text-[var(--color-text-muted)] hover:text-[var(--color-danger)]"><Trash2 size={13} /></button>}
                    </div>
                  </div>
                )
              })}
            </div>

            {/* Totals */}
            <div className="flex justify-end mt-3 pt-3 border-t border-[var(--color-border)]">
              <div className="w-64 space-y-1.5 text-sm">
                <div className="flex justify-between text-[var(--color-text-secondary)]"><span>Subtotal</span><span>PKR {subtotal.toLocaleString(undefined, { minimumFractionDigits: 2 })}</span></div>
                <div className="flex items-center justify-between gap-4">
                  <span className="text-[var(--color-text-secondary)] flex-shrink-0">Tax %</span>
                  <input type="number" className="w-20 h-8 px-2.5 rounded border text-sm text-right bg-[var(--color-bg-elevated)] text-[var(--color-text-primary)] border-[var(--color-border)] focus:outline-none transition-colors" value={poForm.tax_rate} onChange={e => setPOForm(p => ({ ...p, tax_rate: e.target.value }))} />
                </div>
                <div className="flex justify-between font-bold text-[var(--color-text-primary)] pt-1 border-t border-[var(--color-border)]"><span>Total</span><span>PKR {total.toLocaleString(undefined, { minimumFractionDigits: 2 })}</span></div>
              </div>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <label className="text-sm font-medium text-[var(--color-text-primary)]">Notes</label>
              <input className={inputCls} value={poForm.notes} onChange={e => setPOForm(p => ({ ...p, notes: e.target.value }))} placeholder="Special instructions" />
            </div>
            <div className="space-y-1.5">
              <label className="text-sm font-medium text-[var(--color-text-primary)]">Terms</label>
              <input className={inputCls} value={poForm.terms} onChange={e => setPOForm(p => ({ ...p, terms: e.target.value }))} placeholder="Payment terms" />
            </div>
          </div>
        </div>
      </Modal>

      {/* Receive Goods Modal */}
      {receiveModal && (
        <Modal open={true} onClose={() => setReceiveModal(null)} title={`Receive Goods — ${receiveModal.po_number}`} size="md"
          footer={
            <>
              <button onClick={() => setReceiveModal(null)} className="px-4 h-9 rounded-md border border-[var(--color-border)] text-sm text-[var(--color-text-secondary)] hover:bg-[var(--color-bg-elevated)] transition-colors">Cancel</button>
              <button onClick={receiveGoods} disabled={loading}
                className="px-4 h-9 rounded-md bg-[var(--color-success)] text-white text-sm font-medium hover:opacity-90 disabled:opacity-50 transition-colors">
                {loading ? 'Processing…' : 'Receive Goods'}
              </button>
            </>
          }>
          <div className="space-y-3">
            <p className="text-sm text-[var(--color-text-muted)]">Enter quantities received for each item. Board inventory will be updated automatically.</p>
            {(receiveModal.purchase_order_items || []).map(item => (
              <div key={item.id} className="flex items-center gap-3">
                <div className="flex-1">
                  <p className="text-sm font-medium text-[var(--color-text-primary)]">{item.description}</p>
                  <p className="text-xs text-[var(--color-text-muted)]">Ordered: {item.quantity} | Previously received: {item.quantity_received}</p>
                </div>
                <input type="number"
                  className="w-24 h-8 px-2.5 rounded-md border text-sm bg-[var(--color-bg-elevated)] text-[var(--color-text-primary)] border-[var(--color-border)] focus:outline-none focus:border-[var(--color-accent)] transition-colors"
                  value={receiveQtys[item.id] ?? ''}
                  onChange={e => setReceiveQtys(prev => ({ ...prev, [item.id]: e.target.value }))}
                  placeholder="Qty" />
              </div>
            ))}
          </div>
        </Modal>
      )}

      {/* New Vendor Modal */}
      <Modal open={newVendorModal} onClose={() => setNewVendorModal(false)} title="New Vendor" size="md"
        footer={
          <>
            <button onClick={() => setNewVendorModal(false)} className="px-4 h-9 rounded-md border border-[var(--color-border)] text-sm text-[var(--color-text-secondary)] hover:bg-[var(--color-bg-elevated)] transition-colors">Cancel</button>
            <button onClick={createVendor} disabled={loading || !vendorForm.name}
              className="px-4 h-9 rounded-md bg-[var(--color-accent)] text-white text-sm font-medium hover:bg-[var(--color-accent-hover)] disabled:opacity-50 transition-colors">
              {loading ? 'Creating…' : 'Create Vendor'}
            </button>
          </>
        }>
        <div className="grid grid-cols-2 gap-3">
          <div className="col-span-2 space-y-1.5">
            <label className="text-sm font-medium text-[var(--color-text-primary)]">Vendor Name <span className="text-[var(--color-danger)]">*</span></label>
            <input className={inputCls} value={vendorForm.name} onChange={e => setVendorForm(p => ({ ...p, name: e.target.value }))} placeholder="e.g. Paper Mart Pakistan" />
          </div>
          {[
            { key: 'contact_person', label: 'Contact Person', placeholder: 'Mr. Ahmed' },
            { key: 'phone', label: 'Phone', placeholder: '+92 21 111 000 000' },
            { key: 'mobile', label: 'Mobile', placeholder: '+92 300 0000000' },
            { key: 'email', label: 'Email', placeholder: 'sales@vendor.com' },
          ].map(f => (
            <div key={f.key} className="space-y-1.5">
              <label className="text-sm font-medium text-[var(--color-text-primary)]">{f.label}</label>
              <input className={inputCls} value={(vendorForm as any)[f.key]} onChange={e => setVendorForm(p => ({ ...p, [f.key]: e.target.value }))} placeholder={f.placeholder} />
            </div>
          ))}
          <div className="space-y-1.5">
            <label className="text-sm font-medium text-[var(--color-text-primary)]">NTN</label>
            <input className={inputCls} value={vendorForm.ntn} onChange={e => setVendorForm(p => ({ ...p, ntn: e.target.value }))} placeholder="Tax number" />
          </div>
          <div className="space-y-1.5">
            <label className="text-sm font-medium text-[var(--color-text-primary)]">Payment Terms (Days)</label>
            <input type="number" className={inputCls} value={vendorForm.payment_terms} onChange={e => setVendorForm(p => ({ ...p, payment_terms: e.target.value }))} />
          </div>
          <div className="col-span-2 space-y-1.5">
            <label className="text-sm font-medium text-[var(--color-text-primary)]">Address</label>
            <input className={inputCls} value={vendorForm.address} onChange={e => setVendorForm(p => ({ ...p, address: e.target.value }))} placeholder="Vendor address" />
          </div>
        </div>
      </Modal>

      {/* 3-Way Match Modal */}
      <Modal open={!!matchModal} onClose={() => setMatchModal(null)} title={matchModal ? `3-Way Match — ${matchModal.po_number}` : ''} size="lg">
        {matchModal && <ThreeWayMatchView po={matchModal} onClose={() => setMatchModal(null)} />}
      </Modal>
    </div>
  )
}

const MATCH_STATUS_CFG: Record<string, { label: string; color: string }> = {
  matched:               { label: 'Matched',           color: 'text-[var(--color-success)] bg-[var(--color-success)]/10 border-[var(--color-success)]/20' },
  not_billed:            { label: 'Not Billed Yet',    color: 'text-[var(--color-text-muted)] bg-[var(--color-bg-elevated)] border-[var(--color-border)]' },
  partially_billed:      { label: 'Partially Billed',  color: 'text-[var(--color-warning)] bg-[var(--color-warning)]/10 border-[var(--color-warning)]/20' },
  billed_exceeds_received: { label: 'Over-Billed',     color: 'text-[var(--color-danger)] bg-[var(--color-danger)]/10 border-[var(--color-danger)]/20' },
  price_mismatch:        { label: 'Price Mismatch',    color: 'text-[var(--color-danger)] bg-[var(--color-danger)]/10 border-[var(--color-danger)]/20' },
}

function ThreeWayMatchView({ po, onClose }: { po: PO; onClose: () => void }) {
  const [rows, setRows] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [billForm, setBillForm] = useState<null | { bill_number: string; bill_date: string; items: any[] }>(null)
  const [saving, setSaving] = useState(false)

  const load = () => {
    setLoading(true)
    fetch(`/api/v1/purchase-orders/${po.id}/three-way-match`)
      .then(r => r.json())
      .then(json => setRows(json.data ?? []))
      .finally(() => setLoading(false))
  }

  useState(load)

  const startBill = () => {
    setBillForm({
      bill_number: '',
      bill_date: new Date().toISOString().slice(0, 10),
      items: (po.purchase_order_items || []).map(i => ({
        po_item_id: i.id, description: i.description,
        quantity_billed: String(i.quantity_received - (rows.find(r => r.po_item_id === i.id)?.billed_qty || 0)),
        unit_price: String(i.unit_price),
      })),
    })
  }

  const saveBill = async () => {
    if (!billForm?.bill_number) { toast.error('Bill number required'); return }
    setSaving(true)
    try {
      const res = await fetch(`/api/v1/purchase-orders/${po.id}/bills`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(billForm),
      })
      if (!res.ok) { const e = await res.json(); throw new Error(e.error) }
      toast.success('Vendor bill recorded')
      setBillForm(null)
      load()
    } catch (e: any) { toast.error(e.message || 'Failed') }
    finally { setSaving(false) }
  }

  if (loading) return <p className="text-sm text-[var(--color-text-muted)] text-center py-8">Loading…</p>

  return (
    <div className="space-y-4">
      <div className="rounded-lg border border-[var(--color-border)] overflow-hidden">
        <div className="grid grid-cols-12 gap-2 px-3 py-2 bg-[var(--color-bg-elevated)] text-xs font-semibold text-[var(--color-text-muted)] uppercase">
          <div className="col-span-4">Item</div>
          <div className="col-span-2 text-right">Ordered</div>
          <div className="col-span-2 text-right">Received</div>
          <div className="col-span-2 text-right">Billed</div>
          <div className="col-span-2 text-right">Status</div>
        </div>
        <div className="divide-y divide-[var(--color-border-subtle)]">
          {rows.map(r => {
            const cfg = MATCH_STATUS_CFG[r.match_status] || MATCH_STATUS_CFG.not_billed
            return (
              <div key={r.po_item_id} className="grid grid-cols-12 gap-2 px-3 py-2 items-center text-sm">
                <div className="col-span-4 text-[var(--color-text-primary)] truncate">{r.description}</div>
                <div className="col-span-2 text-right text-[var(--color-text-secondary)]">{Number(r.ordered_qty).toLocaleString()}</div>
                <div className="col-span-2 text-right text-[var(--color-text-secondary)]">{Number(r.received_qty).toLocaleString()}</div>
                <div className="col-span-2 text-right text-[var(--color-text-secondary)]">{Number(r.billed_qty).toLocaleString()}</div>
                <div className="col-span-2 text-right">
                  <span className={cn('text-xs px-2 py-0.5 rounded-full border', cfg.color)}>{cfg.label}</span>
                </div>
              </div>
            )
          })}
        </div>
      </div>

      {!billForm ? (
        <button onClick={startBill} className="px-4 h-9 rounded-md bg-[var(--color-accent)] text-white text-sm font-medium hover:bg-[var(--color-accent-hover)] transition-colors">
          Record Vendor Bill
        </button>
      ) : (
        <div className="rounded-lg border border-[var(--color-border)] p-3 space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <input className={inputCls} placeholder="Vendor bill number *" value={billForm.bill_number} onChange={e => setBillForm(p => ({ ...p!, bill_number: e.target.value }))} />
            <input type="date" className={inputCls} value={billForm.bill_date} onChange={e => setBillForm(p => ({ ...p!, bill_date: e.target.value }))} />
          </div>
          <div className="space-y-1.5 max-h-48 overflow-y-auto">
            {billForm.items.map((item, idx) => (
              <div key={idx} className="grid grid-cols-12 gap-2 items-center text-xs">
                <span className="col-span-6 text-[var(--color-text-secondary)] truncate">{item.description}</span>
                <input type="number" className={cn(inputCls, 'col-span-3 h-8')} value={item.quantity_billed}
                  onChange={e => setBillForm(p => { const items = [...p!.items]; items[idx] = { ...items[idx], quantity_billed: e.target.value }; return { ...p!, items } })} />
                <input type="number" className={cn(inputCls, 'col-span-3 h-8')} value={item.unit_price}
                  onChange={e => setBillForm(p => { const items = [...p!.items]; items[idx] = { ...items[idx], unit_price: e.target.value }; return { ...p!, items } })} />
              </div>
            ))}
          </div>
          <div className="flex gap-2">
            <button onClick={saveBill} disabled={saving} className="px-4 h-9 rounded-md bg-[var(--color-accent)] text-white text-sm font-medium hover:bg-[var(--color-accent-hover)] disabled:opacity-50">Save Bill</button>
            <button onClick={() => setBillForm(null)} className="px-3 h-9 rounded-md border border-[var(--color-border)] text-sm hover:bg-[var(--color-bg-elevated)]">Cancel</button>
          </div>
        </div>
      )}
    </div>
  )
}
