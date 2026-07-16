'use client'
import { useState } from 'react'
import { Plus, Pencil, Trash2, Check, X, GripVertical, Star, ChevronDown, ChevronUp, Workflow } from 'lucide-react'
import { cn } from '@/lib/utils/cn'
import { toast } from '@/components/ui/Toast'
import { Modal, ConfirmDialog } from '@/components/ui/Modal'

interface Template { id: string; name: string; description: string | null; is_default: boolean; is_active: boolean }
interface Stage { id: string; workflow_template_id: string; name: string; department_id: string | null; sequence_order: number; is_optional: boolean; is_active: boolean }
interface Dept { id: string; name: string; code: string }

interface Props { initialTemplates: Template[]; initialStages: Stage[]; departments: Dept[] }

export default function WorkflowBuilder({ initialTemplates, initialStages, departments }: Props) {
  const [templates, setTemplates] = useState(initialTemplates)
  const [stages, setStages] = useState(initialStages)
  const [selectedTemplateId, setSelectedTemplateId] = useState<string>(initialTemplates[0]?.id ?? '')
  const [loading, setLoading] = useState(false)
  const [addTemplateOpen, setAddTemplateOpen] = useState(false)
  const [templateForm, setTemplateForm] = useState({ name: '', description: '' })
  const [addingStage, setAddingStage] = useState(false)
  const [stageForm, setStageForm] = useState({ name: '', department_id: '', is_optional: false })
  const [editingStageId, setEditingStageId] = useState<string | null>(null)
  const [editStageForm, setEditStageForm] = useState({ name: '', department_id: '', is_optional: false })
  const [deleteTarget, setDeleteTarget] = useState<{ type: 'template' | 'stage'; id: string; name: string } | null>(null)

  const selectedTemplate = templates.find(t => t.id === selectedTemplateId)
  const selectedStages = stages
    .filter(s => s.workflow_template_id === selectedTemplateId)
    .sort((a, b) => a.sequence_order - b.sequence_order)

  const inputCls = 'w-full h-9 px-3 rounded-md border text-sm bg-[var(--color-bg-elevated)] text-[var(--color-text-primary)] border-[var(--color-border)] focus:outline-none focus:border-[var(--color-accent)] focus:ring-1 focus:ring-[var(--color-accent)] transition-colors'

  // ── Template CRUD ──────────────────────────────────────────────────────────
  const saveTemplate = async () => {
    if (!templateForm.name) return
    setLoading(true)
    try {
      const res = await fetch('/api/v1/workflow', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ _type: 'template', ...templateForm }),
      })
      if (!res.ok) throw new Error()
      const { data } = await res.json()
      setTemplates(prev => [...prev, data])
      setSelectedTemplateId(data.id)
      setAddTemplateOpen(false)
      setTemplateForm({ name: '', description: '' })
      toast.success('Workflow template created')
    } catch { toast.error('Failed to create template') }
    finally { setLoading(false) }
  }

  const setDefault = async (templateId: string) => {
    setLoading(true)
    try {
      await fetch('/api/v1/workflow', {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ _type: 'template', id: templateId, is_default: true }),
      })
      setTemplates(prev => prev.map(t => ({ ...t, is_default: t.id === templateId })))
      toast.success('Default workflow updated')
    } catch { toast.error('Failed to update') }
    finally { setLoading(false) }
  }

  // ── Stage CRUD ─────────────────────────────────────────────────────────────
  const addStage = async () => {
    if (!stageForm.name) return
    setLoading(true)
    try {
      const nextOrder = selectedStages.length > 0 ? Math.max(...selectedStages.map(s => s.sequence_order)) + 1 : 1
      const res = await fetch('/api/v1/workflow', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          _type: 'stage', name: stageForm.name,
          workflow_template_id: selectedTemplateId,
          department_id: stageForm.department_id || null,
          is_optional: stageForm.is_optional,
          sequence_order: nextOrder,
        }),
      })
      if (!res.ok) throw new Error()
      const { data } = await res.json()
      setStages(prev => [...prev, data])
      setAddingStage(false)
      setStageForm({ name: '', department_id: '', is_optional: false })
      toast.success('Stage added')
    } catch { toast.error('Failed to add stage') }
    finally { setLoading(false) }
  }

  const updateStage = async (stage: Stage) => {
    setLoading(true)
    try {
      const res = await fetch('/api/v1/workflow', {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          _type: 'stage', id: stage.id, name: editStageForm.name,
          department_id: editStageForm.department_id || null,
          is_optional: editStageForm.is_optional,
        }),
      })
      if (!res.ok) throw new Error()
      const { data } = await res.json()
      setStages(prev => prev.map(s => s.id === data.id ? data : s))
      setEditingStageId(null)
      toast.success('Stage updated')
    } catch { toast.error('Failed to update stage') }
    finally { setLoading(false) }
  }

  const toggleStageActive = async (stage: Stage) => {
    const newActive = !stage.is_active
    setStages(prev => prev.map(s => s.id === stage.id ? { ...s, is_active: newActive } : s))
    await fetch('/api/v1/workflow', {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ _type: 'stage', id: stage.id, is_active: newActive }),
    })
  }

  const moveStage = async (stage: Stage, direction: 'up' | 'down') => {
    const sorted = [...selectedStages]
    const idx = sorted.findIndex(s => s.id === stage.id)
    const swapIdx = direction === 'up' ? idx - 1 : idx + 1
    if (swapIdx < 0 || swapIdx >= sorted.length) return

    const swapStage = sorted[swapIdx]
    const newOrder = stage.sequence_order
    const swapOrder = swapStage.sequence_order

    setStages(prev => prev.map(s => {
      if (s.id === stage.id) return { ...s, sequence_order: swapOrder }
      if (s.id === swapStage.id) return { ...s, sequence_order: newOrder }
      return s
    }))

    await Promise.all([
      fetch('/api/v1/workflow', { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ _type: 'stage', id: stage.id, sequence_order: swapOrder }) }),
      fetch('/api/v1/workflow', { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ _type: 'stage', id: swapStage.id, sequence_order: newOrder }) }),
    ])
  }

  const confirmDelete = async () => {
    if (!deleteTarget) return
    setLoading(true)
    try {
      await fetch('/api/v1/workflow', {
        method: 'DELETE', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ _type: deleteTarget.type, id: deleteTarget.id }),
      })
      if (deleteTarget.type === 'template') {
        setTemplates(prev => prev.filter(t => t.id !== deleteTarget.id))
        setSelectedTemplateId(templates.find(t => t.id !== deleteTarget.id)?.id ?? '')
      } else {
        setStages(prev => prev.filter(s => s.id !== deleteTarget.id))
      }
      toast.success('Deleted')
    } catch { toast.error('Failed to delete') }
    finally { setLoading(false); setDeleteTarget(null) }
  }

  return (
    <div className="grid grid-cols-[280px_1fr] gap-5">
      {/* ── Template list ── */}
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <span className="text-xs font-semibold text-[var(--color-text-muted)] uppercase tracking-wider">Templates</span>
          <button onClick={() => setAddTemplateOpen(true)}
            className="flex items-center gap-1 px-2 h-6 rounded text-xs bg-[var(--color-accent)] text-white hover:bg-[var(--color-accent-hover)]">
            <Plus size={11} /> New
          </button>
        </div>
        <div className="space-y-1.5">
          {templates.map(t => (
            <button key={t.id} onClick={() => setSelectedTemplateId(t.id)}
              className={cn(
                'w-full text-left px-3 py-2.5 rounded-xl border text-sm transition-all',
                selectedTemplateId === t.id
                  ? 'bg-[var(--color-accent)]/10 border-[var(--color-accent)]/30 text-[var(--color-accent)]'
                  : 'bg-[var(--color-bg-secondary)] border-[var(--color-border)] text-[var(--color-text-secondary)] hover:text-[var(--color-text-primary)] hover:border-[var(--color-border)]'
              )}>
              <div className="flex items-center gap-2">
                <Workflow size={13} className="flex-shrink-0" />
                <span className="font-medium truncate">{t.name}</span>
                {t.is_default && <Star size={11} className="text-[var(--color-warning)] flex-shrink-0 ml-auto" />}
              </div>
              {t.description && <p className="text-xs text-[var(--color-text-muted)] mt-0.5 truncate">{t.description}</p>}
            </button>
          ))}
        </div>
      </div>

      {/* ── Stage editor ── */}
      <div>
        {selectedTemplate ? (
          <div className="rounded-xl border border-[var(--color-border)] bg-[var(--color-bg-secondary)] overflow-hidden">
            {/* Template header */}
            <div className="flex items-center justify-between px-5 py-4 border-b border-[var(--color-border)]">
              <div>
                <h2 className="text-base font-semibold text-[var(--color-text-primary)]">{selectedTemplate.name}</h2>
                {selectedTemplate.description && <p className="text-xs text-[var(--color-text-muted)] mt-0.5">{selectedTemplate.description}</p>}
              </div>
              <div className="flex items-center gap-2">
                {!selectedTemplate.is_default && (
                  <button onClick={() => setDefault(selectedTemplate.id)}
                    className="flex items-center gap-1.5 px-3 h-8 rounded-md border border-[var(--color-border)] text-xs text-[var(--color-text-secondary)] hover:bg-[var(--color-bg-elevated)] transition-colors">
                    <Star size={12} /> Set Default
                  </button>
                )}
                {selectedTemplate.is_default && (
                  <span className="flex items-center gap-1 text-xs text-[var(--color-warning)] bg-[var(--color-warning)]/10 border border-[var(--color-warning)]/20 px-2.5 py-1 rounded-full">
                    <Star size={11} /> Default Template
                  </span>
                )}
                {!selectedTemplate.is_default && (
                  <button onClick={() => setDeleteTarget({ type: 'template', id: selectedTemplate.id, name: selectedTemplate.name })}
                    className="w-8 h-8 flex items-center justify-center rounded-md text-[var(--color-text-muted)] hover:bg-[var(--color-danger)]/10 hover:text-[var(--color-danger)] transition-colors">
                    <Trash2 size={14} />
                  </button>
                )}
              </div>
            </div>

            {/* Stages */}
            <div className="divide-y divide-[var(--color-border-subtle)]">
              {selectedStages.map((stage, idx) => {
                const dept = departments.find(d => d.id === stage.department_id)
                return (
                  <div key={stage.id} className={cn('flex items-center gap-3 px-5 py-3', !stage.is_active && 'opacity-50')}>
                    {/* Order indicator */}
                    <div className="w-6 h-6 rounded-full bg-[var(--color-bg-elevated)] border border-[var(--color-border)] flex items-center justify-center flex-shrink-0">
                      <span className="text-xs font-mono text-[var(--color-text-muted)]">{idx + 1}</span>
                    </div>

                    {editingStageId === stage.id ? (
                      <>
                        <input className="flex-1 h-8 px-2.5 rounded border text-sm bg-[var(--color-bg-elevated)] text-[var(--color-text-primary)] border-[var(--color-border)] focus:outline-none focus:border-[var(--color-accent)] focus:ring-1 focus:ring-[var(--color-accent)]"
                          value={editStageForm.name} onChange={e => setEditStageForm(p => ({ ...p, name: e.target.value }))} />
                        <select className="w-36 h-8 px-2 rounded border text-xs bg-[var(--color-bg-elevated)] text-[var(--color-text-primary)] border-[var(--color-border)] focus:outline-none focus:border-[var(--color-accent)]"
                          value={editStageForm.department_id} onChange={e => setEditStageForm(p => ({ ...p, department_id: e.target.value }))}>
                          <option value="">No dept</option>
                          {departments.map(d => <option key={d.id} value={d.id}>{d.name}</option>)}
                        </select>
                        <label className="flex items-center gap-1.5 text-xs text-[var(--color-text-muted)] cursor-pointer">
                          <input type="checkbox" checked={editStageForm.is_optional} onChange={e => setEditStageForm(p => ({ ...p, is_optional: e.target.checked }))} />
                          Optional
                        </label>
                        <button onClick={() => updateStage(stage)} disabled={loading} className="w-7 h-7 flex items-center justify-center rounded bg-[var(--color-success)] text-white"><Check size={12} /></button>
                        <button onClick={() => setEditingStageId(null)} className="w-7 h-7 flex items-center justify-center rounded border border-[var(--color-border)] text-[var(--color-text-secondary)]"><X size={12} /></button>
                      </>
                    ) : (
                      <>
                        <div className="flex-1">
                          <div className="flex items-center gap-2">
                            <span className={cn('text-sm font-medium', stage.is_active ? 'text-[var(--color-text-primary)]' : 'text-[var(--color-text-muted)] line-through')}>{stage.name}</span>
                            {stage.is_optional && <span className="text-xs text-[var(--color-info)] bg-[var(--color-info)]/10 border border-[var(--color-info)]/20 px-1.5 py-0.5 rounded-full">Optional</span>}
                            {dept && <span className="text-xs text-[var(--color-text-muted)]">→ {dept.name}</span>}
                          </div>
                        </div>
                        <div className="flex items-center gap-1">
                          {/* Move up/down */}
                          <button onClick={() => moveStage(stage, 'up')} disabled={idx === 0}
                            className="w-7 h-7 flex items-center justify-center rounded text-[var(--color-text-muted)] hover:bg-[var(--color-bg-elevated)] disabled:opacity-30 transition-colors">
                            <ChevronUp size={13} />
                          </button>
                          <button onClick={() => moveStage(stage, 'down')} disabled={idx === selectedStages.length - 1}
                            className="w-7 h-7 flex items-center justify-center rounded text-[var(--color-text-muted)] hover:bg-[var(--color-bg-elevated)] disabled:opacity-30 transition-colors">
                            <ChevronDown size={13} />
                          </button>
                          {/* Toggle active */}
                          <button onClick={() => toggleStageActive(stage)}
                            className={cn('text-xs px-2 h-6 rounded border transition-colors',
                              stage.is_active
                                ? 'text-[var(--color-success)] border-[var(--color-success)]/30 bg-[var(--color-success)]/10 hover:bg-[var(--color-success)]/20'
                                : 'text-[var(--color-text-muted)] border-[var(--color-border)] hover:bg-[var(--color-bg-elevated)]')}>
                            {stage.is_active ? 'Active' : 'Disabled'}
                          </button>
                          <button onClick={() => { setEditStageForm({ name: stage.name, department_id: stage.department_id ?? '', is_optional: stage.is_optional }); setEditingStageId(stage.id) }}
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
                )
              })}

              {/* Add stage inline */}
              {addingStage ? (
                <div className="flex items-center gap-3 px-5 py-3 bg-[var(--color-accent)]/5 border-t border-[var(--color-accent)]/20">
                  <div className="w-6 h-6 rounded-full bg-[var(--color-accent)]/20 flex items-center justify-center flex-shrink-0">
                    <span className="text-xs font-mono text-[var(--color-accent)]">{selectedStages.length + 1}</span>
                  </div>
                  <input autoFocus className="flex-1 h-8 px-2.5 rounded border text-sm bg-[var(--color-bg-elevated)] text-[var(--color-text-primary)] border-[var(--color-border)] focus:outline-none focus:border-[var(--color-accent)] focus:ring-1 focus:ring-[var(--color-accent)]"
                    value={stageForm.name} onChange={e => setStageForm(p => ({ ...p, name: e.target.value }))} placeholder="Stage name *" />
                  <select className="w-36 h-8 px-2 rounded border text-xs bg-[var(--color-bg-elevated)] text-[var(--color-text-primary)] border-[var(--color-border)] focus:outline-none focus:border-[var(--color-accent)]"
                    value={stageForm.department_id} onChange={e => setStageForm(p => ({ ...p, department_id: e.target.value }))}>
                    <option value="">No department</option>
                    {departments.map(d => <option key={d.id} value={d.id}>{d.name}</option>)}
                  </select>
                  <label className="flex items-center gap-1.5 text-xs text-[var(--color-text-muted)] cursor-pointer whitespace-nowrap">
                    <input type="checkbox" checked={stageForm.is_optional} onChange={e => setStageForm(p => ({ ...p, is_optional: e.target.checked }))} />
                    Optional
                  </label>
                  <button onClick={addStage} disabled={loading || !stageForm.name}
                    className="px-3 h-8 rounded bg-[var(--color-accent)] text-white text-xs font-medium hover:bg-[var(--color-accent-hover)] disabled:opacity-50 transition-colors">Add</button>
                  <button onClick={() => setAddingStage(false)}
                    className="px-3 h-8 rounded border border-[var(--color-border)] text-xs text-[var(--color-text-secondary)] hover:bg-[var(--color-bg-elevated)] transition-colors">Cancel</button>
                </div>
              ) : (
                <div className="px-5 py-3">
                  <button onClick={() => setAddingStage(true)}
                    className="flex items-center gap-2 text-sm text-[var(--color-text-muted)] hover:text-[var(--color-accent)] transition-colors">
                    <Plus size={15} /> Add Stage
                  </button>
                </div>
              )}
            </div>
          </div>
        ) : (
          <div className="rounded-xl border border-[var(--color-border)] bg-[var(--color-bg-secondary)] p-12 text-center">
            <p className="text-sm text-[var(--color-text-muted)]">Select a workflow template to view and edit its stages.</p>
          </div>
        )}
      </div>

      {/* Add Template Modal */}
      <Modal open={addTemplateOpen} onClose={() => setAddTemplateOpen(false)} title="New Workflow Template" size="sm"
        footer={
          <>
            <button onClick={() => setAddTemplateOpen(false)} className="px-4 h-9 rounded-md border border-[var(--color-border)] text-sm text-[var(--color-text-secondary)] hover:bg-[var(--color-bg-elevated)] transition-colors">Cancel</button>
            <button onClick={saveTemplate} disabled={loading || !templateForm.name}
              className="px-4 h-9 rounded-md bg-[var(--color-accent)] text-white text-sm font-medium hover:bg-[var(--color-accent-hover)] disabled:opacity-50 transition-colors">
              {loading ? 'Creating…' : 'Create Template'}
            </button>
          </>
        }>
        <div className="space-y-4">
          <div className="space-y-1.5">
            <label className="text-sm font-medium text-[var(--color-text-primary)]">Template Name *</label>
            <input className={inputCls} value={templateForm.name} onChange={e => setTemplateForm(p => ({ ...p, name: e.target.value }))} placeholder="e.g. Premium Rigid Box Workflow" />
          </div>
          <div className="space-y-1.5">
            <label className="text-sm font-medium text-[var(--color-text-primary)]">Description</label>
            <input className={inputCls} value={templateForm.description} onChange={e => setTemplateForm(p => ({ ...p, description: e.target.value }))} placeholder="Optional description" />
          </div>
        </div>
      </Modal>

      <ConfirmDialog
        open={!!deleteTarget} onClose={() => setDeleteTarget(null)} onConfirm={confirmDelete}
        title={`Delete ${deleteTarget?.type === 'template' ? 'Template' : 'Stage'}`}
        message={`Remove "${deleteTarget?.name}"? This cannot be undone.`}
        loading={loading}
      />
    </div>
  )
}
