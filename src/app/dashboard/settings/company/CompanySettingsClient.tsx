'use client'
import { useState } from 'react'
import { Building2, GitBranch, Warehouse, Plus, Pencil, Trash2, Check, X, Star } from 'lucide-react'
import { cn } from '@/lib/utils/cn'
import { toast } from '@/components/ui/Toast'
import { ConfirmDialog } from '@/components/ui/Modal'

interface Company { id: string; name: string; ntn: string | null; address: string | null }
interface Branch { id: string; name: string; address: string | null; is_head_office: boolean }
interface WH { id: string; name: string; location: string | null; branch_id: string | null }

interface Props { company: Company | null; branches: Branch[]; warehouses: WH[] }

type EditingRow = { type: 'branch' | 'warehouse'; id: string | null }

export default function CompanySettingsClient({ company: initialCompany, branches: initialBranches, warehouses: initialWarehouses }: Props) {
  const [company, setCompany] = useState(initialCompany)
  const [branches, setBranches] = useState(initialBranches)
  const [warehouses, setWarehouses] = useState(initialWarehouses)
  const [editing, setEditing] = useState<EditingRow | null>(null)
  const [editingCompany, setEditingCompany] = useState(false)
  const [loading, setLoading] = useState(false)
  const [deleteTarget, setDeleteTarget] = useState<{ type: 'branch' | 'warehouse'; id: string; name: string } | null>(null)

  // Company form
  const [companyForm, setCompanyForm] = useState({ name: company?.name ?? '', ntn: company?.ntn ?? '', address: company?.address ?? '' })
  // Branch/Warehouse form
  const [form, setForm] = useState<Record<string, string>>({})

  const saveCompany = async () => {
    setLoading(true)
    try {
      const res = await fetch('/api/v1/company', { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(companyForm) })
      if (!res.ok) throw new Error()
      const { data } = await res.json()
      setCompany(data)
      setEditingCompany(false)
      toast.success('Company profile updated')
    } catch { toast.error('Failed to save company') }
    finally { setLoading(false) }
  }

  const saveBranch = async () => {
    setLoading(true)
    try {
      const isNew = editing?.id === null
      const res = await fetch('/api/v1/branches', {
        method: isNew ? 'POST' : 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(isNew ? form : { id: editing?.id, ...form }),
      })
      if (!res.ok) throw new Error()
      const { data } = await res.json()
      setBranches(prev => isNew ? [...prev, data] : prev.map(b => b.id === data.id ? data : b))
      setEditing(null)
      toast.success(isNew ? 'Branch added' : 'Branch updated')
    } catch { toast.error('Failed to save branch') }
    finally { setLoading(false) }
  }

  const saveWarehouse = async () => {
    setLoading(true)
    try {
      const isNew = editing?.id === null
      const res = await fetch('/api/v1/warehouses', {
        method: isNew ? 'POST' : 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(isNew ? form : { id: editing?.id, ...form }),
      })
      if (!res.ok) throw new Error()
      const { data } = await res.json()
      setWarehouses(prev => isNew ? [...prev, data] : prev.map(w => w.id === data.id ? data : w))
      setEditing(null)
      toast.success(isNew ? 'Warehouse added' : 'Warehouse updated')
    } catch { toast.error('Failed to save warehouse') }
    finally { setLoading(false) }
  }

  const confirmDelete = async () => {
    if (!deleteTarget) return
    setLoading(true)
    try {
      const endpoint = deleteTarget.type === 'branch' ? '/api/v1/branches' : '/api/v1/warehouses'
      const res = await fetch(endpoint, { method: 'DELETE', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id: deleteTarget.id }) })
      if (!res.ok) throw new Error()
      if (deleteTarget.type === 'branch') setBranches(prev => prev.filter(b => b.id !== deleteTarget.id))
      else setWarehouses(prev => prev.filter(w => w.id !== deleteTarget.id))
      toast.success(`${deleteTarget.type === 'branch' ? 'Branch' : 'Warehouse'} removed`)
    } catch { toast.error('Failed to delete') }
    finally { setLoading(false); setDeleteTarget(null) }
  }

  const inputCls = 'w-full h-9 px-3 rounded-md border text-sm bg-[var(--color-bg-elevated)] text-[var(--color-text-primary)] border-[var(--color-border)] placeholder:text-[var(--color-text-muted)] focus:outline-none focus:border-[var(--color-accent)] focus:ring-1 focus:ring-[var(--color-accent)] transition-colors'

  return (
    <div className="space-y-6">
      {/* ─── Company Profile ─── */}
      <div className="rounded-xl border border-[var(--color-border)] bg-[var(--color-bg-secondary)] overflow-hidden">
        <div className="flex items-center justify-between px-5 py-4 border-b border-[var(--color-border)]">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-lg bg-[var(--color-accent)]/10 flex items-center justify-center">
              <Building2 size={16} className="text-[var(--color-accent)]" />
            </div>
            <h2 className="text-base font-semibold text-[var(--color-text-primary)]">Company Profile</h2>
          </div>
          {!editingCompany && (
            <button onClick={() => { setCompanyForm({ name: company?.name ?? '', ntn: company?.ntn ?? '', address: company?.address ?? '' }); setEditingCompany(true) }}
              className="flex items-center gap-1.5 text-sm text-[var(--color-accent)] hover:underline">
              <Pencil size={13} /> Edit
            </button>
          )}
        </div>
        <div className="p-5">
          {editingCompany ? (
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div className="col-span-2 space-y-1.5">
                  <label className="text-sm font-medium text-[var(--color-text-primary)]">Company Name <span className="text-[var(--color-danger)]">*</span></label>
                  <input className={inputCls} value={companyForm.name} onChange={e => setCompanyForm(p => ({ ...p, name: e.target.value }))} placeholder="Jafson Print Pack" />
                </div>
                <div className="space-y-1.5">
                  <label className="text-sm font-medium text-[var(--color-text-primary)]">NTN Number</label>
                  <input className={inputCls} value={companyForm.ntn} onChange={e => setCompanyForm(p => ({ ...p, ntn: e.target.value }))} placeholder="1234567-8" />
                </div>
                <div className="space-y-1.5">
                  <label className="text-sm font-medium text-[var(--color-text-primary)]">Address</label>
                  <input className={inputCls} value={companyForm.address} onChange={e => setCompanyForm(p => ({ ...p, address: e.target.value }))} placeholder="Lahore, Pakistan" />
                </div>
              </div>
              <div className="flex gap-2">
                <button onClick={saveCompany} disabled={loading || !companyForm.name}
                  className="flex items-center gap-1.5 px-4 h-9 rounded-md bg-[var(--color-accent)] text-white text-sm font-medium hover:bg-[var(--color-accent-hover)] disabled:opacity-50 transition-colors">
                  <Check size={14} /> Save Changes
                </button>
                <button onClick={() => setEditingCompany(false)}
                  className="flex items-center gap-1.5 px-4 h-9 rounded-md border border-[var(--color-border)] text-sm text-[var(--color-text-secondary)] hover:bg-[var(--color-bg-elevated)] transition-colors">
                  <X size={14} /> Cancel
                </button>
              </div>
            </div>
          ) : (
            <div className="grid grid-cols-3 gap-6">
              {[
                { label: 'Company Name', value: company?.name },
                { label: 'NTN Number', value: company?.ntn || '—' },
                { label: 'Address', value: company?.address || '—' },
              ].map(f => (
                <div key={f.label}>
                  <p className="text-xs text-[var(--color-text-muted)] mb-1">{f.label}</p>
                  <p className="text-sm font-medium text-[var(--color-text-primary)]">{f.value}</p>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* ─── Branches ─── */}
      <div className="rounded-xl border border-[var(--color-border)] bg-[var(--color-bg-secondary)] overflow-hidden">
        <div className="flex items-center justify-between px-5 py-4 border-b border-[var(--color-border)]">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-lg bg-[var(--color-info)]/10 flex items-center justify-center">
              <GitBranch size={16} className="text-[var(--color-info)]" />
            </div>
            <div>
              <h2 className="text-base font-semibold text-[var(--color-text-primary)]">Branches</h2>
              <p className="text-xs text-[var(--color-text-muted)]">{branches.length} branch{branches.length !== 1 ? 'es' : ''}</p>
            </div>
          </div>
          <button onClick={() => { setForm({ name: '', address: '', is_head_office: 'false' }); setEditing({ type: 'branch', id: null }) }}
            className="flex items-center gap-1.5 px-3 h-8 rounded-md bg-[var(--color-accent)] text-white text-sm font-medium hover:bg-[var(--color-accent-hover)] transition-colors">
            <Plus size={14} /> Add Branch
          </button>
        </div>
        <div className="divide-y divide-[var(--color-border-subtle)]">
          {branches.map(branch => (
            <div key={branch.id} className="flex items-center gap-4 px-5 py-3 hover:bg-[var(--color-bg-elevated)]/50">
              {editing?.type === 'branch' && editing?.id === branch.id ? (
                <div className="flex-1 flex items-center gap-3">
                  <input className={cn(inputCls, 'flex-1')} value={form.name ?? ''} onChange={e => setForm(p => ({ ...p, name: e.target.value }))} placeholder="Branch name" />
                  <input className={cn(inputCls, 'flex-1')} value={form.address ?? ''} onChange={e => setForm(p => ({ ...p, address: e.target.value }))} placeholder="Address" />
                  <button onClick={saveBranch} disabled={loading} className="px-3 h-9 rounded-md bg-[var(--color-success)] text-white text-sm hover:opacity-90 disabled:opacity-50"><Check size={14} /></button>
                  <button onClick={() => setEditing(null)} className="px-3 h-9 rounded-md border border-[var(--color-border)] text-sm hover:bg-[var(--color-bg-elevated)]"><X size={14} /></button>
                </div>
              ) : (
                <>
                  <div className="flex-1">
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-medium text-[var(--color-text-primary)]">{branch.name}</span>
                      {branch.is_head_office && (
                        <span className="flex items-center gap-1 text-xs text-[var(--color-warning)] bg-[var(--color-warning)]/10 px-2 py-0.5 rounded-full border border-[var(--color-warning)]/20">
                          <Star size={10} /> Head Office
                        </span>
                      )}
                    </div>
                    {branch.address && <p className="text-xs text-[var(--color-text-muted)] mt-0.5">{branch.address}</p>}
                  </div>
                  <div className="flex items-center gap-1">
                    <button onClick={() => { setForm({ name: branch.name, address: branch.address ?? '', is_head_office: String(branch.is_head_office) }); setEditing({ type: 'branch', id: branch.id }) }}
                      className="w-8 h-8 flex items-center justify-center rounded-md text-[var(--color-text-muted)] hover:bg-[var(--color-bg-elevated)] hover:text-[var(--color-text-primary)] transition-colors">
                      <Pencil size={13} />
                    </button>
                    {!branch.is_head_office && (
                      <button onClick={() => setDeleteTarget({ type: 'branch', id: branch.id, name: branch.name })}
                        className="w-8 h-8 flex items-center justify-center rounded-md text-[var(--color-text-muted)] hover:bg-[var(--color-danger)]/10 hover:text-[var(--color-danger)] transition-colors">
                        <Trash2 size={13} />
                      </button>
                    )}
                  </div>
                </>
              )}
            </div>
          ))}

          {/* New branch inline form */}
          {editing?.type === 'branch' && editing?.id === null && (
            <div className="flex items-center gap-3 px-5 py-3 bg-[var(--color-accent)]/5 border-t border-[var(--color-accent)]/20">
              <input autoFocus className={cn(inputCls, 'flex-1')} value={form.name ?? ''} onChange={e => setForm(p => ({ ...p, name: e.target.value }))} placeholder="Branch name *" />
              <input className={cn(inputCls, 'flex-1')} value={form.address ?? ''} onChange={e => setForm(p => ({ ...p, address: e.target.value }))} placeholder="Address (optional)" />
              <button onClick={saveBranch} disabled={loading || !form.name} className="px-4 h-9 rounded-md bg-[var(--color-accent)] text-white text-sm font-medium hover:bg-[var(--color-accent-hover)] disabled:opacity-50 transition-colors">Save</button>
              <button onClick={() => setEditing(null)} className="px-3 h-9 rounded-md border border-[var(--color-border)] text-sm text-[var(--color-text-secondary)] hover:bg-[var(--color-bg-elevated)] transition-colors">Cancel</button>
            </div>
          )}

          {branches.length === 0 && !editing && (
            <div className="px-5 py-8 text-center text-sm text-[var(--color-text-muted)]">No branches yet. Add your first branch.</div>
          )}
        </div>
      </div>

      {/* ─── Warehouses ─── */}
      <div className="rounded-xl border border-[var(--color-border)] bg-[var(--color-bg-secondary)] overflow-hidden">
        <div className="flex items-center justify-between px-5 py-4 border-b border-[var(--color-border)]">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-lg bg-[var(--color-success)]/10 flex items-center justify-center">
              <Warehouse size={16} className="text-[var(--color-success)]" />
            </div>
            <div>
              <h2 className="text-base font-semibold text-[var(--color-text-primary)]">Warehouses / Stores</h2>
              <p className="text-xs text-[var(--color-text-muted)]">{warehouses.length} location{warehouses.length !== 1 ? 's' : ''}</p>
            </div>
          </div>
          <button onClick={() => { setForm({ name: '', location: '', branch_id: '' }); setEditing({ type: 'warehouse', id: null }) }}
            className="flex items-center gap-1.5 px-3 h-8 rounded-md bg-[var(--color-accent)] text-white text-sm font-medium hover:bg-[var(--color-accent-hover)] transition-colors">
            <Plus size={14} /> Add Warehouse
          </button>
        </div>
        <div className="divide-y divide-[var(--color-border-subtle)]">
          {warehouses.map(wh => {
            const branch = branches.find(b => b.id === wh.branch_id)
            return (
              <div key={wh.id} className="flex items-center gap-4 px-5 py-3 hover:bg-[var(--color-bg-elevated)]/50">
                {editing?.type === 'warehouse' && editing?.id === wh.id ? (
                  <div className="flex-1 flex items-center gap-3">
                    <input className={cn(inputCls, 'flex-1')} value={form.name ?? ''} onChange={e => setForm(p => ({ ...p, name: e.target.value }))} placeholder="Warehouse name" />
                    <input className={cn(inputCls, 'flex-1')} value={form.location ?? ''} onChange={e => setForm(p => ({ ...p, location: e.target.value }))} placeholder="Location" />
                    <select className={cn(inputCls, 'w-40')} value={form.branch_id ?? ''} onChange={e => setForm(p => ({ ...p, branch_id: e.target.value }))}>
                      <option value="">No Branch</option>
                      {branches.map(b => <option key={b.id} value={b.id}>{b.name}</option>)}
                    </select>
                    <button onClick={saveWarehouse} disabled={loading} className="px-3 h-9 rounded-md bg-[var(--color-success)] text-white text-sm hover:opacity-90"><Check size={14} /></button>
                    <button onClick={() => setEditing(null)} className="px-3 h-9 rounded-md border border-[var(--color-border)] text-sm hover:bg-[var(--color-bg-elevated)]"><X size={14} /></button>
                  </div>
                ) : (
                  <>
                    <div className="flex-1">
                      <span className="text-sm font-medium text-[var(--color-text-primary)]">{wh.name}</span>
                      <div className="flex items-center gap-3 mt-0.5">
                        {wh.location && <span className="text-xs text-[var(--color-text-muted)]">{wh.location}</span>}
                        {branch && <span className="text-xs text-[var(--color-info)] bg-[var(--color-info)]/10 px-1.5 py-0.5 rounded">{branch.name}</span>}
                      </div>
                    </div>
                    <div className="flex items-center gap-1">
                      <button onClick={() => { setForm({ name: wh.name, location: wh.location ?? '', branch_id: wh.branch_id ?? '' }); setEditing({ type: 'warehouse', id: wh.id }) }}
                        className="w-8 h-8 flex items-center justify-center rounded-md text-[var(--color-text-muted)] hover:bg-[var(--color-bg-elevated)] hover:text-[var(--color-text-primary)] transition-colors">
                        <Pencil size={13} />
                      </button>
                      <button onClick={() => setDeleteTarget({ type: 'warehouse', id: wh.id, name: wh.name })}
                        className="w-8 h-8 flex items-center justify-center rounded-md text-[var(--color-text-muted)] hover:bg-[var(--color-danger)]/10 hover:text-[var(--color-danger)] transition-colors">
                        <Trash2 size={13} />
                      </button>
                    </div>
                  </>
                )}
              </div>
            )
          })}

          {editing?.type === 'warehouse' && editing?.id === null && (
            <div className="flex items-center gap-3 px-5 py-3 bg-[var(--color-accent)]/5 border-t border-[var(--color-accent)]/20">
              <input autoFocus className={cn(inputCls, 'flex-1')} value={form.name ?? ''} onChange={e => setForm(p => ({ ...p, name: e.target.value }))} placeholder="Warehouse name *" />
              <input className={cn(inputCls, 'flex-1')} value={form.location ?? ''} onChange={e => setForm(p => ({ ...p, location: e.target.value }))} placeholder="Location (optional)" />
              <select className={cn(inputCls, 'w-40')} value={form.branch_id ?? ''} onChange={e => setForm(p => ({ ...p, branch_id: e.target.value }))}>
                <option value="">No Branch</option>
                {branches.map(b => <option key={b.id} value={b.id}>{b.name}</option>)}
              </select>
              <button onClick={saveWarehouse} disabled={loading || !form.name} className="px-4 h-9 rounded-md bg-[var(--color-accent)] text-white text-sm font-medium hover:bg-[var(--color-accent-hover)] disabled:opacity-50 transition-colors">Save</button>
              <button onClick={() => setEditing(null)} className="px-3 h-9 rounded-md border border-[var(--color-border)] text-sm text-[var(--color-text-secondary)] hover:bg-[var(--color-bg-elevated)] transition-colors">Cancel</button>
            </div>
          )}

          {warehouses.length === 0 && !editing && (
            <div className="px-5 py-8 text-center text-sm text-[var(--color-text-muted)]">No warehouses yet. Add your first warehouse.</div>
          )}
        </div>
      </div>

      <ConfirmDialog
        open={!!deleteTarget}
        onClose={() => setDeleteTarget(null)}
        onConfirm={confirmDelete}
        title={`Delete ${deleteTarget?.type === 'branch' ? 'Branch' : 'Warehouse'}`}
        message={`Are you sure you want to remove "${deleteTarget?.name}"? This action cannot be undone.`}
        loading={loading}
      />
    </div>
  )
}
