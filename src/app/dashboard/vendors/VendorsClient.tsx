'use client'
import { useState, useEffect } from 'react'
import { Users, Plus, Search, Edit2, Trash2, Phone, Mail, Receipt, Wallet } from 'lucide-react'
import { cn } from '@/lib/utils/cn'
import { toast } from '@/components/ui/Toast'
import { Modal } from '@/components/ui/Modal'

interface Vendor {
  id: string; vendor_code: string; name: string; contact_person: string | null
  email: string | null; phone: string | null; mobile: string | null
  address: string | null; ntn: string | null; payment_terms: number; is_active: boolean
}
interface LedgerEntry { id: string; entry_date: string; entry_type: string; description: string; debit: number; credit: number; balance_after: number }

const inputCls = 'w-full h-9 px-3 rounded-md border text-sm bg-[var(--color-bg-elevated)] text-[var(--color-text-primary)] border-[var(--color-border)] placeholder:text-[var(--color-text-muted)] focus:outline-none focus:border-[var(--color-accent)] focus:ring-1 focus:ring-[var(--color-accent)] transition-colors'
const EMPTY = { name: '', contact_person: '', email: '', phone: '', mobile: '', address: '', ntn: '', payment_terms: '30' }

export default function VendorsClient({ initialVendors }: { initialVendors: Vendor[] }) {
  const [vendors, setVendors] = useState(initialVendors)
  const [search, setSearch] = useState('')
  const [modal, setModal] = useState(false)
  const [editVendor, setEditVendor] = useState<Vendor | null>(null)
  const [form, setForm] = useState(EMPTY)
  const [loading, setLoading] = useState(false)

  const filtered = vendors.filter(v =>
    !search || v.name.toLowerCase().includes(search.toLowerCase()) ||
    (v.vendor_code || '').toLowerCase().includes(search.toLowerCase()) ||
    (v.contact_person || '').toLowerCase().includes(search.toLowerCase())
  )

  const openNew = () => { setEditVendor(null); setForm(EMPTY); setModal(true) }
  const openEdit = (v: Vendor) => {
    setEditVendor(v)
    setForm({ name: v.name, contact_person: v.contact_person || '', email: v.email || '', phone: v.phone || '', mobile: v.mobile || '', address: v.address || '', ntn: v.ntn || '', payment_terms: String(v.payment_terms || 30) })
    setModal(true)
  }

  const save = async () => {
    if (!form.name) { toast.error('Vendor name required'); return }
    setLoading(true)
    try {
      if (editVendor) {
        const res = await fetch(`/api/v1/vendors/${editVendor.id}`, {
          method: 'PATCH', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ ...form, payment_terms: parseInt(form.payment_terms) }),
        })
        if (!res.ok) throw new Error()
        setVendors(prev => prev.map(v => v.id === editVendor.id ? { ...v, ...form, payment_terms: parseInt(form.payment_terms) } : v))
        toast.success('Vendor updated')
      } else {
        const res = await fetch('/api/v1/vendors', {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ ...form, payment_terms: parseInt(form.payment_terms) }),
        })
        if (!res.ok) { const e = await res.json(); throw new Error(e.error) }
        const { data } = await res.json()
        setVendors(prev => [...prev, data].sort((a, b) => a.name.localeCompare(b.name)))
        toast.success(`Vendor ${data.vendor_code} created`)
      }
      setModal(false)
    } catch (e: any) { toast.error(e.message || 'Failed') }
    finally { setLoading(false) }
  }

  const deleteVendor = async (v: Vendor) => {
    if (!confirm(`Delete ${v.name}?`)) return
    try {
      await fetch(`/api/v1/vendors/${v.id}`, { method: 'DELETE' })
      setVendors(prev => prev.filter(x => x.id !== v.id))
      toast.success('Vendor deleted')
    } catch { toast.error('Failed') }
  }

  const [ledgerVendor, setLedgerVendor] = useState<Vendor | null>(null)
  const [payVendor, setPayVendor] = useState<Vendor | null>(null)
  const [payForm, setPayForm] = useState({ amount: '', payment_date: new Date().toISOString().slice(0, 10), payment_method: 'bank_transfer', reference: '', notes: '' })
  const [payLoading, setPayLoading] = useState(false)

  const recordPayment = async () => {
    if (!payVendor) return
    const amount = parseFloat(payForm.amount)
    if (!amount || amount <= 0) { toast.error('Enter a valid amount'); return }
    setPayLoading(true)
    try {
      const res = await fetch('/api/v1/finance/vendor-payments', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ vendor_id: payVendor.id, ...payForm, amount }),
      })
      if (!res.ok) { const e = await res.json(); throw new Error(e.error) }
      toast.success(`Payment of PKR ${amount.toLocaleString()} recorded for ${payVendor.name}`)
      setPayVendor(null)
      setPayForm({ amount: '', payment_date: new Date().toISOString().slice(0, 10), payment_method: 'bank_transfer', reference: '', notes: '' })
    } catch (e: any) { toast.error(e.message || 'Failed to record payment') }
    finally { setPayLoading(false) }
  }

  return (
    <div className="space-y-4">
      {/* Toolbar */}
      <div className="flex items-center gap-3">
        <div className="relative flex-1 max-w-md">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-[var(--color-text-muted)]" />
          <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search vendors…"
            className="w-full h-9 pl-9 pr-3 rounded-md border border-[var(--color-border)] bg-[var(--color-bg-elevated)] text-sm text-[var(--color-text-primary)] placeholder:text-[var(--color-text-muted)] focus:outline-none focus:border-[var(--color-accent)] transition-colors" />
        </div>
        <button onClick={openNew}
          className="flex items-center gap-1.5 px-4 h-9 rounded-md bg-[var(--color-accent)] text-white text-sm font-medium hover:bg-[var(--color-accent-hover)] transition-colors ml-auto">
          <Plus size={15} /> New Vendor
        </button>
      </div>

      {/* Table */}
      <div className="rounded-xl border border-[var(--color-border)] bg-[var(--color-bg-secondary)] overflow-hidden">
        <div className="grid grid-cols-12 gap-3 px-5 py-2.5 bg-[var(--color-bg-elevated)] border-b border-[var(--color-border)] text-xs font-semibold text-[var(--color-text-muted)] uppercase tracking-wider">
          <div className="col-span-1">Code</div>
          <div className="col-span-3">Name</div>
          <div className="col-span-2">Contact</div>
          <div className="col-span-3">Phone / Email</div>
          <div className="col-span-2">NTN</div>
          <div className="col-span-1 text-right">Actions</div>
        </div>

        {filtered.length === 0 ? (
          <div className="p-12 text-center">
            <Users size={28} className="text-[var(--color-text-muted)] opacity-30 mx-auto mb-2" />
            <p className="text-sm text-[var(--color-text-muted)]">{search ? 'No vendors found' : 'No vendors yet'}</p>
          </div>
        ) : (
          <div className="divide-y divide-[var(--color-border-subtle)]">
            {filtered.map((v, idx) => (
              <div key={v.id} className={cn('grid grid-cols-12 gap-3 px-5 py-3.5 items-center', idx % 2 === 1 && 'bg-[var(--color-bg-elevated)]/15')}>
                <div className="col-span-1 text-xs font-mono text-[var(--color-accent)]">{v.vendor_code}</div>
                <div className="col-span-3">
                  <p className="text-sm font-medium text-[var(--color-text-primary)]">{v.name}</p>
                  {v.address && <p className="text-xs text-[var(--color-text-muted)] truncate">{v.address}</p>}
                </div>
                <div className="col-span-2 text-sm text-[var(--color-text-secondary)]">{v.contact_person || '—'}</div>
                <div className="col-span-3 space-y-0.5">
                  {v.mobile && <p className="text-xs text-[var(--color-text-secondary)] flex items-center gap-1"><Phone size={10} />{v.mobile}</p>}
                  {v.email && <p className="text-xs text-[var(--color-text-muted)] flex items-center gap-1"><Mail size={10} />{v.email}</p>}
                </div>
                <div className="col-span-2 text-xs text-[var(--color-text-muted)]">{v.ntn || '—'}</div>
                <div className="col-span-1 flex items-center gap-1 justify-end">
                  <button onClick={() => setLedgerVendor(v)} title="View Ledger" className="w-7 h-7 flex items-center justify-center rounded border border-[var(--color-border)] text-[var(--color-text-muted)] hover:text-[var(--color-accent)] hover:border-[var(--color-accent)]/30 transition-colors">
                    <Receipt size={12} />
                  </button>
                  <button onClick={() => setPayVendor(v)} title="Record Payment" className="w-7 h-7 flex items-center justify-center rounded border border-[var(--color-border)] text-[var(--color-text-muted)] hover:text-[var(--color-success)] hover:border-[var(--color-success)]/30 transition-colors">
                    <Wallet size={12} />
                  </button>
                  <button onClick={() => openEdit(v)} className="w-7 h-7 flex items-center justify-center rounded border border-[var(--color-border)] text-[var(--color-text-muted)] hover:text-[var(--color-accent)] hover:border-[var(--color-accent)]/30 transition-colors">
                    <Edit2 size={12} />
                  </button>
                  <button onClick={() => deleteVendor(v)} className="w-7 h-7 flex items-center justify-center rounded border border-[var(--color-border)] text-[var(--color-text-muted)] hover:text-[var(--color-danger)] hover:border-[var(--color-danger)]/30 transition-colors">
                    <Trash2 size={12} />
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Modal */}
      <Modal open={modal} onClose={() => setModal(false)} title={editVendor ? `Edit — ${editVendor.name}` : 'New Vendor'} size="md"
        footer={
          <>
            <button onClick={() => setModal(false)} className="px-4 h-9 rounded-md border border-[var(--color-border)] text-sm text-[var(--color-text-secondary)] hover:bg-[var(--color-bg-elevated)] transition-colors">Cancel</button>
            <button onClick={save} disabled={loading || !form.name}
              className="px-4 h-9 rounded-md bg-[var(--color-accent)] text-white text-sm font-medium hover:bg-[var(--color-accent-hover)] disabled:opacity-50 transition-colors">
              {loading ? 'Saving…' : editVendor ? 'Save Changes' : 'Create Vendor'}
            </button>
          </>
        }>
        <div className="grid grid-cols-2 gap-3">
          <div className="col-span-2 space-y-1.5">
            <label className="text-sm font-medium text-[var(--color-text-primary)]">Vendor Name <span className="text-[var(--color-danger)]">*</span></label>
            <input className={inputCls} value={form.name} onChange={e => setForm(p => ({ ...p, name: e.target.value }))} placeholder="e.g. Paper Mart Pakistan" />
          </div>
          <div className="space-y-1.5">
            <label className="text-sm font-medium text-[var(--color-text-primary)]">Contact Person</label>
            <input className={inputCls} value={form.contact_person} onChange={e => setForm(p => ({ ...p, contact_person: e.target.value }))} placeholder="Mr. Ahmed" />
          </div>
          <div className="space-y-1.5">
            <label className="text-sm font-medium text-[var(--color-text-primary)]">Mobile</label>
            <input className={inputCls} value={form.mobile} onChange={e => setForm(p => ({ ...p, mobile: e.target.value }))} placeholder="+92 300 0000000" />
          </div>
          <div className="space-y-1.5">
            <label className="text-sm font-medium text-[var(--color-text-primary)]">Phone</label>
            <input className={inputCls} value={form.phone} onChange={e => setForm(p => ({ ...p, phone: e.target.value }))} placeholder="+92 42 0000000" />
          </div>
          <div className="space-y-1.5">
            <label className="text-sm font-medium text-[var(--color-text-primary)]">Email</label>
            <input type="email" className={inputCls} value={form.email} onChange={e => setForm(p => ({ ...p, email: e.target.value }))} placeholder="vendor@email.com" />
          </div>
          <div className="space-y-1.5">
            <label className="text-sm font-medium text-[var(--color-text-primary)]">NTN</label>
            <input className={inputCls} value={form.ntn} onChange={e => setForm(p => ({ ...p, ntn: e.target.value }))} placeholder="1234567-8" />
          </div>
          <div className="space-y-1.5">
            <label className="text-sm font-medium text-[var(--color-text-primary)]">Payment Terms (Days)</label>
            <input type="number" className={inputCls} value={form.payment_terms} onChange={e => setForm(p => ({ ...p, payment_terms: e.target.value }))} />
          </div>
          <div className="col-span-2 space-y-1.5">
            <label className="text-sm font-medium text-[var(--color-text-primary)]">Address</label>
            <input className={inputCls} value={form.address} onChange={e => setForm(p => ({ ...p, address: e.target.value }))} placeholder="Vendor address" />
          </div>
        </div>
      </Modal>

      {/* Record Payment Modal */}
      <Modal open={!!payVendor} onClose={() => setPayVendor(null)} title={payVendor ? `Record Payment — ${payVendor.name}` : ''} size="sm"
        footer={
          <>
            <button onClick={() => setPayVendor(null)} className="px-4 h-9 rounded-md border border-[var(--color-border)] text-sm text-[var(--color-text-secondary)] hover:bg-[var(--color-bg-elevated)] transition-colors">Cancel</button>
            <button onClick={recordPayment} disabled={payLoading || !payForm.amount}
              className="px-4 h-9 rounded-md bg-[var(--color-success)] text-white text-sm font-medium hover:opacity-90 disabled:opacity-50 transition-colors">
              {payLoading ? 'Recording…' : 'Record Payment'}
            </button>
          </>
        }>
        <div className="grid grid-cols-2 gap-3">
          <div className="col-span-2 space-y-1.5">
            <label className="text-sm font-medium text-[var(--color-text-primary)]">Amount (PKR) <span className="text-[var(--color-danger)]">*</span></label>
            <input type="number" autoFocus className={inputCls} value={payForm.amount} onChange={e => setPayForm(p => ({ ...p, amount: e.target.value }))} placeholder="0.00" />
          </div>
          <div className="space-y-1.5">
            <label className="text-sm font-medium text-[var(--color-text-primary)]">Payment Date</label>
            <input type="date" className={inputCls} value={payForm.payment_date} onChange={e => setPayForm(p => ({ ...p, payment_date: e.target.value }))} />
          </div>
          <div className="space-y-1.5">
            <label className="text-sm font-medium text-[var(--color-text-primary)]">Method</label>
            <select className={inputCls} value={payForm.payment_method} onChange={e => setPayForm(p => ({ ...p, payment_method: e.target.value }))}>
              <option value="bank_transfer">Bank Transfer</option>
              <option value="cash">Cash</option>
              <option value="cheque">Cheque</option>
              <option value="online">Online</option>
              <option value="other">Other</option>
            </select>
          </div>
          <div className="col-span-2 space-y-1.5">
            <label className="text-sm font-medium text-[var(--color-text-primary)]">Reference (cheque #, bank ref…)</label>
            <input className={inputCls} value={payForm.reference} onChange={e => setPayForm(p => ({ ...p, reference: e.target.value }))} placeholder="Optional" />
          </div>
          <div className="col-span-2 space-y-1.5">
            <label className="text-sm font-medium text-[var(--color-text-primary)]">Notes</label>
            <input className={inputCls} value={payForm.notes} onChange={e => setPayForm(p => ({ ...p, notes: e.target.value }))} placeholder="Optional" />
          </div>
        </div>
      </Modal>

      {/* Ledger Modal */}
      <Modal open={!!ledgerVendor} onClose={() => setLedgerVendor(null)} title={ledgerVendor ? `Ledger — ${ledgerVendor.name}` : ''} size="lg">
        {ledgerVendor && <VendorLedgerView vendorId={ledgerVendor.id} />}
      </Modal>
    </div>
  )
}

function VendorLedgerView({ vendorId }: { vendorId: string }) {
  const [entries, setEntries] = useState<LedgerEntry[]>([])
  const [balance, setBalance] = useState(0)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    fetch(`/api/v1/finance/supplier-ledger?vendor_id=${vendorId}`)
      .then(r => r.json())
      .then(json => { setEntries(json.data ?? []); setBalance(json.current_balance ?? 0) })
      .finally(() => setLoading(false))
  }, [vendorId])

  const fmt = (n: number) => `PKR ${Number(n || 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`

  return (
    <div>
      <div className="flex items-center justify-between mb-3 pb-3 border-b border-[var(--color-border-subtle)]">
        <span className="text-sm text-[var(--color-text-muted)]">Current Balance (Payable)</span>
        <span className={cn('text-lg font-bold', balance > 0 ? 'text-[var(--color-danger)]' : 'text-[var(--color-success)]')}>{fmt(balance)}</span>
      </div>
      {loading ? (
        <div className="py-10 text-center text-sm text-[var(--color-text-muted)]">Loading…</div>
      ) : entries.length === 0 ? (
        <div className="py-10 text-center text-sm text-[var(--color-text-muted)]">No ledger activity yet. Purchase orders and payments for this vendor will appear here.</div>
      ) : (
        <div className="max-h-96 overflow-y-auto">
          <table className="w-full text-sm">
            <thead className="sticky top-0 bg-[var(--color-bg-secondary)]">
              <tr className="text-left text-xs text-[var(--color-text-muted)] uppercase border-b border-[var(--color-border-subtle)]">
                <th className="py-2 font-medium">Date</th>
                <th className="py-2 font-medium">Description</th>
                <th className="py-2 font-medium text-right">Debit</th>
                <th className="py-2 font-medium text-right">Credit</th>
                <th className="py-2 font-medium text-right">Balance</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[var(--color-border-subtle)]">
              {entries.map(e => (
                <tr key={e.id}>
                  <td className="py-2 text-[var(--color-text-secondary)] whitespace-nowrap">{new Date(e.entry_date).toLocaleDateString('en-PK', { day: '2-digit', month: 'short', year: 'numeric' })}</td>
                  <td className="py-2 text-[var(--color-text-primary)]">{e.description}</td>
                  <td className="py-2 text-right text-[var(--color-success)]">{e.debit > 0 ? fmt(e.debit) : '—'}</td>
                  <td className="py-2 text-right text-[var(--color-danger)]">{e.credit > 0 ? fmt(e.credit) : '—'}</td>
                  <td className="py-2 text-right font-medium text-[var(--color-text-primary)]">{fmt(e.balance_after)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
