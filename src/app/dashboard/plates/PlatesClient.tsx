'use client'
import { useState } from 'react'
import { Plus, Search, ExternalLink, Scissors, Trash2, RotateCcw } from 'lucide-react'
import { cn } from '@/lib/utils/cn'
import { toast } from '@/components/ui/Toast'
import { Modal } from '@/components/ui/Modal'
import { Badge } from '@/components/ui/Badge'
import { EmptyState } from '@/components/ui/EmptyState'
import { formatTimeAgo } from '@/lib/utils/format'

interface Plate {
  id: string; color: string; plate_size: string | null; status: string
  origin_job_id: string | null; remarks: string | null; created_at: string; made_date: string | null
  origin_job?: { job_number: string; job_title: string } | null
}
interface Job { id: string; job_number: string; job_title: string; customers?: { name: string } | null }
interface Machine { id: string; name: string; code: string }
interface ColorSpecOption { id: string; name: string }

const SIZES = ['1030 x 790', '1030 x 770']

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

  const availableForReuse = plates.filter(p => p.status === 'in_storage' && (!addSize || p.plate_size === addSize))

  const filtered = plates.filter(p => {
    if (statusFilter && p.status !== statusFilter) return false
    if (search && !p.color.toLowerCase().includes(search.toLowerCase())) return false
    return true
  })

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
      if (!res.ok) throw new Error()
      const { data } = await res.json()
      setPlates(prev => prev.map(p => p.id === plate.id ? { ...p, plate_size: data.plate_size, remarks: data.remarks } : p))
      toast.success(`Resized to ${newSize}`)
    } catch { toast.error('Failed to change size') }
    finally { setSizeEdit(null) }
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
        <button onClick={() => setAddModal(true)}
          className="flex items-center gap-1.5 px-4 h-9 rounded-md bg-[var(--color-accent)] text-white text-sm font-medium hover:bg-[var(--color-accent-hover)] transition-colors ml-auto">
          <Plus size={15} /> Add Plates
        </button>
      </div>

      {/* Table */}
      {filtered.length === 0 ? (
        <EmptyState title="No plates found" description="Add your first plate to get started" />
      ) : (
        <div className="rounded-xl border border-[var(--color-border)] bg-[var(--color-bg-secondary)] overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-xs text-[var(--color-text-muted)] border-b border-[var(--color-border)]">
                <th className="px-4 py-2.5 font-medium">Color</th>
                <th className="px-4 py-2.5 font-medium">Size</th>
                <th className="px-4 py-2.5 font-medium">Job</th>
                <th className="px-4 py-2.5 font-medium">Status</th>
                <th className="px-4 py-2.5 font-medium">Made Date</th>
                <th className="px-4 py-2.5 font-medium">Added</th>
                <th className="px-4 py-2.5 font-medium"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[var(--color-border-subtle)]">
              {filtered.map(plate => {
                const cfg = STATUS_CONFIG[plate.status] || STATUS_CONFIG.in_storage
                return (
                  <tr key={plate.id} className="hover:bg-[var(--color-bg-elevated)]/50 transition-colors">
                    <td className="px-4 py-2.5 font-medium text-[var(--color-text-primary)]">{plate.color}</td>
                    <td className="px-4 py-2.5">
                      {sizeEdit === plate.id ? (
                        <select autoFocus defaultValue={plate.plate_size || SIZES[0]} onBlur={e => changeSize(plate, e.target.value)}
                          onChange={e => changeSize(plate, e.target.value)}
                          className="h-7 px-2 rounded-md border text-xs bg-[var(--color-bg-elevated)] text-[var(--color-text-primary)] border-[var(--color-accent)]">
                          {SIZES.map(s => <option key={s} value={s}>{s}</option>)}
                        </select>
                      ) : (
                        <button onClick={() => setSizeEdit(plate.id)} className="flex items-center gap-1.5 text-[var(--color-text-secondary)] hover:text-[var(--color-accent)] transition-colors" title="Click to change size">
                          {plate.plate_size || '—'}
                          <Scissors size={11} className="text-[var(--color-text-muted)]" />
                        </button>
                      )}
                      {plate.remarks && (
                        <p className="text-[11px] text-[var(--color-text-muted)] mt-0.5">{plate.remarks.split('\n').pop()}</p>
                      )}
                    </td>
                    <td className="px-4 py-2.5 text-[var(--color-text-muted)]">
                      {plate.origin_job ? `${plate.origin_job.job_number}` : '—'}
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
                      <button onClick={() => deletePlate(plate)} title="Delete"
                        className="w-8 h-8 flex items-center justify-center rounded-md border border-[var(--color-border)] text-[var(--color-text-muted)] hover:text-[var(--color-danger)] hover:border-[var(--color-danger)]/30 transition-colors ml-auto">
                        <Trash2 size={13} />
                      </button>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
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
    </div>
  )
}
