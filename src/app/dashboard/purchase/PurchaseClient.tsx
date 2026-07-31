'use client'
import { useState } from 'react'
import { ShoppingCart, Plus, ChevronDown, ChevronRight, Trash2, Check, Send, Scale, Download } from 'lucide-react'
import { cn } from '@/lib/utils/cn'
import { MoneyGate } from '@/components/ui/MoneyGate'
import { TabStrip } from '@/components/ui/TabStrip'
import { toast } from '@/components/ui/Toast'
import { Modal } from '@/components/ui/Modal'
import { formatDate, formatDateTime } from '@/lib/utils/format'
import { exportToExcel } from '@/lib/utils/exportToExcel'
import { Pagination } from '@/components/ui/Pagination'
import { useServerPagedList, fetchAllPages } from '@/lib/hooks/useServerPagedList'
// Board is bought by the kilo, so a per-kg line is priced on weight — the same
// formula the estimator costs with, so the two sides stay comparable (118).
import { sheetWeightKg } from '@/lib/costing/sheetWeight'

// quantity / quantity_received are in PACKETS (the PO's unit). board_item_id is
// what decides whether receiving this line touches stock at all.
interface POItem { id: string; line_no: number; description: string; specification: string | null; quantity: number; unit_price: number; subtotal: number; quantity_received: number; board_item_id?: string | null; job_id?: string | null; jobs?: { job_number: string; job_title: string } | null
  /** What unit_price is per (118): board is bought per kg. */
  rate_basis?: 'kg' | 'packet' | 'unit' | null }
interface PO {
  id: string; po_number: string; status: string; order_date: string; expected_date: string | null
  subtotal: number; tax_amount: number; total_amount: number; notes: string | null; created_at: string
  vendors?: { name: string; vendor_code: string } | null
  purchase_order_items?: POItem[]
}
interface Vendor { id: string; name: string; vendor_code: string }
interface BoardItem {
  id: string; description: string; gsm: number | null
  sheet_width_in: number | null; sheet_height_in: number | null
  /** Sheets in one packet for THIS item — 100 for board, often 500 for paper. */
  sheets_per_packet: number
}
interface OpenJob { id: string; job_number: string; job_title: string }

/** "Bleach Board · 208 GSM · 18.75×35" — how the store recognises a stock row. */
const boardLabel = (b: BoardItem) => [
  b.description,
  b.gsm ? `${b.gsm} GSM` : null,
  b.sheet_width_in && b.sheet_height_in ? `${b.sheet_width_in}×${b.sheet_height_in}` : null,
].filter(Boolean).join(' · ')

const STATUS_CFG = {
  draft:               { label: 'Draft',               color: 'text-[var(--color-text-muted)] bg-[var(--color-bg-elevated)] border-[var(--color-border)]' },
  sent:                { label: 'Sent',                 color: 'text-[var(--color-info)] bg-[color:color-mix(in_srgb,var(--color-info)_10%,transparent)] border-[color:color-mix(in_srgb,var(--color-info)_20%,transparent)]' },
  confirmed:           { label: 'Confirmed',            color: 'text-[var(--color-accent)] bg-[color:color-mix(in_srgb,var(--color-accent)_10%,transparent)] border-[color:color-mix(in_srgb,var(--color-accent)_20%,transparent)]' },
  partially_received:  { label: 'Partially Received',  color: 'text-[var(--color-warning)] bg-[color:color-mix(in_srgb,var(--color-warning)_10%,transparent)] border-[color:color-mix(in_srgb,var(--color-warning)_20%,transparent)]' },
  received:            { label: 'Received',             color: 'text-[var(--color-success)] bg-[color:color-mix(in_srgb,var(--color-success)_10%,transparent)] border-[color:color-mix(in_srgb,var(--color-success)_20%,transparent)]' },
  cancelled:           { label: 'Cancelled',            color: 'text-[var(--color-muted)] bg-[var(--color-bg-elevated)] border-[var(--color-border)]' },
}

// board_item_id: which stock row this buys — without it the receive credits no
// stock at all. job_id: which job it was bought FOR, blank = general stock (113).
// rate_basis: what unit_price is per (118). 'kg' by default because board is
// bought by the kilo; the line total is then weight x rate, not packets x rate.
const EMPTY_LINE = { description: '', specification: '', quantity: '1', unit_price: '0', notes: '', board_item_id: '', job_id: '', rate_basis: 'kg' }
const inputCls = 'w-full h-9 px-3 rounded-md border text-sm bg-[var(--color-bg-elevated)] text-[var(--color-text-primary)] border-[var(--color-border)] placeholder:text-[var(--color-text-muted)] focus:outline-none focus:border-[var(--color-accent)] focus:ring-1 focus:ring-[var(--color-accent)] transition-colors'

export default function PurchaseClient({ initialPOs, initialTotal, vendors, boardItems, openJobs }: { initialPOs: PO[]; initialTotal: number; vendors: Vendor[]; boardItems: BoardItem[]; openJobs: OpenJob[] }) {
  const [expanded, setExpanded] = useState<Set<string>>(new Set())
  const [filterStatus, setFilterStatus] = useState('')

  // The status tab is a server filter now, so it selects from every PO rather
  // than only the newest 200 the page happened to load.
  const list = useServerPagedList<PO>({
    endpoint: '/api/v1/purchase-orders',
    initialRows: initialPOs,
    initialTotal,
    errorMessage: 'Failed to load purchase orders',
  })
  const pos = list.rows
  const setPOs = list.setRows

  const changeStatus = (s: string) => {
    setFilterStatus(s)
    setSelected(new Set())   // ticked rows are about to leave the screen
    list.applyFilter({ status: s })
  }
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

  const addLine = () => setLineItems(p => [...p, { ...EMPTY_LINE }])
  const removeLine = (idx: number) => setLineItems(p => p.filter((_, i) => i !== idx))
  const setLine = (idx: number, k: string, v: string) => setLineItems(p => p.map((l, i) => i === idx ? { ...l, [k]: v } : l))

  // Mirrors the server's own line pricing (118) so the modal total and the
  // stored total agree. The server recomputes it either way — this is display.
  const lineAmount = (l: typeof EMPTY_LINE) => {
    const qty = parseFloat(l.quantity || '0'), rate = parseFloat(l.unit_price || '0')
    if (l.rate_basis !== 'kg') return qty * rate
    const b = boardItems.find(x => x.id === l.board_item_id)
    if (!b) return 0
    return sheetWeightKg(Number(b.sheet_width_in ?? 0), Number(b.sheet_height_in ?? 0), Number(b.gsm ?? 0))
      * qty * (b.sheets_per_packet || 100) * rate
  }
  const subtotal = lineItems.reduce((s, l) => s + lineAmount(l), 0)
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

  // Bulk selection. Bulk status moves reuse the same per-row PATCH the
  // Send/Confirm buttons already use — only rows in the correct current
  // status are touched, the rest of the selection is skipped.
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const toggleSelect = (id: string) => setSelected(p => { const n = new Set(p); n.has(id) ? n.delete(id) : n.add(id); return n })

  const bulkStatus = async (from: string, to: string, label: string) => {
    const targets = pos.filter(p => selected.has(p.id) && p.status === from)
    if (!targets.length) { toast.error(`No selected POs are in "${from}" status`); return }
    let ok = 0
    for (const po of targets) {
      try {
        const res = await fetch(`/api/v1/purchase-orders/${po.id}`, {
          method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ status: to }),
        })
        if (res.ok) ok++
      } catch { /* counted below */ }
    }
    setPOs(prev => prev.map(p => (selected.has(p.id) && p.status === from) ? { ...p, status: to } : p))
    setSelected(new Set())
    ok === targets.length ? toast.success(`${ok} PO${ok > 1 ? 's' : ''} ${label}`) : toast.error(`${ok}/${targets.length} updated — refresh to verify`)
  }

  const exportPOs = async () => {
    // Walks every page of the current filter, so Export still means "what I
    // filtered to" rather than "the 50 rows on screen".
    const source = selected.size
      ? pos.filter(p => selected.has(p.id))
      : await fetchAllPages<PO>('/api/v1/purchase-orders', { status: filterStatus })
    const rows = source.map(po => ({
      'PO #': po.po_number,
      'Vendor': po.vendors?.name ?? '',
      'Status': po.status,
      'Order Date': po.order_date,
      'Expected': po.expected_date ?? '',
      'Items': po.purchase_order_items?.length ?? 0,
      'Subtotal': po.subtotal,
      'Tax': po.tax_amount,
      'Total': po.total_amount,
    }))
    if (!rows.length) { toast.error('Nothing to export'); return }
    exportToExcel(rows, 'purchase-orders-export')
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
      const { data, warnings } = await res.json()
      setPOs(prev => prev.map(p => p.id === receiveModal.id ? { ...p, status: (data as any).status } : p))
      setReceiveModal(null)
      // A stock ledger row that failed to write used to be completely silent.
      if (Array.isArray(warnings) && warnings.length) warnings.forEach((w: string) => toast.error(w))
      else toast.success('Goods received')
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
      <div className="flex flex-col lg:flex-row lg:items-center gap-2.5">
        <TabStrip
          className="flex-1 min-w-0"
          tabs={['', 'draft', 'sent', 'confirmed', 'partially_received', 'received'].map(s => ({
            key: s,
            label: s === '' ? 'All' : STATUS_CFG[s as keyof typeof STATUS_CFG]?.label,
          }))}
          active={filterStatus}
          onChange={changeStatus}
        />
        <div className="flex items-center gap-2 flex-wrap [&>button]:flex-1 md:[&>button]:flex-none">
          {selected.size > 0 && (
            <>
              <span className="text-xs text-[var(--color-text-muted)]">{selected.size} selected</span>
              <button onClick={() => bulkStatus('draft', 'sent', 'marked Sent')}
                className="flex items-center gap-1.5 px-3 h-11 md:h-9 rounded-md border border-[color:color-mix(in_srgb,var(--color-info)_40%,transparent)] text-sm text-[var(--color-info)] hover:bg-[color:color-mix(in_srgb,var(--color-info)_10%,transparent)] transition-colors">
                <Send size={13} /> Mark Sent
              </button>
              <button onClick={() => bulkStatus('sent', 'confirmed', 'confirmed')}
                className="flex items-center gap-1.5 px-3 h-11 md:h-9 rounded-md border border-[color:color-mix(in_srgb,var(--color-accent)_40%,transparent)] text-sm text-[var(--color-accent)] hover:bg-[color:color-mix(in_srgb,var(--color-accent)_10%,transparent)] transition-colors">
                <Check size={13} /> Confirm
              </button>
            </>
          )}
          <button onClick={exportPOs}
            title={selected.size ? `Export ${selected.size} selected` : 'Export current list'}
            className="flex items-center gap-1.5 px-3 h-11 md:h-9 rounded-md border border-[var(--color-border)] text-sm text-[var(--color-text-secondary)] hover:bg-[var(--color-bg-elevated)] transition-colors justify-center">
            <Download size={14} /> Export{selected.size ? ` (${selected.size})` : ''}
          </button>
          <button onClick={() => setNewVendorModal(true)}
            className="flex items-center gap-1.5 px-3 h-11 md:h-9 rounded-md border border-[var(--color-border)] text-sm text-[var(--color-text-secondary)] hover:bg-[var(--color-bg-elevated)] transition-colors justify-center">
            <Plus size={14} /> New Vendor
          </button>
          <button onClick={() => setNewPOModal(true)}
            className="flex items-center gap-1.5 px-4 h-11 md:h-9 rounded-md bg-[var(--color-accent)] text-[var(--color-on-accent)] text-sm font-medium hover:bg-[var(--color-accent-hover)] transition-colors justify-center">
            <Plus size={15} /> New PO
          </button>
        </div>
      </div>

      {/* PO List */}
      <div className="rounded-xl border border-[var(--color-border)] bg-[var(--color-bg-secondary)] overflow-hidden">
        {pos.length === 0 ? (
          <div className="p-12 text-center">
            <ShoppingCart size={28} className="text-[var(--color-text-muted)] opacity-30 mx-auto mb-2" />
            <p className="text-sm text-[var(--color-text-muted)]">No purchase orders yet</p>
          </div>
        ) : (
          <div className="divide-y divide-[var(--color-border-subtle)]">
            {pos.map(po => {
              const statusCfg = STATUS_CFG[po.status as keyof typeof STATUS_CFG] || STATUS_CFG.draft
              const isOpen = expanded.has(po.id)
              const items = po.purchase_order_items || []
              return (
                <div key={po.id}>
                  <div className="flex flex-wrap items-center gap-x-4 gap-y-2 px-4 md:px-5 py-3.5 hover:bg-[color:color-mix(in_srgb,var(--color-bg-elevated)_30%,transparent)]">
                    <input type="checkbox" checked={selected.has(po.id)} onChange={() => toggleSelect(po.id)}
                      className="accent-[var(--color-accent)] cursor-pointer flex-shrink-0" />
                    <button onClick={() => toggle(po.id)} className="text-[var(--color-text-muted)] flex-shrink-0">
                      {isOpen ? <ChevronDown size={16} /> : <ChevronRight size={16} />}
                    </button>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-semibold font-mono text-[var(--color-accent)]">{po.po_number}</span>
                        <span className="text-sm text-[var(--color-text-primary)]">{po.vendors?.name}</span>
                        <span className="text-xs text-[var(--color-text-muted)]">({po.vendors?.vendor_code})</span>
                      </div>
                      <div className="flex flex-wrap items-center gap-x-3 gap-y-0.5 mt-0.5 text-xs text-[var(--color-text-muted)]">
                        <span>{items.length} item{items.length !== 1 ? 's' : ''}</span>
                        <span>Order: {formatDate(po.order_date)}</span>
                        {po.expected_date && <span>Expected: {formatDate(po.expected_date)}</span>}
                      </div>
                    </div>
                    <MoneyGate hide>
                      <div className="text-right flex-shrink-0">
                        <p className="text-sm font-bold text-[var(--color-text-primary)]">PKR {po.total_amount.toLocaleString(undefined, { minimumFractionDigits: 2 })}</p>
                      </div>
                    </MoneyGate>
                    <div className="flex items-center gap-2 flex-shrink-0">
                      <span className={cn('text-xs px-2.5 py-1 rounded-full border font-medium', statusCfg.color)}>{statusCfg.label}</span>
                      {po.status === 'draft' && (
                        <button onClick={() => updateStatus(po.id, 'sent')}
                          className="flex items-center gap-1 px-3 md:px-2.5 h-11 md:h-7 rounded border border-[color:color-mix(in_srgb,var(--color-info)_30%,transparent)] text-xs text-[var(--color-info)] hover:bg-[color:color-mix(in_srgb,var(--color-info)_10%,transparent)] transition-colors">
                          <Send size={11} /> Send
                        </button>
                      )}
                      {po.status === 'sent' && (
                        <button onClick={() => updateStatus(po.id, 'confirmed')}
                          className="flex items-center gap-1 px-3 md:px-2.5 h-11 md:h-7 rounded border border-[color:color-mix(in_srgb,var(--color-accent)_30%,transparent)] text-xs text-[var(--color-accent)] hover:bg-[color:color-mix(in_srgb,var(--color-accent)_10%,transparent)] transition-colors">
                          <Check size={11} /> Confirm
                        </button>
                      )}
                      {['confirmed','partially_received'].includes(po.status) && (
                        <button onClick={() => { setReceiveModal(po); const q: Record<string,string> = {}; items.forEach(i => { q[i.id] = String(i.quantity - i.quantity_received) }); setReceiveQtys(q) }}
                          className="flex items-center gap-1 px-3 md:px-2.5 h-11 md:h-7 rounded bg-[var(--color-success)] text-[var(--color-on-success)] text-xs font-medium hover:opacity-90 transition-colors">
                          <Check size={11} /> Receive
                        </button>
                      )}
                      {['confirmed','partially_received','received'].includes(po.status) && (
                        <button onClick={() => setMatchModal(po)}
                          className="flex items-center gap-1 px-3 md:px-2.5 h-11 md:h-7 rounded border border-[var(--color-border)] text-xs text-[var(--color-text-secondary)] hover:bg-[var(--color-bg-elevated)] transition-colors">
                          <Scale size={11} /> 3-Way Match
                        </button>
                      )}
                    </div>
                  </div>

                  {isOpen && items.length > 0 && (
                    <div className="border-t border-[var(--color-border-subtle)] bg-[color:color-mix(in_srgb,var(--color-bg-elevated)_30%,transparent)]">
                      <div className="hidden md:grid grid-cols-12 gap-3 px-10 py-2 text-xs font-semibold text-[var(--color-text-muted)] uppercase tracking-wider border-b border-[var(--color-border-subtle)]">
                        <div className="col-span-4">Description</div>
                        <div className="col-span-3">Specification</div>
                        <div className="col-span-1 text-right">Qty</div>
                        <div className="col-span-2 text-right">Unit Price</div>
                        <div className="col-span-2 text-right">Subtotal</div>
                      </div>
                      {items.map(item => (
                        <div key={item.id} className="grid grid-cols-2 md:grid-cols-12 gap-x-3 gap-y-1 px-5 md:px-10 py-2.5 text-sm border-b border-[var(--color-border-subtle)] last:border-0 items-center">
                          <div className="col-span-4 text-[var(--color-text-primary)]">{item.description}</div>
                          <div className="col-span-3 text-xs text-[var(--color-text-muted)]">{item.specification || '—'}</div>
                          <div className="col-span-1 text-right text-[var(--color-text-secondary)]">{item.quantity}</div>
                          {/* The basis matters as much as the number — PKR 250
                              per kg and per packet are different purchases. */}
                          <div className="col-span-2 text-right text-[var(--color-text-secondary)]">
                            <MoneyGate>
                              PKR {item.unit_price.toLocaleString(undefined, { minimumFractionDigits: 2 })}
                              <span className="text-[var(--color-text-muted)]">
                                {item.rate_basis === 'kg' ? ' /kg' : item.rate_basis === 'unit' ? ' /unit' : ' /pkt'}
                              </span>
                            </MoneyGate>
                          </div>
                          <div className="col-span-2 text-right font-medium text-[var(--color-text-primary)]">
                            <MoneyGate>PKR {item.subtotal.toLocaleString(undefined, { minimumFractionDigits: 2 })}</MoneyGate>
                          </div>
                        </div>
                      ))}
                      <MoneyGate hide>
                      <div className="flex justify-end px-10 py-2.5 text-sm">
                        <div className="space-y-1">
                          <div className="flex justify-between gap-12 text-[var(--color-text-muted)]"><span>Subtotal</span><span>PKR {po.subtotal.toLocaleString(undefined, { minimumFractionDigits: 2 })}</span></div>
                          {po.tax_amount > 0 && <div className="flex justify-between gap-12 text-[var(--color-text-muted)]"><span>Tax</span><span>PKR {po.tax_amount.toLocaleString(undefined, { minimumFractionDigits: 2 })}</span></div>}
                          <div className="flex justify-between gap-12 font-bold text-[var(--color-text-primary)] border-t border-[var(--color-border)] pt-1"><span>Total</span><span>PKR {po.total_amount.toLocaleString(undefined, { minimumFractionDigits: 2 })}</span></div>
                        </div>
                      </div>
                      </MoneyGate>
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        )}
      </div>

      <Pagination page={list.page} total={list.total} pageSize={list.pageSize}
        loading={list.loading} onPageChange={p => list.goToPage(p, { status: filterStatus })}
        noun="purchase orders" />

      {/* New PO Modal */}
      <Modal open={newPOModal} onClose={() => setNewPOModal(false)} title="New Purchase Order" size="xl"
        footer={
          <>
            <button onClick={() => setNewPOModal(false)} className="px-4 h-11 md:h-9 rounded-md border border-[var(--color-border)] text-sm text-[var(--color-text-secondary)] hover:bg-[var(--color-bg-elevated)] transition-colors">Cancel</button>
            <button onClick={createPO} disabled={loading || !poForm.vendor_id}
              className="px-4 h-9 rounded-md bg-[var(--color-accent)] text-[var(--color-on-accent)] text-sm font-medium hover:bg-[var(--color-accent-hover)] disabled:opacity-50 transition-colors">
              {loading ? 'Creating…' : 'Create PO'}
            </button>
          </>
        }>
        <div className="space-y-5">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            <div className="space-y-1.5">
              <label htmlFor="purchaseclient-1" className="text-sm font-medium text-[var(--color-text-primary)]">Vendor <span className="text-[var(--color-danger)]">*</span></label>
              <select id="purchaseclient-1" className={inputCls} value={poForm.vendor_id} onChange={e => setPOForm(p => ({ ...p, vendor_id: e.target.value }))}>
                <option value="">Select vendor…</option>
                {vendors.map(v => <option key={v.id} value={v.id}>{v.name} ({v.vendor_code})</option>)}
              </select>
            </div>
            <div className="space-y-1.5">
              <label htmlFor="purchaseclient-2" className="text-sm font-medium text-[var(--color-text-primary)]">Order Date</label>
              <input id="purchaseclient-2" type="date" className={inputCls} value={poForm.order_date} onChange={e => setPOForm(p => ({ ...p, order_date: e.target.value }))} />
            </div>
            <div className="space-y-1.5">
              <label htmlFor="purchaseclient-3" className="text-sm font-medium text-[var(--color-text-primary)]">Expected Date</label>
              <input id="purchaseclient-3" type="date" className={inputCls} value={poForm.expected_date} onChange={e => setPOForm(p => ({ ...p, expected_date: e.target.value }))} />
            </div>
          </div>

          {/* Line items */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <span className="text-sm font-medium text-[var(--color-text-primary)]">Line Items</span>
              <button onClick={addLine} className="text-xs text-[var(--color-accent)] hover:underline flex items-center gap-1"><Plus size={12} /> Add Line</button>
            </div>
            <div className="hidden md:grid grid-cols-12 gap-2 px-1 py-1 text-xs font-semibold text-[var(--color-text-muted)] uppercase tracking-wider">
              <div className="col-span-4">Description</div>
              <div className="col-span-3">Specification</div>
              <div className="col-span-1">Qty (pkt)</div>
              <div className="col-span-2">Rate</div>
              <div className="col-span-2 text-right">Subtotal</div>
            </div>
            <div className="space-y-2">
              {lineItems.map((item, idx) => {
                const board = boardItems.find(b => b.id === item.board_item_id)
                // A per-kg line is priced on WEIGHT, not on packets — that is
                // how board is actually invoiced (118). Weight comes from the
                // estimator's own formula, so a PO total and a quotation's
                // board cost are the same arithmetic on the same board.
                const lineWeightKg = board
                  ? sheetWeightKg(Number(board.sheet_width_in ?? 0), Number(board.sheet_height_in ?? 0), Number(board.gsm ?? 0))
                    * parseFloat(item.quantity || '0') * (board.sheets_per_packet || 100)
                  : 0
                const lineTotal = item.rate_basis === 'kg'
                  ? lineWeightKg * parseFloat(item.unit_price || '0')
                  : parseFloat(item.quantity || '0') * parseFloat(item.unit_price || '0')
                return (
                  <div key={idx} className="rounded-lg border border-[var(--color-border-subtle)] p-2.5 space-y-2">
                    <div className="grid grid-cols-2 md:grid-cols-12 gap-2 items-center">
                      <div className="col-span-2 md:col-span-4"><input className={inputCls} value={item.description} onChange={e => setLine(idx, 'description', e.target.value)} placeholder="Item description *" /></div>
                      <div className="col-span-2 md:col-span-3"><input className={inputCls} value={item.specification} onChange={e => setLine(idx, 'specification', e.target.value)} placeholder="Spec / grade" /></div>
                      <div className="col-span-1 md:col-span-1"><input type="number" className={inputCls} value={item.quantity} onChange={e => setLine(idx, 'quantity', e.target.value)} /></div>
                      <div className="col-span-1 md:col-span-2 flex items-center gap-1">
                        <MoneyGate><input type="number" className={inputCls} value={item.unit_price} onChange={e => setLine(idx, 'unit_price', e.target.value)} placeholder="0.00" /></MoneyGate>
                        {/* The basis, per line: board comes per kg, a paper ream
                            per packet, a service line per unit. */}
                        <select aria-label="Rate basis" className="h-9 px-1 rounded-md border text-xs bg-[var(--color-bg-elevated)] text-[var(--color-text-secondary)] border-[var(--color-border)] focus:outline-none focus:border-[var(--color-accent)]"
                          value={item.rate_basis} onChange={e => setLine(idx, 'rate_basis', e.target.value)}>
                          <option value="kg">/kg</option>
                          <option value="packet">/pkt</option>
                          <option value="unit">/unit</option>
                        </select>
                      </div>
                      <div className="col-span-2 md:col-span-2 flex items-center justify-between">
                        <MoneyGate><span className="text-sm font-medium text-[var(--color-text-primary)] tabular-nums">{lineTotal > 0 ? `PKR ${lineTotal.toLocaleString(undefined, { maximumFractionDigits: 0 })}` : '—'}</span></MoneyGate>
                        {lineItems.length > 1 && <button onClick={() => removeLine(idx)} aria-label="Remove line" className="w-11 h-11 md:w-auto md:h-auto flex items-center justify-center text-[var(--color-text-muted)] hover:text-[var(--color-danger)]"><Trash2 size={14} /></button>}
                      </div>
                    </div>

                    {/* A per-kg line has to show its weight, or nobody can check
                        the total against the vendor's invoice. */}
                    {item.rate_basis === 'kg' && (
                      lineWeightKg > 0 ? (
                        <MoneyGate hide>
                          <p className="text-xs text-[var(--color-text-muted)] tabular-nums">
                            {lineWeightKg.toFixed(1)} kg × PKR {parseFloat(item.unit_price || '0').toLocaleString()}/kg
                            {' · '}PKR {(lineTotal / Math.max(parseFloat(item.quantity || '0'), 1)).toLocaleString(undefined, { maximumFractionDigits: 2 })} per packet
                          </p>
                        </MoneyGate>
                      ) : (
                        <p className="text-xs text-[var(--color-warning)]">
                          Per-kg pricing needs the stock item&rsquo;s sheet size and GSM — pick a board stock item below, or set them in Board Inventory first. Use <strong>/pkt</strong> otherwise.
                        </p>
                      )
                    )}

                    {/* Stock link + job. The stock link is what makes receiving
                        this line actually add board to the store; without it the
                        PO is only a piece of paper. */}
                    <div className="grid grid-cols-1 md:grid-cols-12 gap-2">
                      <div className="md:col-span-7 space-y-1">
                        <label htmlFor={`po-line-board-${idx}`} className="text-xs text-[var(--color-text-muted)]">Board stock item — links this line to the store</label>
                        <select id={`po-line-board-${idx}`} className={inputCls} value={item.board_item_id}
                          onChange={e => {
                            const id = e.target.value
                            setLine(idx, 'board_item_id', id)
                            // Save retyping: an empty description takes the
                            // stock item's own name.
                            const b = boardItems.find(x => x.id === id)
                            if (b && !item.description) setLine(idx, 'description', boardLabel(b))
                          }}>
                          <option value="">Not a stock item (no stock will be added)</option>
                          {boardItems.map(b => <option key={b.id} value={b.id}>{boardLabel(b)}</option>)}
                        </select>
                      </div>
                      <div className="md:col-span-5 space-y-1">
                        <label htmlFor={`po-line-job-${idx}`} className="text-xs text-[var(--color-text-muted)]">For which job? (blank = general stock)</label>
                        <select id={`po-line-job-${idx}`} className={inputCls} value={item.job_id}
                          onChange={e => setLine(idx, 'job_id', e.target.value)}>
                          <option value="">General stock</option>
                          {openJobs.map(j => <option key={j.id} value={j.id}>{j.job_number} — {j.job_title}</option>)}
                        </select>
                      </div>
                    </div>

                    {board && parseFloat(item.quantity || '0') > 0 && (
                      <p className="text-xs text-[var(--color-text-muted)] tabular-nums">
                        {parseFloat(item.quantity).toLocaleString()} packet(s) ={' '}
                        {(parseFloat(item.quantity) * board.sheets_per_packet).toLocaleString()} sheets
                        {' '}({board.sheets_per_packet}/packet)
                      </p>
                    )}
                  </div>
                )
              })}
            </div>

            {/* Totals */}
            <MoneyGate hide>
            <div className="flex justify-end mt-3 pt-3 border-t border-[var(--color-border)]">
              <div className="w-64 space-y-1.5 text-sm">
                <div className="flex justify-between text-[var(--color-text-secondary)]"><span>Subtotal</span><span>PKR {subtotal.toLocaleString(undefined, { minimumFractionDigits: 2 })}</span></div>
                <div className="flex items-center justify-between gap-4">
                  <span className="text-[var(--color-text-secondary)] flex-shrink-0">Tax %</span>
                  <input type="number" className="w-20 h-11 md:h-8 px-2.5 rounded border text-sm text-right bg-[var(--color-bg-elevated)] text-[var(--color-text-primary)] border-[var(--color-border)] focus:outline-none transition-colors" value={poForm.tax_rate} onChange={e => setPOForm(p => ({ ...p, tax_rate: e.target.value }))} />
                </div>
                <div className="flex justify-between font-bold text-[var(--color-text-primary)] pt-1 border-t border-[var(--color-border)]"><span>Total</span><span>PKR {total.toLocaleString(undefined, { minimumFractionDigits: 2 })}</span></div>
              </div>
            </div>
            </MoneyGate>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <label htmlFor="purchaseclient-4" className="text-sm font-medium text-[var(--color-text-primary)]">Notes</label>
              <input id="purchaseclient-4" className={inputCls} value={poForm.notes} onChange={e => setPOForm(p => ({ ...p, notes: e.target.value }))} placeholder="Special instructions" />
            </div>
            <div className="space-y-1.5">
              <label htmlFor="purchaseclient-5" className="text-sm font-medium text-[var(--color-text-primary)]">Terms</label>
              <input id="purchaseclient-5" className={inputCls} value={poForm.terms} onChange={e => setPOForm(p => ({ ...p, terms: e.target.value }))} placeholder="Payment terms" />
            </div>
          </div>
        </div>
      </Modal>

      {/* Receive Goods Modal */}
      {receiveModal && (
        <Modal open={true} onClose={() => setReceiveModal(null)} title={`Receive Goods — ${receiveModal.po_number}`} size="md"
          footer={
            <>
              <button onClick={() => setReceiveModal(null)} className="px-4 h-11 md:h-9 rounded-md border border-[var(--color-border)] text-sm text-[var(--color-text-secondary)] hover:bg-[var(--color-bg-elevated)] transition-colors">Cancel</button>
              <button onClick={receiveGoods} disabled={loading}
                className="px-4 h-9 rounded-md bg-[var(--color-success)] text-[var(--color-on-success)] text-sm font-medium hover:opacity-90 disabled:opacity-50 transition-colors">
                {loading ? 'Processing…' : 'Receive Goods'}
              </button>
            </>
          }>
          <div className="space-y-3">
            <p className="text-sm text-[var(--color-text-muted)]">
              Enter the packets received for each line. A fractional value is fine
              &mdash; 44.68 means 44 packets and 68 loose sheets.
            </p>
            {(receiveModal.purchase_order_items || []).map(item => {
              const board = boardItems.find(b => b.id === item.board_item_id)
              const entered = parseFloat(receiveQtys[item.id] ?? String(item.quantity)) || 0
              return (
                <div key={item.id} className="flex flex-col md:flex-row md:items-center gap-2 md:gap-3 rounded-lg border border-[var(--color-border-subtle)] md:border-0 p-3 md:p-0">
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-[var(--color-text-primary)]">{item.description}</p>
                    <p className="text-xs text-[var(--color-text-muted)] tabular-nums">Ordered: {item.quantity} pkt | Previously received: {item.quantity_received} pkt</p>
                    {item.jobs && (
                      <p className="text-xs text-[var(--color-accent)]">For {item.jobs.job_number}</p>
                    )}
                    {board ? (
                      <p className="text-xs text-[var(--color-text-muted)] tabular-nums">
                        Adds {(entered * board.sheets_per_packet).toLocaleString()} sheets to {board.description}
                      </p>
                    ) : (
                      // Says so plainly instead of the old blanket promise that
                      // "board inventory will be updated automatically", which
                      // was false for every line with no stock link.
                      <p className="text-xs text-[var(--color-warning)]">
                        No board stock item on this line &mdash; stock will not change
                      </p>
                    )}
                  </div>
                  <input type="number"
                    aria-label={`Packets received for ${item.description}`}
                    className="w-24 h-11 md:h-8 px-2.5 rounded-md border text-sm bg-[var(--color-bg-elevated)] text-[var(--color-text-primary)] border-[var(--color-border)] focus:outline-none focus:border-[var(--color-accent)] transition-colors"
                    value={receiveQtys[item.id] ?? ''}
                    onChange={e => setReceiveQtys(prev => ({ ...prev, [item.id]: e.target.value }))}
                    placeholder="Packets" />
                </div>
              )
            })}
          </div>
        </Modal>
      )}

      {/* New Vendor Modal */}
      <Modal open={newVendorModal} onClose={() => setNewVendorModal(false)} title="New Vendor" size="md"
        footer={
          <>
            <button onClick={() => setNewVendorModal(false)} className="px-4 h-11 md:h-9 rounded-md border border-[var(--color-border)] text-sm text-[var(--color-text-secondary)] hover:bg-[var(--color-bg-elevated)] transition-colors">Cancel</button>
            <button onClick={createVendor} disabled={loading || !vendorForm.name}
              className="px-4 h-9 rounded-md bg-[var(--color-accent)] text-[var(--color-on-accent)] text-sm font-medium hover:bg-[var(--color-accent-hover)] disabled:opacity-50 transition-colors">
              {loading ? 'Creating…' : 'Create Vendor'}
            </button>
          </>
        }>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          <div className="col-span-2 space-y-1.5">
            <label htmlFor="purchaseclient-6" className="text-sm font-medium text-[var(--color-text-primary)]">Vendor Name <span className="text-[var(--color-danger)]">*</span></label>
            <input id="purchaseclient-6" className={inputCls} value={vendorForm.name} onChange={e => setVendorForm(p => ({ ...p, name: e.target.value }))} placeholder="e.g. Paper Mart Pakistan" />
          </div>
          {[
            { key: 'contact_person', label: 'Contact Person', placeholder: 'Mr. Ahmed' },
            { key: 'phone', label: 'Phone', placeholder: '+92 21 111 000 000' },
            { key: 'mobile', label: 'Mobile', placeholder: '+92 300 0000000' },
            { key: 'email', label: 'Email', placeholder: 'sales@vendor.com' },
          ].map(f => (
            <div key={f.key} className="space-y-1.5">
              <label htmlFor="purchaseclient-7" className="text-sm font-medium text-[var(--color-text-primary)]">{f.label}</label>
              <input id="purchaseclient-7" className={inputCls} value={(vendorForm as any)[f.key]} onChange={e => setVendorForm(p => ({ ...p, [f.key]: e.target.value }))} placeholder={f.placeholder} />
            </div>
          ))}
          <div className="space-y-1.5">
            <label htmlFor="purchaseclient-8" className="text-sm font-medium text-[var(--color-text-primary)]">NTN</label>
            <input id="purchaseclient-8" className={inputCls} value={vendorForm.ntn} onChange={e => setVendorForm(p => ({ ...p, ntn: e.target.value }))} placeholder="Tax number" />
          </div>
          <div className="space-y-1.5">
            <label htmlFor="purchaseclient-9" className="text-sm font-medium text-[var(--color-text-primary)]">Payment Terms (Days)</label>
            <input id="purchaseclient-9" type="number" className={inputCls} value={vendorForm.payment_terms} onChange={e => setVendorForm(p => ({ ...p, payment_terms: e.target.value }))} />
          </div>
          <div className="col-span-2 space-y-1.5">
            <label htmlFor="purchaseclient-10" className="text-sm font-medium text-[var(--color-text-primary)]">Address</label>
            <input id="purchaseclient-10" className={inputCls} value={vendorForm.address} onChange={e => setVendorForm(p => ({ ...p, address: e.target.value }))} placeholder="Vendor address" />
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
  matched:               { label: 'Matched',           color: 'text-[var(--color-success)] bg-[color:color-mix(in_srgb,var(--color-success)_10%,transparent)] border-[color:color-mix(in_srgb,var(--color-success)_20%,transparent)]' },
  not_billed:            { label: 'Not Billed Yet',    color: 'text-[var(--color-text-muted)] bg-[var(--color-bg-elevated)] border-[var(--color-border)]' },
  partially_billed:      { label: 'Partially Billed',  color: 'text-[var(--color-warning)] bg-[color:color-mix(in_srgb,var(--color-warning)_10%,transparent)] border-[color:color-mix(in_srgb,var(--color-warning)_20%,transparent)]' },
  billed_exceeds_received: { label: 'Over-Billed',     color: 'text-[var(--color-danger)] bg-[color:color-mix(in_srgb,var(--color-danger)_10%,transparent)] border-[color:color-mix(in_srgb,var(--color-danger)_20%,transparent)]' },
  price_mismatch:        { label: 'Price Mismatch',    color: 'text-[var(--color-danger)] bg-[color:color-mix(in_srgb,var(--color-danger)_10%,transparent)] border-[color:color-mix(in_srgb,var(--color-danger)_20%,transparent)]' },
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
        <button onClick={startBill} className="px-4 h-11 md:h-9 rounded-md bg-[var(--color-accent)] text-[var(--color-on-accent)] text-sm font-medium hover:bg-[var(--color-accent-hover)] transition-colors">
          Record Vendor Bill
        </button>
      ) : (
        <div className="rounded-lg border border-[var(--color-border)] p-3 space-y-3">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
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
            <button onClick={saveBill} disabled={saving} className="px-4 h-11 md:h-9 rounded-md bg-[var(--color-accent)] text-[var(--color-on-accent)] text-sm font-medium hover:bg-[var(--color-accent-hover)] disabled:opacity-50">Save Bill</button>
            <button onClick={() => setBillForm(null)} className="px-3 h-11 md:h-9 rounded-md border border-[var(--color-border)] text-sm hover:bg-[var(--color-bg-elevated)]">Cancel</button>
          </div>
        </div>
      )}
    </div>
  )
}
