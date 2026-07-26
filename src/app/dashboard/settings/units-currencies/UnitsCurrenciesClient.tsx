'use client'
import { useState } from 'react'
import { Plus, Pencil, Trash2, Check, X, Star } from 'lucide-react'
import { cn } from '@/lib/utils/cn'
import { toast } from '@/components/ui/Toast'
import { ConfirmDialog } from '@/components/ui/Modal'

interface Item { id: string; [key: string]: any }
interface Column { key: string; label: string; placeholder: string; type?: string; width?: string }

function SettingsTable({ title, items: initialItems, columns, apiResource, badgeKey, badgeLabel }: {
  title: string; items: Item[]; columns: Column[]; apiResource: string
  badgeKey?: string; badgeLabel?: string
}) {
  const [items, setItems] = useState(initialItems)
  const [editingId, setEditingId] = useState<string | 'new' | null>(null)
  const [form, setForm] = useState<Record<string, string>>({})
  const [loading, setLoading] = useState(false)
  const [deleteTarget, setDeleteTarget] = useState<Item | null>(null)

  const inputCls = 'h-8 px-2.5 rounded-md border text-sm bg-[var(--color-bg-elevated)] text-[var(--color-text-primary)] border-[var(--color-border)] focus:outline-none focus:border-[var(--color-accent)] focus:ring-1 focus:ring-[var(--color-accent)] transition-colors w-full'

  const save = async () => {
    if (!form[columns[0].key]) { toast.error(`${columns[0].label} is required`); return }
    setLoading(true)
    try {
      const isNew = editingId === 'new'
      const res = await fetch(`/api/v1/settings/${apiResource}`, {
        method: isNew ? 'POST' : 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(isNew ? form : { id: editingId, ...form }),
      })
      if (!res.ok) { const e = await res.json(); throw new Error(e.error) }
      const { data } = await res.json()
      setItems(prev => isNew ? [...prev, data] : prev.map(i => i.id === data.id ? data : i))
      setEditingId(null)
      toast.success(isNew ? `${title} added` : 'Updated')
    } catch (e: any) { toast.error(e.message || 'Failed') }
    finally { setLoading(false) }
  }

  const confirmDelete = async () => {
    if (!deleteTarget) return
    setLoading(true)
    try {
      await fetch(`/api/v1/settings/${apiResource}`, { method: 'DELETE', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id: deleteTarget.id }) })
      setItems(prev => prev.filter(i => i.id !== deleteTarget.id))
      toast.success('Removed')
    } catch { toast.error('Failed to delete') }
    finally { setLoading(false); setDeleteTarget(null) }
  }

  return (
    <div className="rounded-xl border border-[var(--color-border)] bg-[var(--color-bg-secondary)] overflow-hidden">
      <div className="flex items-center justify-between px-5 py-3.5 border-b border-[var(--color-border)] bg-[var(--color-bg-elevated)]">
        <span className="text-sm font-semibold text-[var(--color-text-primary)]">{title} <span className="font-normal text-[var(--color-text-muted)]">({items.length})</span></span>
        <button onClick={() => { setForm(Object.fromEntries(columns.map(c => [c.key, '']))); setEditingId('new') }}
          className="flex items-center gap-1 px-2.5 h-7 rounded-md bg-[var(--color-accent)] text-[var(--color-on-accent)] text-xs font-medium hover:bg-[var(--color-accent-hover)] transition-colors">
          <Plus size={12} /> Add
        </button>
      </div>
      <div className="flex items-center gap-3 px-5 py-2 bg-[color:color-mix(in_srgb,var(--color-bg-elevated)_50%,transparent)] border-b border-[var(--color-border-subtle)]">
        {columns.map(c => <div key={c.key} className={cn('text-xs font-semibold text-[var(--color-text-muted)] uppercase tracking-wider', c.width || 'flex-1')}>{c.label}</div>)}
        <div className="w-16 text-right text-xs font-semibold text-[var(--color-text-muted)] uppercase tracking-wider">Actions</div>
      </div>
      <div className="divide-y divide-[var(--color-border-subtle)]">
        {items.map((item, idx) => (
          <div key={item.id} className={cn('flex items-center gap-3 px-5 py-2.5 hover:bg-[color:color-mix(in_srgb,var(--color-bg-elevated)_40%,transparent)]', idx % 2 === 1 && 'bg-[color:color-mix(in_srgb,var(--color-bg-elevated)_20%,transparent)]')}>
            {editingId === item.id ? (
              <>
                {columns.map(c => <input key={c.key} className={cn(inputCls, c.width)} value={form[c.key] ?? ''} type={c.type || 'text'} onChange={e => setForm(p => ({ ...p, [c.key]: e.target.value }))} placeholder={c.placeholder} />)}
                <div className="w-16 flex justify-end gap-1">
                  <button aria-label="Save" title="Save" onClick={save} disabled={loading} className="w-11 md:w-7 h-11 md:h-7 flex items-center justify-center rounded bg-[var(--color-success)] text-[var(--color-on-success)] hover:opacity-90"><Check size={12} /></button>
                  <button onClick={() => setEditingId(null)} className="w-11 md:w-7 h-11 md:h-7 flex items-center justify-center rounded border border-[var(--color-border)] hover:bg-[var(--color-bg-elevated)]"><X size={12} /></button>
                </div>
              </>
            ) : (
              <>
                {columns.map(c => (
                  <div key={c.key} className={cn('text-sm text-[var(--color-text-primary)]', c.width || 'flex-1')}>
                    <div className="flex items-center gap-2">
                      <span>{item[c.key] ?? '—'}</span>
                      {badgeKey && c.key === columns[0].key && item[badgeKey] && (
                        <span className="flex items-center gap-1 text-xs text-[var(--color-warning)] bg-[color:color-mix(in_srgb,var(--color-warning)_10%,transparent)] px-1.5 py-0.5 rounded-full border border-[color:color-mix(in_srgb,var(--color-warning)_20%,transparent)]">
                          <Star size={9} /> {badgeLabel}
                        </span>
                      )}
                    </div>
                  </div>
                ))}
                <div className="w-16 flex justify-end gap-1">
                  <button onClick={() => { setForm(Object.fromEntries(columns.map(c => [c.key, String(item[c.key] ?? '')]))); setEditingId(item.id) }} className="w-11 md:w-7 h-11 md:h-7 flex items-center justify-center rounded text-[var(--color-text-muted)] hover:bg-[var(--color-bg-elevated)] hover:text-[var(--color-text-primary)] transition-colors"><Pencil size={12} /></button>
                  <button onClick={() => setDeleteTarget(item)} className="w-11 md:w-7 h-11 md:h-7 flex items-center justify-center rounded text-[var(--color-text-muted)] hover:bg-[color:color-mix(in_srgb,var(--color-danger)_10%,transparent)] hover:text-[var(--color-danger)] transition-colors"><Trash2 size={12} /></button>
                </div>
              </>
            )}
          </div>
        ))}
        {editingId === 'new' && (
          <div className="flex items-center gap-3 px-5 py-2.5 bg-[color:color-mix(in_srgb,var(--color-accent)_5%,transparent)] border-t border-[color:color-mix(in_srgb,var(--color-accent)_20%,transparent)]">
            {columns.map((c, i) => <input key={c.key} autoFocus={i === 0} className={cn(inputCls, c.width)} value={form[c.key] ?? ''} type={c.type || 'text'} onChange={e => setForm(p => ({ ...p, [c.key]: e.target.value }))} placeholder={c.placeholder + ' *'} />)}
            <div className="w-16 flex justify-end gap-1">
              <button onClick={save} disabled={loading} className="px-2.5 h-11 md:h-8 rounded bg-[var(--color-accent)] text-[var(--color-on-accent)] text-xs font-medium hover:bg-[var(--color-accent-hover)] disabled:opacity-50">Save</button>
              <button onClick={() => setEditingId(null)} className="px-2 h-11 md:h-8 rounded border border-[var(--color-border)] text-xs text-[var(--color-text-secondary)] hover:bg-[var(--color-bg-elevated)]">Cancel</button>
            </div>
          </div>
        )}
        {items.length === 0 && editingId !== 'new' && <div className="px-5 py-8 text-center text-sm text-[var(--color-text-muted)]">No {title.toLowerCase()} added yet.</div>}
      </div>
      <ConfirmDialog open={!!deleteTarget} onClose={() => setDeleteTarget(null)} onConfirm={confirmDelete} title={`Remove ${title}`} message="Remove this item? This cannot be undone." loading={loading} />
    </div>
  )
}

const UNIT_TYPES = ['quantity', 'weight', 'length', 'area', 'volume']

export default function UnitsCurrenciesClient({ initialUnits, initialCurrencies, initialTaxes }: {
  initialUnits: Item[]; initialCurrencies: Item[]; initialTaxes: Item[]
}) {
  const [activeTab, setActiveTab] = useState<'units' | 'currencies' | 'taxes'>('units')
  const [activeUnitType, setActiveUnitType] = useState('quantity')

  const tabs = [{ key: 'units' as const, label: 'Units' }, { key: 'currencies' as const, label: 'Currencies' }, { key: 'taxes' as const, label: 'Tax Rates' }]

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-1 bg-[var(--color-bg-secondary)] border border-[var(--color-border)] rounded-xl p-1 w-fit">
        {tabs.map(t => (
          <button key={t.key} onClick={() => setActiveTab(t.key)}
            className={cn('px-5 h-8 rounded-lg text-sm font-medium transition-all', activeTab === t.key ? 'bg-[var(--color-accent)] text-[var(--color-on-accent)] shadow-sm' : 'text-[var(--color-text-secondary)] hover:text-[var(--color-text-primary)] hover:bg-[var(--color-bg-elevated)]')}>
            {t.label}
          </button>
        ))}
      </div>

      {activeTab === 'units' && (
        <div className="space-y-3">
          <div className="flex items-center gap-1 flex-wrap">
            {UNIT_TYPES.map(t => (
              <button key={t} onClick={() => setActiveUnitType(t)}
                className={cn('px-3 h-7 rounded-md text-xs font-medium capitalize transition-all border', activeUnitType === t ? 'bg-[var(--color-accent)] text-[var(--color-on-accent)] border-transparent' : 'bg-[var(--color-bg-secondary)] text-[var(--color-text-secondary)] border-[var(--color-border)] hover:text-[var(--color-text-primary)]')}>
                {t} ({initialUnits.filter(u => u.unit_type === t).length})
              </button>
            ))}
          </div>
          <SettingsTable key={activeUnitType} title="Units" items={initialUnits.filter(u => u.unit_type === activeUnitType)} apiResource="units"
            columns={[{ key: 'name', label: 'Name', placeholder: 'Unit name' }, { key: 'symbol', label: 'Symbol', placeholder: 'e.g. KG', width: 'w-28' }]} />
        </div>
      )}

      {activeTab === 'currencies' && (
        <SettingsTable title="Currencies" items={initialCurrencies} apiResource="currencies" badgeKey="is_base" badgeLabel="Base"
          columns={[{ key: 'code', label: 'Code', placeholder: 'e.g. PKR', width: 'w-20' }, { key: 'symbol', label: 'Symbol', placeholder: 'e.g. Rs', width: 'w-20' }, { key: 'name', label: 'Name', placeholder: 'Currency name' }, { key: 'exchange_rate_to_base', label: 'Rate', placeholder: '1.00', type: 'number', width: 'w-28' }]} />
      )}

      {activeTab === 'taxes' && (
        <SettingsTable title="Tax Rates" items={initialTaxes} apiResource="taxes" badgeKey="is_default" badgeLabel="Default"
          columns={[{ key: 'name', label: 'Name', placeholder: 'e.g. GST 17%' }, { key: 'rate_percent', label: 'Rate %', placeholder: '17.00', type: 'number', width: 'w-32' }]} />
      )}
    </div>
  )
}
