'use client'
import { useState } from 'react'
import { Package, Plus, ChevronDown, ChevronRight, Check, X, Trash2 } from 'lucide-react'
import { cn } from '@/lib/utils/cn'
import { toast } from '@/components/ui/Toast'
import { Modal } from '@/components/ui/Modal'
import { formatDate, formatDateTime } from '@/lib/utils/format'
import Link from 'next/link'

interface MRNItem { id: string; material_name: string; material_type: string | null; specification: string | null; quantity_required: number; quantity_issued: number; unit_id: string | null; board_item_id: string | null }
interface MRN { id: string; mrn_number: string; status: string; required_date: string | null; notes: string | null; created_at: string; jobs?: { job_number: string; job_title: string } | null; material_requisition_items?: MRNItem[] }
interface Job { id: string; job_number: string; job_title: string }
interface Unit { id: string; name: string; symbol: string }
interface BoardInventoryItem { id: string; description: string; current_stock: number; unit_id: string | null }

const STATUS_CFG = {
  pending:           { label: 'Pending',           color: 'text-[var(--color-accent)] bg-[var(--color-accent)]/10 border-[var(--color-accent)]/20' },
  approved:          { label: 'Approved',           color: 'text-[var(--color-info)] bg-[var(--color-info)]/10 border-[var(--color-info)]/20' },
  partially_issued:  { label: 'Partially Issued',  color: 'text-[var(--color-warning)] bg-[var(--color-warning)]/10 border-[var(--color-warning)]/20' },
  issued:            { label: 'Issued',             color: 'text-[var(--color-success)] bg-[var(--color-success)]/10 border-[var(--color-success)]/20' },
  cancelled:         { label: 'Cancelled',          color: 'text-[var(--color-muted)] bg-[var(--color-bg-elevated)] border-[var(--color-border)]' },
}

const MATERIAL_TYPES = ['board','paper','ink','lamination','foil','glue','chemical','other']
const inputCls = 'w-full h-9 px-3 rounded-md border text-sm bg-[var(--color-bg-elevated)] text-[var(--color-text-primary)] border-[var(--color-border)] placeholder:text-[var(--color-text-muted)] focus:outline-none focus:border-[var(--color-accent)] focus:ring-1 focus:ring-[var(--color-accent)] transition-colors'
const EMPTY_ITEM = { material_name: '', material_type: '', specification: '', quantity_required: '1', unit_id: '', notes: '' }

export default function StoreClient({ initialMRNs, jobs, units, boardInventory }: { initialMRNs: MRN[]; jobs: Job[]; units: Unit[]; boardInventory: BoardInventoryItem[] }) {
  const [mrns, setMRNs] = useState(initialMRNs)
  const [expanded, setExpanded] = useState<Set<string>>(new Set())
  const [filterStatus, setFilterStatus] = useState('')
  const [newMRNModal, setNewMRNModal] = useState(false)
  const [issueModal, setIssueModal] = useState<MRN | null>(null)
  const [loading, setLoading] = useState(false)
  const [form, setForm] = useState({ job_id: '', required_date: '', notes: '' })
  const [lineItems, setLineItems] = useState([{ ...EMPTY_ITEM }])
  const [issueBoardLinks, setIssueBoardLinks] = useState<Record<string, string>>({})
  const [issueQtys, setIssueQtys] = useState<Record<string, string>>({})

  const toggle = (id: string) => setExpanded(prev => {
    const next = new Set(prev)
    next.has(id) ? next.delete(id) : next.add(id)
    return next
  })

  const filtered = filterStatus ? mrns.filter(m => m.status === filterStatus) : mrns

  const addLine = () => setLineItems(p => [...p, { ...EMPTY_ITEM }])
  const removeLine = (idx: number) => setLineItems(p => p.filter((_, i) => i !== idx))
  const setLine = (idx: number, key: string, val: string) => setLineItems(p => p.map((l, i) => i === idx ? { ...l, [key]: val } : l))

  const createMRN = async () => {
    if (!lineItems.some(l => l.material_name)) { toast.error('Add at least one material'); return }
    setLoading(true)
    try {
      const res = await fetch('/api/v1/store', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...form,
          job_id: form.job_id || null,
          items: lineItems.filter(l => l.material_name).map(l => ({
            ...l, quantity_required: parseFloat(l.quantity_required || '1'),
            unit_id: l.unit_id || null,
          })),
        }),
      })
      if (!res.ok) { const e = await res.json(); throw new Error(e.error) }
      const { data } = await res.json()
      const job = jobs.find(j => j.id === form.job_id)
      setMRNs(prev => [{ ...data, jobs: job || null, material_requisition_items: [] }, ...prev])
      setNewMRNModal(false)
      setForm({ job_id: '', required_date: '', notes: '' })
      setLineItems([{ ...EMPTY_ITEM }])
      toast.success(`MRN ${data.mrn_number} created`)
    } catch (e: any) { toast.error(e.message || 'Failed') }
    finally { setLoading(false) }
  }

  const approveMRN = async (mrn: MRN) => {
    try {
      const res = await fetch(`/api/v1/store/${mrn.id}`, {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'approve' }),
      })
      if (!res.ok) throw new Error()
      setMRNs(prev => prev.map(m => m.id === mrn.id ? { ...m, status: 'approved' } : m))
      toast.success('MRN approved')
    } catch { toast.error('Failed') }
  }

  const issueMaterials = async () => {
    if (!issueModal) return
    setLoading(true)
    try {
      const items = (issueModal.material_requisition_items || []).map(item => ({
        id: item.id,
        quantity_issued: parseFloat(issueQtys[item.id] ?? String(item.quantity_required)),
        board_item_id: issueBoardLinks[item.id] ?? item.board_item_id ?? null,
      }))
      const res = await fetch(`/api/v1/store/${issueModal.id}`, {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'issue', items }),
      })
      if (!res.ok) { const e = await res.json(); throw new Error(e.error) }
      const { data } = await res.json()
      setMRNs(prev => prev.map(m => m.id === issueModal.id ? { ...m, status: data.status, material_requisition_items: m.material_requisition_items?.map(i => ({ ...i, quantity_issued: parseFloat(issueQtys[i.id] ?? String(i.quantity_required)) })) } : m))
      setIssueModal(null)
      setIssueQtys({})
      setIssueBoardLinks({})
      toast.success('Materials issued')
    } catch (e: any) { toast.error(e.message || 'Failed') }
    finally { setLoading(false) }
  }

  return (
    <div className="space-y-4">
      {/* Toolbar */}
      <div className="flex items-center gap-3">
        <div className="flex items-center gap-1">
          {['', 'pending', 'approved', 'partially_issued', 'issued'].map(s => (
            <button key={s} onClick={() => setFilterStatus(s)}
              className={cn('px-3 h-7 rounded-md text-xs font-medium border transition-all',
                filterStatus === s ? 'bg-[var(--color-accent)] text-white border-transparent' : 'border-[var(--color-border)] text-[var(--color-text-secondary)] hover:text-[var(--color-text-primary)]')}>
              {s === '' ? 'All' : STATUS_CFG[s as keyof typeof STATUS_CFG]?.label || s}
            </button>
          ))}
        </div>
        <button onClick={() => setNewMRNModal(true)}
          className="flex items-center gap-1.5 px-4 h-9 rounded-md bg-[var(--color-accent)] text-white text-sm font-medium hover:bg-[var(--color-accent-hover)] transition-colors ml-auto">
          <Plus size={15} /> New MRN
        </button>
      </div>

      {/* MRN list */}
      <div className="rounded-xl border border-[var(--color-border)] bg-[var(--color-bg-secondary)] overflow-hidden">
        {filtered.length === 0 ? (
          <div className="p-12 text-center">
            <Package size={28} className="text-[var(--color-text-muted)] opacity-30 mx-auto mb-2" />
            <p className="text-sm text-[var(--color-text-muted)]">No material requisitions found</p>
          </div>
        ) : (
          <div className="divide-y divide-[var(--color-border-subtle)]">
            {filtered.map(mrn => {
              const statusCfg = STATUS_CFG[mrn.status as keyof typeof STATUS_CFG] || STATUS_CFG.pending
              const isOpen = expanded.has(mrn.id)
              const items = mrn.material_requisition_items || []
              const issuedCount = items.filter(i => i.quantity_issued >= i.quantity_required).length
              return (
                <div key={mrn.id}>
                  {/* MRN header row */}
                  <div className="flex items-center gap-4 px-5 py-3.5 hover:bg-[var(--color-bg-elevated)]/30">
                    <button onClick={() => toggle(mrn.id)} className="text-[var(--color-text-muted)] hover:text-[var(--color-text-primary)] flex-shrink-0">
                      {isOpen ? <ChevronDown size={16} /> : <ChevronRight size={16} />}
                    </button>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-semibold font-mono text-[var(--color-accent)]">{mrn.mrn_number}</span>
                        {mrn.jobs && (
                          <Link href={`/dashboard/jobs/${mrn.jobs.job_number}`} className="text-xs text-[var(--color-text-muted)] hover:text-[var(--color-accent)]">
                            → {mrn.jobs.job_number}
                          </Link>
                        )}
                      </div>
                      <div className="flex items-center gap-3 mt-0.5 text-xs text-[var(--color-text-muted)]">
                        <span>{items.length} material{items.length !== 1 ? 's' : ''}</span>
                        {items.length > 0 && <span>{issuedCount}/{items.length} issued</span>}
                        {mrn.required_date && <span>Required: {formatDate(mrn.required_date)}</span>}
                        <span>{formatDateTime(mrn.created_at)}</span>
                      </div>
                    </div>
                    <div className="flex items-center gap-2 flex-shrink-0">
                      <span className={cn('text-xs px-2.5 py-1 rounded-full border font-medium', statusCfg.color)}>{statusCfg.label}</span>
                      {mrn.status === 'pending' && (
                        <button onClick={() => approveMRN(mrn)}
                          className="flex items-center gap-1 px-2.5 h-7 rounded-md border border-[var(--color-success)]/30 text-xs text-[var(--color-success)] hover:bg-[var(--color-success)]/10 transition-colors">
                          <Check size={11} /> Approve
                        </button>
                      )}
                      {['approved','partially_issued'].includes(mrn.status) && (
                        <button onClick={() => { setIssueModal(mrn); const qtys: Record<string, string> = {}; items.forEach(i => { qtys[i.id] = String(i.quantity_required - i.quantity_issued) }); setIssueQtys(qtys) }}
                          className="flex items-center gap-1 px-2.5 h-7 rounded-md bg-[var(--color-warning)] text-white text-xs font-medium hover:opacity-90 transition-colors">
                          <Package size={11} /> Issue
                        </button>
                      )}
                    </div>
                  </div>

                  {/* Expanded line items */}
                  {isOpen && items.length > 0 && (
                    <div className="border-t border-[var(--color-border-subtle)] bg-[var(--color-bg-elevated)]/30">
                      <div className="grid grid-cols-12 gap-3 px-10 py-2 text-xs font-semibold text-[var(--color-text-muted)] uppercase tracking-wider border-b border-[var(--color-border-subtle)]">
                        <div className="col-span-3">Material</div>
                        <div className="col-span-2">Type</div>
                        <div className="col-span-3">Specification</div>
                        <div className="col-span-2">Required</div>
                        <div className="col-span-2">Issued</div>
                      </div>
                      {items.map(item => (
                        <div key={item.id} className="grid grid-cols-12 gap-3 px-10 py-2.5 items-center text-sm border-b border-[var(--color-border-subtle)] last:border-0">
                          <div className="col-span-3 text-[var(--color-text-primary)]">{item.material_name}</div>
                          <div className="col-span-2 text-[var(--color-text-muted)] capitalize">{item.material_type || '—'}</div>
                          <div className="col-span-3 text-[var(--color-text-muted)] text-xs">{item.specification || '—'}</div>
                          <div className="col-span-2 text-[var(--color-text-primary)]">{item.quantity_required}</div>
                          <div className="col-span-2">
                            <span className={cn('font-medium', item.quantity_issued >= item.quantity_required ? 'text-[var(--color-success)]' : item.quantity_issued > 0 ? 'text-[var(--color-warning)]' : 'text-[var(--color-text-muted)]')}>
                              {item.quantity_issued}
                            </span>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        )}
      </div>

      {/* New MRN Modal */}
      <Modal open={newMRNModal} onClose={() => setNewMRNModal(false)} title="New Material Requisition" size="lg"
        footer={
          <>
            <button onClick={() => setNewMRNModal(false)} className="px-4 h-9 rounded-md border border-[var(--color-border)] text-sm text-[var(--color-text-secondary)] hover:bg-[var(--color-bg-elevated)] transition-colors">Cancel</button>
            <button onClick={createMRN} disabled={loading}
              className="px-4 h-9 rounded-md bg-[var(--color-accent)] text-white text-sm font-medium hover:bg-[var(--color-accent-hover)] disabled:opacity-50 transition-colors">
              {loading ? 'Creating…' : 'Create MRN'}
            </button>
          </>
        }>
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <label className="text-sm font-medium text-[var(--color-text-primary)]">Link to Job</label>
              <select className={inputCls} value={form.job_id} onChange={e => setForm(p => ({ ...p, job_id: e.target.value }))}>
                <option value="">No job (general requisition)</option>
                {jobs.map(j => <option key={j.id} value={j.id}>{j.job_number} — {j.job_title}</option>)}
              </select>
            </div>
            <div className="space-y-1.5">
              <label className="text-sm font-medium text-[var(--color-text-primary)]">Required By</label>
              <input type="date" className={inputCls} value={form.required_date} onChange={e => setForm(p => ({ ...p, required_date: e.target.value }))} />
            </div>
          </div>

          {/* Line items */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <label className="text-sm font-medium text-[var(--color-text-primary)]">Materials Required</label>
              <button onClick={addLine} className="text-xs text-[var(--color-accent)] hover:underline flex items-center gap-1"><Plus size={12} /> Add</button>
            </div>
            <div className="space-y-2">
              {lineItems.map((item, idx) => (
                <div key={idx} className="grid grid-cols-12 gap-2 items-center">
                  <div className="col-span-4">
                    <input className={inputCls} value={item.material_name} onChange={e => setLine(idx, 'material_name', e.target.value)} placeholder="Material name *" />
                  </div>
                  <div className="col-span-2">
                    <select className={inputCls} value={item.material_type} onChange={e => setLine(idx, 'material_type', e.target.value)}>
                      <option value="">Type…</option>
                      {MATERIAL_TYPES.map(t => <option key={t} value={t} className="capitalize">{t}</option>)}
                    </select>
                  </div>
                  <div className="col-span-3">
                    <input className={inputCls} value={item.specification} onChange={e => setLine(idx, 'specification', e.target.value)} placeholder="Specification" />
                  </div>
                  <div className="col-span-2">
                    <input type="number" className={inputCls} value={item.quantity_required} onChange={e => setLine(idx, 'quantity_required', e.target.value)} placeholder="Qty" />
                  </div>
                  <div className="col-span-1 flex justify-end">
                    {lineItems.length > 1 && (
                      <button onClick={() => removeLine(idx)} className="text-[var(--color-text-muted)] hover:text-[var(--color-danger)] transition-colors"><Trash2 size={13} /></button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div className="space-y-1.5">
            <label className="text-sm font-medium text-[var(--color-text-primary)]">Notes</label>
            <input className={inputCls} value={form.notes} onChange={e => setForm(p => ({ ...p, notes: e.target.value }))} placeholder="Optional notes" />
          </div>
        </div>
      </Modal>

      {/* Issue Modal */}
      {issueModal && (
        <Modal open={true} onClose={() => setIssueModal(null)} title={`Issue Materials — ${issueModal.mrn_number}`} size="md"
          footer={
            <>
              <button onClick={() => setIssueModal(null)} className="px-4 h-9 rounded-md border border-[var(--color-border)] text-sm text-[var(--color-text-secondary)] hover:bg-[var(--color-bg-elevated)] transition-colors">Cancel</button>
              <button onClick={issueMaterials} disabled={loading}
                className="px-4 h-9 rounded-md bg-[var(--color-warning)] text-white text-sm font-medium hover:opacity-90 disabled:opacity-50 transition-colors">
                {loading ? 'Issuing…' : 'Issue Materials'}
              </button>
            </>
          }>
          <div className="space-y-3">
            {(issueModal.material_requisition_items || []).map(item => (
              <div key={item.id} className="flex items-center gap-3 flex-wrap">
                <div className="flex-1 min-w-[140px]">
                  <p className="text-sm font-medium text-[var(--color-text-primary)]">{item.material_name}</p>
                  <p className="text-xs text-[var(--color-text-muted)]">Required: {item.quantity_required} | Issued so far: {item.quantity_issued}</p>
                </div>
                <select
                  className="h-8 px-2 rounded-md border text-xs bg-[var(--color-bg-elevated)] text-[var(--color-text-primary)] border-[var(--color-border)] focus:outline-none focus:border-[var(--color-accent)] transition-colors max-w-[180px]"
                  value={issueBoardLinks[item.id] ?? item.board_item_id ?? ''}
                  onChange={e => setIssueBoardLinks(prev => ({ ...prev, [item.id]: e.target.value }))}>
                  <option value="">Not tracked in inventory</option>
                  {boardInventory.map(b => (
                    <option key={b.id} value={b.id}>{b.description} ({b.current_stock} in stock)</option>
                  ))}
                </select>
                <input type="number"
                  className="w-24 h-8 px-2.5 rounded-md border text-sm bg-[var(--color-bg-elevated)] text-[var(--color-text-primary)] border-[var(--color-border)] focus:outline-none focus:border-[var(--color-accent)] transition-colors"
                  value={issueQtys[item.id] ?? ''}
                  onChange={e => setIssueQtys(prev => ({ ...prev, [item.id]: e.target.value }))}
                  placeholder="Qty" />
              </div>
            ))}
            <p className="text-xs text-[var(--color-text-muted)]">
              Link an item to inventory to auto-deduct stock when issued. Leave unlinked for materials you don't track (ink, glue, etc.).
            </p>
          </div>
        </Modal>
      )}
    </div>
  )
}
