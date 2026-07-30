'use client'
import { useState } from 'react'
import { Layers, Plus, TrendingUp, TrendingDown, SlidersHorizontal, AlertTriangle, Search, Download } from 'lucide-react'
import { cn } from '@/lib/utils/cn'
import { toast } from '@/components/ui/Toast'
import { exportToExcel } from '@/lib/utils/exportToExcel'
import { DataList, type DataListColumn } from '@/components/ui/DataList'
import { Toolbar } from '@/components/ui/Toolbar'
import { Modal } from '@/components/ui/Modal'

interface BoardItem {
  id: string; description: string; gsm: number | null; sheet_width_in: number | null; sheet_height_in: number | null
  /** SHEETS, always — see migration 113. Packets are display only. */
  current_stock: number; reserved_stock: number; reorder_level: number
  /** Sheets in one packet for this item: 100 for board, often 500 for paper. */
  sheets_per_packet: number
  unit_cost: number; location: string | null; is_active: boolean
  board_types?: { name: string } | null
  vendor_id?: string | null
  vendors?: { name: string } | null
}
interface BoardType { id: string; name: string }
interface Unit { id: string; name: string; symbol: string }
interface Vendor { id: string; name: string }

/**
 * The store counts packets; the database stores sheets. Every number the user
 * sees or types on this screen goes through one of these two, and nothing else
 * does the arithmetic inline.
 */
const toPackets = (sheets: number, perPacket: number) => sheets / (perPacket || 100)
const toSheets  = (packets: number, perPacket: number) => packets * (perPacket || 100)

/** "44.68" not "44.6800000000001", and no trailing ".00" on whole packets. */
const fmtPackets = (n: number) =>
  (Math.round(n * 100) / 100).toLocaleString(undefined, { maximumFractionDigits: 2 })

const inputCls = 'w-full h-9 px-3 rounded-md border text-sm bg-[var(--color-bg-elevated)] text-[var(--color-text-primary)] border-[var(--color-border)] placeholder:text-[var(--color-text-muted)] focus:outline-none focus:border-[var(--color-accent)] focus:ring-1 focus:ring-[var(--color-accent)] transition-colors'


const INV_COLUMNS = (
  setLotsItem: (i: BoardItem) => void,
  setMovementModal: (m: { item: BoardItem; action: 'in' | 'out' | 'adjustment' }) => void,
  setMoveForm: (f: { quantity: string; notes: string; lot_number: string }) => void,
): DataListColumn<BoardItem>[] => [
  {
    key: 'desc', header: 'Description', span: 3, role: 'identity',
    render: i => (
      <span className="block">
        <span className="block text-sm font-medium text-[var(--color-text-primary)]">{i.description}</span>
        {/* Vendor is the first grouping on the shop's own stock report, and it
            never appeared here until 113 gave vendor_id a foreign key. */}
        {i.vendors?.name && <span className="block text-xs text-[var(--color-text-muted)]">{i.vendors.name}</span>}
      </span>
    ),
  },
  {
    key: 'type', header: 'Type / GSM', span: 2, role: 'title',
    render: i => (
      <span className="block">
        <span className="block text-xs text-[var(--color-text-secondary)]">{i.board_types?.name || '—'}</span>
        {i.gsm && <span className="block text-xs text-[var(--color-text-muted)]">{i.gsm} GSM</span>}
      </span>
    ),
  },
  {
    key: 'size', header: 'Size', span: 2, role: 'meta', label: 'Size',
    render: i => (
      <span className="text-xs text-[var(--color-text-muted)]">
        {i.sheet_width_in && i.sheet_height_in ? `${i.sheet_width_in} × ${i.sheet_height_in}` : '—'}
      </span>
    ),
  },
  {
    key: 'stock', header: 'Stock (pkt)', span: 1, role: 'status', align: 'right',
    render: i => {
      const isLow = i.current_stock <= i.reorder_level
      const isOut = i.current_stock <= 0
      return (
        <span className="inline-flex flex-col items-end">
          {/* Packets first because that is what the store counts; sheets
              underneath because that is what the job consumes. */}
          <span className={cn('text-sm font-bold tabular-nums',
            isOut ? 'text-[var(--color-danger)]' : isLow ? 'text-[var(--color-warning)]' : 'text-[var(--color-success)]')}>
            {fmtPackets(toPackets(i.current_stock, i.sheets_per_packet))}
            {isLow && !isOut && <AlertTriangle size={11} className="text-[var(--color-warning)] inline ml-1" />}
          </span>
          <span className="text-xs text-[var(--color-text-muted)] tabular-nums">{i.current_stock.toLocaleString()} sht</span>
          {isOut && <span className="text-xs text-[var(--color-danger)]">OUT</span>}
        </span>
      )
    },
  },
  {
    key: 'reorder', header: 'Reorder (pkt)', span: 1, role: 'meta', label: 'Reorder at', align: 'right',
    render: i => (
      <span className="text-xs text-[var(--color-text-muted)] tabular-nums">
        {fmtPackets(toPackets(i.reorder_level, i.sheets_per_packet))}
      </span>
    ),
  },
  {
    key: 'location', header: 'Location', span: 1, role: 'desktop',
    render: i => <span className="text-xs text-[var(--color-text-muted)]">{i.location || '—'}</span>,
  },
  {
    key: 'actions', header: 'Actions', span: 2, role: 'actions', align: 'right',
    render: i => (
      <span className="inline-flex items-center gap-1 justify-end">
        <button onClick={() => setLotsItem(i)} title="Lot History" aria-label="Lot history"
          className="flex items-center gap-1 px-2.5 md:px-2 h-9 md:h-7 rounded border border-[var(--color-border)] text-xs text-[var(--color-text-muted)] hover:bg-[var(--color-bg-elevated)] transition-colors">
          <Layers size={11} />
        </button>
        <button onClick={() => { setMovementModal({ item: i, action: 'in' }); setMoveForm({ quantity: '', notes: '', lot_number: '' }) }}
          className="flex items-center gap-1 px-2.5 md:px-2 h-9 md:h-7 rounded border border-[color:color-mix(in_srgb,var(--color-success)_30%,transparent)] text-xs text-[var(--color-success)] hover:bg-[color:color-mix(in_srgb,var(--color-success)_10%,transparent)] transition-colors">
          <TrendingUp size={11} /> In
        </button>
        <button onClick={() => { setMovementModal({ item: i, action: 'out' }); setMoveForm({ quantity: '', notes: '', lot_number: '' }) }}
          className="flex items-center gap-1 px-2.5 md:px-2 h-9 md:h-7 rounded border border-[color:color-mix(in_srgb,var(--color-danger)_30%,transparent)] text-xs text-[var(--color-danger)] hover:bg-[color:color-mix(in_srgb,var(--color-danger)_10%,transparent)] transition-colors">
          <TrendingDown size={11} /> Out
        </button>
        <button onClick={() => { setMovementModal({ item: i, action: 'adjustment' }); setMoveForm({ quantity: String(toPackets(i.current_stock, i.sheets_per_packet)), notes: '', lot_number: '' }) }}
          className="flex items-center gap-1 px-2.5 md:px-2 h-9 md:h-7 rounded border border-[var(--color-border)] text-xs text-[var(--color-text-muted)] hover:bg-[var(--color-bg-elevated)] transition-colors">
          <SlidersHorizontal size={11} /> Adj
        </button>
      </span>
    ),
  },
]

export default function BoardInventoryClient({ initialItems, boardTypes, units, vendors }: { initialItems: BoardItem[]; boardTypes: BoardType[]; units: Unit[]; vendors: Vendor[] }) {
  const [items, setItems] = useState(initialItems)
  const [search, setSearch] = useState('')
  const [showLowOnly, setShowLowOnly] = useState(false)
  const [addModal, setAddModal] = useState(false)
  const [movementModal, setMovementModal] = useState<{ item: BoardItem; action: 'in' | 'out' | 'adjustment' } | null>(null)
  const [lotsItem, setLotsItem] = useState<BoardItem | null>(null)
  const [loading, setLoading] = useState(false)

  const [addForm, setAddForm] = useState({
    description: '', board_type_id: '', gsm: '', sheet_width_in: '', sheet_height_in: '',
    // These two are entered in PACKETS and converted to sheets on submit.
    current_stock: '0', reorder_level: '0',
    sheets_per_packet: '100', vendor_id: '',
    unit_id: '', unit_cost: '0', location: '',
  })
  const [moveForm, setMoveForm] = useState({ quantity: '', notes: '', lot_number: '' })

  const filtered = items
    .filter(i => !search || i.description.toLowerCase().includes(search.toLowerCase()))
    .filter(i => !showLowOnly || i.current_stock <= i.reorder_level)

  const totalStock = items.reduce((s, i) => s + i.current_stock, 0)
  const lowStockCount = items.filter(i => i.current_stock <= i.reorder_level).length

  const addItem = async () => {
    if (!addForm.description) { toast.error('Description required'); return }
    setLoading(true)
    try {
      // The unit boundary lives here: the form is in packets, the API and the
      // database are in sheets. Nothing downstream converts again.
      const perPacket = parseInt(addForm.sheets_per_packet || '100', 10) || 100
      const res = await fetch('/api/v1/board-inventory', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...addForm,
          sheets_per_packet: perPacket,
          vendor_id: addForm.vendor_id || null,
          current_stock: toSheets(parseFloat(addForm.current_stock || '0'), perPacket),
          reorder_level: toSheets(parseFloat(addForm.reorder_level || '0'), perPacket),
        }),
      })
      if (!res.ok) { const e = await res.json(); throw new Error(e.error) }
      const { data } = await res.json()
      const bt = boardTypes.find(b => b.id === addForm.board_type_id)
      const vn = vendors.find(v => v.id === addForm.vendor_id)
      setItems(prev => [...prev, { ...data, board_types: bt ? { name: bt.name } : null, vendors: vn ? { name: vn.name } : null }].sort((a, b) => a.description.localeCompare(b.description)))
      setAddModal(false)
      setAddForm({ description: '', board_type_id: '', gsm: '', sheet_width_in: '', sheet_height_in: '', current_stock: '0', reorder_level: '0', sheets_per_packet: '100', vendor_id: '', unit_id: '', unit_cost: '0', location: '' })
      toast.success('Item added to inventory')
    } catch (e: any) { toast.error(e.message || 'Failed') }
    finally { setLoading(false) }
  }

  const applyMovement = async () => {
    if (!movementModal) return
    const packets = parseFloat(moveForm.quantity || '0')
    if (packets <= 0 && movementModal.action !== 'adjustment') { toast.error('Quantity must be greater than 0'); return }
    setLoading(true)
    try {
      // Typed in packets, sent in sheets — the API and the ledger only ever
      // deal in sheets (113).
      const qty = toSheets(packets, movementModal.item.sheets_per_packet)
      const res = await fetch(`/api/v1/board-inventory/${movementModal.item.id}`, {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: movementModal.action, quantity: qty, notes: moveForm.notes, lot_number: moveForm.lot_number || undefined }),
      })
      if (!res.ok) { const e = await res.json(); throw new Error(e.error) }
      const { data } = await res.json()
      setItems(prev => prev.map(i => i.id === movementModal.item.id ? { ...i, current_stock: (data as any).current_stock } : i))
      setMovementModal(null)
      setMoveForm({ quantity: '', notes: '', lot_number: '' })
      toast.success(movementModal.action === 'in' ? 'Stock added' : movementModal.action === 'out' ? 'Stock reduced' : 'Stock adjusted')
    } catch (e: any) { toast.error(e.message || 'Failed') }
    finally { setLoading(false) }
  }

  return (
    <div className="space-y-4">
      {/* Stat cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 md:gap-4">
        {[
          { label: 'Total Stock Items', value: items.length, icon: Layers, color: 'var(--color-accent)' },
          // Sheets, deliberately not packets: packet size differs per item
          // (100 for board, 500 for paper), so a packet total would be adding
          // up unlike things. Sheets are the one comparable unit.
          { label: 'Total Sheets in Stock', value: totalStock.toLocaleString(), icon: TrendingUp, color: 'var(--color-success)' },
          { label: 'Low Stock Alerts', value: lowStockCount, icon: AlertTriangle, color: lowStockCount > 0 ? 'var(--color-warning)' : 'var(--color-success)' },
        ].map(stat => (
          <div key={stat.label} className="rounded-xl border border-[var(--color-border)] bg-[var(--color-bg-secondary)] p-4 flex items-center gap-4">
            <div className="w-10 h-10 rounded-lg flex items-center justify-center flex-shrink-0" style={{ background: `color-mix(in srgb, ${stat.color} 10%, transparent)` }}>
              <stat.icon size={18} style={{ color: stat.color }} />
            </div>
            <div>
              <p className="text-xs text-[var(--color-text-muted)]">{stat.label}</p>
              <p className="text-xl font-bold text-[var(--color-text-primary)]">{stat.value}</p>
            </div>
          </div>
        ))}
      </div>

      {/* Toolbar */}
      <Toolbar
        search={{ value: search, onChange: setSearch, placeholder: 'Search inventory…' }}
        filters={
          <button onClick={() => setShowLowOnly(!showLowOnly)}
            className={cn('flex items-center gap-1.5 px-3 h-11 md:h-9 rounded-md border text-sm font-medium transition-colors w-full md:w-auto justify-center',
              showLowOnly ? 'bg-[var(--color-warning)] text-[var(--color-on-warning)] border-transparent' : 'border-[var(--color-border)] text-[var(--color-text-secondary)] hover:text-[var(--color-warning)]')}>
            <AlertTriangle size={14} /> Low Stock only
          </button>
        }
        activeFilterCount={showLowOnly ? 1 : 0}
        onClearFilters={() => setShowLowOnly(false)}
        actions={
          <>
            <button onClick={() => {
                if (!filtered.length) { toast.error('Nothing to export'); return }
                // Column order and naming follow the shop's own stock sheet —
                // Vendor, size, GSM — and both units are exported so the file
                // is readable by the store (packets) and by production (sheets).
                exportToExcel(filtered.map(i => ({
                  'Description': i.description, 'Vendor': i.vendors?.name ?? '',
                  'Board Type': i.board_types?.name ?? '',
                  'L': i.sheet_width_in ?? '', 'W': i.sheet_height_in ?? '', 'GSM': i.gsm ?? '',
                  'Balance (packets)': Math.round(toPackets(i.current_stock, i.sheets_per_packet) * 100) / 100,
                  'Balance (sheets)': i.current_stock,
                  'Sheets per Packet': i.sheets_per_packet,
                  'Reserved (sheets)': i.reserved_stock,
                  'Reorder Level (packets)': Math.round(toPackets(i.reorder_level, i.sheets_per_packet) * 100) / 100,
                  'Unit Cost': i.unit_cost,
                  'Location': i.location ?? '', 'Active': i.is_active ? 'Yes' : 'No',
                })), 'board-inventory-export')
              }}
              className="flex items-center justify-center gap-1.5 px-3 h-11 md:h-9 rounded-md border border-[var(--color-border)] text-sm text-[var(--color-text-secondary)] hover:bg-[var(--color-bg-elevated)] transition-colors">
              <Download size={14} /> Export
            </button>
            <button onClick={() => setAddModal(true)}
              className="flex items-center justify-center gap-1.5 px-4 h-11 md:h-9 rounded-md bg-[var(--color-accent)] text-[var(--color-on-accent)] text-sm font-medium hover:bg-[var(--color-accent-hover)] transition-colors">
              <Plus size={15} /> Add Item
            </button>
          </>
        }
      />

      {/* Inventory table */}
      <DataList<BoardItem>
        rows={filtered}
        columns={INV_COLUMNS(setLotsItem, setMovementModal, setMoveForm)}
        getRowId={i => i.id}
        rowClassName={item => {
          const isLow = item.current_stock <= item.reorder_level
          const isOut = item.current_stock <= 0
          return cn(
            isOut && 'border-l-2 border-l-[var(--color-danger)]',
            isLow && !isOut && 'border-l-2 border-l-[var(--color-warning)]'
          )
        }}
        stickyHeader
        empty={
          <div className="p-12 text-center">
            <Layers size={28} className="text-[var(--color-text-muted)] opacity-30 mx-auto mb-2" />
            <p className="text-sm text-[var(--color-text-muted)]">{search || showLowOnly ? 'No matching items' : 'No inventory items yet'}</p>
          </div>
        }
      />

      {/* Add Item Modal */}
      <Modal open={addModal} onClose={() => setAddModal(false)} title="Add Inventory Item" size="md"
        footer={
          <>
            <button onClick={() => setAddModal(false)} className="px-4 h-11 md:h-9 rounded-md border border-[var(--color-border)] text-sm text-[var(--color-text-secondary)] hover:bg-[var(--color-bg-elevated)] transition-colors">Cancel</button>
            <button onClick={addItem} disabled={loading || !addForm.description}
              className="px-4 h-9 rounded-md bg-[var(--color-accent)] text-[var(--color-on-accent)] text-sm font-medium hover:bg-[var(--color-accent-hover)] disabled:opacity-50 transition-colors">
              {loading ? 'Adding…' : 'Add Item'}
            </button>
          </>
        }>
        <div className="grid grid-cols-2 gap-3">
          <div className="col-span-2 space-y-1.5">
            <label htmlFor="boardinventoryclient-1" className="text-sm font-medium text-[var(--color-text-primary)]">Description <span className="text-[var(--color-danger)]">*</span></label>
            <input id="boardinventoryclient-1" className={inputCls} value={addForm.description} onChange={e => setAddForm(p => ({ ...p, description: e.target.value }))} placeholder="e.g. 300 GSM Duplex Board 25×36" />
          </div>
          <div className="space-y-1.5">
            <label htmlFor="boardinventoryclient-2" className="text-sm font-medium text-[var(--color-text-primary)]">Board Type</label>
            <select id="boardinventoryclient-2" className={inputCls} value={addForm.board_type_id} onChange={e => setAddForm(p => ({ ...p, board_type_id: e.target.value }))}>
              <option value="">Select…</option>
              {boardTypes.map(b => <option key={b.id} value={b.id}>{b.name}</option>)}
            </select>
          </div>
          <div className="space-y-1.5">
            <label htmlFor="boardinventoryclient-3" className="text-sm font-medium text-[var(--color-text-primary)]">GSM</label>
            <input id="boardinventoryclient-3" type="number" className={inputCls} value={addForm.gsm} onChange={e => setAddForm(p => ({ ...p, gsm: e.target.value }))} placeholder="300" />
          </div>
          <div className="space-y-1.5">
            <label htmlFor="boardinventoryclient-4" className="text-sm font-medium text-[var(--color-text-primary)]">Sheet Width (in)</label>
            <input id="boardinventoryclient-4" type="number" className={inputCls} value={addForm.sheet_width_in} onChange={e => setAddForm(p => ({ ...p, sheet_width_in: e.target.value }))} placeholder="25" />
          </div>
          <div className="space-y-1.5">
            <label htmlFor="boardinventoryclient-5" className="text-sm font-medium text-[var(--color-text-primary)]">Sheet Height (in)</label>
            <input id="boardinventoryclient-5" type="number" className={inputCls} value={addForm.sheet_height_in} onChange={e => setAddForm(p => ({ ...p, sheet_height_in: e.target.value }))} placeholder="36" />
          </div>
          <div className="space-y-1.5">
            <label htmlFor="boardinventoryclient-v" className="text-sm font-medium text-[var(--color-text-primary)]">Vendor</label>
            <select id="boardinventoryclient-v" className={inputCls} value={addForm.vendor_id} onChange={e => setAddForm(p => ({ ...p, vendor_id: e.target.value }))}>
              <option value="">Select…</option>
              {vendors.map(v => <option key={v.id} value={v.id}>{v.name}</option>)}
            </select>
          </div>
          <div className="space-y-1.5">
            <label htmlFor="boardinventoryclient-sp" className="text-sm font-medium text-[var(--color-text-primary)]">Sheets per Packet</label>
            <input id="boardinventoryclient-sp" type="number" className={inputCls} value={addForm.sheets_per_packet} onChange={e => setAddForm(p => ({ ...p, sheets_per_packet: e.target.value }))} placeholder="100" />
            <p className="text-xs text-[var(--color-text-muted)]">100 for board. Paper reams are often 500 or 250.</p>
          </div>
          <div className="space-y-1.5">
            <label htmlFor="boardinventoryclient-6" className="text-sm font-medium text-[var(--color-text-primary)]">Opening Stock (packets)</label>
            <input id="boardinventoryclient-6" type="number" step="0.01" className={inputCls} value={addForm.current_stock} onChange={e => setAddForm(p => ({ ...p, current_stock: e.target.value }))} placeholder="0" />
            {/* Shows the number that actually lands in the database, so nobody
                has to trust that the conversion happened. */}
            {parseFloat(addForm.current_stock || '0') > 0 && (
              <p className="text-xs text-[var(--color-text-muted)] tabular-nums">
                = {toSheets(parseFloat(addForm.current_stock), parseInt(addForm.sheets_per_packet || '100', 10)).toLocaleString()} sheets
              </p>
            )}
          </div>
          <div className="space-y-1.5">
            <label htmlFor="boardinventoryclient-7" className="text-sm font-medium text-[var(--color-text-primary)]">Reorder Level (packets)</label>
            <input id="boardinventoryclient-7" type="number" step="0.01" className={inputCls} value={addForm.reorder_level} onChange={e => setAddForm(p => ({ ...p, reorder_level: e.target.value }))} placeholder="100" />
          </div>
          <div className="space-y-1.5">
            <label htmlFor="boardinventoryclient-8" className="text-sm font-medium text-[var(--color-text-primary)]">Unit Cost (PKR)</label>
            <input id="boardinventoryclient-8" type="number" className={inputCls} value={addForm.unit_cost} onChange={e => setAddForm(p => ({ ...p, unit_cost: e.target.value }))} placeholder="0.00" />
          </div>
          <div className="space-y-1.5">
            <label htmlFor="boardinventoryclient-9" className="text-sm font-medium text-[var(--color-text-primary)]">Location</label>
            <input id="boardinventoryclient-9" className={inputCls} value={addForm.location} onChange={e => setAddForm(p => ({ ...p, location: e.target.value }))} placeholder="e.g. Rack A-3" />
          </div>
        </div>
      </Modal>

      {/* Movement Modal */}
      {movementModal && (
        <Modal open={true} onClose={() => setMovementModal(null)}
          title={movementModal.action === 'in' ? 'Stock In' : movementModal.action === 'out' ? 'Stock Out' : 'Adjust Stock'}
          size="sm"
          footer={
            <>
              <button onClick={() => setMovementModal(null)} className="px-4 h-11 md:h-9 rounded-md border border-[var(--color-border)] text-sm text-[var(--color-text-secondary)] hover:bg-[var(--color-bg-elevated)] transition-colors">Cancel</button>
              <button onClick={applyMovement} disabled={loading}
                className={cn('px-4 h-9 rounded-md text-white text-sm font-medium disabled:opacity-50 transition-colors',
                  movementModal.action === 'in' ? 'bg-[var(--color-success)] hover:opacity-90' :
                  movementModal.action === 'out' ? 'bg-[var(--color-danger)] hover:opacity-90' :
                  'bg-[var(--color-accent)] hover:bg-[var(--color-accent-hover)]')}>
                {loading ? 'Applying…' : 'Apply'}
              </button>
            </>
          }>
          <div className="space-y-3">
            <div className="rounded-lg bg-[var(--color-bg-elevated)] border border-[var(--color-border)] p-3">
              <p className="text-sm font-medium text-[var(--color-text-primary)]">{movementModal.item.description}</p>
              <p className="text-xs text-[var(--color-text-muted)] mt-0.5 tabular-nums">
                Current stock: <strong>{fmtPackets(toPackets(movementModal.item.current_stock, movementModal.item.sheets_per_packet))} packets</strong>
                {' '}({movementModal.item.current_stock.toLocaleString()} sheets, {movementModal.item.sheets_per_packet}/packet)
              </p>
            </div>
            <div className="space-y-1.5">
              <label htmlFor="boardinventoryclient-10" className="text-sm font-medium text-[var(--color-text-primary)]">
                {movementModal.action === 'adjustment' ? 'New Stock Count (packets)' : 'Quantity (packets)'}
                <span className="text-[var(--color-danger)]"> *</span>
              </label>
              <input id="boardinventoryclient-10" type="number" step="0.01" className={inputCls} value={moveForm.quantity} onChange={e => setMoveForm(p => ({ ...p, quantity: e.target.value }))}
                placeholder={movementModal.action === 'adjustment' ? 'Exact count in packets' : 'Packets'} />
              {parseFloat(moveForm.quantity || '0') > 0 && (
                <p className="text-xs text-[var(--color-text-muted)] tabular-nums">
                  = {toSheets(parseFloat(moveForm.quantity), movementModal.item.sheets_per_packet).toLocaleString()} sheets
                </p>
              )}
            </div>
            {movementModal.action === 'in' && (
              <div className="space-y-1.5">
                <label htmlFor="boardinventoryclient-11" className="text-sm font-medium text-[var(--color-text-primary)]">Lot / Batch Number</label>
                <input id="boardinventoryclient-11" className={inputCls} value={moveForm.lot_number} onChange={e => setMoveForm(p => ({ ...p, lot_number: e.target.value }))} placeholder="Auto-generated if left blank" />
              </div>
            )}
            <div className="space-y-1.5">
              <label htmlFor="boardinventoryclient-12" className="text-sm font-medium text-[var(--color-text-primary)]">Notes</label>
              <input id="boardinventoryclient-12" className={inputCls} value={moveForm.notes} onChange={e => setMoveForm(p => ({ ...p, notes: e.target.value }))} placeholder="Reason for movement" />
            </div>
          </div>
        </Modal>
      )}

      {/* Lot History Modal */}
      <Modal open={!!lotsItem} onClose={() => setLotsItem(null)} title={lotsItem ? `Lot History — ${lotsItem.description}` : ''} size="md">
        {lotsItem && <BoardLotHistory itemId={lotsItem.id} />}
      </Modal>
    </div>
  )
}

function BoardLotHistory({ itemId }: { itemId: string }) {
  const [lots, setLots] = useState<any[]>([])
  const [loading, setLoading] = useState(true)

  useState(() => {
    fetch(`/api/v1/board-inventory/${itemId}/lots`)
      .then(r => r.json())
      .then(json => setLots(json.data ?? []))
      .finally(() => setLoading(false))
  })

  if (loading) return <p className="text-sm text-[var(--color-text-muted)] text-center py-8">Loading…</p>
  if (lots.length === 0) return <p className="text-sm text-[var(--color-text-muted)] text-center py-8">No lots recorded yet — lots are created on Stock In and PO receipt going forward.</p>

  return (
    <div className="max-h-96 overflow-y-auto space-y-2">
      {lots.map(l => (
        <div key={l.id} className="rounded-lg border border-[var(--color-border)] px-3 py-2">
          <div className="flex items-center justify-between">
            <p className="text-sm font-mono font-medium text-[var(--color-text-primary)]">{l.lot_number}</p>
            <span className={cn('text-xs px-2 py-0.5 rounded-full border', l.quantity_remaining > 0 ? 'text-[var(--color-success)] border-[color:color-mix(in_srgb,var(--color-success)_30%,transparent)]' : 'text-[var(--color-text-muted)] border-[var(--color-border)]')}>
              {l.quantity_remaining.toLocaleString()} / {l.quantity_received.toLocaleString()} remaining
            </span>
          </div>
          <p className="text-xs text-[var(--color-text-muted)] mt-1">
            Received {new Date(l.received_date).toLocaleDateString('en-PK')}
            {l.vendors?.name ? ` · ${l.vendors.name}` : ''}
            {l.unit_cost ? ` · PKR ${Number(l.unit_cost).toLocaleString()}/unit` : ''}
          </p>
        </div>
      ))}
    </div>
  )
}
