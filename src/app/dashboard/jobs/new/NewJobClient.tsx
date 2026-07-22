'use client'
import { useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { ArrowLeft, Save, Briefcase } from 'lucide-react'
import { cn } from '@/lib/utils/cn'
import { toast } from '@/components/ui/Toast'
import { EMPTY_JOB_FORM, type JobFormData } from '@/modules/jobs/types/job.types'

interface Props {
  customers: any[]; boardTypes: any[]; paperTypes: any[]
  laminationTypes: any[]; foilTypes: any[]; workflows: any[]
  salesOrders: any[]; defaultWorkflowId: string
}

const inputCls = 'w-full h-9 px-3 rounded-md border text-sm bg-[var(--color-bg-elevated)] text-[var(--color-text-primary)] border-[var(--color-border)] placeholder:text-[var(--color-text-muted)] focus:outline-none focus:border-[var(--color-accent)] focus:ring-1 focus:ring-[var(--color-accent)] transition-colors'
const labelCls = 'text-sm font-medium text-[var(--color-text-primary)]'

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="rounded-xl border border-[var(--color-border)] bg-[var(--color-bg-secondary)] overflow-hidden">
      <div className="px-5 py-3.5 border-b border-[var(--color-border)] bg-[var(--color-bg-elevated)]">
        <h2 className="text-sm font-semibold text-[var(--color-text-primary)]">{title}</h2>
      </div>
      <div className="p-5">{children}</div>
    </div>
  )
}

export default function NewJobClient({ customers, boardTypes, paperTypes, laminationTypes, foilTypes, workflows, salesOrders, defaultWorkflowId }: Props) {
  const router = useRouter()
  const [form, setForm] = useState<JobFormData>({ ...EMPTY_JOB_FORM, workflow_template_id: defaultWorkflowId })
  const [loading, setLoading] = useState(false)

  const set = (k: keyof JobFormData, v: any) => setForm(p => ({ ...p, [k]: v }))

  const save = async () => {
    if (!form.customer_id) { toast.error('Please select a customer'); return }
    if (!form.job_title) { toast.error('Job title is required'); return }
    if (!form.quantity || parseFloat(form.quantity) <= 0) { toast.error('Quantity must be greater than 0'); return }
    setLoading(true)
    try {
      const res = await fetch('/api/v1/jobs', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(form),
      })
      if (!res.ok) { const e = await res.json(); throw new Error(e.error) }
      const { data } = await res.json()
      toast.success(`Job ${data.job_number} created!`)
      router.push(`/dashboard/jobs/${data.id}`)
    } catch (e: any) { toast.error(e.message || 'Failed to create job') }
    finally { setLoading(false) }
  }

  return (
    <div className="space-y-5">
      {/* Page header */}
      <div className="flex items-center gap-3">
        <Link href="/dashboard/jobs" className="w-8 h-8 flex items-center justify-center rounded-md border border-[var(--color-border)] text-[var(--color-text-muted)] hover:bg-[var(--color-bg-elevated)] transition-colors">
          <ArrowLeft size={15} />
        </Link>
        <div>
          <h1 className="text-2xl font-bold text-[var(--color-text-primary)]">New Job</h1>
          <p className="text-sm text-[var(--color-text-muted)] mt-0.5">Job number will be auto-generated</p>
        </div>
      </div>

      {/* Customer & SO */}
      <Section title="Customer & Sales Order">
        <div className="grid grid-cols-2 gap-4">
          <div className="space-y-1.5">
            <label className={labelCls}>Customer <span className="text-[var(--color-danger)]">*</span></label>
            <select className={inputCls} value={form.customer_id} onChange={e => set('customer_id', e.target.value)}>
              <option value="">Select customer…</option>
              {customers.map(c => <option key={c.id} value={c.id}>{c.name} ({c.customer_code})</option>)}
            </select>
          </div>
          <div className="space-y-1.5">
            <label className={labelCls}>Link to Sales Order (optional)</label>
            <select className={inputCls} value={form.sales_order_id} onChange={e => set('sales_order_id', e.target.value)}>
              <option value="">None — standalone job</option>
              {salesOrders.map((so: any) => <option key={so.id} value={so.id}>{so.so_number} — {so.customers?.name}</option>)}
            </select>
          </div>
        </div>
      </Section>

      {/* Job Details */}
      <Section title="Job Details">
        <div className="grid grid-cols-2 gap-4">
          <div className="col-span-2 space-y-1.5">
            <label className={labelCls}>Job Title <span className="text-[var(--color-danger)]">*</span></label>
            <input className={inputCls} value={form.job_title} onChange={e => set('job_title', e.target.value)} placeholder="e.g. Lipton Tea Box 500g" />
          </div>
          <div className="col-span-2 space-y-1.5">
            <label className={labelCls}>Description</label>
            <input className={inputCls} value={form.description} onChange={e => set('description', e.target.value)} placeholder="Optional job description" />
          </div>
          <div className="space-y-1.5">
            <label className={labelCls}>Priority</label>
            <select className={inputCls} value={form.priority} onChange={e => set('priority', e.target.value as any)}>
              <option value="low">Low</option>
              <option value="normal">Normal</option>
              <option value="high">High</option>
              <option value="urgent">Urgent</option>
            </select>
          </div>
          <div className="space-y-1.5">
            <label className={labelCls}>Required Date</label>
            <input type="date" className={inputCls} value={form.required_date} onChange={e => set('required_date', e.target.value)} />
          </div>
        </div>
      </Section>

      {/* Product Specifications */}
      <Section title="Product Specifications">
        <div className="grid grid-cols-4 gap-4">
          <div className="space-y-1.5">
            <label className={labelCls}>Length (mm)</label>
            <input type="number" className={inputCls} value={form.size_l} onChange={e => set('size_l', e.target.value)} placeholder="L" />
          </div>
          <div className="space-y-1.5">
            <label className={labelCls}>Width (mm)</label>
            <input type="number" className={inputCls} value={form.size_w} onChange={e => set('size_w', e.target.value)} placeholder="W" />
          </div>
          <div className="space-y-1.5">
            <label className={labelCls}>Height (mm)</label>
            <input type="number" className={inputCls} value={form.size_h} onChange={e => set('size_h', e.target.value)} placeholder="H" />
          </div>
          <div className="space-y-1.5">
            <label className={labelCls}>Sheet Size</label>
            <input className={inputCls} value={form.sheet_size} onChange={e => set('sheet_size', e.target.value)} placeholder='e.g. 25"×36"' />
          </div>
          <div className="space-y-1.5">
            <label className={labelCls}>Grain Direction</label>
            <select className={inputCls} value={form.grain_direction} onChange={e => set('grain_direction', e.target.value)}>
              <option value="">Not specified</option>
              <option value="long_grain">Long Grain</option>
              <option value="short_grain">Short Grain</option>
            </select>
          </div>
          <div className="space-y-1.5">
            <label className={labelCls}>Quantity <span className="text-[var(--color-danger)]">*</span></label>
            <input type="number" className={inputCls} value={form.quantity} onChange={e => set('quantity', e.target.value)} placeholder="1000" />
          </div>
          <div className="space-y-1.5">
            <label className={labelCls}>Ups <span className="text-xs text-[var(--color-text-muted)]">(impressions/sheet)</span></label>
            <input type="number" className={inputCls} value={form.ups} onChange={e => set('ups', e.target.value)} placeholder="e.g. 8" min="1" />
            {form.ups && parseInt(form.ups) > 0 && form.quantity && (
              <p className="text-xs text-[var(--color-text-muted)]">
                Sheet Qty: {Math.ceil(parseFloat(form.quantity) / parseInt(form.ups)).toLocaleString()}
              </p>
            )}
          </div>
          <div className="space-y-1.5">
            <label className={labelCls}>No. of Colors</label>
            <input type="number" className={inputCls} value={form.no_of_colors} onChange={e => set('no_of_colors', e.target.value)} min="1" max="8" />
          </div>
          <div className="space-y-1.5">
            <label className={labelCls}>Die Number</label>
            <input className={inputCls} value={form.die_number} onChange={e => set('die_number', e.target.value)} placeholder="e.g. D-1042" />
          </div>
          <div className="space-y-1.5">
            <label className={labelCls}>Board / Paper Type</label>
            <select className={inputCls}
              value={form.board_type_id ? `board:${form.board_type_id}` : form.paper_type_id ? `paper:${form.paper_type_id}` : ''}
              onChange={e => {
                const v = e.target.value
                if (v.startsWith('board:')) { set('board_type_id', v.slice(6)); set('paper_type_id', '') }
                else if (v.startsWith('paper:')) { set('paper_type_id', v.slice(6)); set('board_type_id', '') }
                else { set('board_type_id', ''); set('paper_type_id', '') }
              }}>
              <option value="">Select…</option>
              <optgroup label="Board Types">
                {boardTypes.map(b => <option key={b.id} value={`board:${b.id}`}>{b.name}</option>)}
              </optgroup>
              <optgroup label="Paper Types">
                {paperTypes.map(p => <option key={p.id} value={`paper:${p.id}`}>{p.name}</option>)}
              </optgroup>
            </select>
          </div>
        </div>
      </Section>

      {/* Finishing */}
      <Section title="Finishing">
        <div className="grid grid-cols-4 gap-4">
          <div className="space-y-1.5">
            <label className={labelCls}>Lamination</label>
            <select className={inputCls} value={form.lamination_type_id} onChange={e => set('lamination_type_id', e.target.value)}>
              <option value="">None</option>
              {laminationTypes.map(l => <option key={l.id} value={l.id}>{l.name}</option>)}
            </select>
          </div>
          <div className="space-y-1.5">
            <label className={labelCls}>Hot Foil</label>
            <select className={inputCls} value={form.foil_type_id} onChange={e => set('foil_type_id', e.target.value)}>
              <option value="">None</option>
              {foilTypes.map(f => <option key={f.id} value={f.id}>{f.name}</option>)}
            </select>
          </div>
          <div className="space-y-1.5">
            <label className={labelCls}>Pasting</label>
            <select className={inputCls} value={form.pasting} onChange={e => set('pasting', e.target.value)}>
              <option value="">Not specified</option>
              <option value="Side">Side</option>
              <option value="B/Side">B/Side</option>
            </select>
          </div>
          <div className="space-y-1.5">
            <label className={labelCls}>Special Finishing</label>
            <input className={inputCls} value={form.special_finishing} onChange={e => set('special_finishing', e.target.value)} placeholder="e.g. Embossing" />
          </div>
          <div className="space-y-1.5">
            <label className={labelCls}>UV Coating</label>
            <select className={inputCls} value={form.uv_coating} onChange={e => set('uv_coating', e.target.value)}>
              <option value="">None</option>
              <option value="UV">UV</option>
              <option value="Soft UV">Soft UV</option>
              <option value="Water Base">Water Base</option>
              <option value="Drip-off">Drip-off</option>
            </select>
          </div>
        </div>
      </Section>

      {/* Workflow & Financials */}
      <Section title="Workflow & Financials">
        <div className="grid grid-cols-3 gap-4">
          <div className="space-y-1.5">
            <label className={labelCls}>Production Workflow</label>
            <select className={inputCls} value={form.workflow_template_id} onChange={e => set('workflow_template_id', e.target.value)}>
              <option value="">No workflow</option>
              {workflows.map((w: any) => <option key={w.id} value={w.id}>{w.name}{w.is_default ? ' (Default)' : ''}</option>)}
            </select>
          </div>
          <div className="space-y-1.5">
            <label className={labelCls}>Quoted Amount (PKR)</label>
            <input type="number" className={inputCls} value={form.quoted_amount} onChange={e => set('quoted_amount', e.target.value)} placeholder="0.00" />
          </div>
          <div className="col-span-3 space-y-1.5">
            <label className={labelCls}>Internal Remarks</label>
            <input className={inputCls} value={form.internal_remarks} onChange={e => set('internal_remarks', e.target.value)} placeholder="Internal notes (not on job card)" />
          </div>
        </div>
      </Section>

      {/* Actions */}
      <div className="flex items-center gap-3 justify-end">
        <Link href="/dashboard/jobs" className="px-4 h-9 rounded-md border border-[var(--color-border)] text-sm text-[var(--color-text-secondary)] hover:bg-[var(--color-bg-elevated)] transition-colors">
          Cancel
        </Link>
        <button onClick={save} disabled={loading || !form.customer_id || !form.job_title}
          className="flex items-center gap-2 px-5 h-9 rounded-md bg-[var(--color-accent)] text-white text-sm font-medium hover:bg-[var(--color-accent-hover)] disabled:opacity-50 transition-colors">
          <Save size={15} /> {loading ? 'Creating…' : 'Create Job'}
        </button>
      </div>
    </div>
  )
}
