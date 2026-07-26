'use client'
import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { ArrowLeft, Save } from 'lucide-react'
import Link from 'next/link'
import { cn } from '@/lib/utils/cn'
import { toast } from '@/components/ui/Toast'
import { ConfirmDialog } from '@/components/ui/Modal'
import { INDUSTRIES } from '@/modules/crm/customers/types/customer.types'

const EMPTY = { name: '', business_type: 'company', pipeline_stage: 'customer', ntn: '', strn: '', email: '', phone: '', mobile: '', website: '', industry: '', credit_limit: '0', payment_terms: '30', notes: '' }

export default function NewCustomerPage() {
  const router = useRouter()
  const [form, setForm] = useState(EMPTY)
  const [loading, setLoading] = useState(false)

  const set = (k: string, v: string) => setForm(p => ({ ...p, [k]: v }))

  const inputCls = 'w-full h-9 px-3 rounded-md border text-sm bg-[var(--color-bg-elevated)] text-[var(--color-text-primary)] border-[var(--color-border)] placeholder:text-[var(--color-text-muted)] focus:outline-none focus:border-[var(--color-accent)] focus:ring-1 focus:ring-[var(--color-accent)] transition-colors'

  // Pending duplicate warning: null until the API reports a possible match.
  const [duplicate, setDuplicate] = useState<{ message: string; names: string[] } | null>(null)

  const createAnyway = async () => {
    setLoading(true)
    try {
      const res = await fetch('/api/v1/customers', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...form, force: true }),
      })
      if (!res.ok) { const e = await res.json(); throw new Error(e.error) }
      const { data } = await res.json()
      setDuplicate(null)
      toast.success('Customer created')
      router.push(`/dashboard/customers/${data.id}`)
    } catch (e: any) { toast.error(e.message || 'Failed to create'); setLoading(false) }
  }

  const save = async () => {
    if (!form.name) { toast.error('Customer name is required'); return }
    setLoading(true)
    try {
      const res = await fetch('/api/v1/customers', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(form) })

      // Duplicate check came back — ask in-app instead of a browser confirm(),
      // which cannot show the matched names as readable rows and reads like a
      // security warning on a phone.
      if (res.status === 409) {
        const e = await res.json()
        setDuplicate({
          message: e.error || 'A similar customer already exists.',
          names: (e.duplicates || []).map((d: any) => `${d.name} (${d.customer_code})`),
        })
        setLoading(false)
        return
      }

      if (!res.ok) { const e = await res.json(); throw new Error(e.error) }
      const { data } = await res.json()
      toast.success('Customer created')
      router.push(`/dashboard/customers/${data.id}`)
    } catch (e: any) { toast.error(e.message || 'Failed to create') }
    finally { setLoading(false) }
  }

  return (
    <div className="max-w-3xl space-y-6">
      <div className="flex items-center gap-3">
        <Link href="/dashboard/customers" className="w-8 h-8 flex items-center justify-center rounded-md border border-[var(--color-border)] text-[var(--color-text-muted)] hover:bg-[var(--color-bg-elevated)] transition-colors">
          <ArrowLeft size={15} />
        </Link>
        <div>
          <h1 className="text-2xl font-bold text-[var(--color-text-primary)]">
            {form.pipeline_stage === 'lead' ? 'New Lead' : form.pipeline_stage === 'prospect' ? 'New Prospect' : 'New Customer'}
          </h1>
          <p className="text-sm text-[var(--color-text-muted)] mt-0.5">Customer code will be auto-generated</p>
        </div>
      </div>

      <div className="rounded-xl border border-[var(--color-border)] bg-[var(--color-bg-secondary)] overflow-hidden">
        <div className="px-5 py-4 border-b border-[var(--color-border)] bg-[var(--color-bg-elevated)]">
          <h2 className="text-sm font-semibold text-[var(--color-text-primary)]">Basic Information</h2>
        </div>
        <div className="p-5 grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="col-span-2 space-y-1.5">
            <label htmlFor="page-1" className="text-sm font-medium text-[var(--color-text-primary)]">Customer Name <span className="text-[var(--color-danger)]">*</span></label>
            <input id="page-1" className={inputCls} value={form.name} onChange={e => set('name', e.target.value)} placeholder="e.g. Unilever Pakistan" />
          </div>
          <div className="space-y-1.5">
            <label htmlFor="page-2" className="text-sm font-medium text-[var(--color-text-primary)]">Pipeline Stage</label>
            <select id="page-2" className={inputCls} value={form.pipeline_stage} onChange={e => set('pipeline_stage', e.target.value)}>
              <option value="lead">Lead — early interest, not yet qualified</option>
              <option value="prospect">Prospect — qualified, in discussion</option>
              <option value="customer">Customer — active/won</option>
            </select>
          </div>
          <div className="space-y-1.5">
            <label htmlFor="page-3" className="text-sm font-medium text-[var(--color-text-primary)]">Business Type</label>
            <select id="page-3" className={inputCls} value={form.business_type} onChange={e => set('business_type', e.target.value)}>
              <option value="company">Company</option>
              <option value="individual">Individual</option>
              <option value="government">Government</option>
            </select>
          </div>
          <div className="space-y-1.5">
            <label htmlFor="page-4" className="text-sm font-medium text-[var(--color-text-primary)]">Industry</label>
            <select id="page-4" className={inputCls} value={form.industry} onChange={e => set('industry', e.target.value)}>
              <option value="">Select industry</option>
              {INDUSTRIES.map(i => <option key={i} value={i}>{i}</option>)}
            </select>
          </div>
          <div className="space-y-1.5">
            <label htmlFor="page-5" className="text-sm font-medium text-[var(--color-text-primary)]">NTN</label>
            <input id="page-5" className={inputCls} value={form.ntn} onChange={e => set('ntn', e.target.value)} placeholder="National Tax Number" />
          </div>
          <div className="space-y-1.5">
            <label htmlFor="page-6" className="text-sm font-medium text-[var(--color-text-primary)]">STRN</label>
            <input id="page-6" className={inputCls} value={form.strn} onChange={e => set('strn', e.target.value)} placeholder="Sales Tax Reg. No." />
          </div>
        </div>
      </div>

      <div className="rounded-xl border border-[var(--color-border)] bg-[var(--color-bg-secondary)] overflow-hidden">
        <div className="px-5 py-4 border-b border-[var(--color-border)] bg-[var(--color-bg-elevated)]">
          <h2 className="text-sm font-semibold text-[var(--color-text-primary)]">Contact Information</h2>
        </div>
        <div className="p-5 grid grid-cols-1 md:grid-cols-2 gap-4">
          {[
            { key: 'email', label: 'Email', placeholder: 'accounts@company.com', type: 'email' },
            { key: 'phone', label: 'Phone', placeholder: '+92 21 111 000 000' },
            { key: 'mobile', label: 'Mobile', placeholder: '+92 300 0000000' },
            { key: 'website', label: 'Website', placeholder: 'www.company.com' },
          ].map(f => (
            <div key={f.key} className="space-y-1.5">
              <label htmlFor="page-7" className="text-sm font-medium text-[var(--color-text-primary)]">{f.label}</label>
              <input id="page-7" className={inputCls} type={f.type || 'text'} value={(form as any)[f.key]} onChange={e => set(f.key, e.target.value)} placeholder={f.placeholder} />
            </div>
          ))}
        </div>
      </div>

      <div className="rounded-xl border border-[var(--color-border)] bg-[var(--color-bg-secondary)] overflow-hidden">
        <div className="px-5 py-4 border-b border-[var(--color-border)] bg-[var(--color-bg-elevated)]">
          <h2 className="text-sm font-semibold text-[var(--color-text-primary)]">Financial Settings</h2>
        </div>
        <div className="p-5 grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="space-y-1.5">
            <label htmlFor="page-8" className="text-sm font-medium text-[var(--color-text-primary)]">Credit Limit (PKR)</label>
            <input id="page-8" className={inputCls} type="number" value={form.credit_limit} onChange={e => set('credit_limit', e.target.value)} placeholder="0" />
          </div>
          <div className="space-y-1.5">
            <label htmlFor="page-9" className="text-sm font-medium text-[var(--color-text-primary)]">Payment Terms (Days)</label>
            <input id="page-9" className={inputCls} type="number" value={form.payment_terms} onChange={e => set('payment_terms', e.target.value)} placeholder="30" />
          </div>
          <div className="col-span-2 space-y-1.5">
            <label htmlFor="page-10" className="text-sm font-medium text-[var(--color-text-primary)]">Notes</label>
            <textarea id="page-10" className={cn(inputCls, 'h-20 resize-none py-2')} value={form.notes} onChange={e => set('notes', e.target.value)} placeholder="Internal notes about this customer" />
          </div>
        </div>
      </div>

      <div className="form-actions flex items-center gap-3 justify-end [&>*]:flex-1 lg:[&>*]:flex-none [&>*]:justify-center [&>a]:flex [&>a]:items-center">
        <Link href="/dashboard/customers" className="px-4 h-11 lg:h-9 rounded-md border border-[var(--color-border)] text-sm text-[var(--color-text-secondary)] hover:bg-[var(--color-bg-elevated)] transition-colors">Cancel</Link>
        <button onClick={save} disabled={loading || !form.name}
          className="flex items-center gap-2 px-5 h-11 lg:h-9 rounded-md bg-[var(--color-accent)] text-[var(--color-on-accent)] text-sm font-medium hover:bg-[var(--color-accent-hover)] disabled:opacity-50 transition-colors">
          <Save size={15} /> {loading ? 'Creating…' : form.pipeline_stage === 'lead' ? 'Create Lead' : form.pipeline_stage === 'prospect' ? 'Create Prospect' : 'Create Customer'}
        </button>
      </div>
      <ConfirmDialog
        open={!!duplicate}
        onClose={() => setDuplicate(null)}
        onConfirm={createAnyway}
        title="Possible duplicate"
        message={duplicate ? `${duplicate.message}${duplicate.names.length ? ` Possible match: ${duplicate.names.join(', ')}.` : ''} Create this customer anyway?` : ''}
        confirmLabel="Create anyway"
        confirmVariant="primary"
        loading={loading}
      />

    </div>
  )
}
