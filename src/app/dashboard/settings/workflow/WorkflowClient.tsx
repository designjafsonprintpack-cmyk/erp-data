'use client'
import { useState } from 'react'
import { Plus, Pencil, Trash2, Check, X, GripVertical, Star, Workflow, ChevronDown, ChevronUp, Clock } from 'lucide-react'
import { cn } from '@/lib/utils/cn'
import { toast } from '@/components/ui/Toast'
import { Modal, ConfirmDialog } from '@/components/ui/Modal'

interface Stage { id: string; name: string; sequence_order: number; is_optional: boolean; estimated_hours: number | null; is_active: boolean }
interface Template { id: string; name: string; description: string | null; is_default: boolean; is_active: boolean; workflow_stages: Stage[] }

export default function WorkflowClient({ initialTemplates }: { initialTemplates: Template[] }) {
  const [templates, setTemplates] = useState(initialTemplates)
  const [selectedId, setSelectedId] = useState(initialTemplates[0]?.id ?? '')
  const [tplModal, setTplModal] = useState(false)
  const [tplForm, setTplForm] = useState({ name: '', description: '' })
  const [editingStageId, setEditingStageId] = useState<string | 'new' | null>(null)
  const [stageForm, setStageForm] = useState({ name: '', is_optional: false, estimated_hours: '' })
  const [loading, setLoading] = useState(false)
  const [deleteTarget, setDeleteTarget] = useState<{ type: 'template' | 'stage'; id: string; name: string } | null>(null)

  const selected = templates.find(t => t.id === selectedId)

  const inputCls = 'w-full h-9 px-3 rounded-md border text-sm bg-[var(--color-bg-elevated)] text-[var(--color-text-primary)] border-[var(--color-border)] focus:outline-none focus:border-[var(--color-accent)] focus:ring-1 focus:ring-[var(--color-accent)] transition-colors'

  // ─── Template CRUD ───────────────────────────────────────────────────────────
  const createTemplate = async () => {
    if (!tplForm.name) { toast.error('Name is required'); return }
    setLoading(true)
    try {
      const res = await fetch('/api/v1/workflow', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(tplForm) })
      if (!res.ok) throw new Error()
      const { data } = await res.json()
      const newTpl = { ...data, workflow_stages: [] }
      setTemplates(prev => [...prev, newTpl])
      setSelectedId(data.id)
      setTplModal(false)
      toast.success('Workflow template created')
    } catch { toast.error('Failed to create template') }
    finally { setLoading(false) }
  }

  const deleteTemplate = async () => {
    if (!deleteTarget || deleteTarget.type !== 'template') return
    setLoading(true)
    try {
      await fetch('/api/v1/workflow', { method: 'DELETE', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id: deleteTarget.id }) })
      const remaining = templates.filter(t => t.id !== deleteTarget.id)
      setTemplates(remaining)
      setSelectedId(remaining[0]?.id ?? '')
      toast.success('Template deleted')
    } catch { toast.error('Failed to delete') }
    finally { setLoading(false); setDeleteTarget(null) }
  }

  // ─── Stage CRUD ──────────────────────────────────────────────────────────────
  const saveStage = async () => {
    if (!stageForm.name || !selected) { toast.error('Stage name is required'); return }
    setLoading(true)
    try {
      const isNew = editingStageId === 'new'
      const maxOrder = Math.max(0, ...selected.workflow_stages.map(s => s.sequence_order))
      const payload = {
        name: stageForm.name,
        is_optional: stageForm.is_optional,
        estimated_hours: stageForm.estimated_hours ? parseFloat(stageForm.estimated_hours) : null,
        ...(isNew ? { workflow_template_id: selected.id, sequence_order: maxOrder + 1 } : {}),
      }
      const res = await fetch('/api/v1/workflow-stages', {
        method: isNew ? 'POST' : 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(isNew ? payload : { id: editingStageId, ...payload }),
      })
      if (!res.ok) throw new Error()
      const { data } = await res.json()
      setTemplates(prev => prev.map(t => t.id === selected.id ? {
        ...t,
        workflow_stages: isNew
          ? [...t.workflow_stages, data]
          : t.workflow_stages.map(s => s.id === data.id ? data : s),
      } : t))
      setEditingStageId(null)
      toast.success(isNew ? 'Stage added' : 'Stage updated')
    } catch { toast.error('Failed to save stage') }
    finally { setLoading(false) }
  }

  const deleteStage = async () => {
    if (!deleteTarget || deleteTarget.type !== 'stage' || !selected) return
    setLoading(true)
    try {
      await fetch('/api/v1/workflow-stages', { method: 'DELETE', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id: deleteTarget.id }) })
      setTemplates(prev => prev.map(t => t.id === selected.id ? {
        ...t, workflow_stages: t.workflow_stages.filter(s => s.id !== deleteTarget.id),
      } : t))
      toast.success('Stage removed')
    } catch { toast.error('Failed to delete stage') }
    finally { setLoading(false); setDeleteTarget(null) }
  }

  const moveStage = async (stageId: string, dir: 'up' | 'down') => {
    if (!selected) return
    const stages = [...selected.workflow_stages]
    const idx = stages.findIndex(s => s.id === stageId)
    if ((dir === 'up' && idx === 0) || (dir === 'down' && idx === stages.length - 1)) return

    const swapIdx = dir === 'up' ? idx - 1 : idx + 1
    const [a, b] = [stages[idx], stages[swapIdx]]
    const [newOrderA, newOrderB] = [b.sequence_order, a.sequence_order]

    // Optimistic update
    stages[idx] = { ...a, sequence_order: newOrderA }
    stages[swapIdx] = { ...b, sequence_order: newOrderB }
    stages.sort((x, y) => x.sequence_order - y.sequence_order)
    setTemplates(prev => prev.map(t => t.id === selected.id ? { ...t, workflow_stages: stages } : t))

    // Persist both
    await Promise.all([
      fetch('/api/v1/workflow-stages', { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id: a.id, sequence_order: newOrderA }) }),
      fetch('/api/v1/workflow-stages', { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id: b.id, sequence_order: newOrderB }) }),
    ])
  }

  return (
    <div className="grid grid-cols-[280px_1fr] gap-5 items-start">
      {/* ─── Left: Template list ─── */}
      <div className="rounded-xl border border-[var(--color-border)] bg-[var(--color-bg-secondary)] overflow-hidden">
        <div className="flex items-center justify-between px-4 py-3 border-b border-[var(--color-border)] bg-[var(--color-bg-elevated)]">
          <div className="flex items-center gap-2">
            <Workflow size={15} className="text-[var(--color-accent)]" />
            <span className="text-sm font-semibold text-[var(--color-text-primary)]">Templates</span>
          </div>
          <button onClick={() => { setTplForm({ name: '', description: '' }); setTplModal(true) }}
            className="w-7 h-7 flex items-center justify-center rounded-md bg-[var(--color-accent)] text-white hover:bg-[var(--color-accent-hover)] transition-colors">
            <Plus size={14} />
          </button>
        </div>
        <div className="divide-y divide-[var(--color-border-subtle)]">
          {templates.map(tpl => (
            <button key={tpl.id} onClick={() => setSelectedId(tpl.id)}
              className={cn('w-full text-left px-4 py-3 transition-colors hover:bg-[var(--color-bg-elevated)]',
                selectedId === tpl.id && 'bg-[var(--color-accent)]/8 border-l-2 border-l-[var(--color-accent)]')}>
              <div className="flex items-center gap-2 mb-0.5">
                <span className="text-sm font-medium text-[var(--color-text-primary)] truncate">{tpl.name}</span>
                {tpl.is_default && <Star size={11} className="text-[var(--color-warning)] flex-shrink-0" />}
              </div>
              <p className="text-xs text-[var(--color-text-muted)]">{tpl.workflow_stages.length} stages</p>
            </button>
          ))}
        </div>
      </div>

      {/* ─── Right: Stage builder ─── */}
      {selected ? (
        <div className="rounded-xl border border-[var(--color-border)] bg-[var(--color-bg-secondary)] overflow-hidden">
          <div className="flex items-center justify-between px-5 py-4 border-b border-[var(--color-border)] bg-[var(--color-bg-elevated)]">
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-base font-semibold text-[var(--color-text-primary)]">{selected.name}</h2>
                {selected.is_default && <span className="text-xs text-[var(--color-warning)] bg-[var(--color-warning)]/10 px-2 py-0.5 rounded-full border border-[var(--color-warning)]/20 flex items-center gap-1"><Star size={9} /> Default</span>}
              </div>
              {selected.description && <p className="text-xs text-[var(--color-text-muted)] mt-0.5">{selected.description}</p>}
            </div>
            <div className="flex items-center gap-2">
              <button onClick={() => { setStageForm({ name: '', is_optional: false, estimated_hours: '' }); setEditingStageId('new') }}
                className="flex items-center gap-1.5 px-3 h-8 rounded-md bg-[var(--color-accent)] text-white text-sm font-medium hover:bg-[var(--color-accent-hover)] transition-colors">
                <Plus size={14} /> Add Stage
              </button>
              {!selected.is_default && (
                <button onClick={() => setDeleteTarget({ type: 'template', id: selected.id, name: selected.name })}
                  className="w-8 h-8 flex items-center justify-center rounded-md text-[var(--color-text-muted)] hover:bg-[var(--color-danger)]/10 hover:text-[var(--color-danger)] transition-colors">
                  <Trash2 size={14} />
                </button>
              )}
            </div>
          </div>

          <div className="divide-y divide-[var(--color-border-subtle)]">
            {selected.workflow_stages.map((stage, idx) => (
              <div key={stage.id} className={cn('flex items-center gap-3 px-5 py-3 hover:bg-[var(--color-bg-elevated)]/30', idx % 2 === 1 && 'bg-[var(--color-bg-elevated)]/15')}>
                {editingStageId === stage.id ? (
                  <div className="flex-1 flex items-center gap-3">
                    <input autoFocus className={cn(inputCls, 'flex-1')} value={stageForm.name} onChange={e => setStageForm(p => ({ ...p, name: e.target.value }))} placeholder="Stage name" />
                    <input className={cn(inputCls, 'w-28')} type="number" value={stageForm.estimated_hours} onChange={e => setStageForm(p => ({ ...p, estimated_hours: e.target.value }))} placeholder="Est. hours" />
                    <label className="flex items-center gap-1.5 text-sm text-[var(--color-text-secondary)] cursor-pointer flex-shrink-0">
                      <input type="checkbox" checked={stageForm.is_optional} onChange={e => setStageForm(p => ({ ...p, is_optional: e.target.checked }))} className="w-4 h-4" />
                      Optional
                    </label>
                    <button onClick={saveStage} disabled={loading} className="w-8 h-8 flex items-center justify-center rounded-md bg-[var(--color-success)] text-white hover:opacity-90"><Check size={13} /></button>
                    <button onClick={() => setEditingStageId(null)} className="w-8 h-8 flex items-center justify-center rounded-md border border-[var(--color-border)] hover:bg-[var(--color-bg-elevated)]"><X size={13} /></button>
                  </div>
                ) : (
                  <>
                    <div className="flex items-center gap-1 flex-shrink-0">
                      <button onClick={() => moveStage(stage.id, 'up')} disabled={idx === 0} className="w-6 h-6 flex items-center justify-center rounded text-[var(--color-text-muted)] hover:bg-[var(--color-bg-elevated)] disabled:opacity-30 transition-colors"><ChevronUp size={13} /></button>
                      <button onClick={() => moveStage(stage.id, 'down')} disabled={idx === selected.workflow_stages.length - 1} className="w-6 h-6 flex items-center justify-center rounded text-[var(--color-text-muted)] hover:bg-[var(--color-bg-elevated)] disabled:opacity-30 transition-colors"><ChevronDown size={13} /></button>
                    </div>
                    <span className="w-6 h-6 rounded-full bg-[var(--color-accent)]/10 border border-[var(--color-accent)]/20 flex items-center justify-center text-xs font-bold text-[var(--color-accent)] flex-shrink-0">{idx + 1}</span>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-medium text-[var(--color-text-primary)]">{stage.name}</span>
                        {stage.is_optional && <span className="text-xs text-[var(--color-text-muted)] bg-[var(--color-bg-elevated)] border border-[var(--color-border)] px-1.5 py-0.5 rounded">Optional</span>}
                        {stage.estimated_hours && <span className="flex items-center gap-1 text-xs text-[var(--color-text-muted)]"><Clock size={10} /> {stage.estimated_hours}h</span>}
                      </div>
                    </div>
                    <div className="flex items-center gap-1">
                      <button onClick={() => { setStageForm({ name: stage.name, is_optional: stage.is_optional, estimated_hours: String(stage.estimated_hours ?? '') }); setEditingStageId(stage.id) }}
                        className="w-7 h-7 flex items-center justify-center rounded text-[var(--color-text-muted)] hover:bg-[var(--color-bg-elevated)] hover:text-[var(--color-text-primary)] transition-colors">
                        <Pencil size={12} />
                      </button>
                      <button onClick={() => setDeleteTarget({ type: 'stage', id: stage.id, name: stage.name })}
                        className="w-7 h-7 flex items-center justify-center rounded text-[var(--color-text-muted)] hover:bg-[var(--color-danger)]/10 hover:text-[var(--color-danger)] transition-colors">
                        <Trash2 size={12} />
                      </button>
                    </div>
                  </>
                )}
              </div>
            ))}

            {editingStageId === 'new' && (
              <div className="flex items-center gap-3 px-5 py-3 bg-[var(--color-accent)]/5 border-t border-[var(--color-accent)]/20">
                <div className="w-6 h-6 rounded-full bg-[var(--color-accent)] flex items-center justify-center text-xs font-bold text-white flex-shrink-0">{selected.workflow_stages.length + 1}</div>
                <input autoFocus className={cn(inputCls, 'flex-1')} value={stageForm.name} onChange={e => setStageForm(p => ({ ...p, name: e.target.value }))} placeholder="Stage name *" />
                <input className={cn(inputCls, 'w-28')} type="number" value={stageForm.estimated_hours} onChange={e => setStageForm(p => ({ ...p, estimated_hours: e.target.value }))} placeholder="Est. hours" />
                <label className="flex items-center gap-1.5 text-sm text-[var(--color-text-secondary)] cursor-pointer flex-shrink-0">
                  <input type="checkbox" checked={stageForm.is_optional} onChange={e => setStageForm(p => ({ ...p, is_optional: e.target.checked }))} className="w-4 h-4" />
                  Optional
                </label>
                <button onClick={saveStage} disabled={loading} className="px-3 h-9 rounded-md bg-[var(--color-accent)] text-white text-sm font-medium hover:bg-[var(--color-accent-hover)] disabled:opacity-50">Save</button>
                <button onClick={() => setEditingStageId(null)} className="px-3 h-9 rounded-md border border-[var(--color-border)] text-sm hover:bg-[var(--color-bg-elevated)]">Cancel</button>
              </div>
            )}

            {selected.workflow_stages.length === 0 && editingStageId !== 'new' && (
              <div className="px-5 py-12 text-center">
                <GripVertical size={28} className="text-[var(--color-text-muted)] opacity-30 mx-auto mb-2" />
                <p className="text-sm text-[var(--color-text-muted)]">No stages yet. Add stages to define the production flow.</p>
              </div>
            )}
          </div>
        </div>
      ) : (
        <div className="rounded-xl border border-[var(--color-border)] bg-[var(--color-bg-secondary)] p-12 text-center">
          <p className="text-sm text-[var(--color-text-muted)]">Select a template or create a new one</p>
        </div>
      )}

      {/* Create template modal */}
      <Modal open={tplModal} onClose={() => setTplModal(false)} title="New Workflow Template" size="sm"
        footer={
          <>
            <button onClick={() => setTplModal(false)} className="px-4 h-9 rounded-md border border-[var(--color-border)] text-sm text-[var(--color-text-secondary)] hover:bg-[var(--color-bg-elevated)] transition-colors">Cancel</button>
            <button onClick={createTemplate} disabled={loading || !tplForm.name} className="px-4 h-9 rounded-md bg-[var(--color-accent)] text-white text-sm font-medium hover:bg-[var(--color-accent-hover)] disabled:opacity-50 transition-colors">Create</button>
          </>
        }>
        <div className="space-y-4">
          <div className="space-y-1.5">
            <label className="text-sm font-medium text-[var(--color-text-primary)]">Template Name *</label>
            <input className={inputCls} value={tplForm.name} onChange={e => setTplForm(p => ({ ...p, name: e.target.value }))} placeholder="e.g. Corrugated Box Workflow" />
          </div>
          <div className="space-y-1.5">
            <label className="text-sm font-medium text-[var(--color-text-primary)]">Description</label>
            <input className={inputCls} value={tplForm.description} onChange={e => setTplForm(p => ({ ...p, description: e.target.value }))} placeholder="Optional description" />
          </div>
        </div>
      </Modal>

      <ConfirmDialog
        open={!!deleteTarget}
        onClose={() => setDeleteTarget(null)}
        onConfirm={deleteTarget?.type === 'template' ? deleteTemplate : deleteStage}
        title={deleteTarget?.type === 'template' ? 'Delete Template' : 'Remove Stage'}
        message={`Remove "${deleteTarget?.name}"? This cannot be undone.`}
        loading={loading}
      />
    </div>
  )
}
