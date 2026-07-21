'use client'
import { useState, useMemo } from 'react'
import { Plus, Pencil, Trash2, Check, X, Search } from 'lucide-react'
import { cn } from '@/lib/utils/cn'
import { toast } from '@/components/ui/Toast'
import { ConfirmDialog } from '@/components/ui/Modal'

interface ColorSpec {
  id: string
  name: string
  color_type: 'pantone' | 'cmyk' | 'spot' | 'custom'
  pantone_code: string | null
  cmyk_c: number | null
  cmyk_m: number | null
  cmyk_y: number | null
  cmyk_k: number | null
  hex_preview: string | null
  customer_id: string | null
  notes: string | null
  customers?: { name: string } | null
}
interface Customer { id: string; name: string }

const TYPE_LABELS: Record<ColorSpec['color_type'], string> = {
  pantone: 'Pantone', cmyk: 'CMYK Build', spot: 'Spot Mix', custom: 'Custom',
}

const emptyForm = {
  name: '', color_type: 'custom' as ColorSpec['color_type'], pantone_code: '',
  cmyk_c: '', cmyk_m: '', cmyk_y: '', cmyk_k: '', hex_preview: '', customer_id: '', notes: '',
}

const inputCls = 'h-8 px-2.5 rounded-md border text-sm bg-[var(--color-bg-elevated)] text-[var(--color-text-primary)] border-[var(--color-border)] focus:outline-none focus:border-[var(--color-accent)] focus:ring-1 focus:ring-[var(--color-accent)] transition-colors'

export default function ColorLibraryClient({ initialSpecs, customers }: { initialSpecs: ColorSpec[]; customers: Customer[] }) {
  const [specs, setSpecs] = useState(initialSpecs)
  const [search, setSearch] = useState('')
  const [customerFilter, setCustomerFilter] = useState('')
  const [editingId, setEditingId] = useState<string | 'new' | null>(null)
  const [form, setForm] = useState(emptyForm)
  const [loading, setLoading] = useState(false)
  const [deleteTarget, setDeleteTarget] = useState<ColorSpec | null>(null)

  const filtered = useMemo(() => {
    return specs.filter(s => {
      if (customerFilter && s.customer_id !== customerFilter) return false
      if (search && !(`${s.name} ${s.pantone_code ?? ''}`.toLowerCase().includes(search.toLowerCase()))) return false
      return true
    })
  }, [specs, search, customerFilter])

  const startNew = () => { setForm(emptyForm); setEditingId('new') }
  const startEdit = (s: ColorSpec) => {
    setForm({
      name: s.name, color_type: s.color_type, pantone_code: s.pantone_code ?? '',
      cmyk_c: s.cmyk_c != null ? String(s.cmyk_c) : '', cmyk_m: s.cmyk_m != null ? String(s.cmyk_m) : '',
      cmyk_y: s.cmyk_y != null ? String(s.cmyk_y) : '', cmyk_k: s.cmyk_k != null ? String(s.cmyk_k) : '',
      hex_preview: s.hex_preview ?? '', customer_id: s.customer_id ?? '', notes: s.notes ?? '',
    })
    setEditingId(s.id)
  }

  const save = async () => {
    if (!form.name.trim()) { toast.error('Name is required'); return }
    setLoading(true)
    try {
      const isNew = editingId === 'new'
      const payload: Record<string, any> = {
        name: form.name, color_type: form.color_type,
        pantone_code: form.pantone_code || null,
        cmyk_c: form.cmyk_c || null, cmyk_m: form.cmyk_m || null, cmyk_y: form.cmyk_y || null, cmyk_k: form.cmyk_k || null,
        hex_preview: form.hex_preview || null, customer_id: form.customer_id || null, notes: form.notes || null,
      }
      if (!isNew) payload.id = editingId
      const res = await fetch('/api/v1/color-specs', {
        method: isNew ? 'POST' : 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })
      if (!res.ok) { const e = await res.json(); throw new Error(e.error) }
      const { data } = await res.json()
      setSpecs(prev => isNew ? [...prev, data] : prev.map(s => s.id === data.id ? data : s))
      setEditingId(null)
      toast.success(isNew ? 'Color spec added' : 'Color spec updated')
    } catch (e: any) { toast.error(e.message || 'Failed to save') }
    finally { setLoading(false) }
  }

  const confirmDelete = async () => {
    if (!deleteTarget) return
    setLoading(true)
    try {
      const res = await fetch('/api/v1/color-specs', {
        method: 'DELETE', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: deleteTarget.id }),
      })
      if (!res.ok) throw new Error()
      setSpecs(prev => prev.filter(s => s.id !== deleteTarget.id))
      toast.success('Color spec removed')
    } catch { toast.error('Failed to delete') }
    finally { setLoading(false); setDeleteTarget(null) }
  }

  const Swatch = ({ s }: { s: { hex_preview: string | null } }) => (
    <div className="w-6 h-6 rounded-full border border-[var(--color-border)] flex-shrink-0"
      style={{ background: s.hex_preview || 'var(--color-bg-elevated)' }} />
  )

  return (
    <div className="rounded-xl border border-[var(--color-border)] bg-[var(--color-bg-secondary)] overflow-hidden">
      <div className="flex items-center justify-between gap-3 px-4 py-3 border-b border-[var(--color-border)] bg-[var(--color-bg-elevated)] flex-wrap">
        <div className="flex items-center gap-2 flex-1 min-w-[240px]">
          <div className="relative flex-1 max-w-xs">
            <Search size={13} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-[var(--color-text-muted)]" />
            <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search name or Pantone code…"
              className={cn(inputCls, 'w-full pl-7')} />
          </div>
          <select value={customerFilter} onChange={e => setCustomerFilter(e.target.value)} className={inputCls}>
            <option value="">All (global + customer)</option>
            {customers.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
        </div>
        <button onClick={startNew}
          className="flex items-center gap-1 px-2.5 h-7 rounded-md bg-[var(--color-accent)] text-white text-xs font-medium hover:bg-[var(--color-accent-hover)] transition-colors flex-shrink-0">
          <Plus size={12} /> Add Color Spec
        </button>
      </div>

      {editingId === 'new' && (
        <div className="px-4 py-3 bg-[var(--color-accent)]/5 border-b border-[var(--color-accent)]/20 space-y-2">
          <SpecForm form={form} setForm={setForm} customers={customers} />
          <div className="flex gap-2">
            <button onClick={save} disabled={loading || !form.name.trim()}
              className="px-3 h-8 rounded bg-[var(--color-accent)] text-white text-xs font-medium hover:bg-[var(--color-accent-hover)] disabled:opacity-50 transition-colors">Save</button>
            <button onClick={() => setEditingId(null)}
              className="px-3 h-8 rounded border border-[var(--color-border)] text-xs text-[var(--color-text-secondary)] hover:bg-[var(--color-bg-elevated)] transition-colors">Cancel</button>
          </div>
        </div>
      )}

      <div className="divide-y divide-[var(--color-border-subtle)]">
        {filtered.map((s, idx) => (
          <div key={s.id} className={cn('px-4 py-2.5', idx % 2 === 1 && 'bg-[var(--color-bg-elevated)]/20')}>
            {editingId === s.id ? (
              <div className="space-y-2">
                <SpecForm form={form} setForm={setForm} customers={customers} />
                <div className="flex gap-2">
                  <button onClick={save} disabled={loading} className="w-7 h-7 flex items-center justify-center rounded bg-[var(--color-success)] text-white hover:opacity-90"><Check size={12} /></button>
                  <button onClick={() => setEditingId(null)} className="w-7 h-7 flex items-center justify-center rounded border border-[var(--color-border)] text-[var(--color-text-secondary)] hover:bg-[var(--color-bg-elevated)]"><X size={12} /></button>
                </div>
              </div>
            ) : (
              <div className="flex items-center gap-3">
                <Swatch s={s} />
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-medium text-[var(--color-text-primary)]">{s.name}</span>
                    <span className="text-xs px-1.5 py-0.5 rounded bg-[var(--color-bg-elevated)] text-[var(--color-text-muted)]">{TYPE_LABELS[s.color_type]}</span>
                    {s.customers?.name && <span className="text-xs text-[var(--color-accent)]">{s.customers.name}</span>}
                  </div>
                  <div className="text-xs text-[var(--color-text-muted)] mt-0.5">
                    {s.pantone_code && <span className="mr-3">Pantone {s.pantone_code}</span>}
                    {(s.cmyk_c != null || s.cmyk_m != null || s.cmyk_y != null || s.cmyk_k != null) && (
                      <span className="mr-3 font-mono">C{s.cmyk_c ?? 0} M{s.cmyk_m ?? 0} Y{s.cmyk_y ?? 0} K{s.cmyk_k ?? 0}</span>
                    )}
                    {s.notes && <span>{s.notes}</span>}
                  </div>
                </div>
                <div className="flex items-center gap-1 flex-shrink-0">
                  <button onClick={() => startEdit(s)}
                    className="w-7 h-7 flex items-center justify-center rounded text-[var(--color-text-muted)] hover:bg-[var(--color-bg-elevated)] hover:text-[var(--color-text-primary)] transition-colors">
                    <Pencil size={12} />
                  </button>
                  <button onClick={() => setDeleteTarget(s)}
                    className="w-7 h-7 flex items-center justify-center rounded text-[var(--color-text-muted)] hover:bg-[var(--color-danger)]/10 hover:text-[var(--color-danger)] transition-colors">
                    <Trash2 size={12} />
                  </button>
                </div>
              </div>
            )}
          </div>
        ))}

        {filtered.length === 0 && editingId !== 'new' && (
          <div className="px-4 py-8 text-center text-sm text-[var(--color-text-muted)]">
            {specs.length === 0 ? 'No color specs added yet.' : 'No matches for this search/filter.'}
          </div>
        )}
      </div>

      <ConfirmDialog
        open={!!deleteTarget} onClose={() => setDeleteTarget(null)} onConfirm={confirmDelete}
        title="Remove Color Spec" message={`Remove "${deleteTarget?.name}"? Plates that already reference it keep their saved link.`} loading={loading}
      />
    </div>
  )
}

function SpecForm({ form, setForm, customers }: { form: typeof emptyForm; setForm: (fn: (p: typeof emptyForm) => typeof emptyForm) => void; customers: Customer[] }) {
  return (
    <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
      <input autoFocus className={inputCls} value={form.name} onChange={e => setForm(p => ({ ...p, name: e.target.value }))} placeholder="Name *" />
      <select className={inputCls} value={form.color_type} onChange={e => setForm(p => ({ ...p, color_type: e.target.value as any }))}>
        {Object.entries(TYPE_LABELS).map(([k, l]) => <option key={k} value={k}>{l}</option>)}
      </select>
      <select className={inputCls} value={form.customer_id} onChange={e => setForm(p => ({ ...p, customer_id: e.target.value }))}>
        <option value="">Global (no customer)</option>
        {customers.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
      </select>
      <div className="flex items-center gap-1.5">
        <input type="color" value={form.hex_preview || '#cccccc'} onChange={e => setForm(p => ({ ...p, hex_preview: e.target.value }))}
          className="w-8 h-8 rounded border border-[var(--color-border)] bg-transparent cursor-pointer" title="Swatch preview (display only)" />
        <input className={cn(inputCls, 'flex-1')} value={form.hex_preview} onChange={e => setForm(p => ({ ...p, hex_preview: e.target.value }))} placeholder="#hex (optional)" />
      </div>

      {form.color_type === 'pantone' && (
        <input className={inputCls} value={form.pantone_code} onChange={e => setForm(p => ({ ...p, pantone_code: e.target.value }))} placeholder="Pantone code, e.g. 286 C" />
      )}
      {(form.color_type === 'cmyk' || form.color_type === 'spot') && (
        <>
          <input type="number" className={inputCls} value={form.cmyk_c} onChange={e => setForm(p => ({ ...p, cmyk_c: e.target.value }))} placeholder="C %" />
          <input type="number" className={inputCls} value={form.cmyk_m} onChange={e => setForm(p => ({ ...p, cmyk_m: e.target.value }))} placeholder="M %" />
          <input type="number" className={inputCls} value={form.cmyk_y} onChange={e => setForm(p => ({ ...p, cmyk_y: e.target.value }))} placeholder="Y %" />
          <input type="number" className={inputCls} value={form.cmyk_k} onChange={e => setForm(p => ({ ...p, cmyk_k: e.target.value }))} placeholder="K %" />
        </>
      )}
      <input className={cn(inputCls, 'col-span-2 md:col-span-4')} value={form.notes} onChange={e => setForm(p => ({ ...p, notes: e.target.value }))} placeholder="Notes (optional)" />
    </div>
  )
}
