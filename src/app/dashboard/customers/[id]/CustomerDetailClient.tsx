'use client'
import { useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { ArrowLeft, Pencil, Plus, Trash2, Check, X, Phone, Mail, MapPin, User, Building2, Star } from 'lucide-react'
import { cn } from '@/lib/utils/cn'
import { toast } from '@/components/ui/Toast'
import { ConfirmDialog } from '@/components/ui/Modal'
import { Badge } from '@/components/ui'
import { INDUSTRIES } from '@/modules/crm/customers/types/customer.types'

interface Customer { id: string; customer_code: string; name: string; business_type: string; pipeline_stage: string; ntn: string | null; strn: string | null; email: string | null; phone: string | null; mobile: string | null; website: string | null; industry: string | null; credit_limit: number; payment_terms: number; notes: string | null }
interface Contact { id: string; name: string; designation: string | null; email: string | null; phone: string | null; mobile: string | null; is_primary: boolean }
interface Address { id: string; label: string; address_type: string; address_line1: string; address_line2: string | null; city: string | null; country: string; is_default: boolean }

interface Props { customer: Customer; contacts: Contact[]; addresses: Address[] }

const inputCls = 'w-full h-9 px-3 rounded-md border text-sm bg-[var(--color-bg-elevated)] text-[var(--color-text-primary)] border-[var(--color-border)] focus:outline-none focus:border-[var(--color-accent)] focus:ring-1 focus:ring-[var(--color-accent)] transition-colors'

const STAGE_CFG: Record<string, { label: string; color: string; next: string | null; nextLabel: string }> = {
  lead:     { label: 'Lead',     color: 'text-[var(--color-text-muted)] bg-[var(--color-bg-elevated)] border-[var(--color-border)]', next: 'prospect', nextLabel: 'Mark as Prospect' },
  prospect: { label: 'Prospect', color: 'text-[var(--color-warning)] bg-[var(--color-warning)]/10 border-[var(--color-warning)]/20', next: 'customer', nextLabel: 'Mark as Customer' },
  customer: { label: 'Customer', color: 'text-[var(--color-success)] bg-[var(--color-success)]/10 border-[var(--color-success)]/20', next: null, nextLabel: '' },
}

export default function CustomerDetailClient({ customer: initial, contacts: initialContacts, addresses: initialAddresses }: Props) {
  const router = useRouter()
  const [customer, setCustomer] = useState(initial)
  const [contacts, setContacts] = useState(initialContacts)
  const [addresses, setAddresses] = useState(initialAddresses)
  const [editingInfo, setEditingInfo] = useState(false)
  const [infoForm, setInfoForm] = useState({ name: customer.name, business_type: customer.business_type, ntn: customer.ntn || '', strn: customer.strn || '', email: customer.email || '', phone: customer.phone || '', mobile: customer.mobile || '', website: customer.website || '', industry: customer.industry || '', credit_limit: String(customer.credit_limit), payment_terms: String(customer.payment_terms), notes: customer.notes || '' })
  const [newContact, setNewContact] = useState<null | Record<string, string>>(null)
  const [newAddress, setNewAddress] = useState<null | Record<string, string>>(null)
  const [loading, setLoading] = useState(false)
  const [deleteTarget, setDeleteTarget] = useState<{ type: 'contact' | 'address' | 'customer'; id: string; name: string } | null>(null)
  const [activeTab, setActiveTab] = useState<'info' | 'contacts' | 'addresses'>('info')

  const promoteStage = async (nextStage: string) => {
    setLoading(true)
    try {
      const res = await fetch(`/api/v1/customers/${customer.id}`, {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ pipeline_stage: nextStage }),
      })
      if (!res.ok) { const e = await res.json(); throw new Error(e.error) }
      const { data } = await res.json()
      setCustomer(data)
      toast.success(`Moved to ${STAGE_CFG[nextStage]?.label || nextStage}`)
    } catch (e: any) { toast.error(e.message || 'Failed') }
    finally { setLoading(false) }
  }

  const saveInfo = async () => {
    setLoading(true)
    try {
      const res = await fetch(`/api/v1/customers/${customer.id}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(infoForm) })
      if (!res.ok) throw new Error()
      const { data } = await res.json()
      setCustomer(data)
      setEditingInfo(false)
      toast.success('Customer updated')
    } catch { toast.error('Failed to update') }
    finally { setLoading(false) }
  }

  const saveContact = async () => {
    if (!newContact?.name) { toast.error('Name is required'); return }
    setLoading(true)
    try {
      const res = await fetch('/api/v1/contacts', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ...newContact, customer_id: customer.id, is_primary: contacts.length === 0 }) })
      const { data } = await res.json()
      setContacts(prev => [...prev, data])
      setNewContact(null)
      toast.success('Contact added')
    } catch { toast.error('Failed') }
    finally { setLoading(false) }
  }

  const saveAddress = async () => {
    if (!newAddress?.address_line1) { toast.error('Address is required'); return }
    setLoading(true)
    try {
      const res = await fetch('/api/v1/addresses', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ...newAddress, customer_id: customer.id, is_default: addresses.length === 0 }) })
      const { data } = await res.json()
      setAddresses(prev => [...prev, data])
      setNewAddress(null)
      toast.success('Address added')
    } catch { toast.error('Failed') }
    finally { setLoading(false) }
  }

  const confirmDelete = async () => {
    if (!deleteTarget) return
    setLoading(true)
    try {
      if (deleteTarget.type === 'contact') {
        await fetch('/api/v1/contacts', { method: 'DELETE', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id: deleteTarget.id }) })
        setContacts(prev => prev.filter(c => c.id !== deleteTarget.id))
      } else if (deleteTarget.type === 'address') {
        await fetch('/api/v1/addresses', { method: 'DELETE', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id: deleteTarget.id }) })
        setAddresses(prev => prev.filter(a => a.id !== deleteTarget.id))
      } else {
        await fetch(`/api/v1/customers/${customer.id}`, { method: 'DELETE' })
        router.push('/dashboard/customers')
      }
      toast.success('Removed')
    } catch { toast.error('Failed') }
    finally { setLoading(false); setDeleteTarget(null) }
  }

  return (
    <div className="max-w-4xl space-y-5">
      {/* Header */}
      <div className="flex items-center gap-3">
        <Link href="/dashboard/customers" className="w-8 h-8 flex items-center justify-center rounded-md border border-[var(--color-border)] text-[var(--color-text-muted)] hover:bg-[var(--color-bg-elevated)] transition-colors">
          <ArrowLeft size={15} />
        </Link>
        <div className="flex-1">
          <div className="flex items-center gap-3">
            <h1 className="text-2xl font-bold text-[var(--color-text-primary)]">{customer.name}</h1>
            <span className="text-sm font-mono text-[var(--color-text-muted)] bg-[var(--color-bg-elevated)] border border-[var(--color-border)] px-2 py-0.5 rounded">{customer.customer_code}</span>
            <span className={cn('text-xs px-2 py-0.5 rounded-full border font-medium', (STAGE_CFG[customer.pipeline_stage] || STAGE_CFG.customer).color)}>
              {(STAGE_CFG[customer.pipeline_stage] || STAGE_CFG.customer).label}
            </span>
          </div>
          <p className="text-sm text-[var(--color-text-muted)] mt-0.5 capitalize">{customer.business_type} · {customer.industry || 'No industry'}</p>
        </div>
        {STAGE_CFG[customer.pipeline_stage]?.next && (
          <button onClick={() => promoteStage(STAGE_CFG[customer.pipeline_stage].next!)} disabled={loading}
            className="flex items-center gap-1.5 px-3 h-8 rounded-md border border-[var(--color-accent)]/30 text-[var(--color-accent)] text-sm hover:bg-[var(--color-accent)]/10 transition-colors disabled:opacity-50">
            <Check size={13} /> {STAGE_CFG[customer.pipeline_stage].nextLabel}
          </button>
        )}
        <button onClick={() => setDeleteTarget({ type: 'customer', id: customer.id, name: customer.name })}
          className="flex items-center gap-1.5 px-3 h-8 rounded-md border border-[var(--color-danger)]/30 text-[var(--color-danger)] text-sm hover:bg-[var(--color-danger)]/10 transition-colors">
          <Trash2 size={13} /> Delete
        </button>
      </div>

      {/* Tabs */}
      <div className="flex items-center gap-1 bg-[var(--color-bg-secondary)] border border-[var(--color-border)] rounded-xl p-1 w-fit">
        {[{ key: 'info', label: 'Information' }, { key: 'contacts', label: `Contacts (${contacts.length})` }, { key: 'addresses', label: `Addresses (${addresses.length})` }].map(t => (
          <button key={t.key} onClick={() => setActiveTab(t.key as any)}
            className={cn('px-4 h-8 rounded-lg text-sm font-medium transition-all', activeTab === t.key ? 'bg-[var(--color-accent)] text-white' : 'text-[var(--color-text-secondary)] hover:text-[var(--color-text-primary)] hover:bg-[var(--color-bg-elevated)]')}>
            {t.label}
          </button>
        ))}
      </div>

      {/* Info Tab */}
      {activeTab === 'info' && (
        <div className="rounded-xl border border-[var(--color-border)] bg-[var(--color-bg-secondary)] overflow-hidden">
          <div className="flex items-center justify-between px-5 py-4 border-b border-[var(--color-border)] bg-[var(--color-bg-elevated)]">
            <h2 className="text-sm font-semibold text-[var(--color-text-primary)]">Customer Information</h2>
            {!editingInfo && <button onClick={() => setEditingInfo(true)} className="flex items-center gap-1.5 text-sm text-[var(--color-accent)] hover:underline"><Pencil size={13} /> Edit</button>}
          </div>
          <div className="p-5">
            {editingInfo ? (
              <div className="grid grid-cols-2 gap-4">
                {[
                  { key: 'name', label: 'Name', req: true }, { key: 'email', label: 'Email', type: 'email' },
                  { key: 'phone', label: 'Phone' }, { key: 'mobile', label: 'Mobile' },
                  { key: 'ntn', label: 'NTN' }, { key: 'strn', label: 'STRN' },
                  { key: 'credit_limit', label: 'Credit Limit', type: 'number' },
                  { key: 'payment_terms', label: 'Payment Terms (Days)', type: 'number' },
                ].map(f => (
                  <div key={f.key} className="space-y-1.5">
                    <label className="text-sm font-medium text-[var(--color-text-primary)]">{f.label}{f.req && <span className="text-[var(--color-danger)]"> *</span>}</label>
                    <input className={inputCls} type={f.type || 'text'} value={(infoForm as any)[f.key]} onChange={e => setInfoForm(p => ({ ...p, [f.key]: e.target.value }))} />
                  </div>
                ))}
                <div className="space-y-1.5">
                  <label className="text-sm font-medium text-[var(--color-text-primary)]">Industry</label>
                  <select className={inputCls} value={infoForm.industry} onChange={e => setInfoForm(p => ({ ...p, industry: e.target.value }))}>
                    <option value="">Select</option>
                    {INDUSTRIES.map(i => <option key={i} value={i}>{i}</option>)}
                  </select>
                </div>
                <div className="space-y-1.5">
                  <label className="text-sm font-medium text-[var(--color-text-primary)]">Website</label>
                  <input className={inputCls} value={infoForm.website} onChange={e => setInfoForm(p => ({ ...p, website: e.target.value }))} />
                </div>
                <div className="col-span-2 space-y-1.5">
                  <label className="text-sm font-medium text-[var(--color-text-primary)]">Notes</label>
                  <textarea className={cn(inputCls, 'h-20 resize-none py-2')} value={infoForm.notes} onChange={e => setInfoForm(p => ({ ...p, notes: e.target.value }))} />
                </div>
                <div className="col-span-2 flex gap-2">
                  <button onClick={saveInfo} disabled={loading} className="flex items-center gap-1.5 px-4 h-9 rounded-md bg-[var(--color-accent)] text-white text-sm font-medium hover:bg-[var(--color-accent-hover)] disabled:opacity-50 transition-colors"><Check size={14} /> Save</button>
                  <button onClick={() => setEditingInfo(false)} className="px-4 h-9 rounded-md border border-[var(--color-border)] text-sm text-[var(--color-text-secondary)] hover:bg-[var(--color-bg-elevated)] transition-colors">Cancel</button>
                </div>
              </div>
            ) : (
              <div className="grid grid-cols-3 gap-6">
                {[
                  { label: 'Email', value: customer.email }, { label: 'Phone', value: customer.phone },
                  { label: 'Mobile', value: customer.mobile }, { label: 'Website', value: customer.website },
                  { label: 'NTN', value: customer.ntn }, { label: 'STRN', value: customer.strn },
                  { label: 'Credit Limit', value: customer.credit_limit ? `PKR ${Number(customer.credit_limit).toLocaleString()}` : '—' },
                  { label: 'Payment Terms', value: `${customer.payment_terms} days` },
                  { label: 'Industry', value: customer.industry },
                ].map(f => (
                  <div key={f.label}>
                    <p className="text-xs text-[var(--color-text-muted)] mb-0.5">{f.label}</p>
                    <p className="text-sm text-[var(--color-text-primary)]">{f.value || '—'}</p>
                  </div>
                ))}
                {customer.notes && (
                  <div className="col-span-3">
                    <p className="text-xs text-[var(--color-text-muted)] mb-0.5">Notes</p>
                    <p className="text-sm text-[var(--color-text-secondary)]">{customer.notes}</p>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      )}

      {/* Contacts Tab */}
      {activeTab === 'contacts' && (
        <div className="rounded-xl border border-[var(--color-border)] bg-[var(--color-bg-secondary)] overflow-hidden">
          <div className="flex items-center justify-between px-5 py-4 border-b border-[var(--color-border)] bg-[var(--color-bg-elevated)]">
            <h2 className="text-sm font-semibold text-[var(--color-text-primary)]">Contacts</h2>
            <button onClick={() => setNewContact({ name: '', designation: '', email: '', phone: '', mobile: '' })}
              className="flex items-center gap-1.5 px-3 h-8 rounded-md bg-[var(--color-accent)] text-white text-sm font-medium hover:bg-[var(--color-accent-hover)] transition-colors">
              <Plus size={14} /> Add Contact
            </button>
          </div>
          <div className="divide-y divide-[var(--color-border-subtle)]">
            {contacts.map(c => (
              <div key={c.id} className="flex items-center gap-4 px-5 py-4 hover:bg-[var(--color-bg-elevated)]/40">
                <div className="w-10 h-10 rounded-full bg-[var(--color-accent)]/10 border border-[var(--color-accent)]/20 flex items-center justify-center flex-shrink-0">
                  <span className="text-sm font-bold text-[var(--color-accent)]">{c.name.charAt(0)}</span>
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-medium text-[var(--color-text-primary)]">{c.name}</span>
                    {c.is_primary && <span className="flex items-center gap-1 text-xs text-[var(--color-warning)] bg-[var(--color-warning)]/10 px-1.5 py-0.5 rounded-full border border-[var(--color-warning)]/20"><Star size={9} /> Primary</span>}
                  </div>
                  {c.designation && <p className="text-xs text-[var(--color-text-muted)]">{c.designation}</p>}
                  <div className="flex items-center gap-4 mt-1">
                    {c.mobile && <span className="flex items-center gap-1 text-xs text-[var(--color-text-secondary)]"><Phone size={10} />{c.mobile}</span>}
                    {c.email && <span className="flex items-center gap-1 text-xs text-[var(--color-text-secondary)]"><Mail size={10} />{c.email}</span>}
                  </div>
                </div>
                <button onClick={() => setDeleteTarget({ type: 'contact', id: c.id, name: c.name })}
                  className="w-7 h-7 flex items-center justify-center rounded text-[var(--color-text-muted)] hover:bg-[var(--color-danger)]/10 hover:text-[var(--color-danger)] transition-colors">
                  <Trash2 size={13} />
                </button>
              </div>
            ))}
            {newContact && (
              <div className="flex items-center gap-3 px-5 py-4 bg-[var(--color-accent)]/5 border-t border-[var(--color-accent)]/20">
                {['name', 'designation', 'email', 'phone', 'mobile'].map((k, i) => (
                  <input key={k} autoFocus={i === 0} className={cn(inputCls, 'flex-1')} value={newContact[k] ?? ''} onChange={e => setNewContact(p => ({ ...p!, [k]: e.target.value }))} placeholder={k.charAt(0).toUpperCase() + k.slice(1) + (k === 'name' ? ' *' : '')} />
                ))}
                <button onClick={saveContact} disabled={loading} className="px-3 h-9 rounded-md bg-[var(--color-accent)] text-white text-sm font-medium hover:bg-[var(--color-accent-hover)] disabled:opacity-50">Save</button>
                <button onClick={() => setNewContact(null)} className="px-3 h-9 rounded-md border border-[var(--color-border)] text-sm hover:bg-[var(--color-bg-elevated)]">Cancel</button>
              </div>
            )}
            {contacts.length === 0 && !newContact && <div className="px-5 py-10 text-center text-sm text-[var(--color-text-muted)]">No contacts added yet.</div>}
          </div>
        </div>
      )}

      {/* Addresses Tab */}
      {activeTab === 'addresses' && (
        <div className="rounded-xl border border-[var(--color-border)] bg-[var(--color-bg-secondary)] overflow-hidden">
          <div className="flex items-center justify-between px-5 py-4 border-b border-[var(--color-border)] bg-[var(--color-bg-elevated)]">
            <h2 className="text-sm font-semibold text-[var(--color-text-primary)]">Addresses</h2>
            <button onClick={() => setNewAddress({ label: '', address_type: 'billing', address_line1: '', address_line2: '', city: '', country: 'Pakistan' })}
              className="flex items-center gap-1.5 px-3 h-8 rounded-md bg-[var(--color-accent)] text-white text-sm font-medium hover:bg-[var(--color-accent-hover)] transition-colors">
              <Plus size={14} /> Add Address
            </button>
          </div>
          <div className="divide-y divide-[var(--color-border-subtle)]">
            {addresses.map(a => (
              <div key={a.id} className="flex items-start gap-4 px-5 py-4 hover:bg-[var(--color-bg-elevated)]/40">
                <div className="w-8 h-8 rounded-lg bg-[var(--color-info)]/10 flex items-center justify-center flex-shrink-0 mt-0.5">
                  <MapPin size={14} className="text-[var(--color-info)]" />
                </div>
                <div className="flex-1">
                  <div className="flex items-center gap-2 mb-0.5">
                    <span className="text-sm font-medium text-[var(--color-text-primary)]">{a.label}</span>
                    <span className="text-xs capitalize text-[var(--color-info)] bg-[var(--color-info)]/10 px-1.5 py-0.5 rounded border border-[var(--color-info)]/20">{a.address_type}</span>
                    {a.is_default && <span className="text-xs text-[var(--color-warning)] bg-[var(--color-warning)]/10 px-1.5 py-0.5 rounded border border-[var(--color-warning)]/20">Default</span>}
                  </div>
                  <p className="text-sm text-[var(--color-text-secondary)]">{a.address_line1}{a.address_line2 ? `, ${a.address_line2}` : ''}</p>
                  {(a.city || a.country) && <p className="text-xs text-[var(--color-text-muted)]">{[a.city, a.country].filter(Boolean).join(', ')}</p>}
                </div>
                <button onClick={() => setDeleteTarget({ type: 'address', id: a.id, name: a.label })}
                  className="w-7 h-7 flex items-center justify-center rounded text-[var(--color-text-muted)] hover:bg-[var(--color-danger)]/10 hover:text-[var(--color-danger)] transition-colors">
                  <Trash2 size={13} />
                </button>
              </div>
            ))}
            {newAddress && (
              <div className="px-5 py-4 bg-[var(--color-accent)]/5 border-t border-[var(--color-accent)]/20 space-y-3">
                <div className="grid grid-cols-3 gap-3">
                  <input autoFocus className={inputCls} value={newAddress.label} onChange={e => setNewAddress(p => ({ ...p!, label: e.target.value }))} placeholder="Label (e.g. Head Office) *" />
                  <select className={inputCls} value={newAddress.address_type} onChange={e => setNewAddress(p => ({ ...p!, address_type: e.target.value }))}>
                    <option value="billing">Billing</option>
                    <option value="delivery">Delivery</option>
                    <option value="both">Both</option>
                  </select>
                  <input className={inputCls} value={newAddress.city} onChange={e => setNewAddress(p => ({ ...p!, city: e.target.value }))} placeholder="City" />
                </div>
                <input className={inputCls} value={newAddress.address_line1} onChange={e => setNewAddress(p => ({ ...p!, address_line1: e.target.value }))} placeholder="Address Line 1 *" />
                <input className={inputCls} value={newAddress.address_line2} onChange={e => setNewAddress(p => ({ ...p!, address_line2: e.target.value }))} placeholder="Address Line 2 (optional)" />
                <div className="flex gap-2">
                  <button onClick={saveAddress} disabled={loading} className="px-4 h-9 rounded-md bg-[var(--color-accent)] text-white text-sm font-medium hover:bg-[var(--color-accent-hover)] disabled:opacity-50">Save Address</button>
                  <button onClick={() => setNewAddress(null)} className="px-3 h-9 rounded-md border border-[var(--color-border)] text-sm hover:bg-[var(--color-bg-elevated)]">Cancel</button>
                </div>
              </div>
            )}
            {addresses.length === 0 && !newAddress && <div className="px-5 py-10 text-center text-sm text-[var(--color-text-muted)]">No addresses added yet.</div>}
          </div>
        </div>
      )}

      <ConfirmDialog open={!!deleteTarget} onClose={() => setDeleteTarget(null)} onConfirm={confirmDelete}
        title={`Delete ${deleteTarget?.type === 'customer' ? 'Customer' : deleteTarget?.type === 'contact' ? 'Contact' : 'Address'}`}
        message={`Remove "${deleteTarget?.name}"? This cannot be undone.`} loading={loading} />
    </div>
  )
}
