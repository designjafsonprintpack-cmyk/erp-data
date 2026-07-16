'use client'
import { useState } from 'react'
import { Plus, Pencil, Trash2, Check, X } from 'lucide-react'
import { cn } from '@/lib/utils/cn'
import { toast } from '@/components/ui/Toast'
import { ConfirmDialog } from '@/components/ui/Modal'

// ─── Generic TypeManager (DRY — reused across all 6 material tabs) ────────────
interface Field { key: string; label: string; placeholder: string; type?: string }
interface TypeItem { id: string; name: string; [key: string]: any }

interface TypeManagerProps {
  title: string
  apiType: string
  items: TypeItem[]
  extraFields?: Field[]
}

function TypeManager({ title, apiType, items: initialItems, extraFields = [] }: TypeManagerProps) {
  const [items, setItems] = useState(initialItems)
  const [editingId, setEditingId] = useState<string | 'new' | null>(null)
  const [form, setForm] = useState<Record<string, string>>({})
  const [loading, setLoading] = useState(false)
  const [deleteTarget, setDeleteTarget] = useState<TypeItem | null>(null)

  const allFields: Field[] = [{ key: 'name', label: 'Name', placeholder: `${title} name` }, ...extraFields]

  const inputCls = 'h-8 px-2.5 rounded-md border text-sm bg-[var(--color-bg-elevated)] text-[var(--color-text-primary)] border-[var(--color-border)] focus:outline-none focus:border-[var(--color-accent)] focus:ring-1 focus:ring-[var(--color-accent)] transition-colors'

  const save = async () => {
    if (!form.name) { toast.error('Name is required'); return }
    setLoading(true)
    try {
      const isNew = editingId === 'new'
      const res = await fetch(`/api/v1/material-types/${apiType}`, {
        method: isNew ? 'POST' : 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(isNew ? form : { id: editingId, ...form }),
      })
      if (!res.ok) { const e = await res.json(); throw new Error(e.error) }
      const { data } = await res.json()
      setItems(prev => isNew ? [...prev, data] : prev.map(i => i.id === data.id ? data : i))
      setEditingId(null)
      toast.success(isNew ? `${title} added` : `${title} updated`)
    } catch (e: any) { toast.error(e.message || 'Failed to save') }
    finally { setLoading(false) }
  }

  const confirmDelete = async () => {
    if (!deleteTarget) return
    setLoading(true)
    try {
      const res = await fetch(`/api/v1/material-types/${apiType}`, {
        method: 'DELETE', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: deleteTarget.id }),
      })
      if (!res.ok) throw new Error()
      setItems(prev => prev.filter(i => i.id !== deleteTarget.id))
      toast.success(`${title} removed`)
    } catch { toast.error('Failed to delete') }
    finally { setLoading(false); setDeleteTarget(null) }
  }

  const colSpan = Math.floor(10 / allFields.length)

  return (
    <div className="rounded-xl border border-[var(--color-border)] bg-[var(--color-bg-secondary)] overflow-hidden">
      <div className="flex items-center justify-between px-4 py-3 border-b border-[var(--color-border)] bg-[var(--color-bg-elevated)]">
        <span className="text-sm font-semibold text-[var(--color-text-primary)]">{title} <span className="text-[var(--color-text-muted)] font-normal">({items.length})</span></span>
        <button onClick={() => { setForm(Object.fromEntries(allFields.map(f => [f.key, '']))); setEditingId('new') }}
          className="flex items-center gap-1 px-2.5 h-7 rounded-md bg-[var(--color-accent)] text-white text-xs font-medium hover:bg-[var(--color-accent-hover)] transition-colors">
          <Plus size={12} /> Add
        </button>
      </div>

      <div className="divide-y divide-[var(--color-border-subtle)]">
        {items.map((item, idx) => (
          <div key={item.id} className={cn('flex items-center gap-2 px-4 py-2.5 hover:bg-[var(--color-bg-elevated)]/40', idx % 2 === 1 && 'bg-[var(--color-bg-elevated)]/20')}>
            {editingId === item.id ? (
              <>
                {allFields.map(f => (
                  <input key={f.key} className={cn(inputCls, 'flex-1')} value={form[f.key] ?? ''} type={f.type || 'text'}
                    onChange={e => setForm(p => ({ ...p, [f.key]: e.target.value }))} placeholder={f.placeholder} />
                ))}
                <button onClick={save} disabled={loading} className="w-7 h-7 flex items-center justify-center rounded bg-[var(--color-success)] text-white hover:opacity-90"><Check size={12} /></button>
                <button onClick={() => setEditingId(null)} className="w-7 h-7 flex items-center justify-center rounded border border-[var(--color-border)] text-[var(--color-text-secondary)] hover:bg-[var(--color-bg-elevated)]"><X size={12} /></button>
              </>
            ) : (
              <>
                <span className="flex-1 text-sm text-[var(--color-text-primary)]">{item.name}</span>
                {extraFields.map(f => (
                  <span key={f.key} className="text-xs text-[var(--color-text-muted)]">{item[f.key] || '—'}</span>
                ))}
                <div className="flex items-center gap-1 ml-auto">
                  <button onClick={() => { setForm(Object.fromEntries(allFields.map(f => [f.key, String(item[f.key] ?? '')]))); setEditingId(item.id) }}
                    className="w-7 h-7 flex items-center justify-center rounded text-[var(--color-text-muted)] hover:bg-[var(--color-bg-elevated)] hover:text-[var(--color-text-primary)] transition-colors">
                    <Pencil size={12} />
                  </button>
                  <button onClick={() => setDeleteTarget(item)}
                    className="w-7 h-7 flex items-center justify-center rounded text-[var(--color-text-muted)] hover:bg-[var(--color-danger)]/10 hover:text-[var(--color-danger)] transition-colors">
                    <Trash2 size={12} />
                  </button>
                </div>
              </>
            )}
          </div>
        ))}

        {editingId === 'new' && (
          <div className="flex items-center gap-2 px-4 py-2.5 bg-[var(--color-accent)]/5 border-t border-[var(--color-accent)]/20">
            {allFields.map(f => (
              <input key={f.key} autoFocus={f.key === 'name'} className={cn(inputCls, 'flex-1')} value={form[f.key] ?? ''}
                type={f.type || 'text'} onChange={e => setForm(p => ({ ...p, [f.key]: e.target.value }))} placeholder={f.placeholder + ' *'} />
            ))}
            <button onClick={save} disabled={loading || !form.name}
              className="px-3 h-8 rounded bg-[var(--color-accent)] text-white text-xs font-medium hover:bg-[var(--color-accent-hover)] disabled:opacity-50 transition-colors">Save</button>
            <button onClick={() => setEditingId(null)}
              className="px-3 h-8 rounded border border-[var(--color-border)] text-xs text-[var(--color-text-secondary)] hover:bg-[var(--color-bg-elevated)] transition-colors">Cancel</button>
          </div>
        )}

        {items.length === 0 && editingId !== 'new' && (
          <div className="px-4 py-6 text-center text-sm text-[var(--color-text-muted)]">No {title.toLowerCase()}s added yet.</div>
        )}
      </div>

      <ConfirmDialog
        open={!!deleteTarget} onClose={() => setDeleteTarget(null)} onConfirm={confirmDelete}
        title={`Remove ${title}`} message={`Remove "${deleteTarget?.name}"?`} loading={loading}
      />
    </div>
  )
}

// ─── TABS WRAPPER ─────────────────────────────────────────────────────────────
type MaterialKey = 'board' | 'paper' | 'ink' | 'glue' | 'foil' | 'lamination'

interface InitialData { board: any[]; paper: any[]; ink: any[]; glue: any[]; foil: any[]; lamination: any[] }

const TABS: { key: MaterialKey; label: string; extraFields?: any[] }[] = [
  { key: 'board',      label: 'Board Types',      extraFields: [{ key: 'flute_type', label: 'Flute', placeholder: 'e.g. B, C, E' }, { key: 'gsm', label: 'GSM', placeholder: 'GSM', type: 'number' }] },
  { key: 'paper',      label: 'Paper Types',      extraFields: [{ key: 'gsm', label: 'GSM', placeholder: 'GSM', type: 'number' }] },
  { key: 'ink',        label: 'Ink Types',        extraFields: [{ key: 'color_code', label: 'Color Hex', placeholder: '#000000' }] },
  { key: 'glue',       label: 'Glue Types',       extraFields: [] },
  { key: 'foil',       label: 'Foil Types',       extraFields: [{ key: 'color', label: 'Color', placeholder: 'e.g. Gold' }] },
  { key: 'lamination', label: 'Lamination Types', extraFields: [{ key: 'material', label: 'Material', placeholder: 'e.g. BOPP' }] },
]

export default function MaterialsClient({ initialData }: { initialData: InitialData }) {
  const [activeTab, setActiveTab] = useState<MaterialKey>('board')
  const tab = TABS.find(t => t.key === activeTab)!

  return (
    <div className="space-y-4">
      {/* Tab bar */}
      <div className="flex items-center gap-1 flex-wrap bg-[var(--color-bg-secondary)] border border-[var(--color-border)] rounded-xl p-1">
        {TABS.map(t => (
          <button key={t.key} onClick={() => setActiveTab(t.key)}
            className={cn('px-4 h-8 rounded-lg text-sm font-medium transition-all',
              activeTab === t.key
                ? 'bg-[var(--color-accent)] text-white shadow-sm'
                : 'text-[var(--color-text-secondary)] hover:text-[var(--color-text-primary)] hover:bg-[var(--color-bg-elevated)]')}>
            {t.label}
          </button>
        ))}
      </div>

      {/* Active type manager */}
      <TypeManager
        key={activeTab}
        title={tab.label.replace(' Types', '')}
        apiType={activeTab}
        items={initialData[activeTab]}
        extraFields={tab.extraFields}
      />
    </div>
  )
}
