'use client'
import { useState } from 'react'
import { Plus, Pencil, Trash2, Cog, Zap, CheckCircle2, AlertTriangle, Wrench, History, Clock } from 'lucide-react'
import { cn } from '@/lib/utils/cn'
import { toast } from '@/components/ui/Toast'
import { Modal, ConfirmDialog } from '@/components/ui/Modal'

interface Machine {
  id: string; name: string; code: string; machine_type: string
  capacity_per_hour: number | null; status: string; notes: string | null; is_active: boolean
}
interface DowntimeEntry {
  id: string; category: string; reason: string | null; started_at: string; ended_at: string | null
  duration_minutes: number | null; resolution_notes: string | null
  reported?: { full_name: string } | null; resolved?: { full_name: string } | null
}
interface MaintenanceEntry {
  id: string; maintenance_type: string; status: string; scheduled_date: string | null
  completed_date: string | null; description: string; performed_by: string | null; cost: number | null
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
  const [logMachine, setLogMachine] = useState<Machine | null>(null)
  const [downtimeEntries, setDowntimeEntries] = useState<DowntimeEntry[]>([])
  const [maintenanceEntries, setMaintenanceEntries] = useState<MaintenanceEntry[]>([])
  const [logTab, setLogTab] = useState<'downtime' | 'maintenance'>('downtime')
  const [logLoading, setLogLoading] = useState(false)
  const [downtimeForm, setDowntimeForm] = useState({ category: 'breakdown', reason: '' })
  const [maintenanceForm, setMaintenanceForm] = useState({ maintenance_type: 'preventive', status: 'scheduled', scheduled_date: '', description: '', performed_by: '', cost: '', next_due_date: '' })

  const openLog = async (m: Machine) => {
    setLogMachine(m)
    setLogTab('downtime')
    setLogLoading(true)
    try {
      const [dRes, mRes] = await Promise.all([
        fetch(`/api/v1/machines/${m.id}/downtime`).then(r => r.json()),
        fetch(`/api/v1/machines/${m.id}/maintenance`).then(r => r.json()),
      ])
      setDowntimeEntries(dRes.data ?? [])
      setMaintenanceEntries(mRes.data ?? [])
    } catch { toast.error('Failed to load log') }
    finally { setLogLoading(false) }
  }

  const logDowntime = async () => {
    if (!logMachine) return
    setLogLoading(true)
    try {
      const res = await fetch(`/api/v1/machines/${logMachine.id}/downtime`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(downtimeForm),
      })
      if (!res.ok) { const e = await res.json(); throw new Error(e.error) }
      const { data } = await res.json()
      setDowntimeEntries(prev => [data, ...prev])
      setMachines(prev => prev.map(x => x.id === logMachine.id ? { ...x, status: downtimeForm.category === 'breakdown' ? 'breakdown' : 'maintenance' } : x))
      setDowntimeForm({ category: 'breakdown', reason: '' })
      toast.success('Downtime logged')
    } catch (e: any) { toast.error(e.message || 'Failed') }
    finally { setLogLoading(false) }
  }

  const closeDowntime = async (entry: DowntimeEntry) => {
    if (!logMachine) return
    setLogLoading(true)
    try {
      const res = await fetch(`/api/v1/downtime/${entry.id}/close`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ new_machine_status: 'idle' }),
      })
      if (!res.ok) { const e = await res.json(); throw new Error(e.error) }
      const { data } = await res.json()
      setDowntimeEntries(prev => prev.map(x => x.id === entry.id ? data : x))
      setMachines(prev => prev.map(x => x.id === logMachine.id ? { ...x, status: 'idle' } : x))
      toast.success('Downtime resolved — machine back to idle')
    } catch (e: any) { toast.error(e.message || 'Failed') }
    finally { setLogLoading(false) }
  }

  const logMaintenance = async () => {
    if (!logMachine) return
    if (!maintenanceForm.description) { toast.error('Description required'); return }
    setLogLoading(true)
    try {
      const res = await fetch(`/api/v1/machines/${logMachine.id}/maintenance`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(maintenanceForm),
      })
      if (!res.ok) { const e = await res.json(); throw new Error(e.error) }
      const { data } = await res.json()
      setMaintenanceEntries(prev => [data, ...prev])
      setMaintenanceForm({ maintenance_type: 'preventive', status: 'scheduled', scheduled_date: '', description: '', performed_by: '', cost: '', next_due_date: '' })
      toast.success('Maintenance record saved')
    } catch (e: any) { toast.error(e.message || 'Failed') }
    finally { setLogLoading(false) }
  }
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
                      <button onClick={() => openLog(machine)} title="Downtime / Maintenance Log"
                        className="w-8 h-8 flex items-center justify-center rounded-md text-[var(--color-text-muted)] hover:bg-[var(--color-bg-elevated)] hover:text-[var(--color-warning)] transition-colors">
                        <History size={13} />
                      </button>
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

      {/* Downtime / Maintenance Log Modal */}
      <Modal open={!!logMachine} onClose={() => setLogMachine(null)} title={logMachine ? `Log — ${logMachine.name}` : ''} size="lg">
        {logMachine && (
          <div className="space-y-4">
            <div className="flex gap-1 bg-[var(--color-bg-elevated)] border border-[var(--color-border)] rounded-lg p-1 w-fit">
              {(['downtime', 'maintenance'] as const).map(t => (
                <button key={t} onClick={() => setLogTab(t)}
                  className={cn('px-3 h-7 rounded-md text-xs font-medium capitalize transition-all', logTab === t ? 'bg-[var(--color-accent)] text-white' : 'text-[var(--color-text-secondary)]')}>
                  {t}
                </button>
              ))}
            </div>

            {logTab === 'downtime' && (
              <div className="space-y-3">
                {!downtimeEntries.some(e => !e.ended_at) && (
                  <div className="rounded-lg border border-[var(--color-border)] p-3 space-y-2">
                    <p className="text-xs font-medium text-[var(--color-text-primary)]">Log New Downtime</p>
                    <div className="grid grid-cols-2 gap-2">
                      <select className={inputCls} value={downtimeForm.category} onChange={e => setDowntimeForm(p => ({ ...p, category: e.target.value }))}>
                        <option value="breakdown">Breakdown</option>
                        <option value="planned_maintenance">Planned Maintenance</option>
                        <option value="no_operator">No Operator</option>
                        <option value="material_shortage">Material Shortage</option>
                        <option value="power_outage">Power Outage</option>
                        <option value="other">Other</option>
                      </select>
                      <input className={inputCls} placeholder="Reason (optional)" value={downtimeForm.reason} onChange={e => setDowntimeForm(p => ({ ...p, reason: e.target.value }))} />
                    </div>
                    <button onClick={logDowntime} disabled={logLoading}
                      className="px-3 h-8 rounded-md bg-[var(--color-danger)] text-white text-xs font-medium hover:opacity-90 disabled:opacity-50">
                      Log Downtime
                    </button>
                  </div>
                )}
                <div className="max-h-80 overflow-y-auto space-y-2">
                  {downtimeEntries.length === 0 ? (
                    <p className="text-sm text-[var(--color-text-muted)] text-center py-6">No downtime logged yet.</p>
                  ) : downtimeEntries.map(e => (
                    <div key={e.id} className="flex items-center justify-between rounded-lg border border-[var(--color-border)] px-3 py-2">
                      <div>
                        <p className="text-sm font-medium text-[var(--color-text-primary)] capitalize">{e.category.replace(/_/g, ' ')}{e.reason ? ` — ${e.reason}` : ''}</p>
                        <p className="text-xs text-[var(--color-text-muted)]">
                          {new Date(e.started_at).toLocaleString('en-PK')}
                          {e.ended_at ? ` — ${e.duration_minutes ?? '?'} min` : ' — ongoing'}
                          {e.reported?.full_name ? ` · ${e.reported.full_name}` : ''}
                        </p>
                      </div>
                      {!e.ended_at && (
                        <button onClick={() => closeDowntime(e)} disabled={logLoading}
                          className="px-3 h-7 rounded-md bg-[var(--color-success)] text-white text-xs font-medium hover:opacity-90 disabled:opacity-50 flex-shrink-0">
                          Resolve
                        </button>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            )}

            {logTab === 'maintenance' && (
              <div className="space-y-3">
                <div className="rounded-lg border border-[var(--color-border)] p-3 space-y-2">
                  <p className="text-xs font-medium text-[var(--color-text-primary)]">Log Maintenance</p>
                  <div className="grid grid-cols-2 gap-2">
                    <select className={inputCls} value={maintenanceForm.maintenance_type} onChange={e => setMaintenanceForm(p => ({ ...p, maintenance_type: e.target.value }))}>
                      <option value="preventive">Preventive</option>
                      <option value="corrective">Corrective</option>
                      <option value="inspection">Inspection</option>
                      <option value="calibration">Calibration</option>
                      <option value="other">Other</option>
                    </select>
                    <select className={inputCls} value={maintenanceForm.status} onChange={e => setMaintenanceForm(p => ({ ...p, status: e.target.value }))}>
                      <option value="scheduled">Scheduled</option>
                      <option value="in_progress">In Progress</option>
                      <option value="completed">Completed</option>
                      <option value="cancelled">Cancelled</option>
                    </select>
                  </div>
                  <input className={inputCls} placeholder="Description *" value={maintenanceForm.description} onChange={e => setMaintenanceForm(p => ({ ...p, description: e.target.value }))} />
                  <div className="grid grid-cols-3 gap-2">
                    <input type="date" className={inputCls} value={maintenanceForm.scheduled_date} onChange={e => setMaintenanceForm(p => ({ ...p, scheduled_date: e.target.value }))} placeholder="Scheduled date" />
                    <input className={inputCls} placeholder="Performed by" value={maintenanceForm.performed_by} onChange={e => setMaintenanceForm(p => ({ ...p, performed_by: e.target.value }))} />
                    <input type="number" className={inputCls} placeholder="Cost (PKR)" value={maintenanceForm.cost} onChange={e => setMaintenanceForm(p => ({ ...p, cost: e.target.value }))} />
                  </div>
                  <input type="date" className={inputCls} value={maintenanceForm.next_due_date} onChange={e => setMaintenanceForm(p => ({ ...p, next_due_date: e.target.value }))} placeholder="Next due date (recurring)" />
                  <button onClick={logMaintenance} disabled={logLoading}
                    className="px-3 h-8 rounded-md bg-[var(--color-accent)] text-white text-xs font-medium hover:bg-[var(--color-accent-hover)] disabled:opacity-50">
                    Save
                  </button>
                </div>
                <div className="max-h-72 overflow-y-auto space-y-2">
                  {maintenanceEntries.length === 0 ? (
                    <p className="text-sm text-[var(--color-text-muted)] text-center py-6">No maintenance records yet.</p>
                  ) : maintenanceEntries.map(e => (
                    <div key={e.id} className="rounded-lg border border-[var(--color-border)] px-3 py-2">
                      <div className="flex items-center justify-between">
                        <p className="text-sm font-medium text-[var(--color-text-primary)] capitalize">{e.maintenance_type} — {e.description}</p>
                        <span className="text-xs px-2 py-0.5 rounded-full border border-[var(--color-border)] capitalize flex-shrink-0">{e.status.replace('_', ' ')}</span>
                      </div>
                      <p className="text-xs text-[var(--color-text-muted)] mt-0.5">
                        {e.scheduled_date ? `Scheduled ${e.scheduled_date}` : ''}{e.completed_date ? ` · Completed ${e.completed_date}` : ''}
                        {e.performed_by ? ` · ${e.performed_by}` : ''}{e.cost ? ` · PKR ${Number(e.cost).toLocaleString()}` : ''}
                      </p>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}
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
