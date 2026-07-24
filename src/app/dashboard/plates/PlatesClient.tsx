'use client'
import { useState } from 'react'
import { Plus, Search, ExternalLink, Scissors, Trash2, RotateCcw, History, Lock } from 'lucide-react'
import { cn } from '@/lib/utils/cn'
import { toast } from '@/components/ui/Toast'
import { Modal } from '@/components/ui/Modal'
import { Badge } from '@/components/ui/Badge'
import { EmptyState } from '@/components/ui/EmptyState'
import { formatTimeAgo, formatDateTime } from '@/lib/utils/format'

interface Plate {
  id: string; color: string; plate_size: string | null; status: string
  origin_job_id: string | null; remarks: string | null; created_at: string; made_date: string | null
  origin_job?: { job_number: string; job_title: string } | null
  current_job?: { assignment_id: string; job_number: string; job_title: string } | null
}
interface JobPlateHistoryRow {
  id: string; assigned_at: string; returned_at: string | null
  is_reused: boolean; condition_on_assign: string | null; condition_on_return: string | null
  jobs?: { job_number: string; job_title: string } | null
  machines?: { name: string; code: string } | null
}
interface Job { id: string; job_number: string; job_title: string; customers?: { name: string } | null }
interface Machine { id: string; name: string; code: string }
interface ColorSpecOption { id: string; name: string }

const SIZES = ['1030 x 790', '1030 x 770']
// Largest to smallest — mirrors the server-side rule in
// /api/v1/plates/[id]: a plate can only move DOWN this list.
const SIZE_ORDER = SIZES

const STATUS_CONFIG: Record<string, { label: string; variant: 'success' | 'info' | 'danger' }> = {
  in_storage: { label: 'In Storage', variant: 'success' },
  in_use:     { label: 'In Use',     variant: 'info' },
  damaged:    { label: 'Damaged',    variant: 'danger' },
}

const inputCls = 'w-full h-9 px-3 rounded-md border text-sm bg-[var(--color-bg-elevated)] text-[var(--color-text-primary)] border-[var(--color-border)] placeholder:text-[var(--color-text-muted)] focus:outline-none focus:border-[var(--color-accent)] focus:ring-1 focus:ring-[var(--color-accent)] transition-colors'

type ColorRow = { color: string; mode: 'new' | 'old'; existing_plate_id: string }

export default function PlatesClient({ initialPlates, jobs, machines, colorSpecs = [] }: { initialPlates: Plate[]; jobs: Job[]; machines: Machine[]; colorSpecs?: ColorSpecOption[] }) {
  const [plates, setPlates] = useState(initialPlates)
  const [search, setSearch] = useState('')
  const [statusFilter, setStatusFilter] = useState('')

  const [addModal, setAddModal] = useState(false)
  const [addJobId, setAddJobId] = useState('')
  const [addSize, setAddSize] = useState(SIZES[0])
  const [addMachineId, setAddMachineId] = useState('')
  const [addMadeDate, setAddMadeDate] = useState(() => new Date().toISOString().slice(0, 10))
  const [colorRows, setColorRows] = useState<ColorRow[]>([{ color: '', mode: 'new', existing_plate_id: '' }])
  const [adding, setAdding] = useState(false)

  const [sizeEdit, setSizeEdit] = useState<string | null>(null) // plate id currently being size-edited

  const [historyModal, setHistoryModal] = useState<Plate | null>(null)
  const [historyRows, setHistoryRows] = useState<JobPlateHistoryRow[]>([])
  const [historyLoading, setHistoryLoading] = useState(false)

  const [jobFilter, setJobFilter] = useState('') // '', '__unassigned__', or a job_number

  const [returnModal, setReturnModal] = useState<Plate | null>(null)
  const [returnCondition, setReturnCondition] = useState<'good' | 'worn' | 'damaged'>('good')
  const [returning, setReturning] = useState(false)

  const availableForReuse = plates.filter(p => p.status === 'in_storage' && (!addSize || p.plate_size === addSize))

  const filtered = plates.filter(p => {
    if (statusFilter && p.status !== statusFilter) return false
    if (search && !p.color.toLowerCase().includes(search.toLowerCase())) return false
    if (jobFilter === '__unassigned__' && p.current_job) return false
    if (jobFilter && jobFilter !== '__unassigned__' && p.current_job?.job_number !== jobFilter) return false
    return true
  })

  // Job-wise grouping — plates for the same job sit together under one
  // header instead of one flat list where the job is just another column,
  // easy to lose track of when scanning. Plates not currently with any job
  // (in storage, or a stale origin_job that's no longer active) fall into
  // one "In Storage / Not Currently Assigned" group at the end.
  const UNASSIGNED = '__unassigned__'
  const groupOrder: string[] = []
  const groupsMap = new Map<string, { job_number: string; job_title: string } | null>()
  const groupedPlates = new Map<string, Plate[]>()
  for (const p of filtered) {
    const key = p.current_job ? p.current_job.job_number : UNASSIGNED
    if (!groupedPlates.has(key)) {
      groupOrder.push(key)
      groupsMap.set(key, p.current_job ? { job_number: p.current_job.job_number, job_title: p.current_job.job_title } : null)
      groupedPlates.set(key, [])
    }
    groupedPlates.get(key)!.push(p)
  }
  // Active-job groups first (most recently touched job first, since
  // `plates` already comes newest-first), unassigned/storage group last.
  groupOrder.sort((a, b) => (a === UNASSIGNED ? 1 : b === UNASSIGNED ? -1 : 0))
  const jobNumbersForFilter = Array.from(new Set(plates.filter(p => p.current_job).map(p => p.current_job!.job_number)))

  const addColorRow = () => setColorRows(prev => [...prev, { color: '', mode: 'new', existing_plate_id: '' }])
  const removeColorRow = (i: number) => setColorRows(prev => prev.filter((_, idx) => idx !== i))
  const updateColorRow = (i: number, patch: Partial<ColorRow>) =>
    setColorRows(prev => prev.map((r, idx) => idx === i ? { ...r, ...patch } : r))

  const resetAddForm = () => {
    setAddJobId(''); setAddSize(SIZES[0]); setAddMachineId('')
    setColorRows([{ color: '', mode: 'new', existing_plate_id: '' }])
  }

  const submitAdd = async () => {
    const rows = colorRows.filter(r => r.color.trim() || r.mode === 'old')
    if (rows.length === 0) { toast.error('Add at least one color'); return }
    for (const r of rows) {
      if (r.mode === 'new' && !r.color.trim()) { toast.error('Enter a color name'); return }
      if (r.mode === 'old' && !r.existing_plate_id) { toast.error('Select an existing plate for each "Old" row'); return }
    }
    setAdding(true)
    try {
      const res = await fetch('/api/v1/plates', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          job_id: addJobId || null, plate_size: addSize, machine_id: addMachineId || null, made_date: addMadeDate,
          colors: rows.map(r => ({ color: r.color.trim(), mode: r.mode, existing_plate_id: r.existing_plate_id || undefined })),
        }),
      })
      if (!res.ok) { const e = await res.json(); throw new Error(e.error) }
      const { data } = await res.json()
      // Refresh list simply: merge new/updated plates in
      setPlates(prev => {
        const ids = new Set(data.map((p: any) => p.id))
        return [...data, ...prev.filter(p => !ids.has(p.id))]
      })
      setAddModal(false)
      resetAddForm()
      toast.success(`${data.length} plate${data.length > 1 ? 's' : ''} added`)
    } catch (e: any) { toast.error(e.message || 'Failed to add plates') }
    finally { setAdding(false) }
  }

  const changeStatus = async (plate: Plate, status: string) => {
    try {
      const res = await fetch(`/api/v1/plates/${plate.id}`, {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status }),
      })
      if (!res.ok) throw new Error()
      setPlates(prev => prev.map(p => p.id === plate.id ? { ...p, status } : p))
    } catch { toast.error('Failed to update status') }
  }

  const changeSize = async (plate: Plate, newSize: string) => {
    if (newSize === plate.plate_size) { setSizeEdit(null); return }
    try {
      const res = await fetch(`/api/v1/plates/${plate.id}`, {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ plate_size: newSize }),
      })
      if (!res.ok) { const e = await res.json().catch(() => ({})); throw new Error(e.error || 'Failed to change size') }
      const { data } = await res.json()
      setPlates(prev => prev.map(p => p.id === plate.id ? { ...p, plate_size: data.plate_size, remarks: data.remarks } : p))
      toast.success(`Resized to ${newSize}`)
    } catch (e: any) { toast.error(e.message || 'Failed to change size') }
    finally { setSizeEdit(null) }
  }

  // Sizes this plate is still allowed to become — itself, plus anything
  // smaller (never back up to a larger size once cut down). If the plate
  // has no size yet, or an old free-text value from before the two-size
  // model, every size is offered.
  const allowedSizesFor = (plate: Plate): string[] => {
    const idx = plate.plate_size ? SIZE_ORDER.indexOf(plate.plate_size) : -1
    return idx === -1 ? SIZE_ORDER : SIZE_ORDER.slice(idx)
  }

  const openHistory = async (plate: Plate) => {
    setHistoryModal(plate)
    setHistoryLoading(true)
    setHistoryRows([])
    try {
      const res = await fetch(`/api/v1/plates/${plate.id}`)
      if (!res.ok) throw new Error('Failed to load history')
      const { data } = await res.json()
      setHistoryRows(data.history ?? [])
    } catch {
      toast.error('Failed to load plate history')
    } finally {
      setHistoryLoading(false)
    }
  }

  const openReturn = (plate: Plate) => {
    setReturnCondition('good')
    setReturnModal(plate)
  }

  const submitReturn = async () => {
    if (!returnModal?.current_job) return
    setReturning(true)
    try {
      const res = await fetch(`/api/v1/job-plates/${returnModal.current_job.assignment_id}`, {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ condition_on_return: returnCondition }),
      })
      if (!res.ok) { const e = await res.json().catch(() => ({})); throw new Error(e.error || 'Failed to return plate') }
      // Mirror the server's own status mapping (job-plates/[id] PATCH):
      // good/worn -> in_storage, damaged -> damaged. And it's no longer
      // "with" any job.
      const newStatus = returnCondition === 'damaged' ? 'damaged' : 'in_storage'
      setPlates(prev => prev.map(p => p.id === returnModal.id ? { ...p, status: newStatus, current_job: null } : p))
      toast.success('Plate returned')
      setReturnModal(null)
    } catch (e: any) {
      toast.error(e.message || 'Failed to return plate')
    } finally {
      setReturning(false)
    }
  }

  const deletePlate = async (plate: Plate) => {
    if (!confirm(`Delete this ${plate.color} plate?`)) return
    try {
      await fetch(`/api/v1/plates/${plate.id}`, { method: 'DELETE' })
      setPlates(prev => prev.filter(p => p.id !== plate.id))
      toast.success('Plate deleted')
    } catch { toast.error('Failed') }
  }

  return (
    <div className="space-y-4">
      {/* Toolbar */}
      <div className="flex items-center gap-3">
        <div className="relative flex-1 max-w-xs">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-[var(--color-text-muted)]" />
          <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search color…"
            className="w-full h-9 pl-9 pr-3 rounded-md border text-sm bg-[var(--color-bg-elevated)] text-[var(--color-text-primary)] border-[var(--color-border)] placeholder:text-[var(--color-text-muted)] focus:outline-none focus:border-[var(--color-accent)]" />
        </div>
        <select value={statusFilter} onChange={e => setStatusFilter(e.target.value)}
          className="h-9 px-3 rounded-md border text-sm bg-[var(--color-bg-elevated)] text-[var(--color-text-primary)] border-[var(--color-border)]">
          <option value="">All Statuses</option>
          {Object.entries(STATUS_CONFIG).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
        </select>
        <select value={jobFilter} onChange={e => setJobFilter(e.target.value)}
          className="h-9 px-3 rounded-md border text-sm bg-[var(--color-bg-elevated)] text-[var(--color-text-primary)] border-[var(--color-border)]">
          <option value="">All Jobs</option>
          <option value="__unassigned__">In Storage / Not Assigned</option>
          {jobNumbersForFilter.map(jn => <option key={jn} value={jn}>{jn}</option>)}
        </select>
        <button onClick={() => setAddModal(true)}
          className="flex items-center gap-1.5 px-4 h-9 rounded-md bg-[var(--color-accent)] text-white text-sm font-medium hover:bg-[var(--color-accent-hover)] transition-colors ml-auto">
          <Plus size={15} /> Add Plates
        </button>
      </div>

      {/* Job-wise groups */}
      {filtered.length === 0 ? (
        <EmptyState title="No plates found" description="Add your first plate to get started" />
      ) : (
        <div className="space-y-4">
          {groupOrder.map(key => {
            const group = groupsMap.get(key)
            const groupPlates = groupedPlates.get(key)!
            return (
              <div key={key} className="rounded-xl border border-[var(--color-border)] bg-[var(--color-bg-secondary)] overflow-hidden">
                <div className="px-4 py-2.5 border-b border-[var(--color-border)] bg-[var(--color-bg-elevated)]/60 flex items-center gap-2">
                  <span className="text-sm font-semibold text-[var(--color-text-primary)]">
                    {group ? `${group.job_number} — ${group.job_title}` : 'In Storage / Not Currently Assigned'}
                  </span>
                  <span className="text-xs text-[var(--color-text-muted)]">({groupPlates.length} plate{groupPlates.length > 1 ? 's' : ''})</span>
                </div>
                <table className="w-full text-sm">
                  <thead>
                    <tr className="text-left text-xs text-[var(--color-text-muted)] border-b border-[var(--color-border)]">
                      <th className="px-4 py-2 font-medium">Color</th>
                      <th className="px-4 py-2 font-medium">Size</th>
                      <th className="px-4 py-2 font-medium">Status</th>
                      <th className="px-4 py-2 font-medium">Made Date</th>
                      <th className="px-4 py-2 font-medium">Added</th>
                      <th className="px-4 py-2 font-medium"></th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[var(--color-border-subtle)]">
                    {groupPlates.map(plate => (
                      <tr key={plate.id} className="hover:bg-[var(--color-bg-elevated)]/50 transition-colors">
                        <td className="px-4 py-2.5 font-medium text-[var(--color-text-primary)]">
                          {plate.color}
                          {!plate.current_job && plate.origin_job && (
                            <p className="text-[11px] font-normal text-[var(--color-text-muted)] mt-0.5" title="Originally made for this job — not currently assigned to it">
                              Originally: {plate.origin_job.job_number}
                            </p>
                          )}
                        </td>
                        <td className="px-4 py-2.5">
                          {sizeEdit === plate.id ? (
                            <select autoFocus defaultValue={plate.plate_size || SIZES[0]} onBlur={e => changeSize(plate, e.target.value)}
                              onChange={e => changeSize(plate, e.target.value)}
                              className="h-7 px-2 rounded-md border text-xs bg-[var(--color-bg-elevated)] text-[var(--color-text-primary)] border-[var(--color-accent)]">
                              {allowedSizesFor(plate).map(s => <option key={s} value={s}>{s}</option>)}
                            </select>
                          ) : allowedSizesFor(plate).length > 1 ? (
                            <button onClick={() => setSizeEdit(plate.id)} className="flex items-center gap-1.5 text-[var(--color-text-secondary)] hover:text-[var(--color-accent)] transition-colors" title="Click to cut down to a smaller size">
                              {plate.plate_size || '—'}
                              <Scissors size={11} className="text-[var(--color-text-muted)]" />
                            </button>
                          ) : (
                            <span className="flex items-center gap-1.5 text-[var(--color-text-secondary)]" title="Already at the smallest size — can't be resized further">
                              {plate.plate_size || '—'}
                              <Lock size={10} className="text-[var(--color-text-muted)]" />
                            </span>
                          )}
                          {plate.remarks && (
                            <p className="text-[11px] text-[var(--color-text-muted)] mt-0.5">{plate.remarks.split('\n').pop()}</p>
                          )}
                        </td>
                        <td className="px-4 py-2.5">
                          <select value={plate.status} onChange={e => changeStatus(plate, e.target.value)}
                            className="h-7 px-2 rounded-md border text-xs bg-[var(--color-bg-elevated)] text-[var(--color-text-primary)] border-[var(--color-border)]">
                            {Object.entries(STATUS_CONFIG).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
                          </select>
                        </td>
                        <td className="px-4 py-2.5 text-[var(--color-text-muted)] text-xs">{plate.made_date || '—'}</td>
                        <td className="px-4 py-2.5 text-[var(--color-text-muted)] text-xs">{formatTimeAgo(plate.created_at)}</td>
                        <td className="px-4 py-2.5 text-right">
                          <div className="flex items-center justify-end gap-1.5">
                            {plate.current_job && (
                              <button onClick={() => openReturn(plate)} title="Return this plate (job is done with it)"
                                className="w-8 h-8 flex items-center justify-center rounded-md border border-[var(--color-border)] text-[var(--color-text-muted)] hover:text-[var(--color-success)] hover:border-[var(--color-success)]/30 transition-colors">
                                <RotateCcw size={13} />
                              </button>
                            )}
                            <button onClick={() => openHistory(plate)} title="Assignment history"
                              className="w-8 h-8 flex items-center justify-center rounded-md border border-[var(--color-border)] text-[var(--color-text-muted)] hover:text-[var(--color-accent)] hover:border-[var(--color-accent)]/30 transition-colors">
                              <History size={13} />
                            </button>
                            <button onClick={() => deletePlate(plate)} title="Delete"
                              className="w-8 h-8 flex items-center justify-center rounded-md border border-[var(--color-border)] text-[var(--color-text-muted)] hover:text-[var(--color-danger)] hover:border-[var(--color-danger)]/30 transition-colors">
                              <Trash2 size={13} />
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )
          })}
        </div>
      )}

      {/* Add Plates Modal */}
      <Modal open={addModal} onClose={() => { setAddModal(false); resetAddForm() }} title="Add Plates" size="md"
        footer={<>
          <button onClick={() => { setAddModal(false); resetAddForm() }} className="px-4 h-9 rounded-md border border-[var(--color-border)] text-sm text-[var(--color-text-secondary)] hover:bg-[var(--color-bg-elevated)] transition-colors">Cancel</button>
          <button onClick={submitAdd} disabled={adding}
            className="flex items-center gap-2 px-4 h-9 rounded-md bg-[var(--color-accent)] text-white text-sm font-medium hover:bg-[var(--color-accent-hover)] disabled:opacity-50 transition-colors">
            {adding ? 'Adding…' : 'Add Plates'}
          </button>
        </>}>
        <div className="space-y-4">
          <div className="space-y-1.5">
            <label className="text-sm font-medium text-[var(--color-text-primary)]">Job</label>
            <select className={inputCls} value={addJobId} onChange={e => setAddJobId(e.target.value)}>
              <option value="">— Keep in storage (no job yet) —</option>
              {jobs.map(j => <option key={j.id} value={j.id}>{j.job_number} — {j.job_title}</option>)}
            </select>
          </div>
          <div className="space-y-1.5">
            <label className="text-sm font-medium text-[var(--color-text-primary)]">Size</label>
            <select className={inputCls} value={addSize} onChange={e => setAddSize(e.target.value)}>
              {SIZES.map(s => <option key={s} value={s}>{s}</option>)}
            </select>
          </div>
          <div className="space-y-1.5">
            <label className="text-sm font-medium text-[var(--color-text-primary)]">Machine</label>
            <select className={inputCls} value={addMachineId} onChange={e => setAddMachineId(e.target.value)}>
              <option value="">— None —</option>
              {machines.map(m => <option key={m.id} value={m.id}>{m.name} ({m.code})</option>)}
            </select>
          </div>
          <div className="space-y-1.5">
            <label className="text-sm font-medium text-[var(--color-text-primary)]">Made Date</label>
            <input type="date" className={inputCls} value={addMadeDate} onChange={e => setAddMadeDate(e.target.value)} />
          </div>

          <div className="pt-2 border-t border-[var(--color-border-subtle)] space-y-2">
            <label className="text-sm font-medium text-[var(--color-text-primary)]">Colors</label>
            {colorRows.map((row, i) => {
              const reuseOptions = plates.filter(p => p.status === 'in_storage' && p.plate_size === addSize)
              return (
                <div key={i} className="space-y-1.5">
                  <div className="flex items-center gap-1.5">
                    <input value={row.color} onChange={e => updateColorRow(i, { color: e.target.value })}
                      list="color-specs-datalist" placeholder="e.g. Cyan" className="flex-1 h-8 px-2.5 rounded-md border text-sm bg-[var(--color-bg-elevated)] text-[var(--color-text-primary)] border-[var(--color-border)] placeholder:text-[var(--color-text-muted)] focus:outline-none focus:border-[var(--color-accent)]" />
                    <button onClick={() => updateColorRow(i, { mode: 'new' })}
                      className={cn('h-8 px-2.5 rounded-md border text-xs font-medium transition-colors',
                        row.mode === 'new' ? 'border-[var(--color-accent)] bg-[var(--color-accent)]/10 text-[var(--color-accent)]' : 'border-[var(--color-border)] text-[var(--color-text-secondary)]')}>
                      New
                    </button>
                    <button onClick={() => updateColorRow(i, { mode: 'old' })}
                      className={cn('h-8 px-2.5 rounded-md border text-xs font-medium transition-colors',
                        row.mode === 'old' ? 'border-[var(--color-accent)] bg-[var(--color-accent)]/10 text-[var(--color-accent)]' : 'border-[var(--color-border)] text-[var(--color-text-secondary)]')}>
                      Old
                    </button>
                    {colorRows.length > 1 && (
                      <button onClick={() => removeColorRow(i)} className="w-8 h-8 flex items-center justify-center text-[var(--color-text-muted)] hover:text-[var(--color-danger)]">
                        <Trash2 size={13} />
                      </button>
                    )}
                  </div>
                  {row.mode === 'old' && (
                    <select value={row.existing_plate_id} onChange={e => updateColorRow(i, { existing_plate_id: e.target.value })}
                      className="w-full h-8 px-2.5 rounded-md border text-xs bg-[var(--color-bg-elevated)] text-[var(--color-text-primary)] border-[var(--color-border)]">
                      <option value="">Select existing {addSize} plate…</option>
                      {reuseOptions.map(p => <option key={p.id} value={p.id}>{p.color}</option>)}
                    </select>
                  )}
                </div>
              )
            })}
            <button onClick={addColorRow}
              className="w-full h-8 rounded-md border border-dashed border-[var(--color-border)] text-xs text-[var(--color-text-muted)] hover:border-[var(--color-accent)] hover:text-[var(--color-accent)] transition-colors flex items-center justify-center gap-1.5">
              <Plus size={12} /> Add another color
            </button>
            {colorSpecs.length > 0 && (
              <datalist id="color-specs-datalist">
                {colorSpecs.map(c => <option key={c.id} value={c.name} />)}
              </datalist>
            )}
          </div>
        </div>
      </Modal>

      {/* Plate History Modal */}
      <Modal open={!!historyModal} onClose={() => setHistoryModal(null)} title={historyModal ? `${historyModal.color} — Assignment History` : ''} size="md">
        {historyLoading ? (
          <p className="text-sm text-[var(--color-text-muted)] py-6 text-center">Loading…</p>
        ) : historyRows.length === 0 ? (
          <p className="text-sm text-[var(--color-text-muted)] py-6 text-center">This plate has never been assigned to a job yet.</p>
        ) : (
          <div className="space-y-2">
            {historyRows.map(row => (
              <div key={row.id} className="rounded-lg border border-[var(--color-border)] px-3 py-2.5">
                <div className="flex items-center justify-between">
                  <span className="text-sm font-medium text-[var(--color-text-primary)]">
                    {row.jobs ? `${row.jobs.job_number} — ${row.jobs.job_title}` : 'Unknown job'}
                  </span>
                  <span className={cn('text-xs px-2 py-0.5 rounded-full border font-medium',
                    row.returned_at ? 'border-[var(--color-border)] text-[var(--color-text-muted)]' : 'border-[var(--color-success)]/30 bg-[var(--color-success)]/10 text-[var(--color-success)]')}>
                    {row.returned_at ? 'Returned' : 'Currently With This Job'}
                  </span>
                </div>
                <div className="flex items-center gap-3 mt-1 text-xs text-[var(--color-text-muted)]">
                  <span>{row.is_reused ? 'Reused plate' : 'New plate'}</span>
                  {row.machines && <span>{row.machines.name} ({row.machines.code})</span>}
                  <span>Assigned {formatDateTime(row.assigned_at)}</span>
                  {row.returned_at && <span>Returned {formatDateTime(row.returned_at)}{row.condition_on_return ? ` — ${row.condition_on_return}` : ''}</span>}
                </div>
              </div>
            ))}
          </div>
        )}
      </Modal>

      {/* Return Plate Modal */}
      <Modal open={!!returnModal} onClose={() => setReturnModal(null)} title={returnModal ? `Return ${returnModal.color} Plate` : ''} size="sm"
        footer={<>
          <button onClick={() => setReturnModal(null)} className="px-4 h-9 rounded-md border border-[var(--color-border)] text-sm text-[var(--color-text-secondary)] hover:bg-[var(--color-bg-elevated)] transition-colors">Cancel</button>
          <button onClick={submitReturn} disabled={returning}
            className="flex items-center gap-2 px-4 h-9 rounded-md bg-[var(--color-accent)] text-white text-sm font-medium hover:bg-[var(--color-accent-hover)] disabled:opacity-50 transition-colors">
            {returning ? 'Returning…' : 'Return Plate'}
          </button>
        </>}>
        <div className="space-y-3">
          <p className="text-sm text-[var(--color-text-secondary)]">
            {returnModal?.current_job && `This plate is currently with ${returnModal.current_job.job_number}. Returning it marks that job's assignment as finished.`}
          </p>
          <div className="space-y-1.5">
            <label className="text-sm font-medium text-[var(--color-text-primary)]">Condition on Return</label>
            <select value={returnCondition} onChange={e => setReturnCondition(e.target.value as any)} className={inputCls}>
              <option value="good">Good — back to storage</option>
              <option value="worn">Worn — back to storage</option>
              <option value="damaged">Damaged</option>
            </select>
          </div>
        </div>
      </Modal>
    </div>
  )
}
