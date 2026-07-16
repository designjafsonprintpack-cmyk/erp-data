'use client'
import { useState } from 'react'
import { Plus, Pencil, Trash2, Cog, Zap, CheckCircle2, AlertTriangle, Wrench } from 'lucide-react'
import { cn } from '@/lib/utils/cn'
import { toast } from '@/components/ui/Toast'
import { Modal, ConfirmDialog } from '@/components/ui/Modal'

interface Machine {
  id: string; name: string; code: string; machine_type: string
  capacity_per_hour: number | null; status: string; notes: string | null; is_active: boolean
}

const MACHINE_TYPES = [
  { value: 'printing',     label: 'Printing' },
  { value: 'diecutting',   label: 'Die Cutting' },
  { value: 'foldergluing', label: 'Folder Gluing' },
  { value: 'lamination',   label: 'Lamination' },
  { value: 'hotfoil',      label: 'Hot Foil' },
  { value: 'other',        label: 'Other' },
]

const STATUS_CONFIG: Record<string, { label: string; color: string; icon: React.ReactNode }> = {
  running:     { label: 'Running',     color: 'text-[var(--color-success)] bg-[var(--color-success)]/10 border-[var(--color-success)]/20',     icon: <Zap size={11} /> },
  idle:        { label: 'Idle',        color: 'text-[var(--color-text-muted)] bg-[var(--color-bg-elevated)] border-[var(--color-border)]',        icon: <CheckCircle2 size={11} /> },
  maintenance: { label: 'Maintenance', color: 'text-[var(--color-warning)] bg-[var(--color-warning)]/10 border-[var(--color-warning)]/20',       icon: <Wrench size={11} /> },
  breakdown:   { label: 'Breakdown',   color: 'text-[var(--color-danger)] bg-[var(--color-danger)]/10 border-[var(--color-danger)]/20',           icon: <AlertTriangle size={11} /> },
}

const EMPTY_FORM = { name: '', code: '', machine_type: 'printing', capacity_per_hour: '', status: 'idle', notes: '' }

export default function MachinesClient({ initialMachines }: { initialMachines: Machine[] }) {
  const [machines, setMachines] = useState(initialMachines)
  const [modalOpen, setModalOpen] = useState(false)
  const [editingMachine, setEditingMachine] = useState<Machine | null>(null)
  const [form, setForm] = useState(EMPTY_FORM)
  const [loading, setLoading] = useState(false)
  const [deleteTarget, setDeleteTarget] = useState<Machine | null>(null)
  const [activeType, setActiveType] = useState('all')

  const grouped = MACHINE_TYPES.reduce((acc, t) => {
    acc[t.value] = machines.filter(m => m.machine_type === t.value)
    return acc
  }, {} as Record<string, Machine[]>)

  const openNew = () => { setEditingMachine(null); setForm(EMPTY_FORM); setModalOpen(true) }
  const openEdit = (m: Machine) => {
    setEditingMachine(m)
    setForm({ name: m.name, code: m.code, machine_type: m.machine_type, capacity_per_hour: String(m.capacity_per_hour ?? ''), status: m.status, notes: m.notes ?? '' })
    setModalOpen(true)
  }

  const save = async () => {
    if (!form.name || !form.code) { toast.error('Name and Code are required'); return }
    setLoading(true)
    try {
      const payload = { ...form, capacity_per_hour: form.capacity_per_hour ? parseInt(form.capacity_per_hour) : null }
      const isNew = !editingMachine
      const res = await fetch('/api/v1/machines', {
        method: isNew ? 'POST' : 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(isNew ? payload : { id: editingMachine.id, ...payload }),
      })
      if (!res.ok) { const e = await res.json(); throw new Error(e.error) }
      const { data } = await res.json()
      setMachines(prev => isNew ? [...prev, data] : prev.map(m => m.id === data.id ? data : m))
      setModalOpen(false)
      toast.success(isNew ? 'Machine added' : 'Machine updated')
    } catch (e: any) { toast.error(e.message || 'Failed to save') }
    finally { setLoading(false) }
  }

  const confirmDelete = async () => {
    if (!deleteTarget) return
    setLoading(true)
    try {
      const res = await fetch('/api/v1/machines', { method: 'DELETE', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id: deleteTarget.id }) })
      if (!res.ok) throw new Error()
      setMachines(prev => prev.filter(m => m.id !== deleteTarget.id))
      toast.success('Machine removed')
    } catch { toast.error('Failed to delete') }
    finally { setLoading(false); setDeleteTarget(null) }
  }

  const inputCls = 'w-full h-9 px-3 rounded-md border text-sm bg-[var(--color-bg-elevated)] text-[var(--color-text-primary)] border-[var(--color-border)] focus:outline-none focus:border-[var(--color-accent)] focus:ring-1 focus:ring-[var(--color-accent)] transition-colors'

  const filteredTypes = activeType === 'all' ? MACHINE_TYPES : MACHINE_TYPES.filter(t => t.value === activeType)

  return (
    <div className="space-y-4">
      {/* Type filter tabs */}
      <div className="flex items-center gap-2 flex-wrap">
        <button onClick={() => setActiveType('all')}
          className={cn('px-3 h-8 rounded-md text-sm font-medium transition-colors border',
            activeType === 'all' ? 'bg-[var(--color-accent)] text-white border-transparent' : 'bg-[var(--color-bg-secondary)] text-[var(--color-text-secondary)] border-[var(--color-border)] hover:text-[var(--color-text-primary)]')}>
          All ({machines.length})
        </button>
        {MACHINE_TYPES.map(t => (
          <button key={t.value} onClick={() => setActiveType(t.value)}
            className={cn('px-3 h-8 rounded-md text-sm font-medium transition-colors border',
              activeType === t.value ? 'bg-[var(--color-accent)] text-white border-transparent' : 'bg-[var(--color-bg-secondary)] text-[var(--color-text-secondary)] border-[var(--color-border)] hover:text-[var(--color-text-primary)]')}>
            {t.label} ({grouped[t.value]?.length ?? 0})
          </button>
        ))}
        <button onClick={openNew}
          className="ml-auto flex items-center gap-1.5 px-3 h-8 rounded-md bg-[var(--color-accent)] text-white text-sm font-medium hover:bg-[var(--color-accent-hover)] transition-colors">
          <Plus size={14} /> Add Machine
        </button>
      </div>

      {/* Machine cards by type */}
      {filteredTypes.map(type => {
        const typeMachines = grouped[type.value] ?? []
        if (!typeMachines.length) return null
        return (
          <div key={type.value} className="rounded-xl border border-[var(--color-border)] bg-[var(--color-bg-secondary)] overflow-hidden">
            <div className="flex items-center gap-3 px-5 py-3 border-b border-[var(--color-border)] bg-[var(--color-bg-elevated)]">
              <Cog size={15} className="text-[var(--color-text-muted)]" />
              <span className="text-sm font-semibold text-[var(--color-text-primary)]">{type.label}</span>
              <span className="text-xs text-[var(--color-text-muted)]">{typeMachines.length} machine{typeMachines.length !== 1 ? 's' : ''}</span>
            </div>
            <div className="divide-y divide-[var(--color-border-subtle)]">
              {typeMachines.map(machine => {
                const statusCfg = STATUS_CONFIG[machine.status] || STATUS_CONFIG.idle
                return (
                  <div key={machine.id} className="flex items-center gap-4 px-5 py-3.5 hover:bg-[var(--color-bg-elevated)]/40 transition-colors">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-3">
                        <span className="text-sm font-medium text-[var(--color-text-primary)]">{machine.name}</span>
                        <span className="text-xs font-mono bg-[var(--color-bg-elevated)] border border-[var(--color-border)] px-2 py-0.5 rounded text-[var(--color-text-secondary)]">{machine.code}</span>
                        <span className={cn('flex items-center gap-1 text-xs px-2 py-0.5 rounded-full border font-medium', statusCfg.color)}>
                          {statusCfg.icon} {statusCfg.label}
                        </span>
                      </div>
                      {(machine.capacity_per_hour || machine.notes) && (
                        <div className="flex items-center gap-4 mt-1">
                          {machine.capacity_per_hour && <span className="text-xs text-[var(--color-text-muted)]">Capacity: {machine.capacity_per_hour.toLocaleString()}/hr</span>}
                          {machine.notes && <span className="text-xs text-[var(--color-text-muted)] truncate max-w-xs">{machine.notes}</span>}
                        </div>
                      )}
                    </div>
                    <div className="flex items-center gap-1 flex-shrink-0">
                      <button onClick={() => openEdit(machine)}
                        className="w-8 h-8 flex items-center justify-center rounded-md text-[var(--color-text-muted)] hover:bg-[var(--color-bg-elevated)] hover:text-[var(--color-text-primary)] transition-colors">
                        <Pencil size={13} />
                      </button>
                      <button onClick={() => setDeleteTarget(machine)}
                        className="w-8 h-8 flex items-center justify-center rounded-md text-[var(--color-text-muted)] hover:bg-[var(--color-danger)]/10 hover:text-[var(--color-danger)] transition-colors">
                        <Trash2 size={13} />
                      </button>
                    </div>
                  </div>
                )
              })}
            </div>
          </div>
        )
      })}

      {machines.length === 0 && (
        <div className="rounded-xl border border-[var(--color-border)] bg-[var(--color-bg-secondary)] p-12 text-center">
          <Cog size={32} className="text-[var(--color-text-muted)] opacity-40 mx-auto mb-3" />
          <p className="text-sm text-[var(--color-text-muted)]">No machines added yet. Click Add Machine to get started.</p>
        </div>
      )}

      {/* Add/Edit Modal */}
      <Modal
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        title={editingMachine ? 'Edit Machine' : 'Add Machine'}
        size="md"
        footer={
          <>
            <button onClick={() => setModalOpen(false)} className="px-4 h-9 rounded-md border border-[var(--color-border)] text-sm text-[var(--color-text-secondary)] hover:bg-[var(--color-bg-elevated)] transition-colors">Cancel</button>
            <button onClick={save} disabled={loading || !form.name || !form.code}
              className="px-4 h-9 rounded-md bg-[var(--color-accent)] text-white text-sm font-medium hover:bg-[var(--color-accent-hover)] disabled:opacity-50 transition-colors">
              {loading ? 'Saving…' : editingMachine ? 'Save Changes' : 'Add Machine'}
            </button>
          </>
        }
      >
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <label className="text-sm font-medium text-[var(--color-text-primary)]">Machine Name <span className="text-[var(--color-danger)]">*</span></label>
              <input className={inputCls} value={form.name} onChange={e => setForm(p => ({ ...p, name: e.target.value }))} placeholder="e.g. MP-1 (5 Color)" />
            </div>
            <div className="space-y-1.5">
              <label className="text-sm font-medium text-[var(--color-text-primary)]">Machine Code <span className="text-[var(--color-danger)]">*</span></label>
              <input className={inputCls} value={form.code} onChange={e => setForm(p => ({ ...p, code: e.target.value.toUpperCase() }))} placeholder="e.g. MP-1" />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <label className="text-sm font-medium text-[var(--color-text-primary)]">Machine Type <span className="text-[var(--color-danger)]">*</span></label>
              <select className={inputCls} value={form.machine_type} onChange={e => setForm(p => ({ ...p, machine_type: e.target.value }))}>
                {MACHINE_TYPES.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
              </select>
            </div>
            <div className="space-y-1.5">
              <label className="text-sm font-medium text-[var(--color-text-primary)]">Status</label>
              <select className={inputCls} value={form.status} onChange={e => setForm(p => ({ ...p, status: e.target.value }))}>
                {Object.entries(STATUS_CONFIG).map(([v, c]) => <option key={v} value={v}>{c.label}</option>)}
              </select>
            </div>
          </div>
          <div className="space-y-1.5">
            <label className="text-sm font-medium text-[var(--color-text-primary)]">Capacity / Hour</label>
            <input className={inputCls} type="number" value={form.capacity_per_hour} onChange={e => setForm(p => ({ ...p, capacity_per_hour: e.target.value }))} placeholder="e.g. 3000 sheets/hr" />
          </div>
          <div className="space-y-1.5">
            <label className="text-sm font-medium text-[var(--color-text-primary)]">Notes</label>
            <input className={inputCls} value={form.notes} onChange={e => setForm(p => ({ ...p, notes: e.target.value }))} placeholder="Optional notes about this machine" />
          </div>
        </div>
      </Modal>

      <ConfirmDialog
        open={!!deleteTarget}
        onClose={() => setDeleteTarget(null)}
        onConfirm={confirmDelete}
        title="Remove Machine"
        message={`Remove ${deleteTarget?.name} from your machine registry? This will not delete historical production records.`}
        loading={loading}
      />
    </div>
  )
}
