'use client'
import { useState } from 'react'
import { Plus, Pencil, Trash2, Check, X, Circle } from 'lucide-react'
import { cn } from '@/lib/utils/cn'
import { toast } from '@/components/ui/Toast'
import { ConfirmDialog } from '@/components/ui/Modal'

interface JobStatus { id: string; name: string; slug: string; color_hex: string; sort_order: number; is_system: boolean; is_active: boolean }
interface DelayReason { id: string; name: string; category: string; is_active: boolean }

const DELAY_CATEGORIES = ['material', 'machine', 'manpower', 'artwork', 'customer', 'production', 'facility', 'general']

function StatusRow({ status, onEdit, onDelete }: { status: JobStatus; onEdit: () => void; onDelete: () => void }) {
  return (
    <div className="flex items-center gap-4 px-5 py-3 hover:bg-[var(--color-bg-elevated)]/40">
      <div className="w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0" style={{ backgroundColor: status.color_hex + '20', border: `2px solid ${status.color_hex}40` }}>
        <Circle size={12} style={{ fill: status.color_hex, color: status.color_hex }} />
      </div>
      <div className="flex-1">
        <div className="flex items-center gap-2">
          <span className="text-sm font-medium text-[var(--color-text-primary)]">{status.name}</span>
          <code className="text-xs font-mono bg-[var(--color-bg-elevated)] border border-[var(--color-border)] px-1.5 py-0.5 rounded text-[var(--color-text-muted)]">{status.slug}</code>
          {status.is_system && <span className="text-xs text-[var(--color-info)] bg-[var(--color-info)]/10 border border-[var(--color-info)]/20 px-1.5 py-0.5 rounded">System</span>}
        </div>
      </div>
      <div className="flex items-center gap-2">
        <div className="w-6 h-6 rounded" style={{ backgroundColor: status.color_hex }} title={status.color_hex} />
        <span className="text-xs font-mono text-[var(--color-text-muted)] w-16">{status.color_hex}</span>
      </div>
      <div className="flex items-center gap-1">
        <button onClick={onEdit} className="w-7 h-7 flex items-center justify-center rounded text-[var(--color-text-muted)] hover:bg-[var(--color-bg-elevated)] hover:text-[var(--color-text-primary)] transition-colors"><Pencil size={12} /></button>
        {!status.is_system && <button onClick={onDelete} className="w-7 h-7 flex items-center justify-center rounded text-[var(--color-text-muted)] hover:bg-[var(--color-danger)]/10 hover:text-[var(--color-danger)] transition-colors"><Trash2 size={12} /></button>}
      </div>
    </div>
  )
}

export default function JobStatusClient({ initialStatuses, initialDelayReasons }: { initialStatuses: JobStatus[]; initialDelayReasons: DelayReason[] }) {
  const [statuses, setStatuses] = useState(initialStatuses)
  const [delays, setDelays] = useState(initialDelayReasons)
  const [activeTab, setActiveTab] = useState<'status' | 'delay'>('status')
  const [editingStatusId, setEditingStatusId] = useState<string | 'new' | null>(null)
  const [editingDelayId, setEditingDelayId] = useState<string | 'new' | null>(null)
  const [statusForm, setStatusForm] = useState({ name: '', slug: '', color_hex: '#2f81f7' })
  const [delayForm, setDelayForm] = useState({ name: '', category: 'general' })
  const [loading, setLoading] = useState(false)
  const [deleteTarget, setDeleteTarget] = useState<{ type: 'status' | 'delay'; id: string; name: string } | null>(null)

  const inputCls = 'h-8 px-2.5 rounded-md border text-sm bg-[var(--color-bg-elevated)] text-[var(--color-text-primary)] border-[var(--color-border)] focus:outline-none focus:border-[var(--color-accent)] focus:ring-1 focus:ring-[var(--color-accent)] transition-colors'

  const saveStatus = async () => {
    if (!statusForm.name || !statusForm.slug) { toast.error('Name and slug are required'); return }
    setLoading(true)
    try {
      const isNew = editingStatusId === 'new'
      const res = await fetch('/api/v1/job-statuses', {
        method: isNew ? 'POST' : 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(isNew ? { ...statusForm, sort_order: statuses.length + 1 } : { id: editingStatusId, ...statusForm }),
      })
      if (!res.ok) throw new Error()
      const { data } = await res.json()
      setStatuses(prev => isNew ? [...prev, data] : prev.map(s => s.id === data.id ? data : s))
      setEditingStatusId(null)
      toast.success(isNew ? 'Status added' : 'Status updated')
    } catch { toast.error('Failed to save') }
    finally { setLoading(false) }
  }

  const saveDelay = async () => {
    if (!delayForm.name) { toast.error('Name is required'); return }
    setLoading(true)
    try {
      const isNew = editingDelayId === 'new'
      const res = await fetch('/api/v1/delay-reasons', {
        method: isNew ? 'POST' : 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(isNew ? delayForm : { id: editingDelayId, ...delayForm }),
      })
      if (!res.ok) throw new Error()
      const { data } = await res.json()
      setDelays(prev => isNew ? [...prev, data] : prev.map(d => d.id === data.id ? data : d))
      setEditingDelayId(null)
      toast.success(isNew ? 'Reason added' : 'Reason updated')
    } catch { toast.error('Failed to save') }
    finally { setLoading(false) }
  }

  const confirmDelete = async () => {
    if (!deleteTarget) return
    setLoading(true)
    try {
      const endpoint = deleteTarget.type === 'status' ? '/api/v1/job-statuses' : '/api/v1/delay-reasons'
      await fetch(endpoint, { method: 'DELETE', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id: deleteTarget.id }) })
      if (deleteTarget.type === 'status') setStatuses(prev => prev.filter(s => s.id !== deleteTarget.id))
      else setDelays(prev => prev.filter(d => d.id !== deleteTarget.id))
      toast.success('Removed')
    } catch { toast.error('Failed to delete') }
    finally { setLoading(false); setDeleteTarget(null) }
  }

  const grouped = DELAY_CATEGORIES.reduce((acc, cat) => {
    acc[cat] = delays.filter(d => d.category === cat)
    return acc
  }, {} as Record<string, DelayReason[]>)

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-1 bg-[var(--color-bg-secondary)] border border-[var(--color-border)] rounded-xl p-1 w-fit">
        {[{ key: 'status', label: 'Job Statuses' }, { key: 'delay', label: 'Delay Reasons' }].map(t => (
          <button key={t.key} onClick={() => setActiveTab(t.key as any)}
            className={cn('px-5 h-8 rounded-lg text-sm font-medium transition-all', activeTab === t.key ? 'bg-[var(--color-accent)] text-white shadow-sm' : 'text-[var(--color-text-secondary)] hover:text-[var(--color-text-primary)] hover:bg-[var(--color-bg-elevated)]')}>
            {t.label}
          </button>
        ))}
      </div>

      {activeTab === 'status' && (
        <div className="rounded-xl border border-[var(--color-border)] bg-[var(--color-bg-secondary)] overflow-hidden">
          <div className="flex items-center justify-between px-5 py-3.5 border-b border-[var(--color-border)] bg-[var(--color-bg-elevated)]">
            <span className="text-sm font-semibold text-[var(--color-text-primary)]">Job Statuses ({statuses.length})</span>
            <button onClick={() => { setStatusForm({ name: '', slug: '', color_hex: '#2f81f7' }); setEditingStatusId('new') }}
              className="flex items-center gap-1 px-2.5 h-7 rounded-md bg-[var(--color-accent)] text-white text-xs font-medium hover:bg-[var(--color-accent-hover)] transition-colors">
              <Plus size={12} /> Add Status
            </button>
          </div>
          <div className="divide-y divide-[var(--color-border-subtle)]">
            {statuses.map(status => (
              editingStatusId === status.id ? (
                <div key={status.id} className="flex items-center gap-3 px-5 py-3">
                  <input className={cn(inputCls, 'flex-1')} value={statusForm.name} onChange={e => setStatusForm(p => ({ ...p, name: e.target.value }))} placeholder="Status name" />
                  <input className={cn(inputCls, 'w-32')} value={statusForm.slug} onChange={e => setStatusForm(p => ({ ...p, slug: e.target.value.toLowerCase().replace(/\s+/g, '_') }))} placeholder="slug" />
                  <input type="color" value={statusForm.color_hex} onChange={e => setStatusForm(p => ({ ...p, color_hex: e.target.value }))} className="w-10 h-8 rounded border border-[var(--color-border)] cursor-pointer" />
                  <button onClick={saveStatus} disabled={loading} className="w-8 h-8 flex items-center justify-center rounded bg-[var(--color-success)] text-white hover:opacity-90"><Check size={13} /></button>
                  <button onClick={() => setEditingStatusId(null)} className="w-8 h-8 flex items-center justify-center rounded border border-[var(--color-border)] hover:bg-[var(--color-bg-elevated)]"><X size={13} /></button>
                </div>
              ) : (
                <StatusRow key={status.id} status={status}
                  onEdit={() => { setStatusForm({ name: status.name, slug: status.slug, color_hex: status.color_hex }); setEditingStatusId(status.id) }}
                  onDelete={() => setDeleteTarget({ type: 'status', id: status.id, name: status.name })} />
              )
            ))}
            {editingStatusId === 'new' && (
              <div className="flex items-center gap-3 px-5 py-3 bg-[var(--color-accent)]/5 border-t border-[var(--color-accent)]/20">
                <input autoFocus className={cn(inputCls, 'flex-1')} value={statusForm.name} onChange={e => setStatusForm(p => ({ ...p, name: e.target.value, slug: e.target.value.toLowerCase().replace(/\s+/g, '_') }))} placeholder="Status name *" />
                <input className={cn(inputCls, 'w-32')} value={statusForm.slug} onChange={e => setStatusForm(p => ({ ...p, slug: e.target.value }))} placeholder="slug *" />
                <input type="color" value={statusForm.color_hex} onChange={e => setStatusForm(p => ({ ...p, color_hex: e.target.value }))} className="w-10 h-8 rounded border border-[var(--color-border)] cursor-pointer" />
                <button onClick={saveStatus} disabled={loading || !statusForm.name} className="px-3 h-8 rounded bg-[var(--color-accent)] text-white text-xs font-medium hover:bg-[var(--color-accent-hover)] disabled:opacity-50">Save</button>
                <button onClick={() => setEditingStatusId(null)} className="px-2.5 h-8 rounded border border-[var(--color-border)] text-xs hover:bg-[var(--color-bg-elevated)]">Cancel</button>
              </div>
            )}
          </div>
        </div>
      )}

      {activeTab === 'delay' && (
        <div className="space-y-3">
          <div className="flex justify-end">
            <button onClick={() => { setDelayForm({ name: '', category: 'general' }); setEditingDelayId('new') }}
              className="flex items-center gap-1.5 px-3 h-8 rounded-md bg-[var(--color-accent)] text-white text-sm font-medium hover:bg-[var(--color-accent-hover)] transition-colors">
              <Plus size={14} /> Add Reason
            </button>
          </div>

          {editingDelayId === 'new' && (
            <div className="flex items-center gap-3 px-5 py-3 rounded-xl border border-[var(--color-accent)]/20 bg-[var(--color-accent)]/5">
              <input autoFocus className={cn(inputCls, 'flex-1')} value={delayForm.name} onChange={e => setDelayForm(p => ({ ...p, name: e.target.value }))} placeholder="Reason name *" />
              <select className={cn(inputCls, 'w-36 capitalize')} value={delayForm.category} onChange={e => setDelayForm(p => ({ ...p, category: e.target.value }))}>
                {DELAY_CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}
              </select>
              <button onClick={saveDelay} disabled={loading || !delayForm.name} className="px-3 h-8 rounded bg-[var(--color-accent)] text-white text-xs font-medium hover:bg-[var(--color-accent-hover)] disabled:opacity-50">Save</button>
              <button onClick={() => setEditingDelayId(null)} className="px-2.5 h-8 rounded border border-[var(--color-border)] text-xs hover:bg-[var(--color-bg-elevated)]">Cancel</button>
            </div>
          )}

          {DELAY_CATEGORIES.filter(cat => grouped[cat]?.length > 0).map(cat => (
            <div key={cat} className="rounded-xl border border-[var(--color-border)] bg-[var(--color-bg-secondary)] overflow-hidden">
              <div className="px-4 py-2.5 bg-[var(--color-bg-elevated)] border-b border-[var(--color-border)]">
                <span className="text-xs font-semibold text-[var(--color-text-muted)] uppercase tracking-wider capitalize">{cat} ({grouped[cat].length})</span>
              </div>
              <div className="divide-y divide-[var(--color-border-subtle)]">
                {grouped[cat].map((d, idx) => (
                  <div key={d.id} className={cn('flex items-center gap-3 px-4 py-2.5 hover:bg-[var(--color-bg-elevated)]/40', idx % 2 === 1 && 'bg-[var(--color-bg-elevated)]/20')}>
                    {editingDelayId === d.id ? (
                      <>
                        <input autoFocus className={cn(inputCls, 'flex-1')} value={delayForm.name} onChange={e => setDelayForm(p => ({ ...p, name: e.target.value }))} />
                        <select className={cn(inputCls, 'w-32 capitalize')} value={delayForm.category} onChange={e => setDelayForm(p => ({ ...p, category: e.target.value }))}>
                          {DELAY_CATEGORIES.map(c => <option key={c} value={c}>{c}</option>)}
                        </select>
                        <button onClick={saveDelay} disabled={loading} className="w-7 h-7 flex items-center justify-center rounded bg-[var(--color-success)] text-white hover:opacity-90"><Check size={12} /></button>
                        <button onClick={() => setEditingDelayId(null)} className="w-7 h-7 flex items-center justify-center rounded border border-[var(--color-border)] hover:bg-[var(--color-bg-elevated)]"><X size={12} /></button>
                      </>
                    ) : (
                      <>
                        <span className="flex-1 text-sm text-[var(--color-text-primary)]">{d.name}</span>
                        <div className="flex items-center gap-1">
                          <button onClick={() => { setDelayForm({ name: d.name, category: d.category }); setEditingDelayId(d.id) }} className="w-7 h-7 flex items-center justify-center rounded text-[var(--color-text-muted)] hover:bg-[var(--color-bg-elevated)] hover:text-[var(--color-text-primary)] transition-colors"><Pencil size={12} /></button>
                          <button onClick={() => setDeleteTarget({ type: 'delay', id: d.id, name: d.name })} className="w-7 h-7 flex items-center justify-center rounded text-[var(--color-text-muted)] hover:bg-[var(--color-danger)]/10 hover:text-[var(--color-danger)] transition-colors"><Trash2 size={12} /></button>
                        </div>
                      </>
                    )}
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}

      <ConfirmDialog open={!!deleteTarget} onClose={() => setDeleteTarget(null)} onConfirm={confirmDelete}
        title="Remove Item" message={`Remove "${deleteTarget?.name}"?`} loading={loading} />
    </div>
  )
}
