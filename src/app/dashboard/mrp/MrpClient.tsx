'use client'
import { useState, useEffect } from 'react'
import { ClipboardList, AlertTriangle, RefreshCw, ShoppingCart } from 'lucide-react'
import { cn } from '@/lib/utils/cn'
import { DataList, type DataListColumn } from '@/components/ui/DataList'
import { toast } from '@/components/ui/Toast'
import { Modal } from '@/components/ui/Modal'

interface MrpRow {
  board_type_id: string; board_type_name: string; gsm: number | null
  demand_sheets: number; stock_sheets: number; incoming_sheets: number
  shortfall_sheets: number; reorder_level: number; open_job_count: number
}
interface Vendor { id: string; name: string; vendor_code: string }

const inputCls = 'w-full h-9 px-3 rounded-md border text-sm bg-[var(--color-bg-elevated)] text-[var(--color-text-primary)] border-[var(--color-border)] focus:outline-none focus:border-[var(--color-accent)] focus:ring-1 focus:ring-[var(--color-accent)] transition-colors'
const fmt = (n: number) => Number(n || 0).toLocaleString(undefined, { maximumFractionDigits: 0 })


const MRP_COLUMNS = (openCreatePO: (r: MrpRow) => void): DataListColumn<MrpRow>[] => [
  {
    key: 'type', header: 'Board Type', span: 3, role: 'identity',
    render: r => (
      <span className="block min-w-0">
        <span className="block text-sm font-medium text-[var(--color-text-primary)] truncate">{r.board_type_name}</span>
        <span className="block text-xs text-[var(--color-text-muted)]">{r.gsm ? `${r.gsm} GSM · ` : ''}{r.open_job_count} open job{r.open_job_count !== 1 ? 's' : ''}</span>
      </span>
    ),
  },
  {
    key: 'demand', header: 'Demand (Open Jobs)', span: 2, role: 'meta', label: 'Demand', align: 'right',
    render: r => <span className="text-sm text-[var(--color-text-primary)]">{fmt(r.demand_sheets)}</span>,
  },
  {
    key: 'stock', header: 'In Stock', span: 2, role: 'meta', label: 'In stock', align: 'right',
    render: r => <span className="text-sm text-[var(--color-text-secondary)]">{fmt(r.stock_sheets)}</span>,
  },
  {
    key: 'incoming', header: 'Incoming (PO)', span: 2, role: 'meta', label: 'Incoming', align: 'right',
    render: r => <span className="text-sm text-[var(--color-text-muted)]">{fmt(r.incoming_sheets)}</span>,
  },
  {
    key: 'shortfall', header: 'Shortfall', span: 2, role: 'status', align: 'right',
    render: r => (
      <span className={cn('text-sm font-semibold', r.shortfall_sheets > 0 ? 'text-[var(--color-danger)]' : 'text-[var(--color-success)]')}>
        {r.shortfall_sheets > 0 ? `${fmt(r.shortfall_sheets)} short` : 'OK'}
      </span>
    ),
  },
  {
    key: 'action', header: 'Action', span: 1, role: 'actions', align: 'right',
    render: r =>
      r.shortfall_sheets > 0 ? (
        <button onClick={() => openCreatePO(r)} title="Create Purchase Order"
          className="flex items-center gap-1.5 px-3 md:px-0 h-9 md:h-8 md:w-8 justify-center rounded-md border md:border-0 border-[var(--color-accent)]/30 text-xs md:text-sm text-[var(--color-accent)] md:text-[var(--color-text-muted)] hover:bg-[var(--color-accent)]/10 hover:text-[var(--color-accent)] transition-colors">
          <ShoppingCart size={14} /> <span className="md:hidden">Create PO</span>
        </button>
      ) : null,
  },
]

export default function MrpClient() {
  const [rows, setRows] = useState<MrpRow[]>([])
  const [loading, setLoading] = useState(true)
  const [vendors, setVendors] = useState<Vendor[]>([])
  const [poRow, setPoRow] = useState<MrpRow | null>(null)
  const [poForm, setPoForm] = useState({ vendor_id: '', quantity: '', unit_price: '' })
  const [poLoading, setPoLoading] = useState(false)

  const load = async () => {
    setLoading(true)
    try {
      const res = await fetch('/api/v1/mrp')
      const json = await res.json()
      if (!res.ok) throw new Error(json.error)
      setRows(json.data ?? [])
    } catch { toast.error('Failed to load material requirements') }
    finally { setLoading(false) }
  }

  useEffect(() => {
    load()
    fetch('/api/v1/vendors').then(r => r.json()).then(j => setVendors(j.data ?? [])).catch(() => {})
  }, [])

  const openCreatePO = (row: MrpRow) => {
    setPoRow(row)
    setPoForm({ vendor_id: '', quantity: String(Math.ceil(row.shortfall_sheets)), unit_price: '' })
  }

  const createPO = async () => {
    if (!poRow) return
    if (!poForm.vendor_id) { toast.error('Vendor required'); return }
    const qty = parseFloat(poForm.quantity)
    if (!qty || qty <= 0) { toast.error('Quantity must be greater than 0'); return }
    setPoLoading(true)
    try {
      const res = await fetch('/api/v1/purchase-orders', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          vendor_id: poForm.vendor_id,
          notes: `Auto-suggested by MRP — ${poRow.board_type_name} shortfall`,
          items: [{
            material_name: poRow.board_type_name,
            quantity: qty,
            unit_price: poForm.unit_price || '0',
          }],
        }),
      })
      if (!res.ok) { const e = await res.json(); throw new Error(e.error) }
      const { data } = await res.json()
      toast.success(`Purchase Order ${data.po_number} created`)
      setPoRow(null)
      load()
    } catch (e: any) { toast.error(e.message || 'Failed to create PO') }
    finally { setPoLoading(false) }
  }

  const shortfallCount = rows.filter(r => r.shortfall_sheets > 0).length

  return (
    <div className="space-y-4">
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-3">
        <div>
          <h1 className="text-xl md:text-2xl font-bold text-[var(--color-text-primary)] flex items-center gap-2">
            <ClipboardList size={22} /> Material Requirement Planning
          </h1>
          <p className="text-sm text-[var(--color-text-muted)] mt-0.5">
            Board demand from open jobs, compared against current stock and material already on order.
          </p>
        </div>
        <button onClick={load} disabled={loading}
          className="flex items-center justify-center gap-1.5 px-3 h-11 md:h-9 rounded-md border border-[var(--color-border)] text-sm text-[var(--color-text-secondary)] hover:bg-[var(--color-bg-elevated)] disabled:opacity-50 transition-colors">
          <RefreshCw size={13} className={loading ? 'animate-spin' : ''} /> Refresh
        </button>
      </div>

      {shortfallCount > 0 && (
        <div className="flex items-center gap-2 px-4 py-3 rounded-lg bg-[var(--color-danger)]/10 border border-[var(--color-danger)]/20 text-sm text-[var(--color-danger)]">
          <AlertTriangle size={16} className="flex-shrink-0" />
          {shortfallCount} board type{shortfallCount !== 1 ? 's' : ''} short of what&apos;s needed for open jobs.
        </div>
      )}

      {loading ? (
        <div className="rounded-xl border border-[var(--color-border)] bg-[var(--color-bg-secondary)] p-10 text-center text-sm text-[var(--color-text-muted)]">Loading…</div>
      ) : (
        <DataList<MrpRow>
          rows={rows}
          columns={MRP_COLUMNS(openCreatePO)}
          getRowId={r => r.board_type_id}
          rowClassName={r => (r.shortfall_sheets > 0 ? 'bg-[var(--color-danger)]/5' : undefined)}
          striped={false}
          empty={
            <div className="p-10 text-center">
              <ClipboardList size={28} className="text-[var(--color-text-muted)] opacity-30 mx-auto mb-2" />
              <p className="text-sm text-[var(--color-text-muted)]">No open demand or stock to plan against yet.</p>
            </div>
          }
        />
      )}

      {/* Create PO from shortfall */}
      <Modal open={!!poRow} onClose={() => setPoRow(null)} title={poRow ? `Create PO — ${poRow.board_type_name}` : ''} size="sm"
        footer={
          <>
            <button onClick={() => setPoRow(null)} className="px-4 h-9 rounded-md border border-[var(--color-border)] text-sm text-[var(--color-text-secondary)] hover:bg-[var(--color-bg-elevated)] transition-colors">Cancel</button>
            <button onClick={createPO} disabled={poLoading || !poForm.vendor_id}
              className="px-4 h-9 rounded-md bg-[var(--color-accent)] text-white text-sm font-medium hover:bg-[var(--color-accent-hover)] disabled:opacity-50 transition-colors">
              {poLoading ? 'Creating…' : 'Create Purchase Order'}
            </button>
          </>
        }>
        <div className="space-y-3">
          <div className="space-y-1.5">
            <label className="text-sm font-medium text-[var(--color-text-primary)]">Vendor <span className="text-[var(--color-danger)]">*</span></label>
            <select className={inputCls} value={poForm.vendor_id} onChange={e => setPoForm(p => ({ ...p, vendor_id: e.target.value }))}>
              <option value="">Select vendor</option>
              {vendors.map(v => <option key={v.id} value={v.id}>{v.name} ({v.vendor_code})</option>)}
            </select>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <label className="text-sm font-medium text-[var(--color-text-primary)]">Quantity (sheets)</label>
              <input type="number" className={inputCls} value={poForm.quantity} onChange={e => setPoForm(p => ({ ...p, quantity: e.target.value }))} />
            </div>
            <div className="space-y-1.5">
              <label className="text-sm font-medium text-[var(--color-text-primary)]">Unit Price (PKR)</label>
              <input type="number" className={inputCls} value={poForm.unit_price} onChange={e => setPoForm(p => ({ ...p, unit_price: e.target.value }))} placeholder="0" />
            </div>
          </div>
          {poRow && (
            <p className="text-xs text-[var(--color-text-muted)]">
              Shortfall: {fmt(poRow.shortfall_sheets)} sheets — quantity pre-filled to cover it, adjust if ordering more.
            </p>
          )}
        </div>
      </Modal>
    </div>
  )
}
