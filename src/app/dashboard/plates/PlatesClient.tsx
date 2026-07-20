'use client'
import { useState } from 'react'
import { Plus, Layers, RotateCcw, Archive, History, Search, RefreshCw, Boxes } from 'lucide-react'
import { cn } from '@/lib/utils/cn'
import { toast } from '@/components/ui/Toast'
import { Modal } from '@/components/ui/Modal'
import { Badge } from '@/components/ui/Badge'
import { EmptyState } from '@/components/ui/EmptyState'
import { formatDate, formatTimeAgo } from '@/lib/utils/format'

interface Plate {
  id: string; plate_code: string; color: string; die_number: string | null
  plate_size: string | null; material: string; status: string
  origin_job_id: string | null; vendor_id: string | null; cost: number | null
  made_date: string | null; storage_location: string | null
  reuse_count: number; last_used_at: string | null; remarks: string | null
  created_at: string; plate_set_id: string | null; plate_version: number
  origin_job?: { job_number: string; job_title: string } | null
  vendors?: { name: string } | null
  plate_sets?: { set_number: number; job_id: string; jobs?: { job_number: string; job_title: string } | null } | null
}
interface Job { id: string; job_number: string; job_title: string; no_of_colors: number | null; customers?: { name: string } | null }
interface Vendor { id: string; name: string }
interface Machine { id: string; name: string; code: string }
interface Operator { id: string; full_name: string }
interface HistoryRow {
  id: string; job_id: string; machine_id: string | null; is_reused: boolean
  assigned_at: string; returned_at: string | null
  condition_on_assign: string | null; condition_on_return: string | null
  jobs?: { job_number: string; job_title: string } | null
  machines?: { name: string; code: string } | null
}

const inputCls = 'w-full h-9 px-3 rounded-md border text-sm bg-[var(--color-bg-elevated)] text-[var(--color-text-primary)] border-[var(--color-border)] placeholder:text-[var(--color-text-muted)] focus:outline-none focus:border-[var(--color-accent)] focus:ring-1 focus:ring-[var(--color-accent)] transition-colors'

const STATUS_CONFIG: Record<string, { label: string; variant: 'default' | 'success' | 'warning' | 'danger' | 'info' | 'muted' }> = {
  created:    { label: 'Created',    variant: 'muted' },
  mounted:    { label: 'Mounted',    variant: 'info' },
  printing:   { label: 'Printing',   variant: 'info' },
  removed:    { label: 'Removed',    variant: 'muted' },
  in_storage: { label: 'In Storage', variant: 'success' },
  damaged:    { label: 'Damaged',    variant: 'warning' },
  remade:     { label: 'Remade',     variant: 'warning' },
  reused:     { label: 'Reused',     variant: 'info' },
  archived:   { label: 'Archived',   variant: 'muted' },
  disposed:   { label: 'Disposed',   variant: 'danger' },
  lost:       { label: 'Lost',       variant: 'danger' },
}

export default function PlatesClient({ initialPlates, jobs, vendors, machines, operators }: {
  initialPlates: Plate[]; jobs: Job[]; vendors: Vendor[]; machines: Machine[]; operators: Operator[]
}) {
  const [plates, setPlates] = useState(initialPlates)
  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState('')
  const [newModal, setNewModal] = useState(false)
  const [assignModal, setAssignModal] = useState<Plate | null>(null)
  const [returnModal, setReturnModal] = useState<Plate | null>(null)
  const [returnAssignmentId, setReturnAssignmentId] = useState<string | null>(null)
  const [historyModal, setHistoryModal] = useState<Plate | null>(null)
  const [history, setHistory] = useState<HistoryRow[]>([])
  const [loading, setLoading] = useState(false)
  const [generateSetModal, setGenerateSetModal] = useState(false)
  const [generateJobId, setGenerateJobId] = useState('')
  const [generating, setGenerating] = useState(false)
  const [replaceModal, setReplaceModal] = useState<Plate | null>(null)
  const [replaceReason, setReplaceReason] = useState('')
  const [replacing, setReplacing] = useState(false)

  const [form, setForm] = useState({
    plate_code: '', color: '', die_number: '', plate_size: '', material: 'aluminum',
    vendor_id: '', cost: '', made_date: '', storage_location: '', remarks: '', job_id: '', machine_id: '',
  })
  const [assignForm, setAssignForm] = useState({ job_id: '', machine_id: '', operator_id: '', condition_on_assign: 'good' })
  const [returnForm, setReturnForm] = useState({ condition_on_return: 'good', remarks: '' })

  const filtered = plates.filter(p => {
    if (statusFilter && p.status !== statusFilter) return false
    if (search) {
      const s = search.toLowerCase()
      if (!p.plate_code.toLowerCase().includes(s) && !p.color.toLowerCase().includes(s) && !(p.die_number || '').toLowerCase().includes(s)) return false
    }
    return true
  })

  const resetForm = () => setForm({ plate_code: '', color: '', die_number: '', plate_size: '', material: 'aluminum', vendor_id: '', cost: '', made_date: '', storage_location: '', remarks: '', job_id: '', machine_id: '' })

  const createPlate = async () => {
    if (!form.plate_code || !form.color) { toast.error('Plate code and color are required'); return }
    setLoading(true)
    try {
      const res = await fetch('/api/v1/plates', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...form, cost: form.cost ? parseFloat(form.cost) : null }),
      })
      if (!res.ok) { const e = await res.json(); throw new Error(e.error) }
      const { data } = await res.json()
      const job = jobs.find(j => j.id === form.job_id)
      setPlates(prev => [{ ...data, origin_job: job ? { job_number: job.job_number, job_title: job.job_title } : null }, ...prev])
      setNewModal(false)
      resetForm()
      toast.success(`Plate ${data.plate_code} added`)
    } catch (e: any) { toast.error(e.message || 'Failed') }
    finally { setLoading(false) }
  }

  const assignToJob = async () => {
    if (!assignModal || !assignForm.job_id) { toast.error('Select a job'); return }
    setLoading(true)
    try {
      const res = await fetch(`/api/v1/jobs/${assignForm.job_id}/plates`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ plate_id: assignModal.id, machine_id: assignForm.machine_id || null, operator_id: assignForm.operator_id || null, condition_on_assign: assignForm.condition_on_assign }),
      })
      if (!res.ok) { const e = await res.json(); throw new Error(e.error) }
      const job = jobs.find(j => j.id === assignForm.job_id)
      setPlates(prev => prev.map(p => p.id === assignModal.id ? {
        ...p, status: 'mounted', reuse_count: p.reuse_count + 1, last_used_at: new Date().toISOString(),
      } : p))
      setAssignModal(null)
      setAssignForm({ job_id: '', machine_id: '', operator_id: '', condition_on_assign: 'good' })
      toast.success(`Assigned to ${job?.job_number || 'job'}`)
    } catch (e: any) { toast.error(e.message || 'Failed') }
    finally { setLoading(false) }
  }

  const openReturn = async (plate: Plate) => {
    setLoading(true)
    try {
      const res = await fetch(`/api/v1/plates/${plate.id}`)
      const { data } = await res.json()
      const openAssignment = (data.history || []).find((h: HistoryRow) => !h.returned_at)
      if (!openAssignment) { toast.error('No open assignment found for this plate'); return }
      setReturnAssignmentId(openAssignment.id)
      setReturnModal(plate)
      setReturnForm({ condition_on_return: 'good', remarks: '' })
    } catch { toast.error('Could not load plate history') }
    finally { setLoading(false) }
  }

  const submitReturn = async () => {
    if (!returnAssignmentId || !returnModal) return
    setLoading(true)
    try {
      const res = await fetch(`/api/v1/job-plates/${returnAssignmentId}`, {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(returnForm),
      })
      if (!res.ok) { const e = await res.json(); throw new Error(e.error) }
      const newStatus = returnForm.condition_on_return === 'good' || returnForm.condition_on_return === 'worn' ? 'in_storage' : 'damaged'
      setPlates(prev => prev.map(p => p.id === returnModal.id ? { ...p, status: newStatus } : p))
      setReturnModal(null)
      setReturnAssignmentId(null)
      toast.success('Plate returned')
    } catch (e: any) { toast.error(e.message || 'Failed') }
    finally { setLoading(false) }
  }

  const openHistory = async (plate: Plate) => {
    setHistoryModal(plate)
    setHistory([])
    try {
      const res = await fetch(`/api/v1/plates/${plate.id}`)
      const { data } = await res.json()
      setHistory(data.history || [])
    } catch { toast.error('Could not load history') }
  }

  const retirePlate = async (plate: Plate) => {
    if (!confirm(`Retire plate ${plate.plate_code}? It will no longer be available for reuse.`)) return
    try {
      const res = await fetch(`/api/v1/plates/${plate.id}`, {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: 'disposed', retired_reason: 'Retired from registry' }),
      })
      if (!res.ok) throw new Error()
      setPlates(prev => prev.map(p => p.id === plate.id ? { ...p, status: 'disposed' } : p))
      toast.success('Plate retired')
    } catch { toast.error('Failed') }
  }

  const generateSetJob = jobs.find(j => j.id === generateJobId)
  const previewColors = (n: number | null) => {
    if (!n || n < 1) return []
    if (n === 1) return ['Black']
    if (n === 4) return ['Cyan', 'Magenta', 'Yellow', 'Black']
    return Array.from({ length: n }, (_, i) => `Color ${i + 1}`)
  }

  const generateSet = async () => {
    if (!generateJobId) { toast.error('Select a job'); return }
    setGenerating(true)
    try {
      const res = await fetch(`/api/v1/jobs/${generateJobId}/plates/generate-set`, { method: 'POST' })
      if (!res.ok) { const e = await res.json(); throw new Error(e.error) }
      const { data: set } = await res.json()
      const job = jobs.find(j => j.id === generateJobId)
      const newPlates: Plate[] = (set.plates || []).map((p: any) => ({
        ...p, plate_sets: { set_number: set.set_number, job_id: generateJobId, jobs: job ? { job_number: job.job_number, job_title: job.job_title } : null },
      }))
      setPlates(prev => [...newPlates, ...prev])
      setGenerateSetModal(false)
      setGenerateJobId('')
      toast.success(`Set ${set.set_number} generated — ${newPlates.length} plates`)
    } catch (e: any) { toast.error(e.message || 'Failed to generate set') }
    finally { setGenerating(false) }
  }

  const replacePlate = async () => {
    if (!replaceModal) return
    setReplacing(true)
    try {
      const res = await fetch(`/api/v1/plates/${replaceModal.id}/replace`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ reason: replaceReason || null }),
      })
      if (!res.ok) { const e = await res.json(); throw new Error(e.error) }
      const { data: newPlate } = await res.json()
      setPlates(prev => prev.map(p => p.id === replaceModal.id ? { ...p, status: 'damaged' } : p).concat({
        ...newPlate, plate_sets: replaceModal.plate_sets, origin_job: replaceModal.origin_job,
      }))
      setReplaceModal(null)
      setReplaceReason('')
      toast.success(`Replacement plate ${newPlate.plate_code} created`)
    } catch (e: any) { toast.error(e.message || 'Failed to replace plate') }
    finally { setReplacing(false) }
  }

  return (
    <div className="space-y-4">
      {/* Toolbar */}
      <div className="flex items-center gap-3">
        <div className="relative">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-[var(--color-text-muted)]" />
          <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search plate code, color, die #…"
            className={cn(inputCls, 'pl-8 w-64')} />
        </div>
        <select value={statusFilter} onChange={e => setStatusFilter(e.target.value)} className={cn(inputCls, 'w-40')}>
          <option value="">All Status</option>
          {Object.entries(STATUS_CONFIG).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
        </select>
        <button onClick={() => setGenerateSetModal(true)}
          className="flex items-center gap-1.5 px-4 h-9 rounded-md border border-[var(--color-accent)]/40 text-[var(--color-accent)] text-sm font-medium hover:bg-[var(--color-accent)]/10 transition-colors ml-auto">
          <Boxes size={15} /> Generate Plate Set
        </button>
        <button onClick={() => setNewModal(true)}
          className="flex items-center gap-1.5 px-4 h-9 rounded-md bg-[var(--color-accent)] text-white text-sm font-medium hover:bg-[var(--color-accent-hover)] transition-colors">
          <Plus size={15} /> New Plate
        </button>
      </div>

      {/* Registry table */}
      {filtered.length === 0 ? (
        <EmptyState icon={<Layers size={32} />} title="No plates found" description="Add a plate to start the registry" />
      ) : (
        <div className="rounded-xl border border-[var(--color-border)] bg-[var(--color-bg-secondary)] overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-[var(--color-bg-elevated)] border-b border-[var(--color-border)] text-left text-xs text-[var(--color-text-muted)] uppercase tracking-wider">
                <th className="px-4 py-2.5 font-medium">Plate Code</th>
                <th className="px-4 py-2.5 font-medium">Color</th>
                <th className="px-4 py-2.5 font-medium">Set</th>
                <th className="px-4 py-2.5 font-medium">Die #</th>
                <th className="px-4 py-2.5 font-medium">Status</th>
                <th className="px-4 py-2.5 font-medium">Origin Job</th>
                <th className="px-4 py-2.5 font-medium">Storage</th>
                <th className="px-4 py-2.5 font-medium">Reused</th>
                <th className="px-4 py-2.5 font-medium text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[var(--color-border-subtle)]">
              {filtered.map(plate => {
                const cfg = STATUS_CONFIG[plate.status] || STATUS_CONFIG.created
                return (
                  <tr key={plate.id} className="hover:bg-[var(--color-bg-elevated)]/50 transition-colors">
                    <td className="px-4 py-2.5 font-mono font-medium text-[var(--color-text-primary)]">
                      {plate.plate_code}
                      {plate.plate_version > 1 && <span className="ml-1.5 text-[10px] px-1 py-0.5 rounded bg-[var(--color-warning)]/15 text-[var(--color-warning)]">v{plate.plate_version}</span>}
                    </td>
                    <td className="px-4 py-2.5 text-[var(--color-text-secondary)]">{plate.color}</td>
                    <td className="px-4 py-2.5 text-[var(--color-text-muted)] text-xs">
                      {plate.plate_sets ? (
                        <span className="font-mono">{plate.plate_sets.jobs?.job_number} · Set {plate.plate_sets.set_number}</span>
                      ) : '—'}
                    </td>
                    <td className="px-4 py-2.5 text-[var(--color-text-muted)]">{plate.die_number || '—'}</td>
                    <td className="px-4 py-2.5"><Badge variant={cfg.variant}>{cfg.label}</Badge></td>
                    <td className="px-4 py-2.5 text-[var(--color-text-muted)]">
                      {plate.origin_job ? <span className="font-mono text-xs">{plate.origin_job.job_number}</span> : '—'}
                    </td>
                    <td className="px-4 py-2.5 text-[var(--color-text-muted)]">{plate.storage_location || '—'}</td>
                    <td className="px-4 py-2.5 text-[var(--color-text-muted)]">{plate.reuse_count}×</td>
                    <td className="px-4 py-2.5">
                      <div className="flex items-center justify-end gap-1.5">
                        <button onClick={() => openHistory(plate)} title="History"
                          className="w-8 h-8 flex items-center justify-center rounded-md border border-[var(--color-border)] text-[var(--color-text-muted)] hover:text-[var(--color-accent)] hover:border-[var(--color-accent)] transition-colors">
                          <History size={13} />
                        </button>
                        {plate.status === 'in_storage' && (
                          <button onClick={() => setAssignModal(plate)} title="Assign to job"
                            className="flex items-center gap-1 px-2.5 h-8 rounded-md border border-[var(--color-info)]/30 text-[var(--color-info)] bg-[var(--color-info)]/10 hover:bg-[var(--color-info)]/20 text-xs font-medium transition-colors">
                            <RotateCcw size={12} /> Reuse
                          </button>
                        )}
                        {['mounted', 'printing'].includes(plate.status) && (
                          <button onClick={() => openReturn(plate)} title="Return"
                            className="flex items-center gap-1 px-2.5 h-8 rounded-md border border-[var(--color-success)]/30 text-[var(--color-success)] bg-[var(--color-success)]/10 hover:bg-[var(--color-success)]/20 text-xs font-medium transition-colors">
                            Return
                          </button>
                        )}
                        {plate.status === 'damaged' && (
                          <button onClick={() => { setReplaceModal(plate); setReplaceReason('') }} title="Replace this plate"
                            className="flex items-center gap-1 px-2.5 h-8 rounded-md border border-[var(--color-warning)]/30 text-[var(--color-warning)] bg-[var(--color-warning)]/10 hover:bg-[var(--color-warning)]/20 text-xs font-medium transition-colors">
                            <RefreshCw size={12} /> Replace
                          </button>
                        )}
                        {['in_storage', 'damaged', 'created'].includes(plate.status) && (
                          <button onClick={() => retirePlate(plate)} title="Retire"
                            className="w-8 h-8 flex items-center justify-center rounded-md border border-[var(--color-border)] text-[var(--color-text-muted)] hover:text-[var(--color-danger)] hover:border-[var(--color-danger)]/30 transition-colors">
                            <Archive size={13} />
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}

      {/* New Plate Modal */}
      <Modal open={newModal} onClose={() => setNewModal(false)} title="New Plate" size="lg"
        footer={<>
          <button onClick={() => setNewModal(false)} className="px-4 h-9 rounded-md border border-[var(--color-border)] text-sm text-[var(--color-text-secondary)] hover:bg-[var(--color-bg-elevated)] transition-colors">Cancel</button>
          <button onClick={createPlate} disabled={loading || !form.plate_code || !form.color}
            className="flex items-center gap-2 px-4 h-9 rounded-md bg-[var(--color-accent)] text-white text-sm font-medium hover:bg-[var(--color-accent-hover)] disabled:opacity-50 transition-colors">
            {loading ? 'Saving…' : 'Add Plate'}
          </button>
        </>}>
        <div className="grid grid-cols-2 gap-4">
          <div className="space-y-1.5">
            <label className="text-sm font-medium text-[var(--color-text-primary)]">Plate Code <span className="text-[var(--color-danger)]">*</span></label>
            <input className={inputCls} value={form.plate_code} onChange={e => setForm(p => ({ ...p, plate_code: e.target.value }))} placeholder="PL-0231" />
          </div>
          <div className="space-y-1.5">
            <label className="text-sm font-medium text-[var(--color-text-primary)]">Color <span className="text-[var(--color-danger)]">*</span></label>
            <input className={inputCls} value={form.color} onChange={e => setForm(p => ({ ...p, color: e.target.value }))} placeholder="Cyan / Pantone 286C" />
          </div>
          <div className="space-y-1.5">
            <label className="text-sm font-medium text-[var(--color-text-primary)]">Die Number</label>
            <input className={inputCls} value={form.die_number} onChange={e => setForm(p => ({ ...p, die_number: e.target.value }))} />
          </div>
          <div className="space-y-1.5">
            <label className="text-sm font-medium text-[var(--color-text-primary)]">Plate Size</label>
            <input className={inputCls} value={form.plate_size} onChange={e => setForm(p => ({ ...p, plate_size: e.target.value }))} placeholder="24 x 36 in" />
          </div>
          <div className="space-y-1.5">
            <label className="text-sm font-medium text-[var(--color-text-primary)]">Material</label>
            <select className={inputCls} value={form.material} onChange={e => setForm(p => ({ ...p, material: e.target.value }))}>
              <option value="aluminum">Aluminum</option>
              <option value="polyester">Polyester</option>
              <option value="other">Other</option>
            </select>
          </div>
          <div className="space-y-1.5">
            <label className="text-sm font-medium text-[var(--color-text-primary)]">Vendor (if outsourced)</label>
            <select className={inputCls} value={form.vendor_id} onChange={e => setForm(p => ({ ...p, vendor_id: e.target.value }))}>
              <option value="">— Made in-house —</option>
              {vendors.map(v => <option key={v.id} value={v.id}>{v.name}</option>)}
            </select>
          </div>
          <div className="space-y-1.5">
            <label className="text-sm font-medium text-[var(--color-text-primary)]">Cost (PKR)</label>
            <input type="number" className={inputCls} value={form.cost} onChange={e => setForm(p => ({ ...p, cost: e.target.value }))} />
          </div>
          <div className="space-y-1.5">
            <label className="text-sm font-medium text-[var(--color-text-primary)]">Made Date</label>
            <input type="date" className={inputCls} value={form.made_date} onChange={e => setForm(p => ({ ...p, made_date: e.target.value }))} />
          </div>
          <div className="space-y-1.5 col-span-2">
            <label className="text-sm font-medium text-[var(--color-text-primary)]">Storage Location</label>
            <input className={inputCls} value={form.storage_location} onChange={e => setForm(p => ({ ...p, storage_location: e.target.value }))} placeholder="Rack A-3" />
          </div>
          <div className="space-y-1.5 col-span-2 border-t border-[var(--color-border-subtle)] pt-3">
            <label className="text-sm font-medium text-[var(--color-text-primary)]">Assign to Job now (optional)</label>
            <select className={inputCls} value={form.job_id} onChange={e => setForm(p => ({ ...p, job_id: e.target.value }))}>
              <option value="">— Keep in storage —</option>
              {jobs.map(j => <option key={j.id} value={j.id}>{j.job_number} — {j.job_title}</option>)}
            </select>
          </div>
          {form.job_id && (
            <div className="space-y-1.5 col-span-2">
              <label className="text-sm font-medium text-[var(--color-text-primary)]">Machine</label>
              <select className={inputCls} value={form.machine_id} onChange={e => setForm(p => ({ ...p, machine_id: e.target.value }))}>
                <option value="">— Unassigned —</option>
                {machines.map(m => <option key={m.id} value={m.id}>{m.name} ({m.code})</option>)}
              </select>
            </div>
          )}
        </div>
      </Modal>

      {/* Assign / Reuse Modal */}
      <Modal open={!!assignModal} onClose={() => setAssignModal(null)} title={`Reuse Plate ${assignModal?.plate_code || ''}`} size="md"
        footer={<>
          <button onClick={() => setAssignModal(null)} className="px-4 h-9 rounded-md border border-[var(--color-border)] text-sm text-[var(--color-text-secondary)] hover:bg-[var(--color-bg-elevated)] transition-colors">Cancel</button>
          <button onClick={assignToJob} disabled={loading || !assignForm.job_id}
            className="flex items-center gap-2 px-4 h-9 rounded-md bg-[var(--color-accent)] text-white text-sm font-medium hover:bg-[var(--color-accent-hover)] disabled:opacity-50 transition-colors">
            {loading ? 'Assigning…' : 'Assign'}
          </button>
        </>}>
        <div className="space-y-4">
          <div className="space-y-1.5">
            <label className="text-sm font-medium text-[var(--color-text-primary)]">Job <span className="text-[var(--color-danger)]">*</span></label>
            <select className={inputCls} value={assignForm.job_id} onChange={e => setAssignForm(p => ({ ...p, job_id: e.target.value }))}>
              <option value="">Select job…</option>
              {jobs.map(j => <option key={j.id} value={j.id}>{j.job_number} — {j.job_title}</option>)}
            </select>
          </div>
          <div className="space-y-1.5">
            <label className="text-sm font-medium text-[var(--color-text-primary)]">Machine</label>
            <select className={inputCls} value={assignForm.machine_id} onChange={e => setAssignForm(p => ({ ...p, machine_id: e.target.value }))}>
              <option value="">— Unassigned —</option>
              {machines.map(m => <option key={m.id} value={m.id}>{m.name} ({m.code})</option>)}
            </select>
          </div>
          <div className="space-y-1.5">
            <label className="text-sm font-medium text-[var(--color-text-primary)]">Operator</label>
            <select className={inputCls} value={assignForm.operator_id} onChange={e => setAssignForm(p => ({ ...p, operator_id: e.target.value }))}>
              <option value="">— Unassigned —</option>
              {operators.map(o => <option key={o.id} value={o.id}>{o.full_name}</option>)}
            </select>
          </div>
          <div className="space-y-1.5">
            <label className="text-sm font-medium text-[var(--color-text-primary)]">Condition Going Out</label>
            <select className={inputCls} value={assignForm.condition_on_assign} onChange={e => setAssignForm(p => ({ ...p, condition_on_assign: e.target.value }))}>
              <option value="good">Good</option>
              <option value="worn">Worn</option>
            </select>
          </div>
        </div>
      </Modal>

      {/* Return Modal */}
      <Modal open={!!returnModal} onClose={() => setReturnModal(null)} title={`Return Plate ${returnModal?.plate_code || ''}`} size="md"
        footer={<>
          <button onClick={() => setReturnModal(null)} className="px-4 h-9 rounded-md border border-[var(--color-border)] text-sm text-[var(--color-text-secondary)] hover:bg-[var(--color-bg-elevated)] transition-colors">Cancel</button>
          <button onClick={submitReturn} disabled={loading}
            className="flex items-center gap-2 px-4 h-9 rounded-md bg-[var(--color-accent)] text-white text-sm font-medium hover:bg-[var(--color-accent-hover)] disabled:opacity-50 transition-colors">
            {loading ? 'Saving…' : 'Confirm Return'}
          </button>
        </>}>
        <div className="space-y-4">
          <div className="space-y-1.5">
            <label className="text-sm font-medium text-[var(--color-text-primary)]">Condition on Return</label>
            <select className={inputCls} value={returnForm.condition_on_return} onChange={e => setReturnForm(p => ({ ...p, condition_on_return: e.target.value }))}>
              <option value="good">Good — can be reused</option>
              <option value="worn">Worn — can be reused</option>
              <option value="damaged">Damaged — not reusable</option>
              <option value="discarded">Discarded</option>
            </select>
            <p className="text-xs text-[var(--color-text-muted)]">Good/Worn puts the plate back in storage for reuse. Damaged/Discarded retires it.</p>
          </div>
          <div className="space-y-1.5">
            <label className="text-sm font-medium text-[var(--color-text-primary)]">Remarks</label>
            <input className={inputCls} value={returnForm.remarks} onChange={e => setReturnForm(p => ({ ...p, remarks: e.target.value }))} />
          </div>
        </div>
      </Modal>

      {/* History Modal */}
      <Modal open={!!historyModal} onClose={() => setHistoryModal(null)} title={`History — ${historyModal?.plate_code || ''}`} size="lg">
        {history.length === 0 ? (
          <p className="text-sm text-[var(--color-text-muted)] text-center py-8">No assignment history yet</p>
        ) : (
          <div className="divide-y divide-[var(--color-border-subtle)]">
            {history.map(h => (
              <div key={h.id} className="py-3">
                <div className="flex items-center justify-between">
                  <span className="text-sm font-medium text-[var(--color-text-primary)]">
                    {h.jobs?.job_number} — {h.jobs?.job_title} {h.is_reused && <Badge variant="info" className="ml-1.5">Reused</Badge>}
                  </span>
                  <span className="text-xs text-[var(--color-text-muted)]">{formatTimeAgo(h.assigned_at)}</span>
                </div>
                <div className="text-xs text-[var(--color-text-muted)] mt-1">
                  {h.machines ? `${h.machines.name} (${h.machines.code})` : 'No machine noted'} · Out: {h.condition_on_assign || '—'}
                  {h.returned_at ? ` · Returned ${formatDate(h.returned_at)} (${h.condition_on_return})` : ' · Still with job'}
                </div>
              </div>
            ))}
          </div>
        )}
      </Modal>

      {/* Generate Plate Set Modal */}
      <Modal open={generateSetModal} onClose={() => setGenerateSetModal(false)} title="Generate Plate Set" size="md"
        footer={<>
          <button onClick={() => setGenerateSetModal(false)} className="px-4 h-9 rounded-md border border-[var(--color-border)] text-sm text-[var(--color-text-secondary)] hover:bg-[var(--color-bg-elevated)] transition-colors">Cancel</button>
          <button onClick={generateSet} disabled={generating || !generateJobId}
            className="flex items-center gap-2 px-4 h-9 rounded-md bg-[var(--color-accent)] text-white text-sm font-medium hover:bg-[var(--color-accent-hover)] disabled:opacity-50 transition-colors">
            {generating ? 'Generating…' : 'Generate Set'}
          </button>
        </>}>
        <div className="space-y-4">
          <div className="space-y-1.5">
            <label className="text-sm font-medium text-[var(--color-text-primary)]">Job <span className="text-[var(--color-danger)]">*</span></label>
            <select className={inputCls} value={generateJobId} onChange={e => setGenerateJobId(e.target.value)}>
              <option value="">Select job…</option>
              {jobs.map(j => <option key={j.id} value={j.id}>{j.job_number} — {j.job_title} ({j.no_of_colors || '?'} colors)</option>)}
            </select>
          </div>
          {generateSetJob && (
            <div className="space-y-1.5">
              <label className="text-sm font-medium text-[var(--color-text-primary)]">Plates to be created</label>
              {generateSetJob.no_of_colors ? (
                <div className="flex flex-wrap gap-1.5">
                  {previewColors(generateSetJob.no_of_colors).map((c, i) => (
                    <span key={i} className="text-xs px-2 py-1 rounded-md border border-[var(--color-border)] bg-[var(--color-bg-elevated)] text-[var(--color-text-secondary)]">{c}</span>
                  ))}
                </div>
              ) : (
                <p className="text-xs text-[var(--color-danger)]">This job has no &quot;No. of Colors&quot; set — add it on the job first.</p>
              )}
              <p className="text-xs text-[var(--color-text-muted)]">Color names are editable per plate afterward — this is just a starting point (CMYK for 4-color jobs, generic labels otherwise).</p>
            </div>
          )}
        </div>
      </Modal>

      {/* Replace Plate Modal */}
      <Modal open={!!replaceModal} onClose={() => setReplaceModal(null)} title={`Replace ${replaceModal?.plate_code || ''}`} size="md"
        footer={<>
          <button onClick={() => setReplaceModal(null)} className="px-4 h-9 rounded-md border border-[var(--color-border)] text-sm text-[var(--color-text-secondary)] hover:bg-[var(--color-bg-elevated)] transition-colors">Cancel</button>
          <button onClick={replacePlate} disabled={replacing}
            className="flex items-center gap-2 px-4 h-9 rounded-md bg-[var(--color-accent)] text-white text-sm font-medium hover:bg-[var(--color-accent-hover)] disabled:opacity-50 transition-colors">
            {replacing ? 'Replacing…' : 'Create Replacement'}
          </button>
        </>}>
        <div className="space-y-4">
          <p className="text-sm text-[var(--color-text-secondary)]">
            This creates a new {replaceModal?.color} plate (v{(replaceModal?.plate_version || 1) + 1}) in the same set —
            only this one plate is replaced, the rest of the set stays untouched. {replaceModal?.plate_code} stays on record as damaged.
          </p>
          <div className="space-y-1.5">
            <label className="text-sm font-medium text-[var(--color-text-primary)]">Reason (optional)</label>
            <input className={inputCls} value={replaceReason} onChange={e => setReplaceReason(e.target.value)} placeholder="e.g. Scratched during mounting" />
          </div>
        </div>
      </Modal>
    </div>
  )
}
