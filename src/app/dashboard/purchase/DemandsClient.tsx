'use client'
import { useState } from 'react'
import Link from 'next/link'
import { ShoppingCart, Plus, PackageCheck, Truck, AlertTriangle } from 'lucide-react'
import { cn } from '@/lib/utils/cn'
import { TabStrip } from '@/components/ui/TabStrip'
import { Modal } from '@/components/ui/Modal'
import { toast } from '@/components/ui/Toast'
import { DataList, type DataListColumn } from '@/components/ui/DataList'
import { Pagination } from '@/components/ui/Pagination'
import { useServerPagedList } from '@/lib/hooks/useServerPagedList'
import { MoneyGate } from '@/components/ui/MoneyGate'

export interface Demand {
  id: string
  job_id: string | null
  material_name: string
  gsm: number | null
  sheet_width_in: number | null
  sheet_height_in: number | null
  sheets_required: number
  sheets_from_stock: number
  sheets_ordered: number
  sheets_received: number
  sheets_to_purchase: number
  status: string
  notes: string | null
  board_item_id: string | null
  vendor_id: string | null
  vendor_name: string | null
  packets_to_purchase: number
  sheets_per_packet: number
  jobs?: { job_number: string; job_title: string; required_date: string | null; customers?: { name: string } | null } | null
  board_types?: { name: string } | null
  board_inventory?: { description: string; current_stock: number; reserved_stock: number; unit_cost: number | null } | null
}

interface BoardType { id: string; name: string }
interface Vendor { id: string; name: string; vendor_code?: string | null }

const STATUS_CFG: Record<string, { label: string; cls: string }> = {
  open:              { label: 'To order',   cls: 'text-[var(--color-danger)] bg-[color:color-mix(in_srgb,var(--color-danger)_10%,transparent)] border-[color:color-mix(in_srgb,var(--color-danger)_25%,transparent)]' },
  partially_ordered: { label: 'Part order', cls: 'text-[var(--color-warning)] bg-[color:color-mix(in_srgb,var(--color-warning)_10%,transparent)] border-[color:color-mix(in_srgb,var(--color-warning)_25%,transparent)]' },
  ordered:           { label: 'On order',   cls: 'text-[var(--color-info)] bg-[color:color-mix(in_srgb,var(--color-info)_10%,transparent)] border-[color:color-mix(in_srgb,var(--color-info)_25%,transparent)]' },
  ready:             { label: 'Ready',      cls: 'text-[var(--color-success)] bg-[color:color-mix(in_srgb,var(--color-success)_10%,transparent)] border-[color:color-mix(in_srgb,var(--color-success)_25%,transparent)]' },
  cancelled:         { label: 'Cancelled',  cls: 'text-[var(--color-text-muted)] bg-[var(--color-bg-elevated)] border-[var(--color-border)]' },
}

const inputCls = 'w-full h-9 px-3 rounded-md border text-sm bg-[var(--color-bg-elevated)] text-[var(--color-text-primary)] border-[var(--color-border)] placeholder:text-[var(--color-text-muted)] focus:outline-none focus:border-[var(--color-accent)] focus:ring-1 focus:ring-[var(--color-accent)] transition-colors'
const fmt = (n: any) => Number(n || 0).toLocaleString(undefined, { maximumFractionDigits: 0 })

const sizeText = (d: Demand) =>
  d.sheet_width_in && d.sheet_height_in ? `${Number(d.sheet_width_in)} × ${Number(d.sheet_height_in)}` : ''

/**
 * "Kya khareedna hai" — ek hi list.
 *
 * Ye demand koi nahi bharta: job banate hi khud ban jati hai, khud dekh leti
 * hai ke us exact board ka koi leftover para hai aur utna reserve kar leti hai
 * (135). Yahan sirf wo hissa aata hai jo waqai khareedna hai. Tick karo aur PO
 * bana do — vendor, stock item, aur packets sab server khud tay karta hai.
 */
export default function DemandsClient({
  initialDemands, initialTotal, boardTypes, vendors,
}: {
  initialDemands: Demand[]; initialTotal: number; boardTypes: BoardType[]; vendors: Vendor[]
}) {
  const [tab, setTab] = useState('pending')
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [poModal, setPoModal] = useState(false)
  const [forecastModal, setForecastModal] = useState(false)
  const [loading, setLoading] = useState(false)
  const [expected, setExpected] = useState('')
  const [rates, setRates] = useState<Record<string, string>>({})
  /**
   * POORI PO ka ek hi vendor. Mehboob: *"PO banate waqt aik aik ka vendor ki
   * zaroorat nahi, sab job jo select hain unhein aik vendor select ho."*
   *
   * Pehle har line ka apna dropdown tha — jo theek to tha magar rozmarra ke
   * kaam se mel nahi khata: ek PO ek hi vendor ko jati hai, aur ek hi board
   * type ka vendor bhi ek hi hota hai. Das lines par das dropdown bharwana
   * wahi sir khapai thi jo is poore kaam se hatani thi.
   *
   * Vendor phir bhi ek TAJWEEZ hai, taala nahi — *"agar nahi mil raha to
   * bleach wale se bhi board ka doosra brand mangwa sakte hain."* Bas ab wo
   * faisla ek dafa hota hai, har line par nahi.
   */
  const [poVendor, setPoVendor] = useState('')
  const [forecast, setForecast] = useState({
    material_name: '', board_type_id: '', gsm: '', sheet_width_in: '', sheet_height_in: '',
    sheets_required: '', notes: '',
  })

  const list = useServerPagedList<Demand>({
    endpoint: '/api/v1/board-demands',
    initialRows: initialDemands,
    initialTotal,
    params: () => ({ status: tab }),
    errorMessage: 'Failed to load board demands',
  })

  // Page badalte hi selection saaf — jo rows screen se chali gayin unki ticks
  // reh jatin aur PO un ka bhi ban jata.
  const changeTab = (t: string) => { setTab(t); setSelected(new Set()); list.applyFilter({ status: t }) }
  const changePage = (p: number) => { setSelected(new Set()); list.goToPage(p, { status: tab }) }

  const rows = list.rows
  const selectable = rows.filter(d => d.status === 'open' || d.status === 'partially_ordered')
  const chosen = selectable.filter(d => selected.has(d.id))

  const toggle = (id: string) => setSelected(prev => {
    const next = new Set(prev)
    next.has(id) ? next.delete(id) : next.add(id)
    return next
  })
  const toggleAll = () => setSelected(prev =>
    prev.size === selectable.length ? new Set() : new Set(selectable.map(d => d.id)))

  const openPoModal = () => {
    if (!chosen.length) { toast.error('Pick at least one demand'); return }
    // Rate pichhli khareed se pehle se bhara hua — per packet.
    const seed: Record<string, string> = {}
    for (const d of chosen) {
      const perSheet = Number(d.board_inventory?.unit_cost ?? 0)
      seed[d.id] = perSheet > 0 ? String(Math.round(perSheet * (d.sheets_per_packet || 100) * 100) / 100) : ''
    }
    setRates(seed)
    // Jo vendor sab se zyada lines par khud chuna gaya, wohi pehle se bhara
    // hua — mamool yehi hota hai, aur badalna ek click ka kaam rehta hai.
    const tally = new Map<string, number>()
    for (const d of chosen) if (d.vendor_id) tally.set(d.vendor_id, (tally.get(d.vendor_id) ?? 0) + 1)
    const top = Array.from(tally.entries()).sort((a, b) => b[1] - a[1])[0]
    setPoVendor(top?.[0] ?? '')
    setExpected('')
    setPoModal(true)
  }

  const createPO = async () => {
    setLoading(true)
    try {
      const overrides: Record<string, any> = {}
      for (const d of chosen) {
        const o: Record<string, any> = {}
        const r = rates[d.id]
        if (r !== undefined && r !== '') o.unit_price = r
        // Vendor sirf tab bheja jaye jab wo us line ke apne vendor se ALAG ho —
        // warna server ko pata nahi chalta ke ye insaan ka faisla tha ya us ka
        // apna chuna hua, aur ek dafa ka faisla board type ka mamool ban jata.
        if (poVendor && poVendor !== d.vendor_id) o.vendor_id = poVendor
        if (Object.keys(o).length) overrides[d.id] = o
      }
      const res = await fetch('/api/v1/board-demands/create-po', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          demand_ids: chosen.map(d => d.id),
          overrides,
          expected_date: expected || null,
        }),
      })
      const json = await res.json()
      if (!res.ok) throw new Error(json.error || 'Failed')
      const numbers = (json.data ?? []).map((p: any) => p.po_number).join(', ')
      toast.success(`Purchase order ${numbers} created${vendorName ? ` — ${vendorName}` : ''}`)
      for (const w of (json.warnings ?? [])) toast.error(w)
      setPoModal(false)
      setSelected(new Set())
      list.reload({ status: tab })
    } catch (e: any) { toast.error(e.message || 'Failed') }
    finally { setLoading(false) }
  }

  const createForecast = async () => {
    if (!forecast.material_name || !forecast.sheets_required) {
      toast.error('Material aur sheets dono chahiyen'); return
    }
    setLoading(true)
    try {
      const res = await fetch('/api/v1/board-demands', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          material_name: forecast.material_name,
          board_type_id: forecast.board_type_id || null,
          gsm: forecast.gsm || null,
          sheet_width_in: forecast.sheet_width_in || null,
          sheet_height_in: forecast.sheet_height_in || null,
          sheets_required: forecast.sheets_required,
          notes: forecast.notes || null,
        }),
      })
      const json = await res.json()
      if (!res.ok) throw new Error(json.error || 'Failed')
      toast.success('Forecast demand added')
      setForecastModal(false)
      setForecast({ material_name: '', board_type_id: '', gsm: '', sheet_width_in: '', sheet_height_in: '', sheets_required: '', notes: '' })
      if (tab === 'pending' || tab === 'all') list.reload({ status: tab })
    } catch (e: any) { toast.error(e.message || 'Failed') }
    finally { setLoading(false) }
  }

  const columns: DataListColumn<Demand>[] = [
    {
      key: 'what', header: 'Board', span: 4, role: 'identity',
      render: d => (
        <span className="block min-w-0">
          <span className="block text-sm font-medium text-[var(--color-text-primary)] truncate">
            {d.material_name}
            {d.gsm ? <span className="text-[var(--color-text-muted)] font-normal"> · {Number(d.gsm)} gsm</span> : null}
            {sizeText(d) ? <span className="text-[var(--color-text-muted)] font-normal"> · {sizeText(d)}</span> : null}
          </span>
          <span className="block text-xs text-[var(--color-text-muted)] truncate">
            {d.jobs ? (
              <>
                <Link href={`/dashboard/jobs/${d.job_id}`} className="hover:text-[var(--color-accent)] font-mono">
                  {d.jobs.job_number}
                </Link>
                {d.jobs.customers?.name ? ` · ${d.jobs.customers.name}` : ''}
              </>
            ) : (
              <span className="italic">Forecast — no job</span>
            )}
          </span>
        </span>
      ),
    },
    {
      key: 'need', header: 'Needed', span: 2, role: 'meta', label: 'Needed', align: 'right',
      render: d => (
        <span className="block">
          <span className="block text-sm text-[var(--color-text-primary)] tabular-nums">{fmt(d.sheets_required)}</span>
          <span className="block text-[11px] text-[var(--color-text-muted)]">sheets</span>
        </span>
      ),
    },
    {
      key: 'cover', header: 'From stock', span: 2, role: 'meta', label: 'From stock', align: 'right',
      render: d => (
        <span className="block">
          <span className={cn('block text-sm tabular-nums',
            Number(d.sheets_from_stock) > 0 ? 'text-[var(--color-success)]' : 'text-[var(--color-text-muted)]')}>
            {fmt(d.sheets_from_stock)}
          </span>
          {Number(d.sheets_ordered) > 0 && (
            <span className="block text-[11px] text-[var(--color-info)]">{fmt(d.sheets_ordered)} on order</span>
          )}
        </span>
      ),
    },
    {
      key: 'buy', header: 'To buy', span: 2, role: 'meta', label: 'To buy', align: 'right',
      render: d => Number(d.sheets_to_purchase) > 0 ? (
        <span className="block">
          <span className="block text-sm font-semibold text-[var(--color-danger)] tabular-nums">{fmt(d.sheets_to_purchase)}</span>
          <span className="block text-[11px] text-[var(--color-text-muted)]">{fmt(d.packets_to_purchase)} pkt</span>
        </span>
      ) : <span className="text-sm text-[var(--color-text-muted)]">—</span>,
    },
    {
      key: 'vendor', header: 'Vendor', span: 1, role: 'desktop',
      render: d => d.vendor_name
        ? <span className="text-xs text-[var(--color-text-secondary)] truncate">{d.vendor_name}</span>
        : <span className="text-xs text-[var(--color-warning)]">Not set</span>,
    },
    {
      key: 'status', header: 'Status', span: 1, role: 'status', align: 'right',
      render: d => {
        const c = STATUS_CFG[d.status] ?? STATUS_CFG.open
        return <span className={cn('inline-block text-[11px] px-2 py-0.5 rounded-full border font-medium whitespace-nowrap', c.cls)}>{c.label}</span>
      },
    },
  ]

  const totalToBuy = chosen.reduce((s, d) => s + Number(d.sheets_to_purchase || 0), 0)
  // Ab hamesha EK hi PO banti hai — sab lines ka vendor ek.
  const vendorName = vendors.find(v => v.id === poVendor)?.name ?? ''

  return (
    <div className="space-y-4">
      <div className="flex flex-col md:flex-row md:items-center gap-2.5 md:gap-3">
        <TabStrip
          className="flex-1 min-w-0"
          tabs={[
            { key: 'pending', label: 'To order' },
            { key: 'ordered', label: 'On order' },
            { key: 'ready',   label: 'Ready' },
            { key: 'all',     label: 'All' },
          ]}
          active={tab}
          onChange={changeTab}
        />
        <div className="flex items-center gap-2 md:ml-auto flex-shrink-0">
          <button onClick={() => setForecastModal(true)}
            className="flex items-center justify-center gap-1.5 px-3 h-11 md:h-9 rounded-md border border-[var(--color-border)] text-sm text-[var(--color-text-secondary)] hover:bg-[var(--color-bg-elevated)] transition-colors">
            <Plus size={14} /> Forecast
          </button>
          <button onClick={openPoModal} disabled={!chosen.length}
            className="flex items-center justify-center gap-1.5 px-4 h-11 md:h-9 rounded-md bg-[var(--color-accent)] text-[var(--color-on-accent)] text-sm font-medium hover:bg-[var(--color-accent-hover)] disabled:opacity-40 transition-colors">
            <ShoppingCart size={15} /> Create PO{chosen.length ? ` (${chosen.length})` : ''}
          </button>
        </div>
      </div>

      <DataList
        rows={rows}
        columns={columns}
        getRowId={d => d.id}
        selection={selectable.length ? {
          selectedIds: selected,
          onToggle: toggle,
          onToggleAll: toggleAll,
          allSelected: selectable.length > 0 && selected.size === selectable.length,
        } : undefined}
        empty={
          <div className="p-12 text-center">
            <PackageCheck size={28} className="text-[var(--color-success)] opacity-40 mx-auto mb-2" />
            <p className="text-sm text-[var(--color-text-muted)]">
              {tab === 'pending' ? 'Sab jobs ka board pura hai — kuch khareedna baqi nahi.' : 'No board demands here.'}
            </p>
          </div>
        }
      />

      <Pagination page={list.page} total={list.total} pageSize={list.pageSize}
        loading={list.loading} onPageChange={changePage} noun="demands" />

      {/* ─── Create PO ─────────────────────────────────────────────────────── */}
      <Modal open={poModal} onClose={() => setPoModal(false)} size="lg"
        title="Create Purchase Order"
        footer={
          <>
            <button onClick={() => setPoModal(false)}
              className="px-4 h-11 md:h-9 rounded-md border border-[var(--color-border)] text-sm text-[var(--color-text-secondary)] hover:bg-[var(--color-bg-elevated)] transition-colors">Cancel</button>
            <button onClick={createPO} disabled={loading || !poVendor}
              className="px-4 h-9 rounded-md bg-[var(--color-accent)] text-[var(--color-on-accent)] text-sm font-medium hover:bg-[var(--color-accent-hover)] disabled:opacity-50 transition-colors">
              {loading ? 'Creating…' : 'Create PO'}
            </button>
          </>
        }>
        <div className="space-y-4">
          <p className="text-xs text-[var(--color-text-muted)]">
            {fmt(totalToBuy)} sheets across {chosen.length} line{chosen.length !== 1 ? 's' : ''}.
            PO <span className="font-medium">draft</span> banti hai — bhejne se pehle dekh lein.
          </p>

          {/* EK vendor, poori PO ke liye. Ek PO ek hi vendor ko jati hai, aur ek
              board type ka vendor bhi ek hi hota hai — das lines par das
              dropdown bharwana wahi sir khapai thi jo hatani thi. */}
          <div className="space-y-1.5 max-w-sm">
            <label htmlFor="po-vendor" className="text-sm font-medium text-[var(--color-text-primary)]">
              Vendor <span className="text-[var(--color-danger)]">*</span>
            </label>
            <select id="po-vendor" className={inputCls} value={poVendor} onChange={e => setPoVendor(e.target.value)}>
              <option value="">Vendor chunein…</option>
              {vendors.map(v => <option key={v.id} value={v.id}>{v.name}</option>)}
            </select>
            <p className="text-[11px] text-[var(--color-text-muted)]">
              Board ke mamool ke vendor se pehle se bhara hua hai — badal sakte hain.
            </p>
          </div>

          <div className="space-y-2">
            {chosen.map(d => (
              <div key={d.id} className="flex flex-col md:flex-row md:items-center gap-2 md:gap-3 rounded-lg border border-[var(--color-border-subtle)] p-3">
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-[var(--color-text-primary)] truncate">
                    {d.material_name}{d.gsm ? ` · ${Number(d.gsm)} gsm` : ''}{sizeText(d) ? ` · ${sizeText(d)}` : ''}
                  </p>
                  <p className="text-xs text-[var(--color-text-muted)]">
                    {d.jobs?.job_number ?? 'Forecast'} · {fmt(d.packets_to_purchase)} packets ({fmt(d.sheets_to_purchase)} sheets)
                    {!d.board_item_id && <span className="text-[var(--color-info)]"> · naya stock item banega</span>}
                  </p>
                </div>
                {/* Jo rate nahi dekh sakta usay khali khana bhi na dikhe — rate
                    server khud pichhli khareed se bhar deta hai. */}
                <MoneyGate scope="purchase" hide>
                  <div className="flex items-center gap-1.5 flex-shrink-0">
                    <input type="number" className="w-28 h-11 md:h-8 px-2.5 rounded-md border text-sm bg-[var(--color-bg-elevated)] text-[var(--color-text-primary)] border-[var(--color-border)] focus:outline-none focus:border-[var(--color-accent)] transition-colors"
                      value={rates[d.id] ?? ''} placeholder="Rate/pkt"
                      aria-label={`Rate per packet for ${d.material_name}`}
                      onChange={e => setRates(p => ({ ...p, [d.id]: e.target.value }))} />
                  </div>
                </MoneyGate>
              </div>
            ))}
          </div>

          <div className="space-y-1.5 max-w-xs">
            <label htmlFor="demand-po-expected" className="text-sm font-medium text-[var(--color-text-primary)]">Expected delivery</label>
            <input id="demand-po-expected" type="date" className={inputCls} value={expected} onChange={e => setExpected(e.target.value)} />
          </div>
        </div>
      </Modal>

      {/* ─── Forecast demand ───────────────────────────────────────────────── */}
      <Modal open={forecastModal} onClose={() => setForecastModal(false)} size="md"
        title="Forecast — board pehle se mangwana hai"
        footer={
          <>
            <button onClick={() => setForecastModal(false)}
              className="px-4 h-11 md:h-9 rounded-md border border-[var(--color-border)] text-sm text-[var(--color-text-secondary)] hover:bg-[var(--color-bg-elevated)] transition-colors">Cancel</button>
            <button onClick={createForecast} disabled={loading}
              className="px-4 h-9 rounded-md bg-[var(--color-accent)] text-[var(--color-on-accent)] text-sm font-medium hover:bg-[var(--color-accent-hover)] disabled:opacity-50 transition-colors">
              {loading ? 'Adding…' : 'Add demand'}
            </button>
          </>
        }>
        <div className="space-y-3">
          <p className="text-xs text-[var(--color-text-muted)]">
            Client ne forecast diya aur board pehle se mangwa ke rakhna hai. Iska koi job nahi hota —
            job baad mein banegi to isi stock se khud match ho jayegi.
          </p>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <div className="space-y-1.5 md:col-span-2">
              <label htmlFor="fc-board" className="text-sm font-medium text-[var(--color-text-primary)]">Board type</label>
              <select id="fc-board" className={inputCls} value={forecast.board_type_id}
                onChange={e => {
                  const bt = boardTypes.find(b => b.id === e.target.value)
                  setForecast(p => ({ ...p, board_type_id: e.target.value, material_name: bt?.name ?? p.material_name }))
                }}>
                <option value="">Choose…</option>
                {boardTypes.map(b => <option key={b.id} value={b.id}>{b.name}</option>)}
              </select>
            </div>
            <div className="space-y-1.5 md:col-span-2">
              <label htmlFor="fc-name" className="text-sm font-medium text-[var(--color-text-primary)]">Material name *</label>
              <input id="fc-name" className={inputCls} value={forecast.material_name}
                onChange={e => setForecast(p => ({ ...p, material_name: e.target.value }))} placeholder="e.g. Bleach Board" />
            </div>
            <div className="space-y-1.5">
              <label htmlFor="fc-gsm" className="text-sm font-medium text-[var(--color-text-primary)]">GSM</label>
              <input id="fc-gsm" type="number" className={inputCls} value={forecast.gsm}
                onChange={e => setForecast(p => ({ ...p, gsm: e.target.value }))} />
            </div>
            <div className="space-y-1.5">
              <label htmlFor="fc-sheets" className="text-sm font-medium text-[var(--color-text-primary)]">Sheets *</label>
              <input id="fc-sheets" type="number" className={inputCls} value={forecast.sheets_required}
                onChange={e => setForecast(p => ({ ...p, sheets_required: e.target.value }))} />
            </div>
            <div className="space-y-1.5">
              <label htmlFor="fc-w" className="text-sm font-medium text-[var(--color-text-primary)]">Sheet width (in)</label>
              <input id="fc-w" type="number" step="0.25" className={inputCls} value={forecast.sheet_width_in}
                onChange={e => setForecast(p => ({ ...p, sheet_width_in: e.target.value }))} />
            </div>
            <div className="space-y-1.5">
              <label htmlFor="fc-h" className="text-sm font-medium text-[var(--color-text-primary)]">Sheet height (in)</label>
              <input id="fc-h" type="number" step="0.25" className={inputCls} value={forecast.sheet_height_in}
                onChange={e => setForecast(p => ({ ...p, sheet_height_in: e.target.value }))} />
            </div>
            <div className="space-y-1.5 md:col-span-2">
              <label htmlFor="fc-notes" className="text-sm font-medium text-[var(--color-text-primary)]">Note</label>
              <input id="fc-notes" className={inputCls} value={forecast.notes}
                onChange={e => setForecast(p => ({ ...p, notes: e.target.value }))} placeholder="e.g. Ali Traders forecast Q4" />
            </div>
          </div>
        </div>
      </Modal>
    </div>
  )
}

export { DemandsClient }
