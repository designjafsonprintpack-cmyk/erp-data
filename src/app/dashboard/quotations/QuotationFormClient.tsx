'use client'
import { useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { ArrowLeft, Plus, Trash2, Save, Calculator, ChevronDown, ChevronUp, X } from 'lucide-react'
import { cn } from '@/lib/utils/cn'
import { toast } from '@/components/ui/Toast'
import { calculateQuotationItemCost, type UnitBasis } from '@/lib/costing/quotationCosting'

interface Customer { id: string; name: string; customer_code: string }
interface BoardType { id: string; name: string; sheet_length_in: number | null; sheet_width_in: number | null; rate_per_sheet: number | null; rate_per_kg: number | null; gsm: number | null }
interface Tax { id: string; name: string; rate_percent: number }
interface CostItemType { id: string; name: string; unit_basis: UnitBasis; default_rate: number }
interface CostLineDraft { cost_item_type_id: string; name: string; unit_basis: UnitBasis; rate: string }

interface LineItem {
  product_desc: string; size_l: string; size_w: string; size_h: string; quantity: string
  no_of_colors: string; board_type_id: string; board_costing_method: 'per_sheet' | 'per_kg'
  sheet_length_in: string; sheet_width_in: string; board_gsm: string
  board_rate_per_sheet: string; board_rate_per_kg: string
  unit_price: string; notes: string
  ups: string; wastage_percent: string
  costLines: CostLineDraft[]
}

// Default wastage % — hardcoded here rather than pulled from Settings, since
// the old Settings → Costing Rates page was removed: every cost item now
// carries its own default_rate on the Cost Items catalog instead.
const DEFAULT_WASTAGE = '5'

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

const emptyLine = (): LineItem => ({
  product_desc: '', size_l: '', size_w: '', size_h: '', quantity: '1', no_of_colors: '4',
  board_type_id: '', board_costing_method: 'per_sheet',
  sheet_length_in: '', sheet_width_in: '', board_gsm: '', board_rate_per_sheet: '', board_rate_per_kg: '',
  unit_price: '0', notes: '',
  ups: '', wastage_percent: DEFAULT_WASTAGE,
  costLines: [],
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
    initialData?.quotation_items?.map((i: any) => ({
      product_desc: i.product_desc, size_l: String(i.size_l || ''), size_w: String(i.size_w || ''),
      size_h: String(i.size_h || ''), quantity: String(i.quantity), no_of_colors: String(i.no_of_colors || 4),
      board_type_id: i.board_type_id || '', board_costing_method: i.board_costing_method || 'per_sheet',
      sheet_length_in: String(i.sheet_length_in || ''), sheet_width_in: String(i.sheet_width_in || ''),
      board_gsm: String(i.board_gsm || ''), board_rate_per_sheet: String(i.board_rate_per_sheet || ''),
      board_rate_per_kg: String(i.board_rate_per_kg || ''),
      unit_price: String(i.unit_price), notes: i.notes || '',
      ups: String(i.ups || ''), wastage_percent: String(i.wastage_percent ?? DEFAULT_WASTAGE),
      costLines: (i.quotation_item_cost_lines || []).map((l: any) => ({
        cost_item_type_id: l.cost_item_type_id || '', name: l.name, unit_basis: l.unit_basis, rate: String(l.rate),
      })),
    })) || [emptyLine()]
  )
  const [loading, setLoading] = useState(false)
  const [openCalc, setOpenCalc] = useState<number | null>(null)

  const set = (k: string, v: string) => setForm(p => ({ ...p, [k]: v }))
  const setItem = (idx: number, k: keyof LineItem, v: any) => setItems(prev => prev.map((item, i) => i === idx ? { ...item, [k]: v } : item))
  const addLine = () => setItems(prev => [...prev, emptyLine()])
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

  const addCostLine = (idx: number, costItemTypeId: string) => {
    const catalogItem = costItemTypes.find(c => c.id === costItemTypeId)
    if (!catalogItem) return
    setItems(prev => prev.map((item, i) => i === idx ? {
      ...item,
      costLines: [...item.costLines, { cost_item_type_id: catalogItem.id, name: catalogItem.name, unit_basis: catalogItem.unit_basis, rate: String(catalogItem.default_rate) }],
    } : item))
  }
  const removeCostLine = (idx: number, lineIdx: number) => {
    setItems(prev => prev.map((item, i) => i === idx ? { ...item, costLines: item.costLines.filter((_, li) => li !== lineIdx) } : item))
  }
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
    costLines: item.costLines.map(l => ({ name: l.name, unitBasis: l.unit_basis, rate: parseFloat(l.rate || '0') })),
  })

  // Sets the unit price to exact breakeven cost — there's no automatic
  // markup (margin/overhead were removed per Mehboob's request). Profit is
  // shown live below as whatever gap the estimator leaves after raising the
  // price manually from here.
  const applyCalculated = (idx: number) => {
    const item = items[idx]
    if (!item.ups || parseFloat(item.ups) <= 0) { toast.error('Enter Ups first'); return }
    if (!item.sheet_length_in || !item.sheet_width_in) { toast.error('Enter sheet size first'); return }
    const result = computeFor(item)
    setItems(prev => prev.map((it, i) => i === idx ? { ...it, unit_price: String(result.costPerUnit) } : it))
    toast.success('Unit price set to breakeven cost — adjust for profit')
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
            board_cost: result.boardCost || null,
            total_cost: result.totalCost || null,
            cost_lines: item.costLines.map((l, li) => ({
              cost_item_type_id: l.cost_item_type_id || null,
              name: l.name, unit_basis: l.unit_basis, rate: parseFloat(l.rate || '0'),
              quantity: result.costLines[li]?.quantityUsed || 0,
              amount: result.costLines[li]?.amount || 0,
            })),
          }
        }),
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
            const profitPerUnit = result ? parseFloat(item.unit_price || '0') - result.costPerUnit : 0
            const profitTotal = result ? profitPerUnit * parseFloat(item.quantity || '0') : 0
            const profitPct = result && parseFloat(item.unit_price || '0') > 0 ? (profitPerUnit / parseFloat(item.unit_price || '0')) * 100 : 0
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

                      {/* Dynamic cost lines — "+ Add Cost Line" picks from the catalog
                          instead of every cost driver needing its own fixed field */}
                      <div className="pt-3 border-t border-[var(--color-border-subtle)] space-y-2">
                        <div className="flex items-center justify-between">
                          <label className="text-xs font-medium text-[var(--color-text-secondary)]">Cost Lines</label>
                          <select
                            value=""
                            onChange={e => { if (e.target.value) addCostLine(idx, e.target.value) }}
                            className="h-7 px-2 rounded-md border text-xs bg-[var(--color-bg-secondary)] text-[var(--color-text-primary)] border-[var(--color-border)]">
                            <option value="">+ Add Cost Line…</option>
                            {costItemTypes.map(c => <option key={c.id} value={c.id}>{c.name} ({UNIT_BASIS_LABELS[c.unit_basis]})</option>)}
                          </select>
                        </div>
                        {item.costLines.length === 0 ? (
                          <p className="text-xs text-[var(--color-text-muted)]">No cost lines added — pick from the dropdown above (Plate, Printing, UV, Lamination, Foiling, Embossing, Die Making, Die Cutting, Breaking, Pasting, Packing, Cartage, or any custom item set up in Settings → Materials).</p>
                        ) : (
                          <div className="space-y-1.5">
                            {item.costLines.map((line, li) => (
                              <div key={li} className="flex items-center gap-2 text-xs">
                                <span className="flex-1 text-[var(--color-text-primary)]">{line.name}</span>
                                <span className="text-[var(--color-text-muted)] w-40">{UNIT_BASIS_LABELS[line.unit_basis]}</span>
                                <input type="number" value={line.rate} onChange={e => setCostLineRate(idx, li, e.target.value)}
                                  className="w-24 h-7 px-2 rounded-md border text-xs text-right bg-[var(--color-bg-secondary)] text-[var(--color-text-primary)] border-[var(--color-border)]" placeholder="Rate" />
                                <button onClick={() => removeCostLine(idx, li)} className="w-6 h-6 flex items-center justify-center rounded text-[var(--color-text-muted)] hover:text-[var(--color-danger)]">
                                  <X size={12} />
                                </button>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>

                      <div className="grid grid-cols-6 gap-2 pt-3 border-t border-[var(--color-border-subtle)] text-xs">
                        {result && [
                          ['Sheets (gross)', result.grossSheetQty.toLocaleString()],
                          ['1000-Blocks', result.sheetsBilledBlocks.toLocaleString()],
                          ...(item.board_costing_method === 'per_kg' ? [['Board Weight (kg)', result.boardWeightKg] as [string, number]] : []),
                          ['Board Cost', result.boardCost],
                          ...result.costLines.map(l => [l.name, l.amount] as [string, number]),
                        ].map(([label, val], i) => (
                          <div key={i}>
                            <p className="text-[var(--color-text-muted)]">{label}</p>
                            <p className="font-mono text-[var(--color-text-primary)]">{typeof val === 'number' ? val.toLocaleString(undefined, { maximumFractionDigits: 2 }) : val}</p>
                          </div>
                        ))}
                      </div>
                      {result && (
                        <div className="flex items-center justify-between pt-3 border-t border-[var(--color-border-subtle)]">
                          <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs">
                            <span className="text-[var(--color-text-muted)]">Total cost: <b className="text-[var(--color-text-primary)] font-mono">PKR {result.totalCost.toLocaleString(undefined, { maximumFractionDigits: 2 })}</b></span>
                            <span className="text-[var(--color-text-muted)]">Cost/unit: <b className="text-[var(--color-text-primary)] font-mono">PKR {result.costPerUnit.toLocaleString(undefined, { maximumFractionDigits: 2 })}</b></span>
                            <span className="text-[var(--color-text-muted)]">Profit/unit: <b className={cn('font-mono', profitPerUnit >= 0 ? 'text-[var(--color-success)]' : 'text-[var(--color-danger)]')}>PKR {profitPerUnit.toLocaleString(undefined, { maximumFractionDigits: 2 })}</b></span>
                            <span className="text-[var(--color-text-muted)]">Total profit: <b className={cn('font-mono', profitTotal >= 0 ? 'text-[var(--color-success)]' : 'text-[var(--color-danger)]')}>PKR {profitTotal.toLocaleString(undefined, { maximumFractionDigits: 2 })}</b> ({profitPct.toFixed(1)}%)</span>
                          </div>
                          <button onClick={() => applyCalculated(idx)}
                            className="px-3 h-8 rounded-md bg-[var(--color-accent)] text-white text-xs font-medium hover:bg-[var(--color-accent-hover)] transition-colors flex-shrink-0">
                            Set Unit Price to Cost
                          </button>
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
