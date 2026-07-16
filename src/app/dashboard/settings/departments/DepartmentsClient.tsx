'use client'
import { useState } from 'react'
import { Plus, Pencil, Trash2, Check, X, Users } from 'lucide-react'
import { cn } from '@/lib/utils/cn'
import { toast } from '@/components/ui/Toast'
import { ConfirmDialog } from '@/components/ui/Modal'

interface Department { id: string; name: string; code: string; description: string | null; is_active: boolean }

export default function DepartmentsClient({ initialDepartments }: { initialDepartments: Department[] }) {
  const [departments, setDepartments] = useState(initialDepartments)
  const [editingId, setEditingId] = useState<string | 'new' | null>(null)
  const [form, setForm] = useState({ name: '', code: '', description: '' })
  const [loading, setLoading] = useState(false)
  const [deleteTarget, setDeleteTarget] = useState<Department | null>(null)

  const inputCls = 'h-9 px-3 rounded-md border text-sm bg-[var(--color-bg-elevated)] text-[var(--color-text-primary)] border-[var(--color-border)] focus:outline-none focus:border-[var(--color-accent)] focus:ring-1 focus:ring-[var(--color-accent)] transition-colors'

  const save = async () => {
    if (!form.name || !form.code) { toast.error('Name and Code are required'); return }
    setLoading(true)
    try {
      const isNew = editingId === 'new'
      const res = await fetch('/api/v1/departments', {
        method: isNew ? 'POST' : 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(isNew ? form : { id: editingId, ...form }),
      })
      if (!res.ok) { const e = await res.json(); throw new Error(e.error) }
      const { data } = await res.json()
      setDepartments(prev => isNew ? [...prev, data] : prev.map(d => d.id === data.id ? data : d))
      setEditingId(null)
      toast.success(isNew ? 'Department added' : 'Department updated')
    } catch (e: any) { toast.error(e.message || 'Failed to save') }
    finally { setLoading(false) }
  }

  const confirmDelete = async () => {
    if (!deleteTarget) return
    setLoading(true)
    try {
      const res = await fetch('/api/v1/departments', { method: 'DELETE', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id: deleteTarget.id }) })
      if (!res.ok) throw new Error()
      setDepartments(prev => prev.filter(d => d.id !== deleteTarget.id))
      toast.success('Department removed')
    } catch { toast.error('Failed to delete') }
    finally { setLoading(false); setDeleteTarget(null) }
  }

  return (
    <div className="rounded-xl border border-[var(--color-border)] bg-[var(--color-bg-secondary)] overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between px-5 py-4 border-b border-[var(--color-border)]">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-lg bg-[var(--color-accent)]/10 flex items-center justify-center">
            <Users size={16} className="text-[var(--color-accent)]" />
          </div>
          <span className="text-base font-semibold text-[var(--color-text-primary)]">
            {departments.length} Department{departments.length !== 1 ? 's' : ''}
          </span>
        </div>
        <button onClick={() => { setForm({ name: '', code: '', description: '' }); setEditingId('new') }}
          className="flex items-center gap-1.5 px-3 h-8 rounded-md bg-[var(--color-accent)] text-white text-sm font-medium hover:bg-[var(--color-accent-hover)] transition-colors">
          <Plus size={14} /> Add Department
        </button>
      </div>

      {/* Column headers */}
      <div className="grid grid-cols-12 gap-3 px-5 py-2 bg-[var(--color-bg-elevated)] border-b border-[var(--color-border-subtle)] text-xs font-semibold text-[var(--color-text-muted)] uppercase tracking-wider">
        <div className="col-span-4">Name</div>
        <div className="col-span-2">Code</div>
        <div className="col-span-4">Description</div>
        <div className="col-span-2 text-right">Actions</div>
      </div>

      {/* Rows */}
      <div className="divide-y divide-[var(--color-border-subtle)]">
        {departments.map((dept, idx) => (
          <div key={dept.id} className={cn('grid grid-cols-12 gap-3 px-5 py-3 items-center hover:bg-[var(--color-bg-elevated)]/40', idx % 2 === 1 && 'bg-[var(--color-bg-elevated)]/20')}>
            {editingId === dept.id ? (
              <>
                <input autoFocus className={cn(inputCls, 'col-span-4')} value={form.name} onChange={e => setForm(p => ({ ...p, name: e.target.value }))} placeholder="Department name" />
                <input className={cn(inputCls, 'col-span-2')} value={form.code} onChange={e => setForm(p => ({ ...p, code: e.target.value.toUpperCase() }))} placeholder="CODE" />
                <input className={cn(inputCls, 'col-span-3')} value={form.description} onChange={e => setForm(p => ({ ...p, description: e.target.value }))} placeholder="Description" />
                <div className="col-span-3 flex justify-end gap-1">
                  <button onClick={save} disabled={loading} className="w-8 h-8 flex items-center justify-center rounded-md bg-[var(--color-success)] text-white hover:opacity-90 disabled:opacity-50"><Check size={13} /></button>
                  <button onClick={() => setEditingId(null)} className="w-8 h-8 flex items-center justify-center rounded-md border border-[var(--color-border)] text-[var(--color-text-secondary)] hover:bg-[var(--color-bg-elevated)]"><X size={13} /></button>
                </div>
              </>
            ) : (
              <>
                <div className="col-span-4 text-sm font-medium text-[var(--color-text-primary)]">{dept.name}</div>
                <div className="col-span-2"><span className="text-xs font-mono bg-[var(--color-bg-elevated)] border border-[var(--color-border)] px-2 py-0.5 rounded text-[var(--color-text-secondary)]">{dept.code}</span></div>
                <div className="col-span-4 text-sm text-[var(--color-text-muted)] truncate">{dept.description || '—'}</div>
                <div className="col-span-2 flex justify-end gap-1">
                  <button onClick={() => { setForm({ name: dept.name, code: dept.code, description: dept.description ?? '' }); setEditingId(dept.id) }}
                    className="w-8 h-8 flex items-center justify-center rounded-md text-[var(--color-text-muted)] hover:bg-[var(--color-bg-elevated)] hover:text-[var(--color-text-primary)] transition-colors">
                    <Pencil size={13} />
                  </button>
                  <button onClick={() => setDeleteTarget(dept)}
                    className="w-8 h-8 flex items-center justify-center rounded-md text-[var(--color-text-muted)] hover:bg-[var(--color-danger)]/10 hover:text-[var(--color-danger)] transition-colors">
                    <Trash2 size={13} />
                  </button>
                </div>
              </>
            )}
          </div>
        ))}

        {/* New row inline */}
        {editingId === 'new' && (
          <div className="grid grid-cols-12 gap-3 px-5 py-3 items-center bg-[var(--color-accent)]/5 border-t border-[var(--color-accent)]/20">
            <input autoFocus className={cn(inputCls, 'col-span-4')} value={form.name} onChange={e => setForm(p => ({ ...p, name: e.target.value }))} placeholder="Department name *" />
            <input className={cn(inputCls, 'col-span-2')} value={form.code} onChange={e => setForm(p => ({ ...p, code: e.target.value.toUpperCase() }))} placeholder="CODE *" />
            <input className={cn(inputCls, 'col-span-3')} value={form.description} onChange={e => setForm(p => ({ ...p, description: e.target.value }))} placeholder="Description" />
            <div className="col-span-3 flex justify-end gap-1">
              <button onClick={save} disabled={loading} className="px-3 h-9 rounded-md bg-[var(--color-accent)] text-white text-sm font-medium hover:bg-[var(--color-accent-hover)] disabled:opacity-50 transition-colors">Save</button>
              <button onClick={() => setEditingId(null)} className="px-3 h-9 rounded-md border border-[var(--color-border)] text-sm text-[var(--color-text-secondary)] hover:bg-[var(--color-bg-elevated)] transition-colors">Cancel</button>
            </div>
          </div>
        )}

        {departments.length === 0 && editingId !== 'new' && (
          <div className="px-5 py-10 text-center text-sm text-[var(--color-text-muted)]">No departments yet.</div>
        )}
      </div>

      <ConfirmDialog
        open={!!deleteTarget}
        onClose={() => setDeleteTarget(null)}
        onConfirm={confirmDelete}
        title="Delete Department"
        message={`Remove "${deleteTarget?.name}" department? Users assigned to this department will need to be reassigned.`}
        loading={loading}
      />
    </div>
  )
}
