'use client'
import { useState, useEffect } from 'react'
import { useSearchParams } from 'next/navigation'
import {
  Truck, Plus, Package, CheckCircle2, MapPin, Phone,
  ChevronDown, ChevronRight, FileText, Camera, Clock, Send, ExternalLink, Download
} from 'lucide-react'
import { cn } from '@/lib/utils/cn'
import { toast } from '@/components/ui/Toast'
import { Modal } from '@/components/ui/Modal'
import { formatDate, formatDateTime, formatTimeAgo } from '@/lib/utils/format'
import { getCourierTrackingLink } from '@/lib/utils/courierTracking'
import { exportToExcel } from '@/lib/utils/exportToExcel'
import Link from 'next/link'

/* ─── Types ──────────────────────────────────────────────────────────────────── */
interface DispatchItem {
  id: string; job_id: string; quantity_dispatched: number; carton_count: number
  jobs?: { job_number: string; job_title: string } | null
}
interface POD { id: string; received_by: string; condition: string; received_at: string }
interface Dispatch {
  id: string; dispatch_number: string; status: string
  delivery_address: string | null; delivery_city: string | null
  delivery_contact: string | null; delivery_phone: string | null
  dispatch_method: string; vehicle_number: string | null; driver_name: string | null
  courier_name: string | null; tracking_number: string | null
  scheduled_date: string | null; dispatched_at: string | null
  delivery_charges: number; notes: string | null; created_at: string
  customers?: { name: string; customer_code: string } | null
  dispatch_items?: DispatchItem[]
  proof_of_delivery?: POD[]
}
interface Customer { id: string; name: string; customer_code: string; address: string | null; phone: string | null; mobile: string | null }
interface Job { id: string; job_number: string; job_title: string; quantity: number; customers?: { name: string } | null }

/* ─── Config ─────────────────────────────────────────────────────────────────── */
const STATUS_CFG = {
  pending:    { label: 'Pending',    color: 'text-[var(--color-text-muted)] bg-[var(--color-bg-elevated)] border-[var(--color-border)]', dot: 'bg-[var(--color-text-muted)]' },
  ready:      { label: 'Ready',      color: 'text-[var(--color-accent)] bg-[var(--color-accent)]/10 border-[var(--color-accent)]/20', dot: 'bg-[var(--color-accent)]' },
  dispatched: { label: 'In Transit', color: 'text-[var(--color-warning)] bg-[var(--color-warning)]/10 border-[var(--color-warning)]/20', dot: 'bg-[var(--color-warning)] animate-pulse' },
  delivered:  { label: 'Delivered',  color: 'text-[var(--color-success)] bg-[var(--color-success)]/10 border-[var(--color-success)]/20', dot: 'bg-[var(--color-success)]' },
  returned:   { label: 'Returned',   color: 'text-[var(--color-danger)] bg-[var(--color-danger)]/10 border-[var(--color-danger)]/20', dot: 'bg-[var(--color-danger)]' },
  cancelled:  { label: 'Cancelled',  color: 'text-[var(--color-text-muted)] bg-[var(--color-bg-elevated)] border-[var(--color-border)]', dot: 'bg-[var(--color-text-muted)]' },
}
const METHOD_LABELS: Record<string, string> = {
  own_vehicle: 'Own Vehicle', courier: 'Courier', customer_pickup: 'Customer Pickup', third_party: 'Third Party',
}
const inputCls = 'w-full h-9 px-3 rounded-md border text-sm bg-[var(--color-bg-elevated)] text-[var(--color-text-primary)] border-[var(--color-border)] placeholder:text-[var(--color-text-muted)] focus:outline-none focus:border-[var(--color-accent)] focus:ring-1 focus:ring-[var(--color-accent)] transition-colors'
const EMPTY_ITEM = { job_id: '', quantity_dispatched: '', carton_count: '', weight_kg: '', notes: '' }

/* ─── Component ──────────────────────────────────────────────────────────────── */
export default function DispatchClient({ initialDispatches, customers, readyJobs }: {
  initialDispatches: Dispatch[]; customers: Customer[]; readyJobs: Job[]
}) {
  const searchParams = useSearchParams()
  const [dispatches, setDispatches] = useState(initialDispatches)
  const [filterStatus, setFilterStatus] = useState('')
  const [expanded, setExpanded]     = useState<Set<string>>(new Set())
  const [loading, setLoading]       = useState(false)
  const [tab, setTab]               = useState<'all'|'pending'|'dispatched'|'delivered'>('all')

  /* New Dispatch modal */
  const [newModal, setNewModal] = useState(false)
  const [form, setForm] = useState({
    customer_id: '', delivery_address: '', delivery_city: '', delivery_contact: '',
    delivery_phone: '', dispatch_method: 'own_vehicle', vehicle_number: '', driver_name: '',
    driver_phone: '', courier_name: '', tracking_number: '', scheduled_date: '',
    delivery_charges: '0', notes: '',
  })
  const [lineItems, setLineItems] = useState([{ ...EMPTY_ITEM }])

  /* POD modal */
  const [podModal, setPodModal] = useState<Dispatch | null>(null)
  const [podForm, setPodForm]   = useState({ received_by: '', condition: 'good', damage_notes: '', notes: '', photo_url: '', signature_url: '' })

  /* Dispatch action modal */
  const [dispatchActionModal, setDispatchActionModal] = useState<{ dispatch: Dispatch; action: 'dispatch'|'deliver'|'cancel' } | null>(null)
  const [actionNotes, setActionNotes] = useState('')

  const toggle = (id: string) => setExpanded(p => { const n = new Set(p); n.has(id) ? n.delete(id) : n.add(id); return n })

  // If the scan page routed here with ?dispatch=<id> (a scanned QR label
  // matched a dispatch), jump straight into its detail row instead of
  // leaving the user to find it in the list themselves.
  useEffect(() => {
    const targetId = searchParams.get('dispatch')
    if (targetId && dispatches.some(d => d.id === targetId)) {
      setExpanded(p => new Set(p).add(targetId))
      document.getElementById(`dispatch-${targetId}`)?.scrollIntoView({ behavior: 'smooth', block: 'center' })
    }
  }, [searchParams, dispatches])

  const filtered = dispatches.filter(d => {
    if (tab === 'pending')    return d.status === 'pending' || d.status === 'ready'
    if (tab === 'dispatched') return d.status === 'dispatched'
    if (tab === 'delivered')  return d.status === 'delivered'
    return true
  })

  /* auto-fill delivery address from customer */
  const selectedCustomer = customers.find(c => c.id === form.customer_id)

  const addLine = () => setLineItems(p => [...p, { ...EMPTY_ITEM }])
  const removeLine = (i: number) => setLineItems(p => p.filter((_, idx) => idx !== i))
  const setLine = (i: number, k: string, v: string) => setLineItems(p => p.map((l, idx) => idx === i ? { ...l, [k]: v } : l))

  /* ─── Create Dispatch ─────────────────────────────────────────────────────── */
  const createDispatch = async () => {
    if (!form.customer_id) { toast.error('Select a customer'); return }
    if (!lineItems.some(l => l.job_id)) { toast.error('Add at least one job'); return }
    setLoading(true)
    try {
      const res = await fetch('/api/v1/dispatch', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...form, items: lineItems.filter(l => l.job_id) }),
      })
      if (!res.ok) { const e = await res.json(); throw new Error(e.error) }
      const { data } = await res.json()
      const cust = customers.find(c => c.id === form.customer_id)
      setDispatches(prev => [{
        ...data,
        customers: cust ? { name: cust.name, customer_code: cust.customer_code } : null,
        dispatch_items: lineItems.filter(l => l.job_id).map(l => ({
          id: '', job_id: l.job_id, quantity_dispatched: parseFloat(l.quantity_dispatched || '0'), carton_count: parseInt(l.carton_count || '0'),
          jobs: readyJobs.find(j => j.id === l.job_id) ? { job_number: readyJobs.find(j => j.id === l.job_id)!.job_number, job_title: readyJobs.find(j => j.id === l.job_id)!.job_title } : null,
        })),
        proof_of_delivery: [],
      }, ...prev])
      setNewModal(false)
      setForm({ customer_id: '', delivery_address: '', delivery_city: '', delivery_contact: '', delivery_phone: '', dispatch_method: 'own_vehicle', vehicle_number: '', driver_name: '', driver_phone: '', courier_name: '', tracking_number: '', scheduled_date: '', delivery_charges: '0', notes: '' })
      setLineItems([{ ...EMPTY_ITEM }])
      toast.success(`Challan ${data.dispatch_number} created`)
    } catch (e: any) { toast.error(e.message || 'Failed') }
    finally { setLoading(false) }
  }

  /* ─── Bulk selection + export ─────────────────────────────────────────────── */
  // Bulk Deliver reuses the exact per-row PATCH the Deliver button uses (no
  // POD — same as clicking Deliver on each row; POD stays a separate,
  // optional per-challan step). Only 'dispatched' rows in the selection are
  // touched.
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const toggleSelect = (id: string) => setSelected(p => { const n = new Set(p); n.has(id) ? n.delete(id) : n.add(id); return n })

  const bulkDeliver = async () => {
    const targets = dispatches.filter(d => selected.has(d.id) && d.status === 'dispatched')
    if (!targets.length) { toast.error('No selected challans are In Transit'); return }
    let ok = 0
    for (const d of targets) {
      try {
        const res = await fetch(`/api/v1/dispatch/${d.id}`, {
          method: 'PATCH', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ action: 'deliver', status: 'delivered', notes: null }),
        })
        if (res.ok) ok++
      } catch { /* counted below */ }
    }
    setDispatches(prev => prev.map(x => (selected.has(x.id) && x.status === 'dispatched') ? { ...x, status: 'delivered' } : x))
    setSelected(new Set())
    ok === targets.length ? toast.success(`${ok} challan${ok > 1 ? 's' : ''} marked Delivered`) : toast.error(`${ok}/${targets.length} updated — refresh to verify`)
  }

  const exportDispatches = () => {
    const rows = (selected.size ? filtered.filter(d => selected.has(d.id)) : filtered).map(d => ({
      'Challan #': d.dispatch_number,
      'Customer': d.customers?.name ?? '',
      'Status': d.status,
      'Method': d.dispatch_method,
      'Courier': d.courier_name ?? '',
      'Tracking #': d.tracking_number ?? '',
      'Vehicle': d.vehicle_number ?? '',
      'Driver': d.driver_name ?? '',
      'City': d.delivery_city ?? '',
      'Scheduled': d.scheduled_date ?? '',
      'Dispatched At': d.dispatched_at ?? '',
      'Charges': d.delivery_charges,
    }))
    if (!rows.length) { toast.error('Nothing to export'); return }
    exportToExcel(rows, 'dispatch-export')
  }

  /* ─── Status Action ───────────────────────────────────────────────────────── */
  const applyAction = async () => {
    if (!dispatchActionModal) return
    const { dispatch: d, action } = dispatchActionModal
    setLoading(true)
    try {
      const res = await fetch(`/api/v1/dispatch/${d.id}`, {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action,
          status: action === 'dispatch' ? 'dispatched' : action === 'deliver' ? 'delivered' : 'cancelled',
          notes: actionNotes || null,
        }),
      })
      if (!res.ok) throw new Error()
      const { data } = await res.json()
      setDispatches(prev => prev.map(x => x.id === d.id ? { ...x, ...(data as any) } : x))
      setDispatchActionModal(null)
      setActionNotes('')
      toast.success(action === 'dispatch' ? '🚚 Dispatched!' : action === 'deliver' ? '✅ Delivered!' : 'Cancelled')
    } catch { toast.error('Failed') }
    finally { setLoading(false) }
  }

  /* ─── POD Submit ──────────────────────────────────────────────────────────── */
  const submitPOD = async () => {
    if (!podModal) return
    if (!podForm.received_by) { toast.error('Received by is required'); return }
    setLoading(true)
    try {
      const res = await fetch(`/api/v1/dispatch/${podModal.id}/pod`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(podForm),
      })
      if (!res.ok) throw new Error()
      setDispatches(prev => prev.map(x => x.id === podModal.id
        ? { ...x, status: 'delivered', proof_of_delivery: [{ id: Date.now().toString(), received_by: podForm.received_by, condition: podForm.condition, received_at: new Date().toISOString() }] }
        : x))
      setPodModal(null)
      setPodForm({ received_by: '', condition: 'good', damage_notes: '', notes: '', photo_url: '', signature_url: '' })
      toast.success('POD recorded — delivery confirmed')
    } catch { toast.error('Failed') }
    finally { setLoading(false) }
  }

  /* ─── Render ──────────────────────────────────────────────────────────────── */
  const pending    = dispatches.filter(d => ['pending','ready'].includes(d.status)).length
  const inTransit  = dispatches.filter(d => d.status === 'dispatched').length
  const delivered  = dispatches.filter(d => d.status === 'delivered').length

  return (
    <div className="space-y-4">
      {/* Stat cards */}
      <div className="grid grid-cols-2 xl:grid-cols-4 gap-3 md:gap-4">
        {[
          { label: 'Total Challans',  value: dispatches.length, icon: FileText, color: 'var(--color-accent)' },
          { label: 'Pending',         value: pending,           icon: Package,  color: 'var(--color-text-muted)' },
          { label: 'In Transit',      value: inTransit,         icon: Truck,    color: 'var(--color-warning)' },
          { label: 'Delivered',       value: delivered,         icon: CheckCircle2, color: 'var(--color-success)' },
        ].map(s => (
          <div key={s.label} className="rounded-xl border border-[var(--color-border)] bg-[var(--color-bg-secondary)] p-4 flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg flex items-center justify-center flex-shrink-0"
              style={{ background: `color-mix(in srgb, ${s.color} 12%, transparent)` }}>
              <s.icon size={18} style={{ color: s.color }} />
            </div>
            <div>
              <p className="text-xs text-[var(--color-text-muted)]">{s.label}</p>
              <p className="text-xl font-bold text-[var(--color-text-primary)]">{s.value}</p>
            </div>
          </div>
        ))}
      </div>

      {/* Toolbar */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-1">
          {([['all','All'], ['pending','Pending'], ['dispatched','In Transit'], ['delivered','Delivered']] as const).map(([key, label]) => (
            <button key={key} onClick={() => setTab(key)}
              className={cn('px-4 h-8 rounded-md text-sm font-medium border transition-all',
                tab === key ? 'bg-[var(--color-accent)] text-white border-transparent' : 'border-[var(--color-border)] text-[var(--color-text-secondary)] hover:text-[var(--color-text-primary)]')}>
              {label}
            </button>
          ))}
        </div>
        <div className="flex items-center gap-2">
          {selected.size > 0 && (
            <>
              <span className="text-xs text-[var(--color-text-muted)]">{selected.size} selected</span>
              <button onClick={bulkDeliver}
                className="flex items-center gap-1.5 px-3 h-9 rounded-md border border-[var(--color-success)]/40 text-sm text-[var(--color-success)] hover:bg-[var(--color-success)]/10 transition-colors">
                <CheckCircle2 size={13} /> Mark Delivered
              </button>
            </>
          )}
          <button onClick={exportDispatches}
            title={selected.size ? `Export ${selected.size} selected` : 'Export current list'}
            className="flex items-center gap-1.5 px-3 h-9 rounded-md border border-[var(--color-border)] text-sm text-[var(--color-text-secondary)] hover:bg-[var(--color-bg-elevated)] transition-colors">
            <Download size={14} /> Export{selected.size ? ` (${selected.size})` : ''}
          </button>
          <button onClick={() => setNewModal(true)}
            className="flex items-center gap-1.5 px-4 h-9 rounded-md bg-[var(--color-accent)] text-white text-sm font-medium hover:bg-[var(--color-accent-hover)] transition-colors">
            <Plus size={15} /> New Challan
          </button>
        </div>
      </div>

      {/* Dispatch list */}
      <div className="rounded-xl border border-[var(--color-border)] bg-[var(--color-bg-secondary)] overflow-hidden">
        {filtered.length === 0 ? (
          <div className="p-12 text-center">
            <Truck size={28} className="text-[var(--color-text-muted)] opacity-30 mx-auto mb-2" />
            <p className="text-sm text-[var(--color-text-muted)]">No dispatch records found</p>
          </div>
        ) : (
          <div className="divide-y divide-[var(--color-border-subtle)]">
            {filtered.map((d, idx) => {
              const stCfg = STATUS_CFG[d.status as keyof typeof STATUS_CFG] || STATUS_CFG.pending
              const isOpen = expanded.has(d.id)
              const hasPOD = (d.proof_of_delivery ?? []).length > 0
              const pod    = d.proof_of_delivery?.[0]

              return (
                <div key={d.id} id={`dispatch-${d.id}`}>
                  {/* Main row */}
                  <div className={cn('flex items-center gap-4 px-5 py-4 hover:bg-[var(--color-bg-elevated)]/30', idx % 2 === 1 && 'bg-[var(--color-bg-elevated)]/15')}>
                    <input type="checkbox" checked={selected.has(d.id)} onChange={() => toggleSelect(d.id)}
                      className="accent-[var(--color-accent)] cursor-pointer flex-shrink-0" />
                    <button onClick={() => toggle(d.id)} className="text-[var(--color-text-muted)] flex-shrink-0">
                      {isOpen ? <ChevronDown size={16} /> : <ChevronRight size={16} />}
                    </button>

                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2.5 flex-wrap">
                        <span className="text-sm font-bold font-mono text-[var(--color-accent)]">{d.dispatch_number}</span>
                        <span className={cn('inline-flex items-center gap-1.5 text-xs px-2.5 py-0.5 rounded-full border font-medium', stCfg.color)}>
                          <span className={cn('w-1.5 h-1.5 rounded-full flex-shrink-0', stCfg.dot)} />
                          {stCfg.label}
                        </span>
                        {hasPOD && (
                          <span className="text-xs text-[var(--color-success)] flex items-center gap-1">
                            <CheckCircle2 size={11} /> POD
                          </span>
                        )}
                      </div>
                      <div className="flex items-center gap-4 mt-1 flex-wrap text-xs text-[var(--color-text-muted)]">
                        <span className="font-medium text-[var(--color-text-secondary)]">{d.customers?.name}</span>
                        {d.delivery_city && <span className="flex items-center gap-1"><MapPin size={10} />{d.delivery_city}</span>}
                        <span>{METHOD_LABELS[d.dispatch_method] || d.dispatch_method}</span>
                        {d.vehicle_number && <span>🚚 {d.vehicle_number}</span>}
                        {d.courier_name && <span>📦 {d.courier_name}</span>}
                        {d.tracking_number && <span>#{d.tracking_number}</span>}
                        {(() => {
                          const track = getCourierTrackingLink(d.courier_name, d.tracking_number)
                          if (!track) return null
                          return (
                            <button
                              onClick={async (e) => {
                                e.preventDefault(); e.stopPropagation()
                                if (d.tracking_number) { try { await navigator.clipboard.writeText(d.tracking_number) } catch {} }
                                window.open(track.url, '_blank', 'noopener,noreferrer')
                              }}
                              title={d.tracking_number ? 'Copies tracking number and opens courier site' : undefined}
                              className="flex items-center gap-1 text-[var(--color-accent)] hover:underline">
                              <ExternalLink size={10} /> {track.label}
                            </button>
                          )
                        })()}
                        {d.scheduled_date && <span className="flex items-center gap-1"><Clock size={10} />{formatDate(d.scheduled_date)}</span>}
                        {d.dispatched_at && <span>Dispatched {formatTimeAgo(d.dispatched_at)}</span>}
                      </div>
                      {(d.dispatch_items ?? []).length > 0 && (
                        <div className="flex items-center gap-1.5 mt-1 flex-wrap">
                          {(d.dispatch_items ?? []).map(item => (
                            <span key={item.id} className="text-xs bg-[var(--color-bg-elevated)] border border-[var(--color-border)] px-2 py-0.5 rounded font-mono">
                              {item.jobs?.job_number}
                            </span>
                          ))}
                        </div>
                      )}
                    </div>

                    {/* Actions */}
                    <div className="flex items-center gap-1.5 flex-shrink-0">
                      <Link href={`/print/dispatch/${d.id}`} target="_blank"
                        className="flex items-center gap-1 px-2.5 h-7 rounded-md border border-[var(--color-border)] text-xs text-[var(--color-text-muted)] hover:bg-[var(--color-bg-elevated)] transition-colors">
                        <FileText size={11} /> Challan
                      </Link>
                      {d.status === 'pending' && (
                        <button onClick={() => { setDispatchActionModal({ dispatch: d, action: 'dispatch' }); setActionNotes('') }}
                          className="flex items-center gap-1 px-2.5 h-7 rounded bg-[var(--color-warning)] text-white text-xs font-medium hover:opacity-90 transition-colors">
                          <Truck size={11} /> Dispatch
                        </button>
                      )}
                      {d.status === 'dispatched' && !hasPOD && (
                        <button onClick={() => { setPodModal(d); setPodForm({ received_by: '', condition: 'good', damage_notes: '', notes: '', photo_url: '', signature_url: '' }) }}
                          className="flex items-center gap-1 px-2.5 h-7 rounded bg-[var(--color-success)] text-white text-xs font-medium hover:opacity-90 transition-colors">
                          <Camera size={11} /> POD
                        </button>
                      )}
                      {d.status === 'dispatched' && hasPOD && (
                        <button onClick={() => { setDispatchActionModal({ dispatch: d, action: 'deliver' }); setActionNotes('') }}
                          className="flex items-center gap-1 px-2.5 h-7 rounded bg-[var(--color-success)] text-white text-xs font-medium hover:opacity-90 transition-colors">
                          <CheckCircle2 size={11} /> Delivered
                        </button>
                      )}
                    </div>
                  </div>

                  {/* Expanded detail */}
                  {isOpen && (
                    <div className="px-10 py-3 bg-[var(--color-bg-elevated)]/30 border-t border-[var(--color-border-subtle)] space-y-3">
                      {/* Jobs */}
                      {(d.dispatch_items ?? []).length > 0 && (
                        <div>
                          <p className="text-xs font-semibold text-[var(--color-text-muted)] uppercase tracking-wider mb-1.5">Jobs in this Challan</p>
                          <div className="space-y-1">
                            {(d.dispatch_items ?? []).map(item => (
                              <div key={item.id} className="flex items-center gap-3 text-sm">
                                <Link href={`/dashboard/jobs/${item.job_id}`} className="text-xs font-mono text-[var(--color-accent)] hover:underline w-24 flex-shrink-0">
                                  {item.jobs?.job_number}
                                </Link>
                                <span className="text-[var(--color-text-secondary)] flex-1 truncate">{item.jobs?.job_title}</span>
                                <span className="text-[var(--color-text-muted)] text-xs flex-shrink-0">{item.quantity_dispatched.toLocaleString()} pcs</span>
                                {item.carton_count > 0 && <span className="text-[var(--color-text-muted)] text-xs flex-shrink-0">{item.carton_count} ctns</span>}
                              </div>
                            ))}
                          </div>
                        </div>
                      )}
                      {/* POD info */}
                      {hasPOD && pod && (
                        <div className="rounded-lg bg-[var(--color-success)]/5 border border-[var(--color-success)]/20 p-3">
                          <p className="text-xs font-semibold text-[var(--color-success)] mb-1">✓ Proof of Delivery</p>
                          <p className="text-xs text-[var(--color-text-secondary)]">Received by: <strong>{pod.received_by}</strong></p>
                          <p className="text-xs text-[var(--color-text-muted)]">Condition: {pod.condition} · {formatDateTime(pod.received_at)}</p>
                        </div>
                      )}
                      {/* Delivery address */}
                      {d.delivery_address && (
                        <p className="text-xs text-[var(--color-text-muted)] flex items-center gap-1.5">
                          <MapPin size={11} /> {d.delivery_address}{d.delivery_city ? `, ${d.delivery_city}` : ''}
                        </p>
                      )}
                      {d.notes && <p className="text-xs text-[var(--color-text-muted)] italic">{d.notes}</p>}
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        )}
      </div>

      {/* ══ NEW DISPATCH MODAL ══════════════════════════════════════════════════ */}
      <Modal open={newModal} onClose={() => setNewModal(false)} title="New Delivery Challan" size="xl"
        footer={
          <>
            <button onClick={() => setNewModal(false)} className="px-4 h-9 rounded-md border border-[var(--color-border)] text-sm text-[var(--color-text-secondary)] hover:bg-[var(--color-bg-elevated)] transition-colors">Cancel</button>
            <button onClick={createDispatch} disabled={loading || !form.customer_id}
              className="flex items-center gap-2 px-4 h-9 rounded-md bg-[var(--color-accent)] text-white text-sm font-medium hover:bg-[var(--color-accent-hover)] disabled:opacity-50 transition-colors">
              <FileText size={14} /> {loading ? 'Creating…' : 'Create Challan'}
            </button>
          </>
        }>
        <div className="space-y-5">
          {/* Customer & Delivery */}
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <label className="text-sm font-medium text-[var(--color-text-primary)]">Customer <span className="text-[var(--color-danger)]">*</span></label>
              <select className={inputCls} value={form.customer_id} onChange={e => {
                const c = customers.find(x => x.id === e.target.value)
                setForm(p => ({ ...p, customer_id: e.target.value, delivery_address: c?.address || '', delivery_contact: '', delivery_phone: c?.mobile || c?.phone || '' }))
              }}>
                <option value="">Select customer…</option>
                {customers.map(c => <option key={c.id} value={c.id}>{c.name} ({c.customer_code})</option>)}
              </select>
            </div>
            <div className="space-y-1.5">
              <label className="text-sm font-medium text-[var(--color-text-primary)]">Scheduled Date</label>
              <input type="date" className={inputCls} value={form.scheduled_date} onChange={e => setForm(p => ({ ...p, scheduled_date: e.target.value }))} />
            </div>
            <div className="space-y-1.5">
              <label className="text-sm font-medium text-[var(--color-text-primary)]">Delivery Address</label>
              <input className={inputCls} value={form.delivery_address} onChange={e => setForm(p => ({ ...p, delivery_address: e.target.value }))} placeholder="Full delivery address" />
            </div>
            <div className="space-y-1.5">
              <label className="text-sm font-medium text-[var(--color-text-primary)]">City</label>
              <input className={inputCls} value={form.delivery_city} onChange={e => setForm(p => ({ ...p, delivery_city: e.target.value }))} placeholder="Lahore" />
            </div>
            <div className="space-y-1.5">
              <label className="text-sm font-medium text-[var(--color-text-primary)]">Delivery Contact</label>
              <input className={inputCls} value={form.delivery_contact} onChange={e => setForm(p => ({ ...p, delivery_contact: e.target.value }))} placeholder="Contact person name" />
            </div>
            <div className="space-y-1.5">
              <label className="text-sm font-medium text-[var(--color-text-primary)]">Contact Phone</label>
              <input className={inputCls} value={form.delivery_phone} onChange={e => setForm(p => ({ ...p, delivery_phone: e.target.value }))} placeholder="+92 300 0000000" />
            </div>
          </div>

          {/* Dispatch Method */}
          <div>
            <p className="text-sm font-semibold text-[var(--color-text-primary)] mb-2">Dispatch Method</p>
            <div className="grid grid-cols-4 gap-2 mb-3">
              {(['own_vehicle','courier','customer_pickup','third_party'] as const).map(m => (
                <button key={m} onClick={() => setForm(p => ({ ...p, dispatch_method: m }))}
                  className={cn('h-9 rounded-md border text-xs font-medium transition-all',
                    form.dispatch_method === m ? 'bg-[var(--color-accent)] text-white border-transparent' : 'border-[var(--color-border)] text-[var(--color-text-secondary)] hover:bg-[var(--color-bg-elevated)]')}>
                  {METHOD_LABELS[m]}
                </button>
              ))}
            </div>
            {form.dispatch_method === 'own_vehicle' && (
              <div className="grid grid-cols-3 gap-3">
                <div className="space-y-1.5"><label className="text-sm font-medium text-[var(--color-text-primary)]">Vehicle No.</label><input className={inputCls} value={form.vehicle_number} onChange={e => setForm(p => ({ ...p, vehicle_number: e.target.value }))} placeholder="LEA-0000" /></div>
                <div className="space-y-1.5"><label className="text-sm font-medium text-[var(--color-text-primary)]">Driver Name</label><input className={inputCls} value={form.driver_name} onChange={e => setForm(p => ({ ...p, driver_name: e.target.value }))} placeholder="Driver name" /></div>
                <div className="space-y-1.5"><label className="text-sm font-medium text-[var(--color-text-primary)]">Driver Phone</label><input className={inputCls} value={form.driver_phone} onChange={e => setForm(p => ({ ...p, driver_phone: e.target.value }))} placeholder="+92 300 0000000" /></div>
              </div>
            )}
            {form.dispatch_method === 'courier' && (
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5"><label className="text-sm font-medium text-[var(--color-text-primary)]">Courier Name</label><input className={inputCls} value={form.courier_name} onChange={e => setForm(p => ({ ...p, courier_name: e.target.value }))} placeholder="TCS, Leopards, DHL…" /></div>
                <div className="space-y-1.5"><label className="text-sm font-medium text-[var(--color-text-primary)]">Tracking Number</label><input className={inputCls} value={form.tracking_number} onChange={e => setForm(p => ({ ...p, tracking_number: e.target.value }))} placeholder="Tracking / waybill number" /></div>
              </div>
            )}
          </div>

          {/* Jobs to dispatch */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <p className="text-sm font-semibold text-[var(--color-text-primary)]">Jobs to Dispatch</p>
              <button onClick={addLine} className="text-xs text-[var(--color-accent)] hover:underline flex items-center gap-1"><Plus size={12} /> Add Job</button>
            </div>
            <div className="grid grid-cols-12 gap-2 px-1 py-1 text-xs font-semibold text-[var(--color-text-muted)] uppercase tracking-wider">
              <div className="col-span-4">Job</div>
              <div className="col-span-3">Qty Dispatched</div>
              <div className="col-span-2">Cartons</div>
              <div className="col-span-2">Weight (kg)</div>
              <div className="col-span-1" />
            </div>
            <div className="space-y-1.5">
              {lineItems.map((item, idx) => (
                <div key={idx} className="grid grid-cols-12 gap-2 items-center">
                  <div className="col-span-4">
                    <select className={inputCls} value={item.job_id} onChange={e => {
                      const job = readyJobs.find(j => j.id === e.target.value)
                      setLine(idx, 'job_id', e.target.value)
                      if (job) setLine(idx, 'quantity_dispatched', String(job.quantity))
                    }}>
                      <option value="">Select job…</option>
                      {readyJobs.map(j => <option key={j.id} value={j.id}>{j.job_number} — {j.job_title}</option>)}
                    </select>
                  </div>
                  <div className="col-span-3"><input type="number" className={inputCls} value={item.quantity_dispatched} onChange={e => setLine(idx, 'quantity_dispatched', e.target.value)} placeholder="Qty" /></div>
                  <div className="col-span-2"><input type="number" className={inputCls} value={item.carton_count} onChange={e => setLine(idx, 'carton_count', e.target.value)} placeholder="Ctns" /></div>
                  <div className="col-span-2"><input type="number" className={inputCls} value={item.weight_kg} onChange={e => setLine(idx, 'weight_kg', e.target.value)} placeholder="kg" /></div>
                  <div className="col-span-1 flex justify-end">
                    {lineItems.length > 1 && <button onClick={() => removeLine(idx)} className="text-[var(--color-text-muted)] hover:text-[var(--color-danger)]">✕</button>}
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <label className="text-sm font-medium text-[var(--color-text-primary)]">Delivery Charges (PKR)</label>
              <input type="number" className={inputCls} value={form.delivery_charges} onChange={e => setForm(p => ({ ...p, delivery_charges: e.target.value }))} />
            </div>
            <div className="space-y-1.5">
              <label className="text-sm font-medium text-[var(--color-text-primary)]">Notes</label>
              <input className={inputCls} value={form.notes} onChange={e => setForm(p => ({ ...p, notes: e.target.value }))} placeholder="Special delivery instructions" />
            </div>
          </div>
        </div>
      </Modal>

      {/* ══ DISPATCH ACTION MODAL ═══════════════════════════════════════════════ */}
      {dispatchActionModal && (
        <Modal open={true} onClose={() => setDispatchActionModal(null)}
          title={dispatchActionModal.action === 'dispatch' ? '🚚 Confirm Dispatch' : dispatchActionModal.action === 'deliver' ? '✅ Confirm Delivery' : '❌ Cancel Challan'}
          size="sm"
          footer={
            <>
              <button onClick={() => setDispatchActionModal(null)} className="px-4 h-9 rounded-md border border-[var(--color-border)] text-sm text-[var(--color-text-secondary)] hover:bg-[var(--color-bg-elevated)] transition-colors">Cancel</button>
              <button onClick={applyAction} disabled={loading}
                className={cn('flex items-center gap-2 px-4 h-9 rounded-md text-white text-sm font-medium disabled:opacity-50 transition-colors',
                  dispatchActionModal.action === 'dispatch' ? 'bg-[var(--color-warning)] hover:opacity-90' :
                  dispatchActionModal.action === 'deliver'  ? 'bg-[var(--color-success)] hover:opacity-90' :
                                                             'bg-[var(--color-danger)] hover:opacity-90')}>
                {loading ? 'Processing…' : 'Confirm'}
              </button>
            </>
          }>
          <div className="space-y-3">
            <div className="rounded-lg bg-[var(--color-bg-elevated)] border border-[var(--color-border)] p-3 text-sm">
              <p className="font-semibold text-[var(--color-accent)]">{dispatchActionModal.dispatch.dispatch_number}</p>
              <p className="text-[var(--color-text-muted)] text-xs mt-0.5">{dispatchActionModal.dispatch.customers?.name}</p>
            </div>
            {dispatchActionModal.action === 'dispatch' && dispatchActionModal.dispatch.driver_name && (
              <p className="text-sm text-[var(--color-text-secondary)]">Driver: <strong>{dispatchActionModal.dispatch.driver_name}</strong> · {dispatchActionModal.dispatch.vehicle_number}</p>
            )}
            <div className="space-y-1.5">
              <label className="text-sm font-medium text-[var(--color-text-primary)]">Notes (optional)</label>
              <input className={inputCls} value={actionNotes} onChange={e => setActionNotes(e.target.value)} placeholder="Any additional notes…" />
            </div>
          </div>
        </Modal>
      )}

      {/* ══ POD MODAL — Phase 43 ════════════════════════════════════════════════ */}
      {podModal && (
        <Modal open={true} onClose={() => setPodModal(null)} title="Record Proof of Delivery" size="md"
          footer={
            <>
              <button onClick={() => setPodModal(null)} className="px-4 h-9 rounded-md border border-[var(--color-border)] text-sm text-[var(--color-text-secondary)] hover:bg-[var(--color-bg-elevated)] transition-colors">Cancel</button>
              <button onClick={submitPOD} disabled={loading || !podForm.received_by}
                className="flex items-center gap-2 px-4 h-9 rounded-md bg-[var(--color-success)] text-white text-sm font-medium hover:opacity-90 disabled:opacity-50 transition-colors">
                <CheckCircle2 size={14} /> {loading ? 'Saving…' : 'Confirm Delivery'}
              </button>
            </>
          }>
          <div className="space-y-4">
            <div className="rounded-lg bg-[var(--color-bg-elevated)] border border-[var(--color-border)] p-3 text-sm">
              <p className="font-semibold text-[var(--color-accent)]">{podModal.dispatch_number}</p>
              <p className="text-[var(--color-text-secondary)] mt-0.5">{podModal.customers?.name}</p>
              {podModal.delivery_address && <p className="text-xs text-[var(--color-text-muted)] mt-0.5 flex items-center gap-1"><MapPin size={10} />{podModal.delivery_address}</p>}
            </div>

            <div className="space-y-1.5">
              <label className="text-sm font-medium text-[var(--color-text-primary)]">Received By <span className="text-[var(--color-danger)]">*</span></label>
              <input className={inputCls} value={podForm.received_by} onChange={e => setPodForm(p => ({ ...p, received_by: e.target.value }))} placeholder="Name of person who received the goods" />
            </div>

            <div className="space-y-1.5">
              <label className="text-sm font-medium text-[var(--color-text-primary)]">Goods Condition</label>
              <div className="flex gap-2">
                {(['good','damaged','partial'] as const).map(c => (
                  <button key={c} onClick={() => setPodForm(p => ({ ...p, condition: c }))}
                    className={cn('flex-1 h-9 rounded-md border text-xs font-medium capitalize transition-all',
                      podForm.condition === c
                        ? c === 'good'    ? 'bg-[var(--color-success)] text-white border-transparent'
                          : c === 'damaged' ? 'bg-[var(--color-danger)] text-white border-transparent'
                          : 'bg-[var(--color-warning)] text-white border-transparent'
                        : 'border-[var(--color-border)] text-[var(--color-text-muted)] hover:bg-[var(--color-bg-elevated)]')}>
                    {c}
                  </button>
                ))}
              </div>
            </div>

            {podForm.condition !== 'good' && (
              <div className="space-y-1.5">
                <label className="text-sm font-medium text-[var(--color-text-primary)]">Damage Notes</label>
                <input className={inputCls} value={podForm.damage_notes} onChange={e => setPodForm(p => ({ ...p, damage_notes: e.target.value }))} placeholder="Describe the damage or partial delivery…" />
              </div>
            )}

            <div className="space-y-1.5">
              <label className="text-sm font-medium text-[var(--color-text-primary)]">Photo URL (optional)</label>
              <input className={inputCls} value={podForm.photo_url} onChange={e => setPodForm(p => ({ ...p, photo_url: e.target.value }))} placeholder="Paste Supabase Storage URL of delivery photo" />
            </div>

            <div className="space-y-1.5">
              <label className="text-sm font-medium text-[var(--color-text-primary)]">Additional Notes</label>
              <input className={inputCls} value={podForm.notes} onChange={e => setPodForm(p => ({ ...p, notes: e.target.value }))} placeholder="Any remarks about delivery…" />
            </div>
          </div>
        </Modal>
      )}
    </div>
  )
}
