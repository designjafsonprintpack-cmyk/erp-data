'use client'
import { useState, useEffect, useCallback, type Dispatch, type SetStateAction } from 'react'
import { Layers, Plus, TrendingUp, TrendingDown, SlidersHorizontal, AlertTriangle, Search, Download, Undo2, FileText, Pencil } from 'lucide-react'
import { cn } from '@/lib/utils/cn'
import { toast } from '@/components/ui/Toast'
import { exportToExcel } from '@/lib/utils/exportToExcel'
import { DataList, type DataListColumn } from '@/components/ui/DataList'
import { Toolbar } from '@/components/ui/Toolbar'
import { Modal } from '@/components/ui/Modal'
// Board is bought by the kilo. These convert a vendor's rate into the per-sheet
// cost that jobs are costed at, using the estimator's own weight formula.
import { perSheetFromKgRate, perSheetFromPacket } from '@/lib/utils/boardUnitCost'
import { sheetWeightKg } from '@/lib/costing/sheetWeight'

interface BoardItem {
  id: string; description: string; gsm: number | null; sheet_width_in: number | null; sheet_height_in: number | null
  /** SHEETS, always — see migration 113. Packets are display only. */
  current_stock: number; reserved_stock: number; reorder_level: number
  /** Sheets in one packet for this item: 100 for board, often 500 for paper. */
  sheets_per_packet: number
  unit_cost: number; location: string | null; is_active: boolean
  // Exactly one of these is ever set — an item is board OR paper (115).
  board_type_id?: string | null
  paper_type_id?: string | null
  board_types?: { name: string } | null
  paper_types?: { name: string } | null
  vendor_id?: string | null
  vendors?: { name: string } | null
  unit_id?: string | null
}
interface BoardType { id: string; name: string }
interface PaperType { id: string; name: string; gsm: number | null }

/**
 * One dropdown, two master tables. The <select> can only carry a string, so
 * the kind is encoded into the value and split apart again on submit — that is
 * what keeps `board_type_id` and `paper_type_id` from ever both being set.
 */
const MATERIAL_BOARD = 'board:'
const MATERIAL_PAPER = 'paper:'
const splitMaterial = (v: string) => ({
  board_type_id: v.startsWith(MATERIAL_BOARD) ? v.slice(MATERIAL_BOARD.length) : null,
  paper_type_id: v.startsWith(MATERIAL_PAPER) ? v.slice(MATERIAL_PAPER.length) : null,
})
/** The inverse — a saved row back into the <select>'s value. */
const joinMaterial = (i: { board_type_id?: string | null; paper_type_id?: string | null }) =>
  i.board_type_id ? `${MATERIAL_BOARD}${i.board_type_id}`
  : i.paper_type_id ? `${MATERIAL_PAPER}${i.paper_type_id}`
  : ''

/** '' → null for a nullable numeric column; Postgres rejects '' on NUMERIC. */
const numOrNull = (v: string) => (v === '' || v === null ? null : parseFloat(v))

/**
 * Add and Edit describe the same item, so they share one form shape and one
 * field grid (ItemFields). Two parallel copies of these ten fields is exactly
 * how a form drifts — a field added to one and forgotten in the other.
 */
interface ItemForm {
  description: string; material: string; gsm: string
  sheet_width_in: string; sheet_height_in: string
  current_stock: string; reorder_level: string; sheets_per_packet: string
  vendor_id: string; unit_cost: string; location: string
}
const EMPTY_ITEM_FORM: ItemForm = {
  description: '', material: '', gsm: '', sheet_width_in: '', sheet_height_in: '',
  // current_stock is entered in PACKETS on Add and read-only on Edit.
  current_stock: '0', reorder_level: '0', sheets_per_packet: '100',
  vendor_id: '', unit_cost: '0', location: '',
}
interface Unit { id: string; name: string; symbol: string }
interface Vendor { id: string; name: string }
interface OpenJob { id: string; job_number: string; job_title: string }

/**
 * 'return' is board coming BACK from the floor. The ledger stores it as an 'in'
 * with reference_type = 'production_return' (114) so the stock report can show
 * it in its own column, exactly as the shop's Excel does.
 */
type MovementAction = 'in' | 'out' | 'adjustment' | 'return'

/**
 * The movement modal's form. `rate_basis` is how the VENDOR priced the
 * delivery — board comes per kg, paper reams come per packet — and only the
 * derived per-sheet figure is ever sent to the API.
 */
interface MoveForm {
  quantity: string; notes: string; lot_number: string; job_id: string; vendor_id: string
  rate: string; rate_basis: 'kg' | 'packet'
}

/** One row of get_board_stock_report(). Every figure is in SHEETS. */
interface ReportRow {
  board_item_id: string; description: string; vendor_name: string | null
  gsm: number | null; sheet_width_in: number | null; sheet_height_in: number | null
  sheets_per_packet: number
  opening_sheets: number; received_sheets: number; returned_sheets: number
  issued_sheets: number; adjustment_sheets: number
  closing_sheets: number; ledger_closing: number
}

/**
 * The store counts packets; the database stores sheets. Every number the user
 * sees or types on this screen goes through one of these two, and nothing else
 * does the arithmetic inline.
 */
const toPackets = (sheets: number, perPacket: number) => sheets / (perPacket || 100)
const toSheets  = (packets: number, perPacket: number) => packets * (perPacket || 100)

/** First and last day of the current month, as YYYY-MM-DD. */
const monthBounds = () => {
  const n = new Date()
  const iso = (d: Date) =>
    `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
  return { from: iso(new Date(n.getFullYear(), n.getMonth(), 1)),
           to:   iso(new Date(n.getFullYear(), n.getMonth() + 1, 0)) }
}

/** "44.68" not "44.6800000000001", and no trailing ".00" on whole packets. */
const fmtPackets = (n: number) =>
  (Math.round(n * 100) / 100).toLocaleString(undefined, { maximumFractionDigits: 2 })

const inputCls = 'w-full h-9 px-3 rounded-md border text-sm bg-[var(--color-bg-elevated)] text-[var(--color-text-primary)] border-[var(--color-border)] placeholder:text-[var(--color-text-muted)] focus:outline-none focus:border-[var(--color-accent)] focus:ring-1 focus:ring-[var(--color-accent)] transition-colors'


const INV_COLUMNS = (
  setLotsItem: (i: BoardItem) => void,
  // One handler instead of the old open-modal-then-reset-form pair. The form
  // reset has to know the item (Adjust prefills its current count, Stock In
  // defaults to the item's vendor), so keeping the two in one place is what
  // stops the five call sites drifting apart.
  openMovement: (i: BoardItem, action: MovementAction) => void,
  openEdit: (i: BoardItem) => void,
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
        {/* Board or paper — the two masters can hold the same name, so a paper
            item says so rather than looking like an untyped board item. */}
        <span className="block text-xs text-[var(--color-text-secondary)]">
          {i.board_types?.name || (i.paper_types?.name ? `${i.paper_types.name} (Paper)` : '—')}
        </span>
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
        {/* Edit the item itself. Without this there was no way to correct a
            description or set a type after creation — which left the 12
            untyped items from the July load unfixable from the UI. */}
        <button onClick={() => openEdit(i)} title="Edit item" aria-label="Edit item"
          className="flex items-center gap-1 px-2.5 md:px-2 h-9 md:h-7 rounded border border-[var(--color-border)] text-xs text-[var(--color-text-muted)] hover:bg-[var(--color-bg-elevated)] transition-colors">
          <Pencil size={11} />
        </button>
        <button onClick={() => openMovement(i, 'in')}
          className="flex items-center gap-1 px-2.5 md:px-2 h-9 md:h-7 rounded border border-[color:color-mix(in_srgb,var(--color-success)_30%,transparent)] text-xs text-[var(--color-success)] hover:bg-[color:color-mix(in_srgb,var(--color-success)_10%,transparent)] transition-colors">
          <TrendingUp size={11} /> In
        </button>
        <button onClick={() => openMovement(i, 'out')}
          className="flex items-center gap-1 px-2.5 md:px-2 h-9 md:h-7 rounded border border-[color:color-mix(in_srgb,var(--color-danger)_30%,transparent)] text-xs text-[var(--color-danger)] hover:bg-[color:color-mix(in_srgb,var(--color-danger)_10%,transparent)] transition-colors">
          <TrendingDown size={11} /> Out
        </button>
        {/* Board coming back from the floor. Its own button rather than "In"
            because the stock report counts a return separately from a purchase,
            and it carries the job it came back from. */}
        <button onClick={() => openMovement(i, 'return')}
          title="Return from production" aria-label="Return from production"
          className="flex items-center gap-1 px-2.5 md:px-2 h-9 md:h-7 rounded border border-[color:color-mix(in_srgb,var(--color-info)_30%,transparent)] text-xs text-[var(--color-info)] hover:bg-[color:color-mix(in_srgb,var(--color-info)_10%,transparent)] transition-colors">
          <Undo2 size={11} /> Return
        </button>
        <button onClick={() => openMovement(i, 'adjustment')}
          className="flex items-center gap-1 px-2.5 md:px-2 h-9 md:h-7 rounded border border-[var(--color-border)] text-xs text-[var(--color-text-muted)] hover:bg-[var(--color-bg-elevated)] transition-colors">
          <SlidersHorizontal size={11} /> Adj
        </button>
      </span>
    ),
  },
]

export default function BoardInventoryClient({ initialItems, boardTypes, paperTypes, units, vendors, openJobs }: { initialItems: BoardItem[]; boardTypes: BoardType[]; paperTypes: PaperType[]; units: Unit[]; vendors: Vendor[]; openJobs: OpenJob[] }) {
  const [items, setItems] = useState(initialItems)
  const [search, setSearch] = useState('')
  const [showLowOnly, setShowLowOnly] = useState(false)
  const [addModal, setAddModal] = useState(false)
  const [movementModal, setMovementModal] = useState<{ item: BoardItem; action: MovementAction } | null>(null)
  const [view, setView] = useState<'items' | 'report'>('items')
  const [lotsItem, setLotsItem] = useState<BoardItem | null>(null)
  const [loading, setLoading] = useState(false)

  // `material` is "board:<id>" or "paper:<id>" — split into the two real
  // columns on submit. Never sent to the API as-is.
  const [addForm, setAddForm] = useState<ItemForm>(EMPTY_ITEM_FORM)
  // vendor_id is here because the lot a Stock In creates has always had a
  // vendor column and the form never sent one — so Lot History could never
  // name the supplier of a manual receipt.
  // `rate` is what the user types, in `rate_basis` units; the API is only ever
  // sent the per-sheet figure. Board is bought per kg, so that is the default.
  const [moveForm, setMoveForm] = useState<MoveForm>({
    quantity: '', notes: '', lot_number: '', job_id: '', vendor_id: '', rate: '', rate_basis: 'kg',
  })

  const [editModal, setEditModal] = useState<BoardItem | null>(null)
  const [editForm, setEditForm] = useState<ItemForm>(EMPTY_ITEM_FORM)

  const openMovement = (item: BoardItem, action: MovementAction) => {
    setMovementModal({ item, action })
    setMoveForm({
      // Adjust is "set the count to what I just counted", so it opens on the
      // current figure rather than blank.
      quantity: action === 'adjustment' ? String(toPackets(item.current_stock, item.sheets_per_packet)) : '',
      notes: '', lot_number: '', job_id: '',
      // Most receipts come from the item's usual supplier; a one-off delivery
      // from someone else can still be changed in the modal.
      vendor_id: item.vendor_id || '',
      // Deliberately NOT prefilled from the item's current cost — that figure
      // is an average of past receipts, and offering it as this delivery's rate
      // would let a stale number be confirmed by accident and re-averaged in.
      rate: '', rate_basis: 'kg',
    })
  }

  const openEdit = (item: BoardItem) => {
    setEditModal(item)
    setEditForm({
      description: item.description,
      material: joinMaterial(item),
      gsm: item.gsm != null ? String(item.gsm) : '',
      sheet_width_in: item.sheet_width_in != null ? String(item.sheet_width_in) : '',
      sheet_height_in: item.sheet_height_in != null ? String(item.sheet_height_in) : '',
      // Packets in the form, sheets in the database — same boundary as Add.
      current_stock: String(toPackets(item.current_stock, item.sheets_per_packet)),
      reorder_level: String(toPackets(item.reorder_level, item.sheets_per_packet)),
      sheets_per_packet: String(item.sheets_per_packet ?? 100),
      vendor_id: item.vendor_id || '',
      unit_cost: item.unit_cost != null ? String(item.unit_cost) : '0',
      location: item.location || '',
    })
  }

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
      // `material` is a UI-only field; the two columns it stands for are added
      // explicitly. Spreading it would just be stripped by the zod schema, but
      // the split has to happen here either way.
      const { material, ...rest } = addForm
      const picked = splitMaterial(material)
      const res = await fetch('/api/v1/board-inventory', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...rest,
          ...picked,
          sheets_per_packet: perPacket,
          vendor_id: addForm.vendor_id || null,
          current_stock: toSheets(parseFloat(addForm.current_stock || '0'), perPacket),
          reorder_level: toSheets(parseFloat(addForm.reorder_level || '0'), perPacket),
        }),
      })
      if (!res.ok) { const e = await res.json(); throw new Error(e.error) }
      const { data } = await res.json()
      // The POST returns the bare row, so the embeds the list renders have to
      // be reattached by hand — one of the two is always null.
      const bt = boardTypes.find(b => b.id === picked.board_type_id)
      const pt = paperTypes.find(p => p.id === picked.paper_type_id)
      const vn = vendors.find(v => v.id === addForm.vendor_id)
      setItems(prev => [...prev, { ...data, board_types: bt ? { name: bt.name } : null, paper_types: pt ? { name: pt.name } : null, vendors: vn ? { name: vn.name } : null }].sort((a, b) => a.description.localeCompare(b.description)))
      setAddModal(false)
      setAddForm(EMPTY_ITEM_FORM)
      toast.success('Item added to inventory')
    } catch (e: any) { toast.error(e.message || 'Failed') }
    finally { setLoading(false) }
  }

  const updateItem = async () => {
    if (!editModal) return
    if (!editForm.description) { toast.error('Description required'); return }
    setLoading(true)
    try {
      const perPacket = parseInt(editForm.sheets_per_packet || '100', 10) || 100
      const picked = splitMaterial(editForm.material)
      // Only real columns go in the body, and only the ones this form owns.
      // current_stock is deliberately absent: stock moves through In / Out /
      // Adjust so that every change leaves a ledger row behind. Editing it
      // here would move the number with no movement recorded.
      const res = await fetch(`/api/v1/board-inventory/${editModal.id}`, {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          description: editForm.description,
          ...picked,
          gsm: numOrNull(editForm.gsm),
          sheet_width_in: numOrNull(editForm.sheet_width_in),
          sheet_height_in: numOrNull(editForm.sheet_height_in),
          reorder_level: toSheets(parseFloat(editForm.reorder_level || '0'), perPacket),
          sheets_per_packet: perPacket,
          vendor_id: editForm.vendor_id || null,
          unit_cost: numOrNull(editForm.unit_cost),
          location: editForm.location || null,
        }),
      })
      if (!res.ok) { const e = await res.json(); throw new Error(e.error) }
      const { data } = await res.json()
      // Reattach the embeds by hand — the PATCH returns the bare row, and the
      // list renders the vendor and the type name from them.
      const bt = boardTypes.find(b => b.id === picked.board_type_id)
      const pt = paperTypes.find(p => p.id === picked.paper_type_id)
      const vn = vendors.find(v => v.id === editForm.vendor_id)
      setItems(prev => prev.map(i => i.id === editModal.id
        ? { ...i, ...data, board_types: bt ? { name: bt.name } : null, paper_types: pt ? { name: pt.name } : null, vendors: vn ? { name: vn.name } : null }
        : i).sort((a, b) => a.description.localeCompare(b.description)))
      setEditModal(null)
      toast.success('Item updated')
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
      // The vendor's rate, converted to per sheet through the same formula the
      // estimator uses. One expression, so the number shown in the modal and
      // the number sent to the API cannot diverge.
      const it = movementModal.item
      const rate = parseFloat(moveForm.rate || '0')
      const receiptPerSheet = rate > 0
        ? (moveForm.rate_basis === 'kg'
            ? perSheetFromKgRate(rate, it.sheet_width_in, it.sheet_height_in, it.gsm)
            : perSheetFromPacket(rate, it.sheets_per_packet))
        : null
      const res = await fetch(`/api/v1/board-inventory/${movementModal.item.id}`, {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: movementModal.action, quantity: qty,
          notes: moveForm.notes,
          lot_number: moveForm.lot_number || undefined,
          // Which job the board came back from. Optional, following the
          // project's warn-and-record precedent rather than blocking a return
          // nobody can attribute.
          job_id: moveForm.job_id || undefined,
          // Who this delivery came from. The lot has carried a vendor since
          // 055 and the route has always read it — the form simply never sent
          // one, which is why a manual receipt showed no supplier in Lot
          // History. Only meaningful on the two lot-creating actions.
          vendor_id: (movementModal.action === 'in' || movementModal.action === 'return')
            ? (moveForm.vendor_id || undefined) : undefined,
          // Kilos or packets in, sheets out — the same boundary the quantity
          // crosses two lines above. The API and the columns are per sheet
          // throughout. null when the weight can't be worked out, which the
          // form has already said in red rather than storing a silent 0.
          unit_cost: movementModal.action === 'in'
            ? (receiptPerSheet ?? undefined)
            : undefined,
        }),
      })
      if (!res.ok) { const e = await res.json(); throw new Error(e.error) }
      const { data } = await res.json()
      // unit_cost as well as the stock: a priced Stock In re-averages it, and
      // the row would otherwise keep showing the pre-receipt rate until reload.
      setItems(prev => prev.map(i => i.id === movementModal.item.id
        ? { ...i, current_stock: (data as any).current_stock, unit_cost: (data as any).unit_cost ?? i.unit_cost }
        : i))
      setMovementModal(null)
      setMoveForm({ quantity: '', notes: '', lot_number: '', job_id: '', vendor_id: '', rate: '', rate_basis: 'kg' })
      toast.success(
        movementModal.action === 'in' ? 'Stock added'
        : movementModal.action === 'out' ? 'Stock reduced'
        : movementModal.action === 'return' ? 'Returned to store'
        : 'Stock adjusted')
    } catch (e: any) { toast.error(e.message || 'Failed') }
    finally { setLoading(false) }
  }

  return (
    <div className="space-y-4">
      {/* Items = today's stock. Stock Report = the shop's own monthly sheet,
          rebuilt from the movement ledger (114). */}
      <div className="flex items-center gap-1 bg-[var(--color-bg-elevated)] border border-[var(--color-border)] rounded-md p-0.5 w-fit">
        {([['items', 'Items', Layers], ['report', 'Stock Report', FileText]] as const).map(([key, label, Icon]) => (
          <button key={key} onClick={() => setView(key)}
            aria-pressed={view === key}
            className={cn('flex items-center gap-1.5 px-3 h-11 md:h-8 rounded text-sm font-medium transition-colors',
              view === key ? 'bg-[var(--color-accent)] text-[var(--color-on-accent)]' : 'text-[var(--color-text-muted)] hover:text-[var(--color-text-primary)]')}>
            <Icon size={14} /> {label}
          </button>
        ))}
      </div>

      {view === 'report' && <StockReport />}

      {view === 'items' && <>
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
                  'Board / Paper Type': i.board_types?.name ?? (i.paper_types?.name ? `${i.paper_types.name} (Paper)` : ''),
                  'L': i.sheet_width_in ?? '', 'W': i.sheet_height_in ?? '', 'GSM': i.gsm ?? '',
                  'Balance (packets)': Math.round(toPackets(i.current_stock, i.sheets_per_packet) * 100) / 100,
                  'Balance (sheets)': i.current_stock,
                  'Sheets per Packet': i.sheets_per_packet,
                  'Reserved (sheets)': i.reserved_stock,
                  'Reorder Level (packets)': Math.round(toPackets(i.reorder_level, i.sheets_per_packet) * 100) / 100,
                  // Both, for the same reason the balance is exported both ways:
                  // the store thinks in packets, costing thinks in sheets.
                  'Unit Cost (PKR/sheet)': i.unit_cost,
                  'Unit Cost (PKR/packet)': Math.round(Number(i.unit_cost ?? 0) * i.sheets_per_packet * 100) / 100,
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
        columns={INV_COLUMNS(setLotsItem, openMovement, openEdit)}
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
      </>}

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
        <ItemFields mode="add" idPrefix="boardinventoryclient" form={addForm} setForm={setAddForm}
          boardTypes={boardTypes} paperTypes={paperTypes} vendors={vendors} />
      </Modal>

      {/* Edit Item Modal — same fields as Add, minus Opening Stock. Stock is
          deliberately not editable here: In / Out / Adjust each leave a ledger
          row behind, and 114's whole stock report is rebuilt from that ledger,
          so a silent edit to current_stock would put the report permanently out
          of step with the balance. */}
      {editModal && (
        <Modal open={true} onClose={() => setEditModal(null)} title={`Edit — ${editModal.description}`} size="md"
          footer={
            <>
              <button onClick={() => setEditModal(null)} className="px-4 h-11 md:h-9 rounded-md border border-[var(--color-border)] text-sm text-[var(--color-text-secondary)] hover:bg-[var(--color-bg-elevated)] transition-colors">Cancel</button>
              <button onClick={updateItem} disabled={loading || !editForm.description}
                className="px-4 h-9 rounded-md bg-[var(--color-accent)] text-[var(--color-on-accent)] text-sm font-medium hover:bg-[var(--color-accent-hover)] disabled:opacity-50 transition-colors">
                {loading ? 'Saving…' : 'Save Changes'}
              </button>
            </>
          }>
          <ItemFields mode="edit" idPrefix="bi-edit" form={editForm} setForm={setEditForm}
            boardTypes={boardTypes} paperTypes={paperTypes} vendors={vendors} />
        </Modal>
      )}

      {/* Movement Modal */}
      {movementModal && (
        <Modal open={true} onClose={() => setMovementModal(null)}
          title={movementModal.action === 'in' ? 'Stock In'
            : movementModal.action === 'out' ? 'Stock Out'
            : movementModal.action === 'return' ? 'Return to Store'
            : 'Adjust Stock'}
          size="sm"
          footer={
            <>
              <button onClick={() => setMovementModal(null)} className="px-4 h-11 md:h-9 rounded-md border border-[var(--color-border)] text-sm text-[var(--color-text-secondary)] hover:bg-[var(--color-bg-elevated)] transition-colors">Cancel</button>
              <button onClick={applyMovement} disabled={loading}
                // Filled buttons take --color-on-*, never text-white: white on
                // these fills fails WCAG AA in all four dark themes (CLAUDE.md §5).
                className={cn('px-4 h-9 rounded-md text-sm font-medium disabled:opacity-50 transition-colors',
                  movementModal.action === 'in' ? 'bg-[var(--color-success)] text-[var(--color-on-success)] hover:opacity-90' :
                  movementModal.action === 'out' ? 'bg-[var(--color-danger)] text-[var(--color-on-danger)] hover:opacity-90' :
                  movementModal.action === 'return' ? 'bg-[var(--color-info)] text-[var(--color-on-info)] hover:opacity-90' :
                  'bg-[var(--color-accent)] text-[var(--color-on-accent)] hover:bg-[var(--color-accent-hover)]')}>
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
              <>
                <div className="space-y-1.5">
                  <label htmlFor="boardinventoryclient-11" className="text-sm font-medium text-[var(--color-text-primary)]">Lot / Batch Number</label>
                  <input id="boardinventoryclient-11" className={inputCls} value={moveForm.lot_number} onChange={e => setMoveForm(p => ({ ...p, lot_number: e.target.value }))} placeholder="Auto-generated if left blank" />
                </div>
                {/* The lot has had a vendor column since 055 and the route has
                    always read it, but no form ever sent one — so a manual
                    receipt's supplier was lost and Lot History showed a blank
                    where the vendor should be. Defaults to the item's usual
                    supplier; a one-off delivery can be changed here. */}
                <div className="space-y-1.5">
                  <label htmlFor="boardinventoryclient-in-vendor" className="text-sm font-medium text-[var(--color-text-primary)]">Received from (vendor)</label>
                  <select id="boardinventoryclient-in-vendor" className={inputCls} value={moveForm.vendor_id}
                    onChange={e => setMoveForm(p => ({ ...p, vendor_id: e.target.value }))}>
                    <option value="">Not recorded</option>
                    {vendors.map(v => <option key={v.id} value={v.id}>{v.name}</option>)}
                  </select>
                </div>
                {/* The rate this delivery came at. BOARD IS BOUGHT BY THE KILO,
                    so per-kg is the default and the conversion uses the same
                    weight formula the estimator costs with — quoted rate and
                    actual rate are then the same arithmetic. Paper invoices come
                    per ream, so per-packet stays available.
                    Blank is allowed and changes nothing: an unpriced delivery
                    must not drag the item's average toward zero. */}
                <div className="space-y-1.5">
                  <div className="flex items-center justify-between gap-2">
                    <label htmlFor="boardinventoryclient-in-rate" className="text-sm font-medium text-[var(--color-text-primary)]">
                      Purchase rate (PKR / {moveForm.rate_basis === 'kg' ? 'kg' : 'packet'})
                    </label>
                    <div className="flex items-center gap-0.5 bg-[var(--color-bg-elevated)] border border-[var(--color-border)] rounded-md p-0.5">
                      {(['kg', 'packet'] as const).map(b => (
                        <button key={b} type="button" onClick={() => setMoveForm(p => ({ ...p, rate_basis: b }))}
                          className={cn('px-2 h-6 rounded text-xs font-medium transition-colors',
                            moveForm.rate_basis === b
                              ? 'bg-[var(--color-accent)] text-[var(--color-on-accent)]'
                              : 'text-[var(--color-text-muted)] hover:text-[var(--color-text-secondary)]')}>
                          Per {b === 'kg' ? 'KG' : 'packet'}
                        </button>
                      ))}
                    </div>
                  </div>
                  <input id="boardinventoryclient-in-rate" type="number" step="0.01" className={inputCls}
                    value={moveForm.rate} onChange={e => setMoveForm(p => ({ ...p, rate: e.target.value }))}
                    placeholder="Leave blank if not known" />
                  {(() => {
                    const rate = parseFloat(moveForm.rate || '0')
                    if (!(rate > 0)) return null
                    const it = movementModal.item
                    const perSheet = moveForm.rate_basis === 'kg'
                      ? perSheetFromKgRate(rate, it.sheet_width_in, it.sheet_height_in, it.gsm)
                      : perSheetFromPacket(rate, it.sheets_per_packet)
                    // Per kg needs sheet size AND GSM. Without them the weight
                    // is genuinely unknown, so say so instead of storing a 0.
                    if (perSheet == null) return (
                      <p className="text-xs text-[var(--color-danger)]">
                        Sheet size and GSM are needed to work out weight, and this item is missing one.
                        Set them with <strong>Edit</strong> first, or enter the rate per packet.
                      </p>
                    )
                    const sheets = toSheets(parseFloat(moveForm.quantity) || 0, it.sheets_per_packet)
                    const kgPerSheet = sheetWeightKg(Number(it.sheet_width_in ?? 0), Number(it.sheet_height_in ?? 0), Number(it.gsm ?? 0))
                    return (
                      <p className="text-xs text-[var(--color-text-muted)] tabular-nums">
                        = PKR {perSheet.toFixed(4)} / sheet
                        {' · '}PKR {(perSheet * it.sheets_per_packet).toLocaleString(undefined, { maximumFractionDigits: 2 })} / packet
                        {kgPerSheet > 0 && <> · {(kgPerSheet * sheets).toFixed(1)} kg total</>}
                        {sheets > 0 && <> · <strong>PKR {(perSheet * sheets).toLocaleString(undefined, { maximumFractionDigits: 0 })}</strong> for this receipt</>}
                      </p>
                    )
                  })()}
                  <p className="text-xs text-[var(--color-text-muted)]">
                    Updates the item&rsquo;s cost as a <strong>weighted average</strong> — that is the rate jobs are costed at.
                    Weight uses the estimator&rsquo;s own formula (L × W × GSM ÷ 15500 per 100 sheets).
                  </p>
                </div>
                {/* "Kon sa board kis job ke liye aaya" for board that arrives
                    WITHOUT a purchase order. The PO path already asks this per
                    line (113); a manual Stock In had no way to answer it, so
                    every walk-in / cash purchase lost the link. Blank is a real
                    answer — general stock — not a missing field. */}
                <div className="space-y-1.5">
                  <label htmlFor="boardinventoryclient-in-job" className="text-sm font-medium text-[var(--color-text-primary)]">For which job? (blank = general stock)</label>
                  <select id="boardinventoryclient-in-job" className={inputCls} value={moveForm.job_id}
                    onChange={e => setMoveForm(p => ({ ...p, job_id: e.target.value }))}>
                    <option value="">General stock — not for a specific job</option>
                    {openJobs.map(j => <option key={j.id} value={j.id}>{j.job_number} — {j.job_title}</option>)}
                  </select>
                  <p className="text-xs text-[var(--color-text-muted)]">
                    Recorded on the lot and the ledger row. The board is <strong>not</strong> reserved — it can still be issued to any job.
                  </p>
                </div>
              </>
            )}
            {movementModal.action === 'return' && (
              <div className="space-y-1.5">
                <label htmlFor="boardinventoryclient-ret-job" className="text-sm font-medium text-[var(--color-text-primary)]">Returned from job</label>
                <select id="boardinventoryclient-ret-job" className={inputCls} value={moveForm.job_id}
                  onChange={e => setMoveForm(p => ({ ...p, job_id: e.target.value }))}>
                  <option value="">Not linked to a job</option>
                  {openJobs.map(j => <option key={j.id} value={j.id}>{j.job_number} — {j.job_title}</option>)}
                </select>
                <p className="text-xs text-[var(--color-text-muted)]">
                  Shows in the stock report&rsquo;s <strong>Return From Production</strong> column, separate from purchases.
                </p>
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

/**
 * The item fields, shared by Add and Edit so the two can't drift apart.
 * `mode` decides one thing only: Add asks for Opening Stock, Edit shows the
 * current balance read-only and points at In / Out / Adjust instead.
 */
function ItemFields({ mode, idPrefix, form, setForm, boardTypes, paperTypes, vendors }: {
  mode: 'add' | 'edit'
  idPrefix: string
  form: ItemForm
  setForm: Dispatch<SetStateAction<ItemForm>>
  boardTypes: BoardType[]
  paperTypes: PaperType[]
  vendors: Vendor[]
}) {
  const set = (k: keyof ItemForm, v: string) => setForm(p => ({ ...p, [k]: v }))
  const perPacket = parseInt(form.sheets_per_packet || '100', 10) || 100

  return (
    <div className="grid grid-cols-2 gap-3">
      <div className="col-span-2 space-y-1.5">
        <label htmlFor={`${idPrefix}-1`} className="text-sm font-medium text-[var(--color-text-primary)]">Description <span className="text-[var(--color-danger)]">*</span></label>
        <input id={`${idPrefix}-1`} className={inputCls} value={form.description} onChange={e => set('description', e.target.value)} placeholder="e.g. 300 GSM Duplex Board 25×36" />
      </div>
      {/* Board AND paper in one dropdown. The store carries both kinds of
          sheet material; before 115 only board_types existed here, so a paper
          item had to be saved with no type at all — which is why 12 of the 51
          loaded items came out untyped. Two optgroups keep them tellable
          apart, and only one of the two columns is ever written. */}
      <div className="space-y-1.5">
        <label htmlFor={`${idPrefix}-2`} className="text-sm font-medium text-[var(--color-text-primary)]">Board / Paper Type</label>
        <select id={`${idPrefix}-2`} className={inputCls} value={form.material} onChange={e => set('material', e.target.value)}>
          <option value="">Select…</option>
          <optgroup label="Board">
            {boardTypes.map(b => <option key={b.id} value={`${MATERIAL_BOARD}${b.id}`}>{b.name}</option>)}
          </optgroup>
          <optgroup label="Paper">
            {/* GSM in the label only — the item's own GSM field below is the
                one that counts, exactly as it is for board. */}
            {paperTypes.map(p => <option key={p.id} value={`${MATERIAL_PAPER}${p.id}`}>{p.name}{p.gsm ? ` (${p.gsm} GSM)` : ''}</option>)}
          </optgroup>
        </select>
        {form.material.startsWith(MATERIAL_PAPER) && (
          <p className="text-xs text-[var(--color-warning)]">
            Paper often comes <strong>500 sheets to a ream</strong>, not 100 — check Sheets per Packet below before saving.
          </p>
        )}
      </div>
      <div className="space-y-1.5">
        <label htmlFor={`${idPrefix}-3`} className="text-sm font-medium text-[var(--color-text-primary)]">GSM</label>
        <input id={`${idPrefix}-3`} type="number" className={inputCls} value={form.gsm} onChange={e => set('gsm', e.target.value)} placeholder="300" />
      </div>
      <div className="space-y-1.5">
        <label htmlFor={`${idPrefix}-4`} className="text-sm font-medium text-[var(--color-text-primary)]">Sheet Width (in)</label>
        <input id={`${idPrefix}-4`} type="number" className={inputCls} value={form.sheet_width_in} onChange={e => set('sheet_width_in', e.target.value)} placeholder="25" />
      </div>
      <div className="space-y-1.5">
        <label htmlFor={`${idPrefix}-5`} className="text-sm font-medium text-[var(--color-text-primary)]">Sheet Height (in)</label>
        <input id={`${idPrefix}-5`} type="number" className={inputCls} value={form.sheet_height_in} onChange={e => set('sheet_height_in', e.target.value)} placeholder="36" />
      </div>
      <div className="space-y-1.5">
        <label htmlFor={`${idPrefix}-v`} className="text-sm font-medium text-[var(--color-text-primary)]">Vendor</label>
        <select id={`${idPrefix}-v`} className={inputCls} value={form.vendor_id} onChange={e => set('vendor_id', e.target.value)}>
          <option value="">Select…</option>
          {vendors.map(v => <option key={v.id} value={v.id}>{v.name}</option>)}
        </select>
      </div>
      <div className="space-y-1.5">
        <label htmlFor={`${idPrefix}-sp`} className="text-sm font-medium text-[var(--color-text-primary)]">Sheets per Packet</label>
        <input id={`${idPrefix}-sp`} type="number" className={inputCls} value={form.sheets_per_packet} onChange={e => set('sheets_per_packet', e.target.value)} placeholder="100" />
        <p className="text-xs text-[var(--color-text-muted)]">100 for board. Paper reams are often 500 or 250.</p>
      </div>
      {mode === 'add' ? (
        <div className="space-y-1.5">
          <label htmlFor={`${idPrefix}-6`} className="text-sm font-medium text-[var(--color-text-primary)]">Opening Stock (packets)</label>
          <input id={`${idPrefix}-6`} type="number" step="0.01" className={inputCls} value={form.current_stock} onChange={e => set('current_stock', e.target.value)} placeholder="0" />
          {/* Shows the number that actually lands in the database, so nobody
              has to trust that the conversion happened. */}
          {parseFloat(form.current_stock || '0') > 0 && (
            <p className="text-xs text-[var(--color-text-muted)] tabular-nums">
              = {toSheets(parseFloat(form.current_stock), perPacket).toLocaleString()} sheets
            </p>
          )}
        </div>
      ) : (
        <div className="space-y-1.5">
          <span className="block text-sm font-medium text-[var(--color-text-primary)]">Current Stock</span>
          <p className="h-9 flex items-center text-sm text-[var(--color-text-secondary)] tabular-nums">
            {fmtPackets(parseFloat(form.current_stock || '0'))} packets
          </p>
          <p className="text-xs text-[var(--color-text-muted)]">
            Change stock with <strong>In / Out / Adjust</strong> so the movement is recorded.
          </p>
        </div>
      )}
      <div className="space-y-1.5">
        <label htmlFor={`${idPrefix}-7`} className="text-sm font-medium text-[var(--color-text-primary)]">Reorder Level (packets)</label>
        <input id={`${idPrefix}-7`} type="number" step="0.01" className={inputCls} value={form.reorder_level} onChange={e => set('reorder_level', e.target.value)} placeholder="100" />
      </div>
      <div className="space-y-1.5">
        {/* Per SHEET, and now labelled as such. The field never said which unit
            it meant, and the one consumer that spends it (store issue → job
            costing) multiplies it by sheets — so a packet price typed here was
            100× too high with nothing to catch it. */}
        <label htmlFor={`${idPrefix}-8`} className="text-sm font-medium text-[var(--color-text-primary)]">Unit Cost (PKR / sheet)</label>
        <input id={`${idPrefix}-8`} type="number" step="0.0001" className={inputCls} value={form.unit_cost} onChange={e => set('unit_cost', e.target.value)} placeholder="0.0000" />
        {parseFloat(form.unit_cost || '0') > 0 && (() => {
          // Both equivalents, because the vendor quotes in kilos (board) or
          // reams (paper) and neither matches the stored unit.
          const kgPerSheet = sheetWeightKg(
            parseFloat(form.sheet_width_in || '0'), parseFloat(form.sheet_height_in || '0'), parseFloat(form.gsm || '0'))
          const perSheet = parseFloat(form.unit_cost)
          return (
            <p className="text-xs text-[var(--color-text-muted)] tabular-nums">
              = PKR {(perSheet * perPacket).toLocaleString(undefined, { maximumFractionDigits: 2 })} per packet of {perPacket}
              {kgPerSheet > 0 && <> · PKR {(perSheet / kgPerSheet).toLocaleString(undefined, { maximumFractionDigits: 2 })} per kg</>}
            </p>
          )
        })()}
      </div>
      <div className="space-y-1.5">
        <label htmlFor={`${idPrefix}-9`} className="text-sm font-medium text-[var(--color-text-primary)]">Location</label>
        <input id={`${idPrefix}-9`} className={inputCls} value={form.location} onChange={e => set('location', e.target.value)} placeholder="e.g. Rack A-3" />
      </div>
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
            {/* "/unit" said nothing. The column is per sheet — and until this
                commit the PO path wrote a per-packet figure into it. */}
            {l.unit_cost ? ` · PKR ${Number(l.unit_cost).toFixed(4)}/sheet` : ''}
          </p>
          {/* Which job this lot came in for — a purchase_order / manual lot was
              bought FOR the job, a production_return lot came back OFF it. */}
          {l.jobs?.job_number && (
            <p className="text-xs text-[var(--color-accent)] mt-0.5">
              {l.reference_type === 'production_return' ? 'Returned from' : 'For'} {l.jobs.job_number}
              {l.jobs.job_title ? ` — ${l.jobs.job_title}` : ''}
            </p>
          )}
        </div>
      ))}
    </div>
  )
}

/**
 * The shop's monthly board stock sheet, rebuilt from the movement ledger:
 * Opening / Received / Return / Issued / Balance per item, grouped by vendor.
 *
 * Every figure is computed by get_board_stock_report() in the database (114) —
 * nothing is totalled from a fetched array, because PostgREST silently caps a
 * plain select at 1000 rows and that is exactly how the Finance stat cards went
 * wrong before 103.
 *
 * Numbers are shown in PACKETS, which is what the store counts. Sheets sit
 * underneath the balance because that is what a job consumes.
 */
function StockReport() {
  const initial = monthBounds()
  const [from, setFrom] = useState(initial.from)
  const [to, setTo] = useState(initial.to)
  const [rows, setRows] = useState<ReportRow[]>([])
  const [loading, setLoading] = useState(true)
  const [hideEmpty, setHideEmpty] = useState(true)
  const [warning, setWarning] = useState<string | null>(null)

  const load = useCallback(async (f: string, t: string) => {
    setLoading(true)
    try {
      const res = await fetch(`/api/v1/board-inventory/report?from=${f}&to=${t}`)
      if (!res.ok) { const e = await res.json().catch(() => ({})); throw new Error(e.error || 'Failed to load the report') }
      const json = await res.json()
      setRows((json.data ?? []) as ReportRow[])
      setWarning(json.warning ?? null)
    } catch (e: any) {
      toast.error(e.message || 'Failed to load the report')
      setRows([])
    } finally { setLoading(false) }
  }, [])

  useEffect(() => { load(initial.from, initial.to) }, [load, initial.from, initial.to])

  const pkt = (sheets: number, per: number) => toPackets(Number(sheets), per)
  // An item with no opening, no movement and no balance is noise on a monthly
  // sheet — hidden by default, one click away.
  const shown = hideEmpty
    ? rows.filter(r => [r.opening_sheets, r.received_sheets, r.returned_sheets,
                        r.issued_sheets, r.closing_sheets].some(v => Number(v) !== 0))
    : rows

  // Packet totals, matching how the shop's own sheet totals its Balance column.
  const totals = shown.reduce((a, r) => ({
    opening:  a.opening  + pkt(r.opening_sheets,  r.sheets_per_packet),
    received: a.received + pkt(r.received_sheets, r.sheets_per_packet),
    returned: a.returned + pkt(r.returned_sheets, r.sheets_per_packet),
    issued:   a.issued   + pkt(r.issued_sheets,   r.sheets_per_packet),
    closing:  a.closing  + pkt(r.closing_sheets,  r.sheets_per_packet),
  }), { opening: 0, received: 0, returned: 0, issued: 0, closing: 0 })

  const exportReport = () => {
    if (!shown.length) { toast.error('Nothing to export'); return }
    exportToExcel(shown.map(r => ({
      'Item Description': r.description,
      'Vendor': r.vendor_name ?? '',
      'L': r.sheet_width_in ?? '', 'W': r.sheet_height_in ?? '', 'GSM': r.gsm ?? '',
      'Opening Balance': +pkt(r.opening_sheets, r.sheets_per_packet).toFixed(2),
      'Received': +pkt(r.received_sheets, r.sheets_per_packet).toFixed(2),
      'Total': +(pkt(r.opening_sheets, r.sheets_per_packet) + pkt(r.received_sheets, r.sheets_per_packet)).toFixed(2),
      'Issued': +pkt(r.issued_sheets, r.sheets_per_packet).toFixed(2),
      'Return From Production': +pkt(r.returned_sheets, r.sheets_per_packet).toFixed(2),
      'Adjustment': +pkt(r.adjustment_sheets, r.sheets_per_packet).toFixed(2),
      'Balance': +pkt(r.closing_sheets, r.sheets_per_packet).toFixed(2),
      'Balance (sheets)': Number(r.closing_sheets),
      'Sheets per Packet': r.sheets_per_packet,
    })), `board-stock-report-${from}-to-${to}`)
  }

  const num = (v: number) => v === 0 ? '—' : fmtPackets(v)

  return (
    <div className="space-y-3">
      {/* Range */}
      <div className="flex flex-col md:flex-row md:items-end gap-2.5">
        <div className="space-y-1.5">
          <label htmlFor="report-from" className="text-xs font-medium text-[var(--color-text-muted)]">From</label>
          <input id="report-from" type="date" className={cn(inputCls, 'md:w-40')} value={from} onChange={e => setFrom(e.target.value)} />
        </div>
        <div className="space-y-1.5">
          <label htmlFor="report-to" className="text-xs font-medium text-[var(--color-text-muted)]">To</label>
          <input id="report-to" type="date" className={cn(inputCls, 'md:w-40')} value={to} onChange={e => setTo(e.target.value)} />
        </div>
        <button onClick={() => load(from, to)} disabled={loading || from > to}
          className="px-4 h-11 md:h-9 rounded-md bg-[var(--color-accent)] text-[var(--color-on-accent)] text-sm font-medium hover:bg-[var(--color-accent-hover)] disabled:opacity-50 transition-colors">
          {loading ? 'Loading…' : 'Show'}
        </button>
        <div className="flex-1" />
        <button onClick={() => setHideEmpty(v => !v)}
          aria-pressed={hideEmpty}
          className={cn('px-3 h-11 md:h-9 rounded-md border text-sm font-medium transition-colors',
            hideEmpty ? 'border-[var(--color-accent)] text-[var(--color-accent)]' : 'border-[var(--color-border)] text-[var(--color-text-secondary)]')}>
          Hide zero rows
        </button>
        <button onClick={exportReport}
          className="flex items-center justify-center gap-1.5 px-3 h-11 md:h-9 rounded-md border border-[var(--color-border)] text-sm text-[var(--color-text-secondary)] hover:bg-[var(--color-bg-elevated)] transition-colors">
          <Download size={14} /> Export
        </button>
      </div>

      {warning && (
        <p className="text-xs text-[var(--color-warning)] flex items-start gap-1.5 rounded-lg border border-[color:color-mix(in_srgb,var(--color-warning)_30%,transparent)] bg-[color:color-mix(in_srgb,var(--color-warning)_8%,transparent)] px-3 py-2">
          <AlertTriangle size={12} className="mt-0.5 flex-shrink-0" /> {warning}
        </p>
      )}

      {loading ? (
        <p className="text-sm text-[var(--color-text-muted)] text-center py-12">Loading…</p>
      ) : shown.length === 0 ? (
        <div className="rounded-xl border border-[var(--color-border)] bg-[var(--color-bg-secondary)] p-12 text-center">
          <FileText size={28} className="text-[var(--color-text-muted)] opacity-30 mx-auto mb-2" />
          <p className="text-sm text-[var(--color-text-muted)]">No board movement in this period</p>
        </div>
      ) : (
        <>
          {/* Desktop: the sheet as a table. The wide table scrolls inside its own
              box so the page body never scrolls sideways. */}
          <div className="hidden md:block rounded-xl border border-[var(--color-border)] bg-[var(--color-bg-secondary)] overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-[var(--color-bg-elevated)] border-b border-[var(--color-border)] text-xs font-semibold text-[var(--color-text-muted)] uppercase tracking-wider">
                  <th className="text-left px-4 py-2.5 font-semibold">Item</th>
                  <th className="text-left px-3 py-2.5 font-semibold">Vendor</th>
                  <th className="text-right px-2 py-2.5 font-semibold">L</th>
                  <th className="text-right px-2 py-2.5 font-semibold">W</th>
                  <th className="text-right px-2 py-2.5 font-semibold">GSM</th>
                  <th className="text-right px-3 py-2.5 font-semibold">Opening</th>
                  <th className="text-right px-3 py-2.5 font-semibold">Received</th>
                  <th className="text-right px-3 py-2.5 font-semibold">Issued</th>
                  <th className="text-right px-3 py-2.5 font-semibold">Return</th>
                  <th className="text-right px-4 py-2.5 font-semibold">Balance</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[var(--color-border-subtle)]">
                {shown.map(r => (
                  <tr key={r.board_item_id}>
                    <td className="px-4 py-2.5 text-[var(--color-text-primary)]">{r.description}</td>
                    <td className="px-3 py-2.5 text-xs text-[var(--color-text-muted)]">{r.vendor_name ?? '—'}</td>
                    <td className="px-2 py-2.5 text-right text-xs text-[var(--color-text-muted)] tabular-nums">{r.sheet_width_in ?? '—'}</td>
                    <td className="px-2 py-2.5 text-right text-xs text-[var(--color-text-muted)] tabular-nums">{r.sheet_height_in ?? '—'}</td>
                    <td className="px-2 py-2.5 text-right text-xs text-[var(--color-text-muted)] tabular-nums">{r.gsm ?? '—'}</td>
                    <td className="px-3 py-2.5 text-right tabular-nums text-[var(--color-text-secondary)]">{num(pkt(r.opening_sheets, r.sheets_per_packet))}</td>
                    <td className="px-3 py-2.5 text-right tabular-nums text-[var(--color-success)]">{num(pkt(r.received_sheets, r.sheets_per_packet))}</td>
                    <td className="px-3 py-2.5 text-right tabular-nums text-[var(--color-danger)]">{num(pkt(r.issued_sheets, r.sheets_per_packet))}</td>
                    <td className="px-3 py-2.5 text-right tabular-nums text-[var(--color-info)]">{num(pkt(r.returned_sheets, r.sheets_per_packet))}</td>
                    <td className="px-4 py-2.5 text-right font-semibold tabular-nums text-[var(--color-text-primary)]">
                      {num(pkt(r.closing_sheets, r.sheets_per_packet))}
                      <span className="block text-[10px] font-normal text-[var(--color-text-muted)]">{Number(r.closing_sheets).toLocaleString()} sht</span>
                    </td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr className="bg-[var(--color-bg-elevated)] border-t border-[var(--color-border)] font-semibold">
                  <td className="px-4 py-2.5" colSpan={5}>Total (packets)</td>
                  <td className="px-3 py-2.5 text-right tabular-nums">{fmtPackets(totals.opening)}</td>
                  <td className="px-3 py-2.5 text-right tabular-nums">{fmtPackets(totals.received)}</td>
                  <td className="px-3 py-2.5 text-right tabular-nums">{fmtPackets(totals.issued)}</td>
                  <td className="px-3 py-2.5 text-right tabular-nums">{fmtPackets(totals.returned)}</td>
                  <td className="px-4 py-2.5 text-right tabular-nums">{fmtPackets(totals.closing)}</td>
                </tr>
              </tfoot>
            </table>
          </div>

          {/* Mobile: one card per item. Ten columns cannot fit a phone, and the
              rule here is make it FIT, not add a sideways scroll. */}
          <div className="md:hidden space-y-2">
            {shown.map(r => (
              <div key={r.board_item_id} className="rounded-xl border border-[var(--color-border)] bg-[var(--color-bg-secondary)] p-3">
                <p className="text-sm font-medium text-[var(--color-text-primary)]">{r.description}</p>
                <p className="text-xs text-[var(--color-text-muted)]">
                  {r.vendor_name ?? '—'}
                  {r.gsm ? ` · ${r.gsm} GSM` : ''}
                  {r.sheet_width_in && r.sheet_height_in ? ` · ${r.sheet_width_in}×${r.sheet_height_in}` : ''}
                </p>
                <div className="grid grid-cols-2 gap-x-4 gap-y-1 mt-2 text-xs">
                  {([['Opening', pkt(r.opening_sheets, r.sheets_per_packet), ''],
                     ['Received', pkt(r.received_sheets, r.sheets_per_packet), 'text-[var(--color-success)]'],
                     ['Issued', pkt(r.issued_sheets, r.sheets_per_packet), 'text-[var(--color-danger)]'],
                     ['Return', pkt(r.returned_sheets, r.sheets_per_packet), 'text-[var(--color-info)]']] as const).map(([label, val, cls]) => (
                    <div key={label} className="flex items-center justify-between">
                      <span className="text-[var(--color-text-muted)]">{label}</span>
                      <span className={cn('tabular-nums', cls || 'text-[var(--color-text-secondary)]')}>{num(val)}</span>
                    </div>
                  ))}
                </div>
                <div className="flex items-center justify-between mt-2 pt-2 border-t border-[var(--color-border-subtle)]">
                  <span className="text-xs font-medium text-[var(--color-text-primary)]">Balance</span>
                  <span className="text-sm font-semibold tabular-nums text-[var(--color-text-primary)]">
                    {fmtPackets(pkt(r.closing_sheets, r.sheets_per_packet))} pkt
                    <span className="block text-[10px] font-normal text-[var(--color-text-muted)] text-right">{Number(r.closing_sheets).toLocaleString()} sht</span>
                  </span>
                </div>
              </div>
            ))}
            <div className="rounded-xl border border-[var(--color-border)] bg-[var(--color-bg-elevated)] p-3 flex items-center justify-between">
              <span className="text-sm font-semibold text-[var(--color-text-primary)]">Total balance</span>
              <span className="text-sm font-semibold tabular-nums text-[var(--color-text-primary)]">{fmtPackets(totals.closing)} pkt</span>
            </div>
          </div>
        </>
      )}
    </div>
  )
}
