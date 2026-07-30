'use client'
import { useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { ArrowLeft, Save, History, X, RefreshCw, Search, Sparkles, FilePenLine, AlertTriangle } from 'lucide-react'
import { cn } from '@/lib/utils/cn'
import { toast } from '@/components/ui/Toast'
import { EMPTY_JOB_FORM, type JobFormData } from '@/modules/jobs/types/job.types'
import { CHANGE_ASPECTS } from '@/modules/jobs/constants/changeAspects'
import { useDraftAutosave } from '@/lib/utils/useDraftAutosave'
import { formatTimeAgo } from '@/lib/utils/format'

interface Props {
  customers: any[]; boardTypes: any[]; boxTypes: any[]; paperTypes: any[]
  laminationTypes: any[]; foilTypes: any[]; coatingTypes: any[]; workflows: any[]
  salesOrders: any[]; repeatableJobs: any[]; stockGsm: any[]; defaultWorkflowId: string
}

type JobMode = 'new' | 'repeat' | 'changed'

const EMPTY_REPEAT = { parent_job_id: '', quantity: '', required_date: '', notes: '', same_artwork: true }

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

export default function NewJobClient({ customers, boardTypes, boxTypes, paperTypes, laminationTypes, foilTypes, coatingTypes, workflows, salesOrders, repeatableJobs, stockGsm, defaultWorkflowId }: Props) {
  const router = useRouter()
  const [form, setForm] = useState<JobFormData>({ ...EMPTY_JOB_FORM, workflow_template_id: defaultWorkflowId })
  const [loading, setLoading] = useState(false)

  // Repeat mode reuses the existing POST /api/v1/jobs/[id]/repeat endpoint
  // rather than duplicating the spec-copying logic here — that route already
  // sets parent_job_id / is_repeat / repeat_sequence, re-initializes the
  // workflow and links artwork. This is purely the missing entry point.
  const [mode, setMode] = useState<JobMode>('new')
  const [repeat, setRepeat] = useState({ ...EMPTY_REPEAT })
  const [repeatSearch, setRepeatSearch] = useState('')
  const setRep = (k: keyof typeof EMPTY_REPEAT, v: any) => setRepeat(p => ({ ...p, [k]: v }))

  // ─── Repeat with Changes ──────────────────────────────────────────────────
  // Unlike exact repeat, this one drives the SAME full spec form as New Job —
  // that is the whole difference between the two: repeat is a locked copy,
  // changed is an editable one. So it posts to /api/v1/jobs (which understands
  // parent_job_id since migration 097), not to the /repeat endpoint.
  const [changedParentId, setChangedParentId] = useState('')
  const [changedAspects, setChangedAspects] = useState<string[]>([])
  const [changeNote, setChangeNote] = useState('')
  const toggleAspect = (v: string) =>
    setChangedAspects(p => p.includes(v) ? p.filter(x => x !== v) : [...p, v])

  /** Numeric columns come back as numbers; every form field is a string. */
  const s = (v: any) => (v === null || v === undefined ? '' : String(v))

  const selectChangedParent = (id: string) => {
    setChangedParentId(id)
    const p = repeatableJobs.find((j: any) => j.id === id)
    if (!p) return
    // Every field stays editable afterwards — this is a starting point, the
    // same way applyLineItem() works for a sales order.
    setForm(prev => ({
      ...prev,
      customer_id:          p.customer_id || '',
      job_title:            p.job_title || '',
      description:          p.description || '',
      sales_order_id:       '',   // a repeat starts fresh, same as /repeat does
      sales_order_item_id:  '',
      size_l: s(p.size_l), size_w: s(p.size_w), size_h: s(p.size_h),
      sheet_width_in: s(p.sheet_width_in), sheet_height_in: s(p.sheet_height_in),
      box_type_id:          p.box_type_id || '',
      quantity:             s(p.quantity),
      no_of_colors:         s(p.no_of_colors),
      die_number:           p.die_number || '',
      gsm:                  s(p.gsm),
      ups:                  s(p.ups),
      board_type_id:        p.board_type_id || '',
      paper_type_id:        p.paper_type_id || '',
      lamination_type_id:   p.lamination_type_id || '',
      uv_coating:           p.uv_coating || '',
      foil_type_id:         p.foil_type_id || '',
      special_finishing:    p.special_finishing || '',
      pasting:              p.pasting || '',
      workflow_template_id: p.workflow_template_id || defaultWorkflowId,
      quoted_amount:        s(p.quoted_amount),
      required_date:        '',   // the new order has its own date
    }))
  }

  const changedParent = repeatableJobs.find((j: any) => j.id === changedParentId)

  const q = repeatSearch.trim().toLowerCase()
  const filteredJobs = q
    ? repeatableJobs.filter((j: any) =>
        [j.job_number, j.job_title, j.customers?.name, j.die_number]
          .some((f: any) => String(f ?? '').toLowerCase().includes(q)))
    : repeatableJobs
  const parentJob = repeatableJobs.find((j: any) => j.id === repeat.parent_job_id)

  const { draftAvailable, draftSavedAt, restoreDraft, discardDraft, clearDraft } = useDraftAutosave({
    key: 'jafson_draft_new_job',
    value: form,
    isBlank: (v: JobFormData) => !v.job_title?.trim() && !v.customer_id,
  })
  const applyRestoredDraft = () => {
    const draft = restoreDraft()
    if (draft) setForm(draft)
    discardDraft()
  }

  const set = (k: keyof JobFormData, v: any) => setForm(p => ({ ...p, [k]: v }))

  // Box Type drives the workflow (migration 110): Box → Standard Carton,
  // HL → HL (Hinge Lid), Label/Sticker → Label / Sticker. The API resolves this
  // server-side regardless, but the dropdown is moved here too so the form shows
  // the workflow the job will actually get instead of quietly disagreeing with
  // it. Only the mapped box types steer it — an unmapped one leaves whatever is
  // already selected alone, and an explicit pick afterwards still wins.
  const setBoxType = (boxTypeId: string) => setForm(p => {
    const mapped = boxTypes.find((b: any) => b.id === boxTypeId)?.workflow_template_id
    return { ...p, box_type_id: boxTypeId, workflow_template_id: mapped || p.workflow_template_id }
  })

  // Board / Paper is one combined select ("board:<id>" | "paper:<id>").
  // Choosing one does NOT set GSM: GSM belongs to the stock item, not the
  // board type, so it is offered from real inventory instead (see gsmOptions).
  const selectMaterial = (v: string) => {
    const isBoard = v.startsWith('board:')
    const isPaper = v.startsWith('paper:')
    const id = isBoard || isPaper ? v.slice(v.indexOf(':') + 1) : ''
    setForm(p => ({
      ...p,
      board_type_id: isBoard ? id : '',
      paper_type_id: isPaper ? id : '',
    }))
  }

  // GSM options come from real board_inventory rows for the selected board
  // type — one board type is stocked in many weights, so board_types.gsm
  // can't be the source. Free entry stays allowed via <datalist>: the shop
  // may deliberately run a weight that isn't in stock yet.
  const gsmOptions = Array.from(new Set(
    (stockGsm as any[])
      .filter(r => !form.board_type_id || r.board_type_id === form.board_type_id)
      .map(r => Number(r.gsm))
      .filter(g => g > 0)
  )).sort((a, b) => a - b)


  // Fills job fields from a Sales Order line item — used both when a linked
  // SO has exactly one item (auto-applied) and when the person picks one
  // from the line-item selector for a multi-item SO. Fields stay editable
  // afterward; this is just a starting point, not a lock.
  const applyLineItem = (item: any) => {
    setForm(p => ({
      ...p,
      sales_order_item_id: item.id,
      job_title: item.product_desc || p.job_title,
      size_l: item.size_l != null ? String(item.size_l) : p.size_l,
      size_w: item.size_w != null ? String(item.size_w) : p.size_w,
      size_h: item.size_h != null ? String(item.size_h) : p.size_h,
      quantity: item.quantity != null ? String(item.quantity) : p.quantity,
      no_of_colors: item.no_of_colors != null ? String(item.no_of_colors) : p.no_of_colors,
      // Board and paper are mutually exclusive, so the pair has to be set
      // together — carrying only board_type_id would leave a paper line's old
      // board selection in place and the form would show the wrong material.
      // Both fall back to what the form already had if the line has neither.
      board_type_id: item.board_type_id || (item.paper_type_id ? '' : p.board_type_id),
      paper_type_id: item.paper_type_id || (item.board_type_id ? '' : p.paper_type_id),
      // The GSM the quotation was priced on, carried through the sales order.
      gsm: item.gsm != null ? String(item.gsm) : p.gsm,
    }))
  }

  const handleSelectSO = (soId: string) => {
    const so = salesOrders.find((s: any) => s.id === soId)
    const items = so?.sales_order_items ?? []
    setForm(p => ({ ...p, sales_order_id: soId, sales_order_item_id: '', customer_id: so?.customer_id || p.customer_id }))
    if (items.length === 1) applyLineItem(items[0])
  }

  const selectedSO = salesOrders.find((s: any) => s.id === form.sales_order_id)
  const selectedSOItems = selectedSO?.sales_order_items ?? []

  const save = async () => {
    const isChanged = mode === 'changed'
    if (isChanged && !changedParentId) { toast.error('Select the job this repeats'); return }
    if (!form.customer_id) { toast.error('Please select a customer'); return }
    if (!form.job_title) { toast.error('Job title is required'); return }
    if (!form.quantity || parseFloat(form.quantity) <= 0) { toast.error('Quantity must be greater than 0'); return }
    // Required on purpose: this list is what prints on the job card, and it is
    // the whole reason the operator doesn't reach for the old plate.
    if (isChanged && !changedAspects.length) { toast.error('Tick what changed on this repeat'); return }
    setLoading(true)
    try {
      const res = await fetch('/api/v1/jobs', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(isChanged ? {
          ...form,
          parent_job_id:   changedParentId,
          repeat_kind:     'changed',
          changed_aspects: changedAspects,
          change_note:     changeNote || null,
        } : form),
      })
      if (!res.ok) { const e = await res.json(); throw new Error(e.error) }
      const { data } = await res.json()
      clearDraft()
      toast.success(isChanged ? `Changed repeat ${data.job_number} created!` : `Job ${data.job_number} created!`)
      router.push(`/dashboard/jobs/${data.id}`)
    } catch (e: any) { toast.error(e.message || 'Failed to create job') }
    finally { setLoading(false) }
  }

  const saveRepeat = async () => {
    if (!repeat.parent_job_id) { toast.error('Select the job you want to repeat'); return }
    if (repeat.quantity && parseFloat(repeat.quantity) <= 0) { toast.error('Quantity must be greater than 0'); return }
    setLoading(true)
    try {
      const res = await fetch(`/api/v1/jobs/${repeat.parent_job_id}/repeat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          quantity: repeat.quantity || undefined,
          required_date: repeat.required_date || null,
          notes: repeat.notes || null,
          same_artwork: repeat.same_artwork,
        }),
      })
      if (!res.ok) { const e = await res.json(); throw new Error(e.error) }
      const { data } = await res.json()
      toast.success(`Repeat job ${data.job_number} created!`)
      router.push(`/dashboard/jobs/${data.id}`)
    } catch (e: any) { toast.error(e.message || 'Failed to create repeat job') }
    finally { setLoading(false) }
  }

  return (
    <div className="space-y-5">
      {mode === 'new' && draftAvailable && (
        <div className="flex items-center gap-3 px-4 h-11 rounded-md border border-[color:color-mix(in_srgb,var(--color-accent)_30%,transparent)] bg-[color:color-mix(in_srgb,var(--color-accent)_10%,transparent)] text-sm">
          <History size={15} className="text-[var(--color-accent)] flex-shrink-0" />
          <span className="text-[var(--color-text-primary)]">
            You have an unsaved job draft{draftSavedAt ? ` from ${formatTimeAgo(draftSavedAt)}` : ''}.
          </span>
          <button onClick={applyRestoredDraft} className="ml-auto text-[var(--color-accent)] font-medium hover:underline">Restore</button>
          <button onClick={discardDraft} className="text-[var(--color-text-muted)] hover:text-[var(--color-text-primary)]" title="Discard draft">
            <X size={14} />
          </button>
        </div>
      )}
      {/* Page header */}
      <div className="flex items-center gap-3">
        <Link href="/dashboard/jobs" className="w-8 h-8 flex items-center justify-center rounded-md border border-[var(--color-border)] text-[var(--color-text-muted)] hover:bg-[var(--color-bg-elevated)] transition-colors">
          <ArrowLeft size={15} />
        </Link>
        <div>
          <h1 className="text-2xl font-bold text-[var(--color-text-primary)]">
            {mode === 'repeat' ? 'Repeat Job' : mode === 'changed' ? 'Repeat with Changes' : 'New Job'}
          </h1>
          <p className="text-sm text-[var(--color-text-muted)] mt-0.5">
            {mode === 'repeat'
              ? 'Copies every spec from the original job — only change what differs'
              : mode === 'changed'
              ? 'Same job, but the printed content changed — every spec stays editable'
              : 'Job number will be auto-generated'}
          </p>
        </div>
      </div>

      {/* New vs Repeat */}
      <div className="inline-flex p-1 rounded-lg border border-[var(--color-border)] bg-[var(--color-bg-secondary)] w-full sm:w-auto">
        {([
          { id: 'new' as JobMode, label: 'New Job', short: 'New', icon: Sparkles },
          { id: 'repeat' as JobMode, label: 'Repeat Job', short: 'Repeat', icon: RefreshCw },
          { id: 'changed' as JobMode, label: 'Repeat + Changes', short: 'Changed', icon: FilePenLine },
        ]).map(t => (
          <button key={t.id} onClick={() => setMode(t.id)}
            className={cn(
              // px-4 → px-3 below md: three tabs have to fit a 360px phone, and
              // the third label is the long one, so it also shortens there.
              'flex items-center justify-center gap-1.5 md:gap-2 px-3 md:px-4 h-9 rounded-md text-sm font-medium transition-colors flex-1 sm:flex-none whitespace-nowrap',
              mode === t.id
                ? 'bg-[var(--color-accent)] text-[var(--color-on-accent)]'
                : 'text-[var(--color-text-muted)] hover:text-[var(--color-text-primary)]'
            )}>
            <t.icon size={14} className="flex-shrink-0" />
            <span className="md:hidden">{t.short}</span>
            <span className="hidden md:inline">{t.label}</span>
          </button>
        ))}
      </div>

      {mode === 'repeat' ? (
        <Section title="Repeat an Existing Job">
          <div className="space-y-4">
            <div className="space-y-1.5">
              <label className={labelCls}>Find the original job <span className="text-[var(--color-danger)]">*</span></label>
              <div className="relative">
                <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-[var(--color-text-muted)] pointer-events-none" />
                <input className={cn(inputCls, 'pl-9')} value={repeatSearch} onChange={e => setRepeatSearch(e.target.value)}
                  placeholder="Search by job number, title, customer or die number…" />
              </div>
              <select className={inputCls} value={repeat.parent_job_id} onChange={e => setRep('parent_job_id', e.target.value)} size={1}>
                <option value="">Select job to repeat…</option>
                {filteredJobs.map((j: any) => (
                  <option key={j.id} value={j.id}>
                    {j.job_number} — {j.job_title} ({j.customers?.name || 'No customer'})
                  </option>
                ))}
              </select>
              {filteredJobs.length === 0 && (
                <p className="text-xs text-[var(--color-text-muted)]">No jobs match that search.</p>
              )}
            </div>

            {parentJob && (
              <div className="rounded-lg border border-[var(--color-border)] bg-[color:color-mix(in_srgb,var(--color-bg-elevated)_50%,transparent)] p-4">
                <p className="text-xs font-semibold uppercase tracking-wider text-[var(--color-text-muted)] mb-2">
                  Will be copied from {parentJob.job_number}
                </p>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-sm">
                  <div><span className="text-[var(--color-text-muted)] text-xs block">Size (mm)</span>
                    {[parentJob.size_l, parentJob.size_w, parentJob.size_h].filter(Boolean).join(' × ') || '—'}</div>
                  <div><span className="text-[var(--color-text-muted)] text-xs block">Original Qty</span>
                    {parentJob.quantity != null ? Number(parentJob.quantity).toLocaleString() : '—'}</div>
                  <div><span className="text-[var(--color-text-muted)] text-xs block">Ups</span>{parentJob.ups ?? '—'}</div>
                  <div><span className="text-[var(--color-text-muted)] text-xs block">Colors</span>{parentJob.no_of_colors ?? '—'}</div>
                </div>
                <p className="text-xs text-[var(--color-text-muted)] mt-3 leading-relaxed">
                  Board, box type, sheet size, die number, finishing and the production workflow are all carried over too.
                </p>
              </div>
            )}

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <label htmlFor="newjobclient-1" className={labelCls}>Quantity</label>
                <input id="newjobclient-1" type="number" className={inputCls} value={repeat.quantity} onChange={e => setRep('quantity', e.target.value)}
                  placeholder={parentJob?.quantity != null ? `Same as original (${Number(parentJob.quantity).toLocaleString()})` : 'Same as original'} />
              </div>
              <div className="space-y-1.5">
                <label htmlFor="newjobclient-2" className={labelCls}>Required Date</label>
                <input id="newjobclient-2" type="date" className={inputCls} value={repeat.required_date} onChange={e => setRep('required_date', e.target.value)} />
              </div>
              <div className="md:col-span-2 space-y-1.5">
                <label htmlFor="newjobclient-3" className={labelCls}>Notes</label>
                <input id="newjobclient-3" className={inputCls} value={repeat.notes} onChange={e => setRep('notes', e.target.value)} placeholder="Optional — recorded against both jobs" />
              </div>
            </div>

            <label htmlFor="newjobclient-4" className="flex items-center gap-2.5 text-sm text-[var(--color-text-primary)] cursor-pointer">
              <input id="newjobclient-4" type="checkbox" className="w-4 h-4 accent-[var(--color-accent)]" checked={repeat.same_artwork}
                onChange={e => setRep('same_artwork', e.target.checked)} />
              Reuse the original artwork (no fresh artwork round needed)
            </label>
          </div>
        </Section>
      ) : (
      <>
      {mode === 'changed' && (
        <>
          <Section title="Which job is this a repeat of?">
            <div className="space-y-4">
              <div className="space-y-1.5">
                <label className={labelCls}>Original job <span className="text-[var(--color-danger)]">*</span></label>
                <div className="relative">
                  <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-[var(--color-text-muted)] pointer-events-none" />
                  <input className={cn(inputCls, 'pl-9')} value={repeatSearch} onChange={e => setRepeatSearch(e.target.value)}
                    placeholder="Search by job number, title, customer or die number…" />
                </div>
                <select className={inputCls} value={changedParentId} onChange={e => selectChangedParent(e.target.value)}>
                  <option value="">Select the job being repeated…</option>
                  {filteredJobs.map((j: any) => (
                    <option key={j.id} value={j.id}>
                      {j.job_number} — {j.job_title} ({j.customers?.name || 'No customer'})
                    </option>
                  ))}
                </select>
                {filteredJobs.length === 0 && (
                  <p className="text-xs text-[var(--color-text-muted)]">No jobs match that search.</p>
                )}
              </div>

              {changedParent && (
                <div className="rounded-lg border p-3 text-sm
                  bg-[color:color-mix(in_srgb,var(--color-accent)_8%,transparent)]
                  border-[color:color-mix(in_srgb,var(--color-accent)_25%,transparent)]">
                  <p className="text-[var(--color-text-primary)]">
                    Everything below is filled in from <span className="font-semibold">{changedParent.job_number}</span>.
                    Change whatever is different — nothing is locked.
                  </p>
                </div>
              )}
            </div>
          </Section>

          <Section title="What changed?">
            <div className="space-y-4">
              <div className="flex flex-wrap gap-2">
                {CHANGE_ASPECTS.map(a => {
                  const on = changedAspects.includes(a.value)
                  return (
                    <button key={a.value} type="button" onClick={() => toggleAspect(a.value)}
                      title={a.hint}
                      aria-pressed={on}
                      className={cn(
                        'px-3 h-11 md:h-9 rounded-md border text-sm font-medium transition-colors',
                        on
                          ? 'bg-[var(--color-warning)] text-[var(--color-on-warning)] border-transparent'
                          : 'bg-[var(--color-bg-elevated)] text-[var(--color-text-secondary)] border-[var(--color-border)] hover:text-[var(--color-text-primary)]'
                      )}>
                      {a.label}
                    </button>
                  )
                })}
              </div>

              <div className="space-y-1.5">
                <label htmlFor="newjobclient-change-note" className={labelCls}>Details</label>
                <input id="newjobclient-change-note" className={inputCls} value={changeNote}
                  onChange={e => setChangeNote(e.target.value)}
                  placeholder="e.g. Expiry 03/27 ki jagah 09/27 — baqi sab same" />
                <p className="text-xs text-[var(--color-text-muted)]">
                  Printed on the Job Card, so the floor reads it before mounting a plate.
                </p>
              </div>

              <div className="flex items-start gap-2.5 rounded-lg border p-3 text-xs
                bg-[color:color-mix(in_srgb,var(--color-warning)_10%,transparent)]
                border-[color:color-mix(in_srgb,var(--color-warning)_25%,transparent)]
                text-[var(--color-text-secondary)]">
                <AlertTriangle size={15} className="text-[var(--color-warning)] flex-shrink-0 mt-px" />
                <span>
                  The old artwork is <strong>not</strong> carried over and the old plates must not be
                  reused for whatever changed. This job needs a fresh artwork round and customer
                  approval before printing.
                </span>
              </div>
            </div>
          </Section>
        </>
      )}

      {/* Customer & SO */}
      <Section title="Customer & Sales Order">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="space-y-1.5">
            <label htmlFor="newjobclient-5" className={labelCls}>Customer <span className="text-[var(--color-danger)]">*</span></label>
            <select id="newjobclient-5" className={inputCls} value={form.customer_id} onChange={e => set('customer_id', e.target.value)}>
              <option value="">Select customer…</option>
              {customers.map(c => <option key={c.id} value={c.id}>{c.name} ({c.customer_code})</option>)}
            </select>
          </div>
          <div className="space-y-1.5">
            <label htmlFor="newjobclient-6" className={labelCls}>Link to Sales Order (optional)</label>
            <select id="newjobclient-6" className={inputCls} value={form.sales_order_id} onChange={e => handleSelectSO(e.target.value)}>
              <option value="">None — standalone job</option>
              {salesOrders.map((so: any) => <option key={so.id} value={so.id}>{so.so_number} — {so.customers?.name}</option>)}
            </select>
          </div>
          {selectedSOItems.length > 1 && (
            <div className="col-span-2 space-y-1.5">
              <label htmlFor="newjobclient-7" className={labelCls}>Select Product <span className="text-[var(--color-danger)]">*</span></label>
              <select id="newjobclient-7" className={inputCls} value={form.sales_order_item_id} onChange={e => {
                const item = selectedSOItems.find((it: any) => it.id === e.target.value)
                if (item) applyLineItem(item)
              }}>
                <option value="">Which product is this job for?</option>
                {selectedSOItems.map((it: any) => <option key={it.id} value={it.id}>{it.product_desc} — Qty {it.quantity}</option>)}
              </select>
            </div>
          )}
        </div>
      </Section>

      {/* Job Details */}
      <Section title="Job Details">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="col-span-2 space-y-1.5">
            <label htmlFor="newjobclient-8" className={labelCls}>Job Title <span className="text-[var(--color-danger)]">*</span></label>
            <input id="newjobclient-8" className={inputCls} value={form.job_title} onChange={e => set('job_title', e.target.value)} placeholder="e.g. Lipton Tea Box 500g" />
          </div>
          <div className="col-span-2 space-y-1.5">
            <label htmlFor="newjobclient-9" className={labelCls}>Description</label>
            <input id="newjobclient-9" className={inputCls} value={form.description} onChange={e => set('description', e.target.value)} placeholder="Optional job description" />
          </div>
          <div className="space-y-1.5">
            <label htmlFor="newjobclient-10" className={labelCls}>Priority</label>
            <select id="newjobclient-10" className={inputCls} value={form.priority} onChange={e => set('priority', e.target.value as any)}>
              <option value="low">Low</option>
              <option value="normal">Normal</option>
              <option value="high">High</option>
              <option value="urgent">Urgent</option>
            </select>
          </div>
          <div className="space-y-1.5">
            <label htmlFor="newjobclient-11" className={labelCls}>Required Date</label>
            <input id="newjobclient-11" type="date" className={inputCls} value={form.required_date} onChange={e => set('required_date', e.target.value)} />
          </div>
        </div>
      </Section>

      {/* Product Specifications */}
      <Section title="Product Specifications">
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-4">
          <div className="space-y-1.5">
            <label htmlFor="newjobclient-12" className={labelCls}>Length (mm)</label>
            <input id="newjobclient-12" type="number" className={inputCls} value={form.size_l} onChange={e => set('size_l', e.target.value)} placeholder="L" />
          </div>
          <div className="space-y-1.5">
            <label htmlFor="newjobclient-13" className={labelCls}>Width (mm)</label>
            <input id="newjobclient-13" type="number" className={inputCls} value={form.size_w} onChange={e => set('size_w', e.target.value)} placeholder="W" />
          </div>
          <div className="space-y-1.5">
            <label htmlFor="newjobclient-14" className={labelCls}>Height (mm)</label>
            <input id="newjobclient-14" type="number" className={inputCls} value={form.size_h} onChange={e => set('size_h', e.target.value)} placeholder="H" />
          </div>
          <div className="space-y-1.5">
            <label htmlFor="newjobclient-15" className={labelCls}>Ups <span className="text-xs text-[var(--color-text-muted)]">(impressions/sheet)</span></label>
            <input id="newjobclient-15" type="number" className={inputCls} value={form.ups} onChange={e => set('ups', e.target.value)} placeholder="e.g. 8" min="1" />
            {form.ups && parseInt(form.ups) > 0 && form.quantity && (
              <p className="text-xs text-[var(--color-text-muted)]">
                Sheet Qty: {Math.ceil(parseFloat(form.quantity) / parseInt(form.ups)).toLocaleString()}
              </p>
            )}
          </div>
          <div className="space-y-1.5">
            <label htmlFor="newjobclient-16" className={labelCls}>Sheet Width (in)</label>
            <input id="newjobclient-16" type="number" className={inputCls} value={form.sheet_width_in} onChange={e => set('sheet_width_in', e.target.value)} placeholder="e.g. 25" />
          </div>
          <div className="space-y-1.5">
            <label htmlFor="newjobclient-17" className={labelCls}>Sheet Height (in)</label>
            <input id="newjobclient-17" type="number" className={inputCls} value={form.sheet_height_in} onChange={e => set('sheet_height_in', e.target.value)} placeholder="e.g. 36" />
          </div>
          <div className="space-y-1.5">
            <label htmlFor="newjobclient-18" className={labelCls}>Board / Paper Type</label>
            <select id="newjobclient-18" className={inputCls}
              value={form.board_type_id ? `board:${form.board_type_id}` : form.paper_type_id ? `paper:${form.paper_type_id}` : ''}
              onChange={e => selectMaterial(e.target.value)}>
              <option value="">Select…</option>
              <optgroup label="Board Types">
                {boardTypes.map(b => <option key={b.id} value={`board:${b.id}`}>{b.name}</option>)}
              </optgroup>
              <optgroup label="Paper Types">
                {paperTypes.map(p => <option key={p.id} value={`paper:${p.id}`}>{p.name}</option>)}
              </optgroup>
            </select>
          </div>
          <div className="space-y-1.5">
            <label htmlFor="newjobclient-19" className={labelCls}>GSM</label>
            <input id="newjobclient-19" type="number" className={inputCls} list="job-gsm-options" value={form.gsm}
              onChange={e => set('gsm', e.target.value)} placeholder="e.g. 300" min="1" />
            <datalist id="job-gsm-options">
              {gsmOptions.map(g => <option key={g} value={g} />)}
            </datalist>
            {gsmOptions.length > 0 && (
              <p className="text-xs text-[var(--color-text-muted)]">In stock: {gsmOptions.join(', ')}</p>
            )}
          </div>
          <div className="space-y-1.5">
            <label htmlFor="newjobclient-20" className={labelCls}>No. of Colors</label>
            <input id="newjobclient-20" type="number" className={inputCls} value={form.no_of_colors} onChange={e => set('no_of_colors', e.target.value)} min="1" max="8" />
          </div>
          <div className="space-y-1.5">
            <label htmlFor="newjobclient-21" className={labelCls}>Quantity <span className="text-[var(--color-danger)]">*</span></label>
            <input id="newjobclient-21" type="number" className={inputCls} value={form.quantity} onChange={e => set('quantity', e.target.value)} placeholder="1000" />
          </div>
          <div className="space-y-1.5">
            <label htmlFor="newjobclient-22" className={labelCls}>Die Number</label>
            <input id="newjobclient-22" className={inputCls} value={form.die_number} onChange={e => set('die_number', e.target.value)} placeholder="e.g. D-1042" />
          </div>
          <div className="space-y-1.5">
            <label htmlFor="newjobclient-23" className={labelCls}>Box Type</label>
            <select id="newjobclient-23" className={inputCls} value={form.box_type_id} onChange={e => setBoxType(e.target.value)}>
              <option value="">Not specified</option>
              {boxTypes.map((b: any) => <option key={b.id} value={b.id}>{b.name}</option>)}
            </select>
          </div>
        </div>
      </Section>

      {/* Finishing */}
      <Section title="Finishing">
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-4">
          <div className="space-y-1.5">
            <label htmlFor="newjobclient-24" className={labelCls}>Lamination</label>
            <select id="newjobclient-24" className={inputCls} value={form.lamination_type_id} onChange={e => set('lamination_type_id', e.target.value)}>
              <option value="">None</option>
              {laminationTypes.map(l => <option key={l.id} value={l.id}>{l.name}</option>)}
            </select>
          </div>
          <div className="space-y-1.5">
            <label htmlFor="newjobclient-25" className={labelCls}>Hot Foil</label>
            <select id="newjobclient-25" className={inputCls} value={form.foil_type_id} onChange={e => set('foil_type_id', e.target.value)}>
              <option value="">None</option>
              {foilTypes.map(f => <option key={f.id} value={f.id}>{f.name}</option>)}
            </select>
          </div>
          <div className="space-y-1.5">
            <label htmlFor="newjobclient-26" className={labelCls}>Pasting</label>
            <select id="newjobclient-26" className={inputCls} value={form.pasting} onChange={e => set('pasting', e.target.value)}>
              <option value="">Not specified</option>
              <option value="Side">Side</option>
              <option value="B/Side">B/Side</option>
            </select>
          </div>
          <div className="space-y-1.5">
            <label htmlFor="newjobclient-27" className={labelCls}>Special Finishing</label>
            <input id="newjobclient-27" className={inputCls} value={form.special_finishing} onChange={e => set('special_finishing', e.target.value)} placeholder="e.g. Embossing" />
          </div>
          <div className="space-y-1.5">
            <label htmlFor="newjobclient-28" className={labelCls}>UV Coating</label>
            <select id="newjobclient-28" className={inputCls} value={form.uv_coating} onChange={e => set('uv_coating', e.target.value)}>
              <option value="">None</option>
              {coatingTypes.map(c => <option key={c.id} value={c.name}>{c.name}</option>)}
            </select>
          </div>
        </div>
      </Section>

      {/* Workflow & Financials */}
      <Section title="Workflow & Financials">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div className="space-y-1.5">
            <label htmlFor="newjobclient-29" className={labelCls}>Production Workflow</label>
            <select id="newjobclient-29" className={inputCls} value={form.workflow_template_id} onChange={e => set('workflow_template_id', e.target.value)}>
              <option value="">No workflow</option>
              {workflows.map((w: any) => <option key={w.id} value={w.id}>{w.name}{w.is_default ? ' (Default)' : ''}</option>)}
            </select>
          </div>
          <div className="space-y-1.5">
            <label htmlFor="newjobclient-30" className={labelCls}>Quoted Amount (PKR)</label>
            <input id="newjobclient-30" type="number" className={inputCls} value={form.quoted_amount} onChange={e => set('quoted_amount', e.target.value)} placeholder="0.00" />
          </div>
          <div className="col-span-3 space-y-1.5">
            <label htmlFor="newjobclient-31" className={labelCls}>Internal Remarks</label>
            <input id="newjobclient-31" className={inputCls} value={form.internal_remarks} onChange={e => set('internal_remarks', e.target.value)} placeholder="Internal notes (not on job card)" />
          </div>
        </div>
      </Section>
      </>
      )}

      {/* Actions */}
      <div className="form-actions flex items-center gap-3 justify-end [&>*]:flex-1 lg:[&>*]:flex-none [&>*]:justify-center [&>a]:flex [&>a]:items-center">
        <Link href="/dashboard/jobs" className="px-4 h-11 lg:h-9 rounded-md border border-[var(--color-border)] text-sm text-[var(--color-text-secondary)] hover:bg-[var(--color-bg-elevated)] transition-colors">
          Cancel
        </Link>
        {mode === 'repeat' ? (
          <button onClick={saveRepeat} disabled={loading || !repeat.parent_job_id}
            className="flex items-center gap-2 px-5 h-11 lg:h-9 rounded-md bg-[var(--color-accent)] text-[var(--color-on-accent)] text-sm font-medium hover:bg-[var(--color-accent-hover)] disabled:opacity-50 transition-colors">
            <RefreshCw size={15} /> {loading ? 'Creating…' : 'Create Repeat Job'}
          </button>
        ) : (
          <button onClick={save}
            disabled={loading || !form.customer_id || !form.job_title
              || (mode === 'changed' && (!changedParentId || !changedAspects.length))}
            className="flex items-center gap-2 px-5 h-11 lg:h-9 rounded-md bg-[var(--color-accent)] text-[var(--color-on-accent)] text-sm font-medium hover:bg-[var(--color-accent-hover)] disabled:opacity-50 transition-colors">
            {mode === 'changed' ? <FilePenLine size={15} /> : <Save size={15} />}
            {loading ? 'Creating…' : mode === 'changed' ? 'Create Changed Repeat' : 'Create Job'}
          </button>
        )}
      </div>
    </div>
  )
}
