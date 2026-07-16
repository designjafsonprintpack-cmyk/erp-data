'use client'
import { useState } from 'react'
import {
  CheckCircle2, XCircle, AlertTriangle, ClipboardList, RefreshCw,
  Plus, Shield, Pen, ThumbsUp, ThumbsDown
} from 'lucide-react'
import { cn } from '@/lib/utils/cn'
import { toast } from '@/components/ui/Toast'
import { Modal } from '@/components/ui/Modal'
import { formatDate, formatDateTime, formatTimeAgo } from '@/lib/utils/format'
import Link from 'next/link'

/* ─── Types ──────────────────────────────────────────────────────────────────── */
interface TemplateItem { id: string; question: string; category: string; is_critical: boolean; sort_order: number }
interface Template { id: string; name: string; qc_template_items: TemplateItem[] }
interface Defect { id: string; job_id: string; defect_type: string; severity: string; quantity_affected: number; description: string | null; resolved: boolean; created_at: string; jobs?: { job_number: string; job_title: string } | null }
interface Inspection {
  id: string; job_id: string; inspection_no: number; result: string | null
  sample_size: number | null; defect_count: number; notes: string | null
  inspected_at: string | null; signed_off_at: string | null; created_at: string
  jobs?: { job_number: string; job_title: string; customers?: { name: string } | null } | null
  qc_templates?: { name: string } | null
  qc_defects?: { id: string; severity: string; resolved: boolean }[]
}
interface ReprintReq {
  id: string; original_job_id: string; reason: string; quantity: number; priority: string; status: string; created_at: string
  jobs?: { job_number: string; job_title: string; customers?: { name: string } | null } | null
}
interface Job { id: string; job_number: string; job_title: string; quantity: number; customers?: { name: string } | null }

/* ─── Constants ──────────────────────────────────────────────────────────────── */
const RESULT_CFG = {
  pass:             { label: 'Pass',             color: 'text-[var(--color-success)] bg-[var(--color-success)]/10 border-[var(--color-success)]/20', icon: CheckCircle2 },
  fail:             { label: 'Fail',             color: 'text-[var(--color-danger)] bg-[var(--color-danger)]/10 border-[var(--color-danger)]/20',   icon: XCircle },
  conditional_pass: { label: 'Conditional Pass', color: 'text-[var(--color-warning)] bg-[var(--color-warning)]/10 border-[var(--color-warning)]/20', icon: AlertTriangle },
}
const SEVERITY_CFG = {
  minor:    { label: 'Minor',    color: 'text-[var(--color-info)] bg-[var(--color-info)]/10 border-[var(--color-info)]/20' },
  major:    { label: 'Major',    color: 'text-[var(--color-warning)] bg-[var(--color-warning)]/10 border-[var(--color-warning)]/20' },
  critical: { label: 'Critical', color: 'text-[var(--color-danger)] bg-[var(--color-danger)]/10 border-[var(--color-danger)]/20' },
}
const DEFECT_TYPES = [
  'colour_shift','misregister','scumming','hickey','fold_crack','cut_short',
  'lamination_bubble','foil_skip','ink_smear','wrong_size','pasting_fault','other',
]
const REPRINT_STATUS_CFG = {
  pending:     { label: 'Pending',     color: 'text-[var(--color-accent)] bg-[var(--color-accent)]/10 border-[var(--color-accent)]/20' },
  approved:    { label: 'Approved',    color: 'text-[var(--color-success)] bg-[var(--color-success)]/10 border-[var(--color-success)]/20' },
  rejected:    { label: 'Rejected',    color: 'text-[var(--color-danger)] bg-[var(--color-danger)]/10 border-[var(--color-danger)]/20' },
  in_progress: { label: 'In Progress', color: 'text-[var(--color-warning)] bg-[var(--color-warning)]/10 border-[var(--color-warning)]/20' },
  completed:   { label: 'Completed',   color: 'text-[var(--color-success)] bg-[var(--color-success)]/10 border-[var(--color-success)]/20' },
}

const inputCls = 'w-full h-9 px-3 rounded-md border text-sm bg-[var(--color-bg-elevated)] text-[var(--color-text-primary)] border-[var(--color-border)] placeholder:text-[var(--color-text-muted)] focus:outline-none focus:border-[var(--color-accent)] focus:ring-1 focus:ring-[var(--color-accent)] transition-colors'

/* ─── Component ──────────────────────────────────────────────────────────────── */
export default function QCClient({ initialInspections, openDefects, reprintRequests, templates, jobs }: {
  initialInspections: Inspection[]; openDefects: Defect[]; reprintRequests: ReprintReq[]
  templates: Template[]; jobs: Job[]
}) {
  const [inspections, setInspections] = useState(initialInspections)
  const [defects,     setDefects]     = useState(openDefects)
  const [reprints,    setReprints]    = useState(reprintRequests)
  const [tab, setTab] = useState<'inspections'|'defects'|'reprints'>('inspections')
  const [loading, setLoading] = useState(false)

  /* Inspect modal */
  const [inspectModal, setInspectModal]   = useState(false)
  const [inspJob,      setInspJob]        = useState('')
  const [inspTemplate, setInspTemplate]   = useState(templates[0]?.id || '')
  const [sampleSize,   setSampleSize]     = useState('')
  const [inspNotes,    setInspNotes]      = useState('')
  const [responses,    setResponses]      = useState<Record<string, { response: 'pass'|'fail'|'na'; notes: string }>>({})
  const selectedTemplate = templates.find(t => t.id === inspTemplate)
  const items = selectedTemplate?.qc_template_items?.sort((a,b) => a.sort_order - b.sort_order) ?? []

  /* Defect modal */
  const [defectModal, setDefectModal] = useState(false)
  const [defectForm,  setDefectForm]  = useState({ job_id: '', inspection_id: '', defect_type: '', severity: 'minor', quantity_affected: '', description: '' })

  /* Reprint modal */
  const [reprintModal, setReprintModal] = useState(false)
  const [reprintForm,  setReprintForm]  = useState({ original_job_id: '', reason: '', quantity: '', priority: 'normal', notes: '' })

  /* Sign-off modal */
  const [signoffModal,  setSignoffModal]  = useState<Inspection | null>(null)
  const [signoffResult, setSignoffResult] = useState<'pass'|'fail'|'conditional_pass'>('pass')
  const [signoffNotes,  setSignoffNotes]  = useState('')

  /* Resolve defect */
  const [resolveModal, setResolveModal] = useState<Defect | null>(null)
  const [resolveNotes, setResolveNotes] = useState('')

  /* Reprint action */
  const [reprintAction, setReprintAction] = useState<{ rpr: ReprintReq; action: 'approve'|'reject' } | null>(null)
  const [reprintActionNotes, setReprintActionNotes] = useState('')

  /* ─── Handlers ─────────────────────────────────────────────────────────────── */
  const setResponse = (itemId: string, field: 'response'|'notes', val: string) =>
    setResponses(p => ({ ...p, [itemId]: { ...p[itemId], response: p[itemId]?.response || 'pass', notes: '', [field]: val } }))

  const submitInspection = async () => {
    if (!inspJob) { toast.error('Select a job'); return }
    if (items.length > 0 && Object.keys(responses).length === 0) { toast.error('Complete the checklist'); return }
    setLoading(true)
    try {
      const responseList = items.map(item => ({
        template_item_id: item.id,
        question:  item.question,
        is_critical: item.is_critical,
        response:  responses[item.id]?.response || 'pass',
        notes:     responses[item.id]?.notes || null,
      }))
      const res = await fetch('/api/v1/qc/checklists', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ job_id: inspJob, template_id: inspTemplate || null, sample_size: sampleSize || null, notes: inspNotes || null, responses: responseList }),
      })
      if (!res.ok) { const e = await res.json(); throw new Error(e.error) }
      const { data } = await res.json()
      const job = jobs.find(j => j.id === inspJob)
      setInspections(prev => [{ ...data, jobs: job ? { job_number: job.job_number, job_title: job.job_title, customers: job.customers } : null, qc_templates: selectedTemplate ? { name: selectedTemplate.name } : null, qc_defects: [] }, ...prev])
      setInspectModal(false)
      setInspJob(''); setInspNotes(''); setSampleSize(''); setResponses({})
      toast.success(`Inspection #${data.inspection_no} recorded — ${data.result?.toUpperCase()}`)
    } catch (e: any) { toast.error(e.message || 'Failed') }
    finally { setLoading(false) }
  }

  const submitDefect = async () => {
    if (!defectForm.job_id || !defectForm.defect_type) { toast.error('Job and defect type required'); return }
    setLoading(true)
    try {
      const res = await fetch('/api/v1/qc/defects', {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(defectForm),
      })
      if (!res.ok) throw new Error()
      const { data } = await res.json()
      const job = jobs.find(j => j.id === defectForm.job_id)
      setDefects(prev => [{ ...data, jobs: job ? { job_number: job.job_number, job_title: job.job_title } : null }, ...prev])
      setDefectModal(false)
      setDefectForm({ job_id: '', inspection_id: '', defect_type: '', severity: 'minor', quantity_affected: '', description: '' })
      toast.success('Defect logged')
    } catch { toast.error('Failed') }
    finally { setLoading(false) }
  }

  const submitReprint = async () => {
    if (!reprintForm.original_job_id || !reprintForm.reason || !reprintForm.quantity) { toast.error('Fill required fields'); return }
    setLoading(true)
    try {
      const res = await fetch('/api/v1/qc/reprint', {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(reprintForm),
      })
      if (!res.ok) throw new Error()
      const { data } = await res.json()
      const job = jobs.find(j => j.id === reprintForm.original_job_id)
      setReprints(prev => [{ ...data, jobs: job || null }, ...prev])
      setReprintModal(false)
      setReprintForm({ original_job_id: '', reason: '', quantity: '', priority: 'normal', notes: '' })
      toast.success('Re-print request submitted')
    } catch { toast.error('Failed') }
    finally { setLoading(false) }
  }

  const submitSignoff = async () => {
    if (!signoffModal) return
    setLoading(true)
    try {
      const res = await fetch(`/api/v1/qc/checklists/${signoffModal.id}`, {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'signoff', result: signoffResult, notes: signoffNotes }),
      })
      if (!res.ok) throw new Error()
      setInspections(prev => prev.map(i => i.id === signoffModal.id ? { ...i, result: signoffResult, signed_off_at: new Date().toISOString() } : i))
      setSignoffModal(null)
      toast.success(`QC Sign-off: ${signoffResult.toUpperCase()}`)
    } catch { toast.error('Failed') }
    finally { setLoading(false) }
  }

  const resolveDefect = async () => {
    if (!resolveModal) return
    setLoading(true)
    try {
      const res = await fetch(`/api/v1/qc/defects/${resolveModal.id}`, {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'resolve', resolved_notes: resolveNotes }),
      })
      if (!res.ok) throw new Error()
      setDefects(prev => prev.filter(d => d.id !== resolveModal.id))
      setResolveModal(null)
      toast.success('Defect resolved')
    } catch { toast.error('Failed') }
    finally { setLoading(false) }
  }

  const handleReprintAction = async () => {
    if (!reprintAction) return
    setLoading(true)
    try {
      const res = await fetch(`/api/v1/qc/reprint/${reprintAction.rpr.id}`, {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: reprintAction.action, notes: reprintActionNotes }),
      })
      if (!res.ok) throw new Error()
      const newStatus = reprintAction.action === 'approve' ? 'approved' : 'rejected'
      setReprints(prev => prev.map(r => r.id === reprintAction.rpr.id ? { ...r, status: newStatus } : r))
      setReprintAction(null)
      toast.success(reprintAction.action === 'approve' ? '✅ Re-print approved — new job created' : 'Request rejected')
    } catch { toast.error('Failed') }
    finally { setLoading(false) }
  }

  /* ─── Render ────────────────────────────────────────────────────────────────── */
  const passCount = inspections.filter(i => i.result === 'pass').length
  const failCount = inspections.filter(i => i.result === 'fail').length

  return (
    <div className="space-y-4">
      {/* Stat cards */}
      <div className="grid grid-cols-4 gap-4">
        {[
          { label: 'Inspections',   value: inspections.length, icon: ClipboardList, color: 'var(--color-accent)' },
          { label: 'Passed',        value: passCount,          icon: CheckCircle2,  color: 'var(--color-success)' },
          { label: 'Failed',        value: failCount,          icon: XCircle,       color: 'var(--color-danger)' },
          { label: 'Open Defects',  value: defects.length,     icon: AlertTriangle, color: defects.length > 0 ? 'var(--color-warning)' : 'var(--color-success)' },
        ].map(s => (
          <div key={s.label} className="rounded-xl border border-[var(--color-border)] bg-[var(--color-bg-secondary)] p-4 flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg flex items-center justify-center flex-shrink-0"
              style={{ background: `color-mix(in srgb, ${s.color} 12%, transparent)` }}>
              <s.icon size={18} style={{ color: s.color }} />
            </div>
            <div>
              <p className="text-xs text-[var(--color-text-muted)]">{s.label}</p>
              <p className="text-xl font-bold text-[var(--color-text-primary)]">{s.value}</p>
            </div>
          </div>
        ))}
      </div>

      {/* Toolbar */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-1">
          {([
            ['inspections', `Inspections (${inspections.length})`],
            ['defects',     `Open Defects (${defects.length})`],
            ['reprints',    `Re-prints (${reprints.length})`],
          ] as const).map(([key, label]) => (
            <button key={key} onClick={() => setTab(key)}
              className={cn('px-4 h-8 rounded-md text-sm font-medium border transition-all',
                tab === key ? 'bg-[var(--color-accent)] text-white border-transparent' : 'border-[var(--color-border)] text-[var(--color-text-secondary)] hover:text-[var(--color-text-primary)]')}>
              {label}
            </button>
          ))}
        </div>
        <div className="flex items-center gap-2">
          {tab === 'inspections' && (
            <button onClick={() => setInspectModal(true)}
              className="flex items-center gap-1.5 px-4 h-9 rounded-md bg-[var(--color-accent)] text-white text-sm font-medium hover:bg-[var(--color-accent-hover)] transition-colors">
              <Plus size={14} /> New Inspection
            </button>
          )}
          {tab === 'defects' && (
            <button onClick={() => setDefectModal(true)}
              className="flex items-center gap-1.5 px-4 h-9 rounded-md bg-[var(--color-danger)] text-white text-sm font-medium hover:opacity-90 transition-colors">
              <Plus size={14} /> Log Defect
            </button>
          )}
          {tab === 'reprints' && (
            <button onClick={() => setReprintModal(true)}
              className="flex items-center gap-1.5 px-4 h-9 rounded-md bg-[var(--color-warning)] text-white text-sm font-medium hover:opacity-90 transition-colors">
              <RefreshCw size={14} /> Request Re-print
            </button>
          )}
        </div>
      </div>

      {/* ── INSPECTIONS TAB ─────────────────────────────────────────────────────── */}
      {tab === 'inspections' && (
        <div className="rounded-xl border border-[var(--color-border)] bg-[var(--color-bg-secondary)] overflow-hidden">
          {inspections.length === 0 ? (
            <div className="p-12 text-center">
              <ClipboardList size={28} className="text-[var(--color-text-muted)] opacity-30 mx-auto mb-2" />
              <p className="text-sm text-[var(--color-text-muted)]">No inspections yet</p>
            </div>
          ) : (
            <>
              <div className="grid grid-cols-12 gap-3 px-5 py-2.5 bg-[var(--color-bg-elevated)] border-b border-[var(--color-border)] text-xs font-semibold text-[var(--color-text-muted)] uppercase tracking-wider">
                <div className="col-span-2">Job</div>
                <div className="col-span-3">Title</div>
                <div className="col-span-2">Template</div>
                <div className="col-span-1 text-center">Insp #</div>
                <div className="col-span-2">Result</div>
                <div className="col-span-2 text-right">Actions</div>
              </div>
              <div className="divide-y divide-[var(--color-border-subtle)]">
                {inspections.map((insp, idx) => {
                  const resultCfg = insp.result ? RESULT_CFG[insp.result as keyof typeof RESULT_CFG] : null
                  const openDef = (insp.qc_defects || []).filter(d => !d.resolved).length
                  return (
                    <div key={insp.id} className={cn('grid grid-cols-12 gap-3 px-5 py-3.5 items-center', idx % 2 === 1 && 'bg-[var(--color-bg-elevated)]/15')}>
                      <div className="col-span-2">
                        <Link href={`/dashboard/jobs/${insp.job_id}`} className="text-xs font-mono text-[var(--color-accent)] hover:underline">
                          {insp.jobs?.job_number}
                        </Link>
                        <p className="text-xs text-[var(--color-text-muted)] mt-0.5">{insp.jobs?.customers?.name}</p>
                      </div>
                      <div className="col-span-3 text-sm text-[var(--color-text-primary)] truncate">{insp.jobs?.job_title}</div>
                      <div className="col-span-2 text-xs text-[var(--color-text-muted)]">{insp.qc_templates?.name || 'Custom'}</div>
                      <div className="col-span-1 text-center text-sm font-semibold text-[var(--color-text-secondary)]">#{insp.inspection_no}</div>
                      <div className="col-span-2">
                        {resultCfg ? (
                          <span className={cn('inline-flex items-center gap-1.5 text-xs px-2.5 py-1 rounded-full border font-medium', resultCfg.color)}>
                            <resultCfg.icon size={11} /> {resultCfg.label}
                          </span>
                        ) : (
                          <span className="text-xs text-[var(--color-text-muted)]">Pending</span>
                        )}
                        {openDef > 0 && <span className="ml-2 text-xs text-[var(--color-warning)]">{openDef} defect{openDef !== 1 ? 's' : ''}</span>}
                      </div>
                      <div className="col-span-2 flex items-center gap-1.5 justify-end">
                        {!insp.signed_off_at && (
                          <button onClick={() => { setSignoffModal(insp); setSignoffResult(insp.result as any || 'pass'); setSignoffNotes('') }}
                            className="flex items-center gap-1 px-2.5 h-7 rounded border border-[var(--color-accent)]/30 text-xs text-[var(--color-accent)] hover:bg-[var(--color-accent)]/10 transition-colors">
                            <Shield size={11} /> Sign-off
                          </button>
                        )}
                        {insp.signed_off_at && (
                          <span className="text-xs text-[var(--color-success)] flex items-center gap-1">
                            <CheckCircle2 size={11} /> Signed
                          </span>
                        )}
                      </div>
                    </div>
                  )
                })}
              </div>
            </>
          )}
        </div>
      )}

      {/* ── DEFECTS TAB ─────────────────────────────────────────────────────────── */}
      {tab === 'defects' && (
        <div className="rounded-xl border border-[var(--color-border)] bg-[var(--color-bg-secondary)] overflow-hidden">
          {defects.length === 0 ? (
            <div className="p-12 text-center">
              <CheckCircle2 size={28} className="text-[var(--color-success)] opacity-50 mx-auto mb-2" />
              <p className="text-sm font-medium text-[var(--color-text-primary)]">No open defects</p>
              <p className="text-xs text-[var(--color-text-muted)] mt-1">All defects have been resolved</p>
            </div>
          ) : (
            <>
              <div className="grid grid-cols-12 gap-3 px-5 py-2.5 bg-[var(--color-bg-elevated)] border-b border-[var(--color-border)] text-xs font-semibold text-[var(--color-text-muted)] uppercase tracking-wider">
                <div className="col-span-2">Job</div>
                <div className="col-span-3">Defect Type</div>
                <div className="col-span-2">Severity</div>
                <div className="col-span-2">Qty Affected</div>
                <div className="col-span-2">Reported</div>
                <div className="col-span-1 text-right">Action</div>
              </div>
              <div className="divide-y divide-[var(--color-border-subtle)]">
                {defects.map((d, idx) => {
                  const sevCfg = SEVERITY_CFG[d.severity as keyof typeof SEVERITY_CFG] || SEVERITY_CFG.minor
                  return (
                    <div key={d.id} className={cn('grid grid-cols-12 gap-3 px-5 py-3.5 items-center', idx % 2 === 1 && 'bg-[var(--color-bg-elevated)]/15')}>
                      <div className="col-span-2">
                        <Link href={`/dashboard/jobs/${d.job_id}`} className="text-xs font-mono text-[var(--color-accent)] hover:underline">{d.jobs?.job_number}</Link>
                      </div>
                      <div className="col-span-3">
                        <p className="text-sm text-[var(--color-text-primary)] capitalize">{d.defect_type.replace(/_/g, ' ')}</p>
                        {d.description && <p className="text-xs text-[var(--color-text-muted)] truncate">{d.description}</p>}
                      </div>
                      <div className="col-span-2">
                        <span className={cn('text-xs px-2 py-0.5 rounded-full border font-medium', sevCfg.color)}>{sevCfg.label}</span>
                      </div>
                      <div className="col-span-2 text-sm text-[var(--color-text-secondary)]">
                        {d.quantity_affected > 0 ? d.quantity_affected.toLocaleString() + ' pcs' : '—'}
                      </div>
                      <div className="col-span-2 text-xs text-[var(--color-text-muted)]">{formatTimeAgo(d.created_at)}</div>
                      <div className="col-span-1 text-right">
                        <button onClick={() => { setResolveModal(d); setResolveNotes('') }}
                          className="flex items-center gap-1 px-2.5 h-7 rounded border border-[var(--color-success)]/30 text-xs text-[var(--color-success)] hover:bg-[var(--color-success)]/10 transition-colors ml-auto">
                          <CheckCircle2 size={11} /> Resolve
                        </button>
                      </div>
                    </div>
                  )
                })}
              </div>
            </>
          )}
        </div>
      )}

      {/* ── REPRINTS TAB ─────────────────────────────────────────────────────────── */}
      {tab === 'reprints' && (
        <div className="rounded-xl border border-[var(--color-border)] bg-[var(--color-bg-secondary)] overflow-hidden">
          {reprints.length === 0 ? (
            <div className="p-12 text-center">
              <RefreshCw size={28} className="text-[var(--color-text-muted)] opacity-30 mx-auto mb-2" />
              <p className="text-sm text-[var(--color-text-muted)]">No re-print requests</p>
            </div>
          ) : (
            <>
              <div className="grid grid-cols-12 gap-3 px-5 py-2.5 bg-[var(--color-bg-elevated)] border-b border-[var(--color-border)] text-xs font-semibold text-[var(--color-text-muted)] uppercase tracking-wider">
                <div className="col-span-2">Job</div>
                <div className="col-span-4">Reason</div>
                <div className="col-span-1">Qty</div>
                <div className="col-span-2">Status</div>
                <div className="col-span-3 text-right">Actions</div>
              </div>
              <div className="divide-y divide-[var(--color-border-subtle)]">
                {reprints.map((rpr, idx) => {
                  const stCfg = REPRINT_STATUS_CFG[rpr.status as keyof typeof REPRINT_STATUS_CFG] || REPRINT_STATUS_CFG.pending
                  return (
                    <div key={rpr.id} className={cn('grid grid-cols-12 gap-3 px-5 py-3.5 items-center', idx % 2 === 1 && 'bg-[var(--color-bg-elevated)]/15')}>
                      <div className="col-span-2">
                        <Link href={`/dashboard/jobs/${rpr.original_job_id}`} className="text-xs font-mono text-[var(--color-accent)] hover:underline">{rpr.jobs?.job_number}</Link>
                        <p className="text-xs text-[var(--color-text-muted)]">{rpr.jobs?.customers?.name}</p>
                      </div>
                      <div className="col-span-4 text-sm text-[var(--color-text-primary)] truncate">{rpr.reason}</div>
                      <div className="col-span-1 text-sm text-[var(--color-text-secondary)]">{rpr.quantity.toLocaleString()}</div>
                      <div className="col-span-2">
                        <span className={cn('text-xs px-2.5 py-1 rounded-full border font-medium', stCfg.color)}>{stCfg.label}</span>
                      </div>
                      <div className="col-span-3 flex items-center gap-1.5 justify-end">
                        {rpr.status === 'pending' && (
                          <>
                            <button onClick={() => { setReprintAction({ rpr, action: 'approve' }); setReprintActionNotes('') }}
                              className="flex items-center gap-1 px-2.5 h-7 rounded bg-[var(--color-success)] text-white text-xs font-medium hover:opacity-90 transition-colors">
                              <ThumbsUp size={11} /> Approve
                            </button>
                            <button onClick={() => { setReprintAction({ rpr, action: 'reject' }); setReprintActionNotes('') }}
                              className="flex items-center gap-1 px-2.5 h-7 rounded border border-[var(--color-danger)]/30 text-xs text-[var(--color-danger)] hover:bg-[var(--color-danger)]/10 transition-colors">
                              <ThumbsDown size={11} /> Reject
                            </button>
                          </>
                        )}
                      </div>
                    </div>
                  )
                })}
              </div>
            </>
          )}
        </div>
      )}

      {/* ══ MODALS ══════════════════════════════════════════════════════════════════ */}

      {/* New Inspection Modal */}
      <Modal open={inspectModal} onClose={() => setInspectModal(false)} title="New QC Inspection" size="xl"
        footer={
          <>
            <button onClick={() => setInspectModal(false)} className="px-4 h-9 rounded-md border border-[var(--color-border)] text-sm text-[var(--color-text-secondary)] hover:bg-[var(--color-bg-elevated)] transition-colors">Cancel</button>
            <button onClick={submitInspection} disabled={loading || !inspJob}
              className="flex items-center gap-2 px-4 h-9 rounded-md bg-[var(--color-accent)] text-white text-sm font-medium hover:bg-[var(--color-accent-hover)] disabled:opacity-50 transition-colors">
              <ClipboardList size={14} /> {loading ? 'Saving…' : 'Submit Inspection'}
            </button>
          </>
        }>
        <div className="space-y-4">
          <div className="grid grid-cols-3 gap-3">
            <div className="space-y-1.5">
              <label className="text-sm font-medium text-[var(--color-text-primary)]">Job <span className="text-[var(--color-danger)]">*</span></label>
              <select className={inputCls} value={inspJob} onChange={e => setInspJob(e.target.value)}>
                <option value="">Select job…</option>
                {jobs.map(j => <option key={j.id} value={j.id}>{j.job_number} — {j.job_title}</option>)}
              </select>
            </div>
            <div className="space-y-1.5">
              <label className="text-sm font-medium text-[var(--color-text-primary)]">QC Template</label>
              <select className={inputCls} value={inspTemplate} onChange={e => { setInspTemplate(e.target.value); setResponses({}) }}>
                <option value="">No template</option>
                {templates.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}
              </select>
            </div>
            <div className="space-y-1.5">
              <label className="text-sm font-medium text-[var(--color-text-primary)]">Sample Size</label>
              <input type="number" className={inputCls} value={sampleSize} onChange={e => setSampleSize(e.target.value)} placeholder="e.g. 50" />
            </div>
          </div>

          {/* Checklist */}
          {items.length > 0 && (
            <div className="rounded-xl border border-[var(--color-border)] overflow-hidden">
              <div className="grid grid-cols-12 gap-3 px-4 py-2.5 bg-[var(--color-bg-elevated)] border-b border-[var(--color-border)] text-xs font-semibold text-[var(--color-text-muted)] uppercase tracking-wider">
                <div className="col-span-5">Check Point</div>
                <div className="col-span-1 text-center">Critical</div>
                <div className="col-span-3 text-center">Result</div>
                <div className="col-span-3">Notes</div>
              </div>
              <div className="divide-y divide-[var(--color-border-subtle)] max-h-72 overflow-y-auto">
                {items.map(item => {
                  const resp = responses[item.id]?.response || 'pass'
                  return (
                    <div key={item.id} className="grid grid-cols-12 gap-3 px-4 py-2.5 items-center">
                      <div className="col-span-5 text-sm text-[var(--color-text-primary)]">{item.question}</div>
                      <div className="col-span-1 text-center">
                        {item.is_critical && <span className="text-xs text-[var(--color-danger)] font-bold">●</span>}
                      </div>
                      <div className="col-span-3 flex items-center justify-center gap-1.5">
                        {(['pass','fail','na'] as const).map(v => (
                          <button key={v} onClick={() => setResponse(item.id, 'response', v)}
                            className={cn('px-2.5 h-7 rounded-md text-xs font-medium border transition-all',
                              resp === v
                                ? v === 'pass' ? 'bg-[var(--color-success)] text-white border-transparent'
                                  : v === 'fail' ? 'bg-[var(--color-danger)] text-white border-transparent'
                                  : 'bg-[var(--color-bg-elevated)] text-[var(--color-text-muted)] border-[var(--color-border)]'
                                : 'border-[var(--color-border)] text-[var(--color-text-muted)] hover:bg-[var(--color-bg-elevated)]')}>
                            {v === 'pass' ? '✓ Pass' : v === 'fail' ? '✗ Fail' : 'N/A'}
                          </button>
                        ))}
                      </div>
                      <div className="col-span-3">
                        <input className="w-full h-7 px-2 rounded border text-xs bg-[var(--color-bg-elevated)] text-[var(--color-text-primary)] border-[var(--color-border)] focus:outline-none transition-colors"
                          value={responses[item.id]?.notes || ''} onChange={e => setResponse(item.id, 'notes', e.target.value)} placeholder="Note…" />
                      </div>
                    </div>
                  )
                })}
              </div>
            </div>
          )}

          <div className="space-y-1.5">
            <label className="text-sm font-medium text-[var(--color-text-primary)]">Inspector Notes</label>
            <input className={inputCls} value={inspNotes} onChange={e => setInspNotes(e.target.value)} placeholder="Overall observations…" />
          </div>
        </div>
      </Modal>

      {/* Log Defect Modal */}
      <Modal open={defectModal} onClose={() => setDefectModal(false)} title="Log Defect" size="md"
        footer={
          <>
            <button onClick={() => setDefectModal(false)} className="px-4 h-9 rounded-md border border-[var(--color-border)] text-sm text-[var(--color-text-secondary)] hover:bg-[var(--color-bg-elevated)] transition-colors">Cancel</button>
            <button onClick={submitDefect} disabled={loading || !defectForm.job_id || !defectForm.defect_type}
              className="px-4 h-9 rounded-md bg-[var(--color-danger)] text-white text-sm font-medium hover:opacity-90 disabled:opacity-50 transition-colors">
              {loading ? 'Logging…' : 'Log Defect'}
            </button>
          </>
        }>
        <div className="space-y-3">
          <div className="space-y-1.5">
            <label className="text-sm font-medium text-[var(--color-text-primary)]">Job <span className="text-[var(--color-danger)]">*</span></label>
            <select className={inputCls} value={defectForm.job_id} onChange={e => setDefectForm(p => ({ ...p, job_id: e.target.value }))}>
              <option value="">Select job…</option>
              {jobs.map(j => <option key={j.id} value={j.id}>{j.job_number} — {j.job_title}</option>)}
            </select>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <label className="text-sm font-medium text-[var(--color-text-primary)]">Defect Type <span className="text-[var(--color-danger)]">*</span></label>
              <select className={inputCls} value={defectForm.defect_type} onChange={e => setDefectForm(p => ({ ...p, defect_type: e.target.value }))}>
                <option value="">Select…</option>
                {DEFECT_TYPES.map(t => <option key={t} value={t} className="capitalize">{t.replace(/_/g, ' ')}</option>)}
              </select>
            </div>
            <div className="space-y-1.5">
              <label className="text-sm font-medium text-[var(--color-text-primary)]">Severity</label>
              <select className={inputCls} value={defectForm.severity} onChange={e => setDefectForm(p => ({ ...p, severity: e.target.value }))}>
                <option value="minor">Minor</option>
                <option value="major">Major</option>
                <option value="critical">Critical</option>
              </select>
            </div>
          </div>
          <div className="space-y-1.5">
            <label className="text-sm font-medium text-[var(--color-text-primary)]">Quantity Affected</label>
            <input type="number" className={inputCls} value={defectForm.quantity_affected} onChange={e => setDefectForm(p => ({ ...p, quantity_affected: e.target.value }))} placeholder="Number of pieces" />
          </div>
          <div className="space-y-1.5">
            <label className="text-sm font-medium text-[var(--color-text-primary)]">Description</label>
            <input className={inputCls} value={defectForm.description} onChange={e => setDefectForm(p => ({ ...p, description: e.target.value }))} placeholder="Describe the defect in detail…" />
          </div>
        </div>
      </Modal>

      {/* Re-print Request Modal */}
      <Modal open={reprintModal} onClose={() => setReprintModal(false)} title="Request Re-print" size="md"
        footer={
          <>
            <button onClick={() => setReprintModal(false)} className="px-4 h-9 rounded-md border border-[var(--color-border)] text-sm text-[var(--color-text-secondary)] hover:bg-[var(--color-bg-elevated)] transition-colors">Cancel</button>
            <button onClick={submitReprint} disabled={loading || !reprintForm.original_job_id || !reprintForm.reason || !reprintForm.quantity}
              className="px-4 h-9 rounded-md bg-[var(--color-warning)] text-white text-sm font-medium hover:opacity-90 disabled:opacity-50 transition-colors">
              {loading ? 'Submitting…' : 'Submit Request'}
            </button>
          </>
        }>
        <div className="space-y-3">
          <div className="space-y-1.5">
            <label className="text-sm font-medium text-[var(--color-text-primary)]">Original Job <span className="text-[var(--color-danger)]">*</span></label>
            <select className={inputCls} value={reprintForm.original_job_id} onChange={e => setReprintForm(p => ({ ...p, original_job_id: e.target.value }))}>
              <option value="">Select job…</option>
              {jobs.map(j => <option key={j.id} value={j.id}>{j.job_number} — {j.job_title}</option>)}
            </select>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <label className="text-sm font-medium text-[var(--color-text-primary)]">Re-print Quantity <span className="text-[var(--color-danger)]">*</span></label>
              <input type="number" className={inputCls} value={reprintForm.quantity} onChange={e => setReprintForm(p => ({ ...p, quantity: e.target.value }))} placeholder="Pieces to reprint" />
            </div>
            <div className="space-y-1.5">
              <label className="text-sm font-medium text-[var(--color-text-primary)]">Priority</label>
              <select className={inputCls} value={reprintForm.priority} onChange={e => setReprintForm(p => ({ ...p, priority: e.target.value }))}>
                <option value="low">Low</option>
                <option value="normal">Normal</option>
                <option value="high">High</option>
                <option value="urgent">Urgent</option>
              </select>
            </div>
          </div>
          <div className="space-y-1.5">
            <label className="text-sm font-medium text-[var(--color-text-primary)]">Reason <span className="text-[var(--color-danger)]">*</span></label>
            <input className={inputCls} value={reprintForm.reason} onChange={e => setReprintForm(p => ({ ...p, reason: e.target.value }))} placeholder="Why is a re-print needed?" />
          </div>
          <div className="space-y-1.5">
            <label className="text-sm font-medium text-[var(--color-text-primary)]">Notes</label>
            <input className={inputCls} value={reprintForm.notes} onChange={e => setReprintForm(p => ({ ...p, notes: e.target.value }))} placeholder="Additional information…" />
          </div>
        </div>
      </Modal>

      {/* Sign-off Modal — Phase 40 */}
      {signoffModal && (
        <Modal open={true} onClose={() => setSignoffModal(null)} title={`QC Sign-off — ${signoffModal.jobs?.job_number}`} size="sm"
          footer={
            <>
              <button onClick={() => setSignoffModal(null)} className="px-4 h-9 rounded-md border border-[var(--color-border)] text-sm text-[var(--color-text-secondary)] hover:bg-[var(--color-bg-elevated)] transition-colors">Cancel</button>
              <button onClick={submitSignoff} disabled={loading}
                className={cn('flex items-center gap-2 px-4 h-9 rounded-md text-white text-sm font-medium disabled:opacity-50 transition-colors',
                  signoffResult === 'pass' ? 'bg-[var(--color-success)] hover:opacity-90' :
                  signoffResult === 'fail' ? 'bg-[var(--color-danger)] hover:opacity-90' :
                                            'bg-[var(--color-warning)] hover:opacity-90')}>
                <Shield size={14} /> {loading ? 'Signing…' : 'Sign Off'}
              </button>
            </>
          }>
          <div className="space-y-4">
            <div className="rounded-lg bg-[var(--color-bg-elevated)] border border-[var(--color-border)] p-3">
              <p className="text-sm font-medium text-[var(--color-text-primary)]">{signoffModal.jobs?.job_title}</p>
              <p className="text-xs text-[var(--color-text-muted)] mt-0.5">Inspection #{signoffModal.inspection_no} · {signoffModal.defect_count} defects found</p>
            </div>
            <div className="space-y-1.5">
              <label className="text-sm font-medium text-[var(--color-text-primary)]">Final QC Decision</label>
              <div className="flex gap-2">
                {(['pass','conditional_pass','fail'] as const).map(v => {
                  const cfg = RESULT_CFG[v]
                  return (
                    <button key={v} onClick={() => setSignoffResult(v)}
                      className={cn('flex-1 flex items-center justify-center gap-1.5 h-9 rounded-md border text-xs font-medium transition-all',
                        signoffResult === v ? cn(cfg.color, 'border-current') : 'border-[var(--color-border)] text-[var(--color-text-muted)] hover:bg-[var(--color-bg-elevated)]')}>
                      <cfg.icon size={12} /> {cfg.label}
                    </button>
                  )
                })}
              </div>
            </div>
            <div className="space-y-1.5">
              <label className="text-sm font-medium text-[var(--color-text-primary)]">Sign-off Notes</label>
              <input className={inputCls} value={signoffNotes} onChange={e => setSignoffNotes(e.target.value)} placeholder="Final observations…" />
            </div>
            {signoffResult === 'pass' && (
              <div className="rounded-lg bg-[var(--color-success)]/5 border border-[var(--color-success)]/20 p-3 text-xs text-[var(--color-success)]">
                ✓ Job status will automatically change to <strong>Completed</strong> after sign-off.
              </div>
            )}
          </div>
        </Modal>
      )}

      {/* Resolve Defect Modal */}
      {resolveModal && (
        <Modal open={true} onClose={() => setResolveModal(null)} title="Resolve Defect" size="sm"
          footer={
            <>
              <button onClick={() => setResolveModal(null)} className="px-4 h-9 rounded-md border border-[var(--color-border)] text-sm text-[var(--color-text-secondary)] hover:bg-[var(--color-bg-elevated)] transition-colors">Cancel</button>
              <button onClick={resolveDefect} disabled={loading}
                className="px-4 h-9 rounded-md bg-[var(--color-success)] text-white text-sm font-medium hover:opacity-90 disabled:opacity-50 transition-colors">
                {loading ? 'Resolving…' : 'Mark Resolved'}
              </button>
            </>
          }>
          <div className="space-y-3">
            <div className="rounded-lg bg-[var(--color-bg-elevated)] border border-[var(--color-border)] p-3 text-sm">
              <p className="font-medium text-[var(--color-text-primary)] capitalize">{resolveModal.defect_type.replace(/_/g,' ')}</p>
              <p className="text-xs text-[var(--color-text-muted)] mt-0.5">{resolveModal.quantity_affected} pcs affected</p>
            </div>
            <div className="space-y-1.5">
              <label className="text-sm font-medium text-[var(--color-text-primary)]">Resolution Notes</label>
              <input className={inputCls} value={resolveNotes} onChange={e => setResolveNotes(e.target.value)} placeholder="How was this defect resolved?" />
            </div>
          </div>
        </Modal>
      )}

      {/* Reprint Approve/Reject Modal */}
      {reprintAction && (
        <Modal open={true} onClose={() => setReprintAction(null)}
          title={reprintAction.action === 'approve' ? '✅ Approve Re-print' : '❌ Reject Re-print'} size="sm"
          footer={
            <>
              <button onClick={() => setReprintAction(null)} className="px-4 h-9 rounded-md border border-[var(--color-border)] text-sm text-[var(--color-text-secondary)] hover:bg-[var(--color-bg-elevated)] transition-colors">Cancel</button>
              <button onClick={handleReprintAction} disabled={loading}
                className={cn('px-4 h-9 rounded-md text-white text-sm font-medium disabled:opacity-50 transition-colors',
                  reprintAction.action === 'approve' ? 'bg-[var(--color-success)] hover:opacity-90' : 'bg-[var(--color-danger)] hover:opacity-90')}>
                {loading ? 'Processing…' : reprintAction.action === 'approve' ? 'Approve & Create Job' : 'Reject Request'}
              </button>
            </>
          }>
          <div className="space-y-3">
            <div className="rounded-lg bg-[var(--color-bg-elevated)] border border-[var(--color-border)] p-3 text-sm">
              <p className="font-semibold text-[var(--color-accent)]">{reprintAction.rpr.jobs?.job_number}</p>
              <p className="text-[var(--color-text-primary)]">{reprintAction.rpr.reason}</p>
              <p className="text-xs text-[var(--color-text-muted)] mt-1">Qty: {reprintAction.rpr.quantity.toLocaleString()} pcs</p>
            </div>
            {reprintAction.action === 'approve' && (
              <div className="rounded-lg bg-[var(--color-success)]/5 border border-[var(--color-success)]/20 p-3 text-xs text-[var(--color-success)]">
                A new repeat job will be created automatically with the same specifications.
              </div>
            )}
            <div className="space-y-1.5">
              <label className="text-sm font-medium text-[var(--color-text-primary)]">Notes (optional)</label>
              <input className={inputCls} value={reprintActionNotes} onChange={e => setReprintActionNotes(e.target.value)}
                placeholder={reprintAction.action === 'approve' ? 'Special instructions…' : 'Reason for rejection…'} />
            </div>
          </div>
        </Modal>
      )}
    </div>
  )
}
