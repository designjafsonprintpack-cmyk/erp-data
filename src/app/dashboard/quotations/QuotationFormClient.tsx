'use client'
import { useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { ArrowLeft, Plus, Trash2, Save, Calculator, ChevronDown, ChevronUp, History, X } from 'lucide-react'
import { cn } from '@/lib/utils/cn'
import { toast } from '@/components/ui/Toast'
import { calculateQuotationItemCost, type UnitBasis } from '@/lib/costing/quotationCosting'
import { useDraftAutosave } from '@/lib/utils/useDraftAutosave'
import { formatTimeAgo } from '@/lib/utils/format'

interface Customer { id: string; name: string; customer_code: string }
interface BoardType { id: string; name: string; sheet_length_in: number | null; sheet_width_in: number | null; rate_per_sheet: number | null; rate_per_kg: number | null; gsm: number | null }
interface Tax { id: string; name: string; rate_percent: number }
interface CostItemType { id: string; name: string; unit_basis: UnitBasis; default_rate: number }
// `active` is the "tick" — a checked Finish Goods line counts toward the
// total; unchecked ones stay visible (with their rate still editable) but
// contribute nothing, so switching a line on/off never loses the rate the
// estimator typed in.
interface CostLineDraft { cost_item_type_id: string; name: string; unit_basis: UnitBasis; rate: string; active: boolean; per_unit_qty: string }

interface LineItem {
  product_desc: string; size_l: string; size_w: string; size_h: string; quantity: string
  no_of_colors: string; board_type_id: string; board_costing_method: 'per_sheet' | 'per_kg'
  sheet_length_in: string; sheet_width_in: string; board_gsm: string
  board_rate_per_sheet: string; board_rate_per_kg: string
  unit_price: string; notes: string
  ups: string; wastage_percent: string
  profit_margin_percent: string
  packet_length_in: string; packet_width_in: string; packet_div: string
  costLines: CostLineDraft[]
}

// Default wastage % — hardcoded here rather than pulled from Settings, since
// the old Settings → Costing Rates page was removed: every cost item now
// carries its own default_rate on the Cost Items catalog instead.
const DEFAULT_WASTAGE = '5'

// Bases priced "per N boxes" — the N is editable per line (Packing,
// Cartage, Cartage Travel). Everything else keeps a fixed basis.
const PER_N_BOXES_BASES: UnitBasis[] = ['per_1000_boxes', 'per_1000_boxes_carton', 'per_1000_boxes_wastage']

const UNIT_BASIS_LABELS: Record<UnitBasis, string> = {
  per_sheet: 'Per Sheet',
  per_1000_sheets: 'Per 1000 Sheets',
  per_1000_sheets_per_color: 'Per 1000 Sheets × Color',
  per_plate: 'Per Plate (per color)',
  per_ups: 'Per Ups',
  per_1000_boxes: 'Per 1000 Boxes',
  per_1000_boxes_carton: 'Per 1000 Boxes in Carton',
  per_sqft: 'Per Sq.Ft (area-based)',
  per_1000_boxes_wastage: 'Per 1000 Boxes (+ wastage)',
}

const emptyLine = (costItemTypes: CostItemType[]): LineItem => ({
  product_desc: '', size_l: '', size_w: '', size_h: '', quantity: '1', no_of_colors: '4',
  board_type_id: '', board_costing_method: 'per_sheet',
  sheet_length_in: '', sheet_width_in: '', board_gsm: '', board_rate_per_sheet: '', board_rate_per_kg: '',
  unit_price: '0', notes: '',
  ups: '', wastage_percent: DEFAULT_WASTAGE,
  profit_margin_percent: '0',
  packet_length_in: '', packet_width_in: '', packet_div: '1',
  // Every catalog item shows up as a Finish Goods checklist row, unticked
  // by default — nothing is included in the cost until the estimator
  // ticks it (and gets a rate pre-filled from the catalog default, still
  // editable).
  costLines: costItemTypes.map(c => ({ cost_item_type_id: c.id, name: c.name, unit_basis: c.unit_basis, rate: String(c.default_rate), active: false, per_unit_qty: '1000' })),
})

interface Props {
  mode: 'new' | 'edit'; customers: Customer[]; boardTypes: BoardType[]; taxes: Tax[]
  costItemTypes: CostItemType[]; initialData?: any
}

export default function QuotationFormClient({ mode, customers, boardTypes, taxes, costItemTypes, initialData }: Props) {
  const router = useRouter()

  const [form, setForm] = useState({
    customer_id: initialData?.customer_id || '',
    valid_until: initialData?.valid_until || '',
    discount_percent: String(initialData?.discount_percent || '0'),
    tax_id: initialData?.tax_id || '',
    notes: initialData?.notes || '',
    terms_conditions: initialData?.terms_conditions || '',
  })
  const [items, setItems] = useState<LineItem[]>(
    initialData?.quotation_items?.map((i: any) => {
      const saved: any[] = i.quotation_item_cost_lines || []
      // Merge: every catalog item is a checklist row. If this item has a
      // saved cost line for that catalog entry, it's ticked with the saved
      // rate; otherwise it's unticked with the catalog default rate. Any
      // saved line whose cost_item_type_id no longer matches a live
      // catalog entry (deleted/renamed item type) is still appended so a
      // historical quotation doesn't silently lose what it was actually
      // costed with.
      const bySavedType = new Map(saved.map(l => [l.cost_item_type_id, l]))
      const merged: CostLineDraft[] = costItemTypes.map(c => {
        const s = bySavedType.get(c.id)
        return s
          ? { cost_item_type_id: c.id, name: s.name, unit_basis: s.unit_basis, rate: String(s.rate), active: true, per_unit_qty: String(s.per_unit_qty ?? 1000) }
          : { cost_item_type_id: c.id, name: c.name, unit_basis: c.unit_basis, rate: String(c.default_rate), active: false, per_unit_qty: '1000' }
      })
      const orphaned = saved.filter(l => l.cost_item_type_id && !costItemTypes.some(c => c.id === l.cost_item_type_id))
      for (const o of orphaned) merged.push({ cost_item_type_id: o.cost_item_type_id || '', name: o.name, unit_basis: o.unit_basis, rate: String(o.rate), active: true, per_unit_qty: String(o.per_unit_qty ?? 1000) })

      return {
        product_desc: i.product_desc, size_l: String(i.size_l || ''), size_w: String(i.size_w || ''),
        size_h: String(i.size_h || ''), quantity: String(i.quantity), no_of_colors: String(i.no_of_colors || 4),
        board_type_id: i.board_type_id || '', board_costing_method: i.board_costing_method || 'per_sheet',
        sheet_length_in: String(i.sheet_length_in || ''), sheet_width_in: String(i.sheet_width_in || ''),
        board_gsm: String(i.board_gsm || ''), board_rate_per_sheet: String(i.board_rate_per_sheet || ''),
        board_rate_per_kg: String(i.board_rate_per_kg || ''),
        unit_price: String(i.unit_price), notes: i.notes || '',
        ups: String(i.ups || ''), wastage_percent: String(i.wastage_percent ?? DEFAULT_WASTAGE),
        profit_margin_percent: String(i.margin_percent ?? '0'),
        packet_length_in: String(i.packet_length_in || ''), packet_width_in: String(i.packet_width_in || ''),
        packet_div: String(i.packet_div ?? '1'),
        costLines: merged,
      }
    }) || [emptyLine(costItemTypes)]
  )
  const [loading, setLoading] = useState(false)
  const [openCalc, setOpenCalc] = useState<number | null>(null)

  // Autosave only applies to brand-new quotations — never in edit mode, to
  // avoid ever restoring a stale local draft over a real saved record.
  const isNew = mode !== 'edit'
  const { draftAvailable, draftSavedAt, restoreDraft, discardDraft, clearDraft } = useDraftAutosave({
    key: 'jafson_draft_new_quotation',
    value: { form, items },
    enabled: isNew,
    isBlank: (v: { form: typeof form; items: LineItem[] }) =>
      !v.form.customer_id && v.items.every(i => !i.product_desc?.trim()),
  })
  const applyRestoredDraft = () => {
    const draft = restoreDraft()
    if (draft) { setForm(draft.form); setItems(draft.items) }
    discardDraft()
  }

  const set = (k: string, v: string) => setForm(p => ({ ...p, [k]: v }))
  const setItem = (idx: number, k: keyof LineItem, v: any) => setItems(prev => prev.map((item, i) => i === idx ? { ...item, [k]: v } : item))
  const addLine = () => setItems(prev => [...prev, emptyLine(costItemTypes)])
  const removeLine = (idx: number) => setItems(prev => prev.filter((_, i) => i !== idx))

  // Selecting a Board Type pre-fills the sheet size/GSM/rate fields — but
  // they stay independently editable afterward, since a custom/one-off
  // sheet size that isn't in the catalog still needs to be costable.
  const selectBoard = (idx: number, boardTypeId: string) => {
    const board = boardTypes.find(b => b.id === boardTypeId)
    setItems(prev => prev.map((item, i) => i === idx ? {
      ...item,
      board_type_id: boardTypeId,
      sheet_length_in: board?.sheet_length_in ? String(board.sheet_length_in) : item.sheet_length_in,
      sheet_width_in: board?.sheet_width_in ? String(board.sheet_width_in) : item.sheet_width_in,
      board_gsm: board?.gsm ? String(board.gsm) : item.board_gsm,
      board_rate_per_sheet: board?.rate_per_sheet ? String(board.rate_per_sheet) : item.board_rate_per_sheet,
      board_rate_per_kg: board?.rate_per_kg ? String(board.rate_per_kg) : item.board_rate_per_kg,
    } : item))
  }

  // Ticking a Finish Goods row includes it in the cost; unticking removes
  // it from the total but keeps the rate the estimator typed, so toggling
  // back on doesn't lose it.
  const toggleCostLine = (idx: number, lineIdx: number) => {
    setItems(prev => prev.map((item, i) => i === idx ? {
      ...item, costLines: item.costLines.map((l, li) => li === lineIdx ? { ...l, active: !l.active } : l),
    } : item))
  }
  const setCostLinePerUnitQty = (itemIdx: number, lineIdx: number, per_unit_qty: string) =>
    setItems(prev => prev.map((item, i) => i !== itemIdx ? item : {
      ...item, costLines: item.costLines.map((l, li) => li === lineIdx ? { ...l, per_unit_qty } : l),
    }))
  const setCostLineRate = (idx: number, lineIdx: number, rate: string) => {
    setItems(prev => prev.map((item, i) => i === idx ? {
      ...item, costLines: item.costLines.map((l, li) => li === lineIdx ? { ...l, rate } : l),
    } : item))
  }

  const inputCls = 'w-full h-9 px-2.5 rounded-md border text-sm bg-[var(--color-bg-elevated)] text-[var(--color-text-primary)] border-[var(--color-border)] focus:outline-none focus:border-[var(--color-accent)] focus:ring-1 focus:ring-[var(--color-accent)] transition-colors'
  const smallInputCls = 'w-full h-8 px-2 rounded-md border text-sm bg-[var(--color-bg-secondary)] text-[var(--color-text-primary)] border-[var(--color-border)] focus:outline-none focus:border-[var(--color-accent)] focus:ring-1 focus:ring-[var(--color-accent)] transition-colors'

  // Computed totals
  const subtotal = items.reduce((sum, item) => sum + (parseFloat(item.quantity || '0') * parseFloat(item.unit_price || '0')), 0)
  const discountAmt = subtotal * (parseFloat(form.discount_percent || '0') / 100)
  const afterDiscount = subtotal - discountAmt
  const selectedTax = taxes.find(t => t.id === form.tax_id)
  const taxAmt = selectedTax ? afterDiscount * (selectedTax.rate_percent / 100) : 0
  const total = afterDiscount + taxAmt

  const computeFor = (item: LineItem) => calculateQuotationItemCost({
    quantity: parseFloat(item.quantity || '0'),
    ups: parseFloat(item.ups || '0'),
    wastagePercent: parseFloat(item.wastage_percent || '0'),
    noOfColors: parseFloat(item.no_of_colors || '0'),
    boardCostingMethod: item.board_costing_method,
    boardRatePerSheet: parseFloat(item.board_rate_per_sheet || '0'),
    boardRatePerKg: parseFloat(item.board_rate_per_kg || '0'),
    boardGsm: parseFloat(item.board_gsm || '0'),
    sheetLengthIn: parseFloat(item.sheet_length_in || '0'),
    sheetWidthIn: parseFloat(item.sheet_width_in || '0'),
    // Only ticked Finish Goods rows count toward the total.
    costLines: item.costLines.filter(l => l.active).map(l => ({ name: l.name, unitBasis: l.unit_basis, rate: parseFloat(l.rate || '0'), perUnitQty: parseFloat(l.per_unit_qty || '1000') })),
    profitMarginPercent: parseFloat(item.profit_margin_percent || '0'),
    packetLengthIn: parseFloat(item.packet_length_in || '0'),
    packetWidthIn: parseFloat(item.packet_width_in || '0'),
    packetDiv: parseFloat(item.packet_div || '1'),
  })

  // Profit Margin % drives the suggested price: Agreed Rate = Total Cost x
  // (1 + margin%/100), Suggested Unit Price = Agreed Rate / Quantity. This
  // only sets unit_price when clicked — the estimator can still type over
  // it by hand afterward, same as before.
  const applyMargin = (idx: number) => {
    const item = items[idx]
    if (!item.ups || parseFloat(item.ups) <= 0) { toast.error('Enter Ups first'); return }
    if (!item.sheet_length_in || !item.sheet_width_in) { toast.error('Enter sheet size first'); return }
    const result = computeFor(item)
    setItems(prev => prev.map((it, i) => i === idx ? { ...it, unit_price: String(result.suggestedUnitPrice) } : it))
    toast.success(`Unit price set from ${item.profit_margin_percent || 0}% margin`)
  }

  const save = async (status = 'draft') => {
    if (!form.customer_id) { toast.error('Please select a customer'); return }
    if (!items.some(i => i.product_desc)) { toast.error('Add at least one line item'); return }
    setLoading(true)
    try {
      const payload = {
        ...form,
        discount_percent: parseFloat(form.discount_percent || '0'),
        tax_id: form.tax_id || null,
        subtotal, discount_amount: discountAmt, tax_amount: taxAmt, total_amount: total,
        status,
        items: items.filter(i => i.product_desc).map(item => {
          const result = computeFor(item)
          return {
            product_desc: item.product_desc,
            size_l: item.size_l ? parseFloat(item.size_l) : null,
            size_w: item.size_w ? parseFloat(item.size_w) : null,
            size_h: item.size_h ? parseFloat(item.size_h) : null,
            quantity: parseFloat(item.quantity || '1'),
            no_of_colors: parseInt(item.no_of_colors || '4'),
            board_type_id: item.board_type_id || null,
            board_costing_method: item.board_costing_method,
            sheet_length_in: item.sheet_length_in ? parseFloat(item.sheet_length_in) : null,
            sheet_width_in: item.sheet_width_in ? parseFloat(item.sheet_width_in) : null,
            board_gsm: item.board_gsm ? parseFloat(item.board_gsm) : null,
            board_rate_per_sheet: item.board_rate_per_sheet ? parseFloat(item.board_rate_per_sheet) : null,
            board_rate_per_kg: item.board_rate_per_kg ? parseFloat(item.board_rate_per_kg) : null,
            unit_price: parseFloat(item.unit_price || '0'),
            subtotal: parseFloat(item.quantity || '1') * parseFloat(item.unit_price || '0'),
            notes: item.notes || null,
            ups: item.ups ? parseInt(item.ups) : null,
            sheet_qty: item.ups ? Math.ceil(parseFloat(item.quantity || '0') / parseFloat(item.ups)) : null,
            wastage_percent: item.wastage_percent ? parseFloat(item.wastage_percent) : null,
            margin_percent: item.profit_margin_percent ? parseFloat(item.profit_margin_percent) : null,
            packet_length_in: item.packet_length_in ? parseFloat(item.packet_length_in) : null,
            packet_width_in: item.packet_width_in ? parseFloat(item.packet_width_in) : null,
            packet_div: item.packet_div ? parseFloat(item.packet_div) : null,
            board_cost: result.boardCost || null,
            total_cost: result.totalCost || null,
            // Only ticked rows are saved as cost lines — unticked catalog
            // rows with a leftover rate typed in don't get persisted.
            cost_lines: item.costLines.filter(l => l.active).map((l) => {
              const idx2 = result.costLines.findIndex(rl => rl.name === l.name && rl.unitBasis === l.unit_basis)
              return {
                cost_item_type_id: l.cost_item_type_id || null,
                name: l.name, unit_basis: l.unit_basis, rate: parseFloat(l.rate || '0'),
                per_unit_qty: parseFloat(l.per_unit_qty || '1000') || 1000,
                quantity: result.costLines[idx2]?.quantityUsed || 0,
                amount: result.costLines[idx2]?.amount || 0,
              }
            }),
          }
        }),
      }
      const url = mode === 'new' ? '/api/v1/quotations' : `/api/v1/quotations/${initialData?.id}`
      const res = await fetch(url, { method: mode === 'new' ? 'POST' : 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) })
      if (!res.ok) { const e = await res.json(); throw new Error(e.error) }
      const { data } = await res.json()
      clearDraft()
      toast.success(mode === 'new' ? 'Quotation created' : 'Quotation updated')
      router.push(`/dashboard/quotations/${data.id}`)
    } catch (e: any) { toast.error(e.message || 'Failed') }
    finally { setLoading(false) }
  }

  return (
    <div className="space-y-6">
      {draftAvailable && (
        <div className="flex items-center gap-3 px-4 h-11 rounded-md border border-[var(--color-accent)]/30 bg-[var(--color-accent)]/10 text-sm">
          <History size={15} className="text-[var(--color-accent)] flex-shrink-0" />
          <span className="text-[var(--color-text-primary)]">
            You have an unsaved quotation draft{draftSavedAt ? ` from ${formatTimeAgo(draftSavedAt)}` : ''}.
          </span>
          <button onClick={applyRestoredDraft} className="ml-auto text-[var(--color-accent)] font-medium hover:underline">Restore</button>
          <button onClick={discardDraft} className="text-[var(--color-text-muted)] hover:text-[var(--color-text-primary)]" title="Discard draft">
            <X size={14} />
          </button>
        </div>
      )}
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
            <label className="text-sm font-medium text-[var(--color-text-primary)]">Sales Tax</label>
            <select className={inputCls} value={form.tax_id} onChange={e => set('tax_id', e.target.value)}>
              <option value="">No tax</option>
              {taxes.map(t => <option key={t.id} value={t.id}>{t.name} ({t.rate_percent}%)</option>)}
            </select>
          </div>
          <div className="space-y-1.5">
            <label className="text-sm font-medium text-[var(--color-text-primary)]">Notes</label>
            <input className={inputCls} value={form.notes} onChange={e => set('notes', e.target.value)} placeholder="Customer-visible notes" />
          </div>
          <div className="space-y-1.5">
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
          <div className="col-span-2">L × W × H (mm)</div>
          <div className="col-span-1">Qty</div>
          <div className="col-span-1">Colors</div>
          <div className="col-span-1">Board Type</div>
          <div className="col-span-1">Unit Price</div>
          <div className="col-span-1 text-right">Subtotal</div>
          <div className="col-span-2"></div>
        </div>

        <div className="divide-y divide-[var(--color-border-subtle)]">
          {items.map((item, idx) => {
            const lineTotal = parseFloat(item.quantity || '0') * parseFloat(item.unit_price || '0')
            const isOpen = openCalc === idx
            const result = isOpen ? computeFor(item) : null
            return (
              <div key={idx}>
                <div className="grid grid-cols-12 gap-2 px-4 py-3 items-center">
                  <div className="col-span-3">
                    <input className={inputCls} value={item.product_desc} onChange={e => setItem(idx, 'product_desc', e.target.value)} placeholder="Product description *" />
                  </div>
                  <div className="col-span-2 flex items-center gap-1">
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
                    <select className={inputCls} value={item.board_type_id} onChange={e => selectBoard(idx, e.target.value)}>
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
                  <div className="col-span-2 flex justify-end gap-1">
                    <button onClick={() => setOpenCalc(isOpen ? null : idx)}
                      className={cn('flex items-center gap-1 px-2.5 h-8 rounded-md border text-xs font-medium transition-colors',
                        isOpen ? 'border-[var(--color-accent)] text-[var(--color-accent)] bg-[var(--color-accent)]/10' : 'border-[var(--color-border)] text-[var(--color-text-muted)] hover:text-[var(--color-accent)] hover:border-[var(--color-accent)]')}>
                      <Calculator size={12} /> Cost {isOpen ? <ChevronUp size={12} /> : <ChevronDown size={12} />}
                    </button>
                    {items.length > 1 && (
                      <button onClick={() => removeLine(idx)} className="w-8 h-8 flex items-center justify-center rounded-md text-[var(--color-text-muted)] hover:bg-[var(--color-danger)]/10 hover:text-[var(--color-danger)] transition-colors">
                        <Trash2 size={13} />
                      </button>
                    )}
                  </div>
                </div>

                {/* Costing calculator panel */}
                {isOpen && (
                  <div className="px-4 pb-4 -mt-1">
                    <div className="rounded-lg border border-[var(--color-border)] bg-[var(--color-bg-elevated)]/40 p-4 space-y-3">
                      <div className="grid grid-cols-4 gap-3">
                        <div className="space-y-1">
                          <label className="text-xs text-[var(--color-text-muted)]">Ups (per sheet)</label>
                          <input type="number" className={smallInputCls} value={item.ups} onChange={e => setItem(idx, 'ups', e.target.value)} placeholder="e.g. 8" />
                        </div>
                        <div className="space-y-1">
                          <label className="text-xs text-[var(--color-text-muted)]">Wastage %</label>
                          <input type="number" className={smallInputCls} value={item.wastage_percent} onChange={e => setItem(idx, 'wastage_percent', e.target.value)} />
                        </div>
                        <div className="space-y-1">
                          <label className="text-xs text-[var(--color-text-muted)]">Sheet Length (in)</label>
                          <input type="number" className={smallInputCls} value={item.sheet_length_in} onChange={e => setItem(idx, 'sheet_length_in', e.target.value)} placeholder="e.g. 20" />
                        </div>
                        <div className="space-y-1">
                          <label className="text-xs text-[var(--color-text-muted)]">Sheet Width (in)</label>
                          <input type="number" className={smallInputCls} value={item.sheet_width_in} onChange={e => setItem(idx, 'sheet_width_in', e.target.value)} placeholder="e.g. 30" />
                        </div>
                        <div className="space-y-1">
                          <label className="text-xs text-[var(--color-text-muted)]">Board GSM</label>
                          <input type="number" className={smallInputCls} value={item.board_gsm} onChange={e => setItem(idx, 'board_gsm', e.target.value)} placeholder="e.g. 300" />
                        </div>
                        <div className="space-y-1">
                          <label className="text-xs text-[var(--color-text-muted)]">Board Costing</label>
                          <select className={smallInputCls} value={item.board_costing_method} onChange={e => setItem(idx, 'board_costing_method', e.target.value as 'per_sheet' | 'per_kg')}>
                            <option value="per_sheet">Per Sheet</option>
                            <option value="per_kg">Per KG (weight)</option>
                          </select>
                        </div>
                        {item.board_costing_method === 'per_kg' ? (
                          <div className="space-y-1">
                            <label className="text-xs text-[var(--color-text-muted)]">Board Rate / KG</label>
                            <input type="number" className={smallInputCls} value={item.board_rate_per_kg} onChange={e => setItem(idx, 'board_rate_per_kg', e.target.value)} placeholder="PKR" />
                          </div>
                        ) : (
                          <div className="space-y-1">
                            <label className="text-xs text-[var(--color-text-muted)]">Board Rate / Sheet</label>
                            <input type="number" className={smallInputCls} value={item.board_rate_per_sheet} onChange={e => setItem(idx, 'board_rate_per_sheet', e.target.value)} placeholder="PKR" />
                          </div>
                        )}
                      </div>

                      {/* Packet Size + Div — informational bundling detail only,
                          doesn't affect Board Cost/Total Cost (Div cancels out
                          mathematically either way). Kept editable for records. */}
                      <div className="pt-3 border-t border-[var(--color-border-subtle)]">
                        <p className="text-xs font-medium text-[var(--color-text-secondary)] mb-2">Packet Size <span className="font-normal text-[var(--color-text-muted)]">(record-keeping only — doesn&apos;t change cost)</span></p>
                        <div className="grid grid-cols-4 gap-3">
                          <div className="space-y-1">
                            <label className="text-xs text-[var(--color-text-muted)]">Packet Length (in)</label>
                            <input type="number" className={smallInputCls} value={item.packet_length_in} onChange={e => setItem(idx, 'packet_length_in', e.target.value)} placeholder="e.g. 20" />
                          </div>
                          <div className="space-y-1">
                            <label className="text-xs text-[var(--color-text-muted)]">Packet Width (in)</label>
                            <input type="number" className={smallInputCls} value={item.packet_width_in} onChange={e => setItem(idx, 'packet_width_in', e.target.value)} placeholder="e.g. 30" />
                          </div>
                          <div className="space-y-1">
                            <label className="text-xs text-[var(--color-text-muted)]">Div</label>
                            <input type="number" className={smallInputCls} value={item.packet_div} onChange={e => setItem(idx, 'packet_div', e.target.value)} placeholder="1" />
                          </div>
                          {result && (
                            <div className="space-y-1">
                              <label className="text-xs text-[var(--color-text-muted)]">Packets / Pkt Weight</label>
                              <p className="h-8 flex items-center text-sm font-mono text-[var(--color-text-secondary)]">{result.packets.toLocaleString(undefined, { maximumFractionDigits: 2 })} / {result.pktWeightKg.toLocaleString(undefined, { maximumFractionDigits: 2 })} kg</p>
                            </div>
                          )}
                        </div>
                      </div>

                      {/* Finish Goods checklist — tick to include a line in the
                          cost, type its Rate, Amount computes automatically.
                          Unticked lines keep whatever Rate was typed so
                          re-ticking doesn't lose it. */}
                      <div className="pt-3 border-t border-[var(--color-border-subtle)] space-y-2">
                        <label className="text-xs font-medium text-[var(--color-text-secondary)]">Finish Goods</label>
                        <div className="grid grid-cols-12 gap-2 px-1 text-[10px] uppercase tracking-wider text-[var(--color-text-muted)]">
                          <div className="col-span-1"></div>
                          <div className="col-span-4">Item</div>
                          <div className="col-span-3">Basis</div>
                          <div className="col-span-2 text-right">Rate</div>
                          <div className="col-span-2 text-right">Amount</div>
                        </div>
                        <div className="space-y-1">
                          {item.costLines.map((line, li) => {
                            const lineResult = result?.costLines.find((_, ri) => ri === result.costLines.findIndex(rl => rl.name === line.name && rl.unitBasis === line.unit_basis))
                            const amount = line.active ? (lineResult?.amount ?? 0) : 0
                            return (
                              <div key={li} className={cn('grid grid-cols-12 gap-2 items-center py-1 px-1 rounded', line.active && 'bg-[var(--color-accent)]/5')}>
                                <div className="col-span-1">
                                  <input type="checkbox" checked={line.active} onChange={() => toggleCostLine(idx, li)}
                                    className="w-4 h-4 rounded accent-[var(--color-accent)] cursor-pointer" />
                                </div>
                                <div className={cn('col-span-4 text-xs', line.active ? 'text-[var(--color-text-primary)] font-medium' : 'text-[var(--color-text-muted)]')}>{line.name}</div>
                                <div className="col-span-3 text-[10px] text-[var(--color-text-muted)]">
                                  {PER_N_BOXES_BASES.includes(line.unit_basis) ? (
                                    <span className="flex items-center gap-1">
                                      Per
                                      <input type="number" min={1} value={line.per_unit_qty}
                                        onChange={e => setCostLinePerUnitQty(idx, li, e.target.value)}
                                        className="w-14 h-6 px-1 rounded border text-[10px] text-center bg-[var(--color-bg-secondary)] text-[var(--color-text-primary)] border-[var(--color-border)] focus:outline-none focus:border-[var(--color-accent)]" />
                                      {line.unit_basis === 'per_1000_boxes_carton' ? 'Boxes in Carton' : line.unit_basis === 'per_1000_boxes_wastage' ? 'Boxes (+ wastage)' : 'Boxes'}
                                    </span>
                                  ) : UNIT_BASIS_LABELS[line.unit_basis]}
                                </div>
                                <div className="col-span-2">
                                  <input type="number" value={line.rate} onChange={e => setCostLineRate(idx, li, e.target.value)}
                                    className="w-full h-7 px-2 rounded-md border text-xs text-right bg-[var(--color-bg-secondary)] text-[var(--color-text-primary)] border-[var(--color-border)]" placeholder="Rate" />
                                </div>
                                <div className="col-span-2 text-right text-xs font-mono text-[var(--color-text-primary)]">
                                  {line.active ? amount.toLocaleString(undefined, { maximumFractionDigits: 2 }) : '—'}
                                </div>
                              </div>
                            )
                          })}
                        </div>
                        {costItemTypes.length === 0 && (
                          <p className="text-xs text-[var(--color-text-muted)]">No cost items set up yet — add Plate, Printing, UV, Lamination, Foiling, Embossing, Die Making, Die Cutting, Breaking, Pasting, Packing, Cartage (or custom items) from Settings → Materials.</p>
                        )}
                      </div>

                      <div className="grid grid-cols-6 gap-2 pt-3 border-t border-[var(--color-border-subtle)] text-xs">
                        {result && [
                          ['Sheets (gross)', result.grossSheetQty.toLocaleString()],
                          ['1000-Blocks', result.sheetsBilledBlocks.toLocaleString()],
                          ...(item.board_costing_method === 'per_kg' ? [['Board Weight (kg)', result.boardWeightKg] as [string, number]] : []),
                          ['Board Cost', result.boardCost],
                          ['Finish Goods Total', result.costLinesTotal],
                        ].map(([label, val], i) => (
                          <div key={i}>
                            <p className="text-[var(--color-text-muted)]">{label}</p>
                            <p className="font-mono text-[var(--color-text-primary)]">{typeof val === 'number' ? val.toLocaleString(undefined, { maximumFractionDigits: 2 }) : val}</p>
                          </div>
                        ))}
                      </div>

                      {/* Profit Margin % — editable, drives the suggested price
                          live: Agreed Rate = Total Cost x (1 + margin%/100). */}
                      {result && (
                        <div className="pt-3 border-t border-[var(--color-border-subtle)] space-y-3">
                          <div className="grid grid-cols-4 gap-3 items-end">
                            <div className="space-y-1">
                              <label className="text-xs text-[var(--color-text-muted)]">Total Cost</label>
                              <p className="h-8 flex items-center text-sm font-mono text-[var(--color-text-primary)]">PKR {result.totalCost.toLocaleString(undefined, { maximumFractionDigits: 2 })}</p>
                            </div>
                            <div className="space-y-1">
                              <label className="text-xs text-[var(--color-text-muted)]">Profit Margin %</label>
                              <input type="number" className={smallInputCls} value={item.profit_margin_percent} onChange={e => setItem(idx, 'profit_margin_percent', e.target.value)} placeholder="e.g. 20" />
                            </div>
                            <div className="space-y-1">
                              <label className="text-xs text-[var(--color-text-muted)]">Agreed Rate (order total)</label>
                              <p className="h-8 flex items-center text-sm font-mono text-[var(--color-text-primary)]">PKR {result.agreedRate.toLocaleString(undefined, { maximumFractionDigits: 2 })}</p>
                            </div>
                            <div className="space-y-1">
                              <label className="text-xs text-[var(--color-text-muted)]">Suggested Unit Price</label>
                              <p className="h-8 flex items-center text-sm font-mono text-[var(--color-success)]">PKR {result.suggestedUnitPrice.toLocaleString(undefined, { maximumFractionDigits: 2 })}</p>
                            </div>
                          </div>
                          <div className="flex items-center justify-between">
                            <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs">
                              <span className="text-[var(--color-text-muted)]">Cost/unit: <b className="text-[var(--color-text-primary)] font-mono">PKR {result.costPerUnit.toLocaleString(undefined, { maximumFractionDigits: 2 })}</b></span>
                              <span className="text-[var(--color-text-muted)]">Profit amount: <b className="text-[var(--color-success)] font-mono">PKR {result.profitAmount.toLocaleString(undefined, { maximumFractionDigits: 2 })}</b></span>
                              <span className="text-[var(--color-text-muted)]">Sales Tax: <span className="text-[var(--color-text-secondary)]">set once for the whole quotation above (or leave &quot;No tax&quot;)</span></span>
                            </div>
                            <button onClick={() => applyMargin(idx)}
                              className="px-3 h-8 rounded-md bg-[var(--color-accent)] text-white text-xs font-medium hover:bg-[var(--color-accent-hover)] transition-colors flex-shrink-0">
                              Apply to Unit Price
                            </button>
                          </div>
                        </div>
                      )}
                    </div>
                  </div>
                )}
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
              {selectedTax && (
                <div className="flex justify-between text-sm text-[var(--color-text-secondary)]">
                  <span>{selectedTax.name} ({selectedTax.rate_percent}%)</span>
                  <span>+ PKR {taxAmt.toLocaleString(undefined, { minimumFractionDigits: 2 })}</span>
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
