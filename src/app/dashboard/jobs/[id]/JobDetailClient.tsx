'use client'
import { useState, useEffect } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { createSupabaseClient } from '@/lib/supabase/client'
import {
  ArrowLeft, Printer, PauseCircle, PlayCircle, RefreshCw, CheckCircle2,
  SkipForward, Clock, User, Calendar, Package, ChevronRight, AlertTriangle,
  MessageSquare, Layers, Activity, FileText, Pencil, Trash2
} from 'lucide-react'
import { cn } from '@/lib/utils/cn'
import { toast } from '@/components/ui/Toast'
import { Modal, ConfirmDialog } from '@/components/ui/Modal'
import { formatDate, formatDateTime, formatTimeAgo } from '@/lib/utils/format'
import {
  JOB_STATUS_CONFIG, JOB_PRIORITY_CONFIG,
  type Job, type JobStageProgress, type JobEvent, type JobStatus,
  type WastageReason, type JobWastage
} from '@/modules/jobs/types/job.types'
import JobArtworkTab from './JobArtworkTab'

interface DelayReason { id: string; name: string; category: string }
interface Machine { id: string; name: string }
interface ArtworkVersion {
  id: string; job_id: string; version: number; file_name: string; file_url: string
  file_size: number | null; file_type: string | null; designer_notes: string | null
  status: string; is_production_ready: boolean; approved_at: string | null; created_at: string
}
interface Props {
  job: Job; stages: JobStageProgress[]; events: JobEvent[]; delayReasons: DelayReason[]
  wastageReasons: WastageReason[]; machines: Machine[]; wastageEntries: JobWastage[]
  companyId: string; artworks: ArtworkVersion[]
}

type Tab = 'overview' | 'workflow' | 'artwork' | 'timeline' | 'remarks' | 'wastage'

const EVENT_LABELS: Record<string, string> = {
  created: 'Job Created', status_changed: 'Status Changed', stage_started: 'Stage Started',
  stage_completed: 'Stage Completed', stage_skipped: 'Stage Skipped',
  hold_started: 'Put On Hold', hold_ended: 'Resumed', remark_added: 'Remark Added',
  artwork_uploaded: 'Artwork Uploaded', repeat_created: 'Repeat Job Created',
  assigned: 'Assigned', priority_changed: 'Priority Changed', wastage_recorded: 'Wastage Recorded',
  plate_assigned: 'Plate Assigned', plate_returned: 'Plate Returned',
}

const EVENT_COLORS: Record<string, string> = {
  created: 'bg-[var(--color-accent)]/10 text-[var(--color-accent)]',
  stage_completed: 'bg-[var(--color-success)]/10 text-[var(--color-success)]',
  hold_started: 'bg-[var(--color-danger)]/10 text-[var(--color-danger)]',
  hold_ended: 'bg-[var(--color-success)]/10 text-[var(--color-success)]',
  remark_added: 'bg-[var(--color-bg-elevated)] text-[var(--color-text-secondary)]',
  wastage_recorded: 'bg-[var(--color-warning)]/10 text-[var(--color-warning)]',
  plate_assigned: 'bg-[var(--color-info)]/10 text-[var(--color-info)]',
}

function daysUrgency(required_date: string | null, status: JobStatus) {
  if (!required_date || ['completed','dispatched','cancelled'].includes(status)) return null
  const days = Math.ceil((new Date(required_date).getTime() - Date.now()) / 86400000)
  if (days < 0) return { text: `${Math.abs(days)} days overdue`, cls: 'text-[var(--color-danger)] bg-[var(--color-danger)]/10 border-[var(--color-danger)]/20' }
  if (days === 0) return { text: 'Due today', cls: 'text-[var(--color-danger)] bg-[var(--color-danger)]/10 border-[var(--color-danger)]/20' }
  if (days <= 3) return { text: `${days} days left`, cls: 'text-[var(--color-warning)] bg-[var(--color-warning)]/10 border-[var(--color-warning)]/20' }
  return null
}

export default function JobDetailClient({ job: initialJob, stages: initialStages, events: initialEvents, delayReasons, wastageReasons, machines, wastageEntries: initialWastage, companyId, artworks }: Props) {
  const router = useRouter()
  const [job, setJob] = useState(initialJob)
  const [stages, setStages] = useState(initialStages)
  const [events, setEvents] = useState(initialEvents)
  const [wastage, setWastage] = useState(initialWastage)
  const [activeTab, setActiveTab] = useState<Tab>('overview')
  const [loading, setLoading] = useState(false)

  // Hold modal
  const [holdModal, setHoldModal] = useState(false)
  const [holdForm, setHoldForm] = useState({ hold_reason_id: '', hold_notes: '' })

  // Resume modal
  const [resumeModal, setResumeModal] = useState(false)
  const [resumeNotes, setResumeNotes] = useState('')

  // Repeat modal
  const [repeatModal, setRepeatModal] = useState(false)
  const [repeatForm, setRepeatForm] = useState({ quantity: String(job.quantity), required_date: '', notes: '', same_artwork: true })

  const [deleteModal, setDeleteModal] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const deleteJob = async () => {
    setDeleting(true)
    try {
      const res = await fetch(`/api/v1/jobs/${job.id}`, { method: 'DELETE' })
      if (!res.ok) { const e = await res.json(); throw new Error(e.error) }
      toast.success('Job deleted')
      router.push('/dashboard/jobs')
    } catch (e: any) { toast.error(e.message || 'Failed to delete job'); setDeleting(false) }
  }

  // Edit/Delete are superadmin-only — the API enforces this either way, this
  // is just so other roles don't see a button that will 403 when clicked.
  const [isSuperadmin, setIsSuperadmin] = useState(false)
  useEffect(() => {
    (async () => {
      const supabase = createSupabaseClient()
      const { data: { session } } = await supabase.auth.getSession()
      const token = session?.access_token
      if (!token) return
      try {
        const payload = JSON.parse(atob(token.split('.')[1].replace(/-/g, '+').replace(/_/g, '/')))
        setIsSuperadmin(payload?.app_role === 'superadmin')
      } catch { /* leave false */ }
    })()
  }, [])

  // Remark
  const [remark, setRemark] = useState('')
  const [addingRemark, setAddingRemark] = useState(false)

  // Wastage modal
  const [wastageModal, setWastageModal] = useState(false)
  const [wastageForm, setWastageForm] = useState({ wastage_reason_id: '', machine_id: '', quantity: '', notes: '' })
  const [recordingWastage, setRecordingWastage] = useState(false)

  const statusCfg = JOB_STATUS_CONFIG[job.status] || JOB_STATUS_CONFIG.new
  const priorityCfg = JOB_PRIORITY_CONFIG[job.priority] || JOB_PRIORITY_CONFIG.normal
  const urgency = daysUrgency(job.required_date, job.status)

  // ─── Actions ────────────────────────────────────────────────────────────────
  const holdJob = async () => {
    if (!holdForm.hold_reason_id) { toast.error('Please select a delay reason'); return }
    setLoading(true)
    try {
      const res = await fetch(`/api/v1/jobs/${job.id}/hold`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(holdForm),
      })
      if (!res.ok) { const e = await res.json(); throw new Error(e.error) }
      const { data } = await res.json()
      setJob(data)
      setHoldModal(false)
      toast.success('Job put on hold')
      router.refresh()
    } catch (e: any) { toast.error(e.message || 'Failed') }
    finally { setLoading(false) }
  }

  const resumeJob = async () => {
    setLoading(true)
    try {
      const res = await fetch(`/api/v1/jobs/${job.id}/resume`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ notes: resumeNotes }),
      })
      if (!res.ok) throw new Error()
      const { data } = await res.json()
      setJob(data)
      setResumeModal(false)
      toast.success('Job resumed')
      router.refresh()
    } catch { toast.error('Failed to resume') }
    finally { setLoading(false) }
  }

  const createRepeat = async () => {
    setLoading(true)
    try {
      const res = await fetch(`/api/v1/jobs/${job.id}/repeat`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(repeatForm),
      })
      if (!res.ok) { const e = await res.json(); throw new Error(e.error) }
      const { data } = await res.json()
      setRepeatModal(false)
      toast.success(`Repeat job ${data.job_number} created!`)
      router.push(`/dashboard/jobs/${data.id}`)
    } catch (e: any) { toast.error(e.message || 'Failed') }
    finally { setLoading(false) }
  }

  const advanceStage = async (stageId: string, action: 'start' | 'complete' | 'skip', notes?: string) => {
    setLoading(true)
    try {
      const res = await fetch(`/api/v1/jobs/${job.id}/workflow`, {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ stage_progress_id: stageId, action, notes }),
      })
      if (!res.ok) { const e = await res.json(); throw new Error(e.error) }
      const { data } = await res.json()
      setStages(prev => prev.map(s => s.id === data.id ? { ...s, ...data } : s))
      toast.success(action === 'start' ? 'Stage started' : action === 'complete' ? 'Stage completed' : 'Stage skipped')
    } catch (e: any) { toast.error(e.message || 'Failed') }
    finally { setLoading(false) }
  }

  const addRemark = async () => {
    if (!remark.trim()) return
    setAddingRemark(true)
    try {
      const res = await fetch(`/api/v1/jobs/${job.id}/events`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ notes: remark }),
      })
      if (!res.ok) throw new Error()
      const newEvent = {
        id: Date.now().toString(), job_id: job.id, event_type: 'remark_added' as const,
        old_value: null, new_value: null, notes: remark,
        actor_id: null, occurred_at: new Date().toISOString(),
      }
      setEvents(prev => [newEvent, ...prev])
      setRemark('')
      toast.success('Remark added')
    } catch { toast.error('Failed') }
    finally { setAddingRemark(false) }
  }

  const recordWastage = async () => {
    if (!wastageForm.wastage_reason_id) { toast.error('Please select a reason'); return }
    if (!wastageForm.quantity || parseFloat(wastageForm.quantity) <= 0) { toast.error('Quantity must be greater than 0'); return }
    setRecordingWastage(true)
    try {
      const res = await fetch(`/api/v1/jobs/${job.id}/wastage`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(wastageForm),
      })
      if (!res.ok) { const e = await res.json(); throw new Error(e.error) }
      const { data } = await res.json()
      setWastage(prev => [data, ...prev])
      setWastageModal(false)
      setWastageForm({ wastage_reason_id: '', machine_id: '', quantity: '', notes: '' })
      toast.success('Wastage recorded')
      router.refresh()
    } catch (e: any) { toast.error(e.message || 'Failed to record wastage') }
    finally { setRecordingWastage(false) }
  }

  const totalWastage = wastage.reduce((sum, w) => sum + Number(w.quantity), 0)

  const completedStages = stages.filter(s => s.status === 'completed').length
  const totalStages = stages.length
  const progressPct = totalStages > 0 ? Math.round((completedStages / totalStages) * 100) : 0

  const inputCls = 'w-full h-9 px-3 rounded-md border text-sm bg-[var(--color-bg-elevated)] text-[var(--color-text-primary)] border-[var(--color-border)] focus:outline-none focus:border-[var(--color-accent)] focus:ring-1 focus:ring-[var(--color-accent)] transition-colors'

  return (
    <div className="max-w-6xl space-y-5">
      {/* ─── Header ─────────────────────────────────────────────────────────── */}
      <div className="flex items-start justify-between gap-4">
        <div className="flex items-start gap-3">
          <Link href="/dashboard/jobs" className="w-8 h-8 flex items-center justify-center rounded-md border border-[var(--color-border)] text-[var(--color-text-muted)] hover:bg-[var(--color-bg-elevated)] transition-colors mt-1">
            <ArrowLeft size={15} />
          </Link>
          <div>
            <div className="flex items-center gap-3 flex-wrap">
              <h1 className="text-2xl font-bold text-[var(--color-text-primary)] font-mono">{job.job_number}</h1>
              <span className={cn('inline-flex items-center gap-1.5 text-xs px-2.5 py-1 rounded-full border font-medium', statusCfg.color)}>
                <span className={cn('w-1.5 h-1.5 rounded-full', statusCfg.dot)} />
                {statusCfg.label}
              </span>
              {job.is_on_hold && (
                <span className="text-xs px-2.5 py-1 rounded-full border font-medium text-[var(--color-danger)] bg-[var(--color-danger)]/10 border-[var(--color-danger)]/20 flex items-center gap-1.5">
                  <PauseCircle size={11} /> On Hold
                </span>
              )}
              {job.is_repeat && (
                <span className="text-xs px-2.5 py-1 rounded-full border font-medium text-[var(--color-info)] bg-[var(--color-info)]/10 border-[var(--color-info)]/20 flex items-center gap-1.5">
                  <RefreshCw size={11} /> Repeat #{job.repeat_sequence}
                </span>
              )}
              {urgency && (
                <span className={cn('text-xs px-2.5 py-1 rounded-full border font-medium flex items-center gap-1.5', urgency.cls)}>
                  <AlertTriangle size={11} /> {urgency.text}
                </span>
              )}
            </div>
            <p className="text-base text-[var(--color-text-secondary)] mt-1">{job.job_title}</p>
            <p className="text-sm text-[var(--color-text-muted)]">{(job as any).customers?.name}</p>
          </div>
        </div>

        {/* Action buttons */}
        <div className="flex items-center gap-2 flex-shrink-0 flex-wrap justify-end">
          <Link href={`/print/jobs/${job.id}/card`} target="_blank"
            className="flex items-center gap-1.5 px-3 h-8 rounded-md border border-[var(--color-border)] text-sm text-[var(--color-text-secondary)] hover:bg-[var(--color-bg-elevated)] transition-colors">
            <Printer size={14} /> Print Card
          </Link>
          <Link href={`/dashboard/jobs/${job.id}/edit`}
            className={cn('items-center gap-1.5 px-3 h-8 rounded-md border border-[var(--color-border)] text-sm text-[var(--color-text-secondary)] hover:bg-[var(--color-bg-elevated)] transition-colors', isSuperadmin ? 'flex' : 'hidden')}>
            <Pencil size={14} /> Edit
          </Link>
          <button onClick={() => setRepeatModal(true)}
            className="flex items-center gap-1.5 px-3 h-8 rounded-md border border-[var(--color-border)] text-sm text-[var(--color-text-secondary)] hover:bg-[var(--color-bg-elevated)] transition-colors">
            <RefreshCw size={14} /> Repeat Job
          </button>
          {isSuperadmin && (
            <button onClick={() => setDeleteModal(true)}
              className="flex items-center gap-1.5 px-3 h-8 rounded-md border border-[var(--color-danger)]/40 text-sm text-[var(--color-danger)] hover:bg-[var(--color-danger)]/10 transition-colors">
              <Trash2 size={14} /> Delete
            </button>
          )}
          {job.is_on_hold ? (
            <button onClick={() => setResumeModal(true)}
              className="flex items-center gap-1.5 px-3 h-8 rounded-md bg-[var(--color-success)] text-white text-sm font-medium hover:opacity-90 transition-colors">
              <PlayCircle size={14} /> Resume
            </button>
          ) : !['completed','dispatched','cancelled'].includes(job.status) && (
            <button onClick={() => setHoldModal(true)}
              className="flex items-center gap-1.5 px-3 h-8 rounded-md bg-[var(--color-danger)] text-white text-sm font-medium hover:opacity-90 transition-colors">
              <PauseCircle size={14} /> Hold
            </button>
          )}
        </div>
      </div>

      {/* ─── Progress bar ────────────────────────────────────────────────────── */}
      {totalStages > 0 && (
        <div className="rounded-xl border border-[var(--color-border)] bg-[var(--color-bg-secondary)] px-5 py-4">
          <div className="flex items-center justify-between mb-2">
            <span className="text-sm font-medium text-[var(--color-text-primary)]">Workflow Progress</span>
            <span className="text-sm font-semibold text-[var(--color-accent)]">{progressPct}% — {completedStages}/{totalStages} stages</span>
          </div>
          <div className="h-2 bg-[var(--color-bg-elevated)] rounded-full overflow-hidden">
            <div className="h-full bg-[var(--color-accent)] rounded-full transition-all duration-500" style={{ width: `${progressPct}%` }} />
          </div>
          {/* Stage pills */}
          <div className="flex items-center gap-1.5 mt-3 flex-wrap">
            {stages.map(s => {
              const stageName = (s as any).workflow_stages?.name || 'Stage'
              const isOptional = (s as any).workflow_stages?.is_optional
              return (
                <span key={s.id} className={cn('text-xs px-2 py-0.5 rounded-full border font-medium flex items-center gap-1',
                  s.status === 'completed'   ? 'bg-[var(--color-success)]/10 text-[var(--color-success)] border-[var(--color-success)]/20' :
                  s.status === 'in_progress' ? 'bg-[var(--color-warning)]/10 text-[var(--color-warning)] border-[var(--color-warning)]/20' :
                  s.status === 'skipped'     ? 'bg-[var(--color-bg-elevated)] text-[var(--color-text-muted)] border-[var(--color-border)] line-through' :
                                               'bg-[var(--color-bg-elevated)] text-[var(--color-text-muted)] border-[var(--color-border)]'
                )}>
                  {s.status === 'completed' && <CheckCircle2 size={9} />}
                  {stageName}{isOptional ? '*' : ''}
                </span>
              )
            })}
          </div>
        </div>
      )}

      {/* ─── Tabs ────────────────────────────────────────────────────────────── */}
      <div className="flex items-center gap-1 border-b border-[var(--color-border)]">
        {([
          { key: 'overview', label: 'Overview', icon: FileText },
          { key: 'workflow', label: 'Workflow', icon: Layers },
          { key: 'artwork',  label: 'Artwork',  icon: Package },
          { key: 'timeline', label: 'Timeline', icon: Activity },
          { key: 'remarks',  label: 'Remarks',  icon: MessageSquare },
          { key: 'wastage',  label: 'Wastage',  icon: AlertTriangle },
        ] as const).map(tab => {
          const Icon = tab.icon
          return (
            <button key={tab.key} onClick={() => setActiveTab(tab.key)}
              className={cn('flex items-center gap-1.5 px-4 py-2.5 text-sm font-medium border-b-2 -mb-px transition-colors',
                activeTab === tab.key
                  ? 'border-b-[var(--color-accent)] text-[var(--color-accent)]'
                  : 'border-b-transparent text-[var(--color-text-secondary)] hover:text-[var(--color-text-primary)]')}>
              <Icon size={14} />{tab.label}
              {tab.key === 'artwork' && artworks.length > 0 && (
                <span className="ml-1 text-xs bg-[var(--color-bg-elevated)] border border-[var(--color-border)] px-1.5 py-0.5 rounded-full">{artworks.length}</span>
              )}
              {tab.key === 'timeline' && events.length > 0 && (
                <span className="ml-1 text-xs bg-[var(--color-bg-elevated)] border border-[var(--color-border)] px-1.5 py-0.5 rounded-full">{events.length}</span>
              )}
              {tab.key === 'wastage' && wastage.length > 0 && (
                <span className="ml-1 text-xs bg-[var(--color-bg-elevated)] border border-[var(--color-border)] px-1.5 py-0.5 rounded-full">{wastage.length}</span>
              )}
            </button>
          )
        })}
      </div>

      {/* ─── Tab: Overview ───────────────────────────────────────────────────── */}
      {activeTab === 'overview' && (
        <div className="grid grid-cols-3 gap-5">
          {/* Job specs */}
          <div className="col-span-2 rounded-xl border border-[var(--color-border)] bg-[var(--color-bg-secondary)] overflow-hidden">
            <div className="px-5 py-3.5 border-b border-[var(--color-border)] bg-[var(--color-bg-elevated)]">
              <h2 className="text-sm font-semibold text-[var(--color-text-primary)]">Product Specifications</h2>
            </div>
            <div className="p-5 grid grid-cols-3 gap-x-6 gap-y-4">
              {[
                { label: 'Size (L×W×H)', value: [job.size_l, job.size_w, job.size_h].filter(Boolean).join(' × ') + (job.size_l ? ' mm' : '') || '—' },
                { label: 'Sheet Size', value: job.sheet_size || '—' },
                { label: 'Grain Direction', value: job.grain_direction === 'long_grain' ? 'Long Grain' : job.grain_direction === 'short_grain' ? 'Short Grain' : '—' },
                { label: 'Ups', value: job.ups || '—' },
                { label: 'Sheet Qty', value: job.sheet_qty?.toLocaleString() || '—' },
                { label: 'Quantity', value: job.quantity.toLocaleString() },
                { label: 'No. of Colors', value: job.no_of_colors || '—' },
                { label: 'Die Number', value: job.die_number || '—' },
                { label: 'Priority', value: <span className={cn('font-semibold', priorityCfg.color)}>{priorityCfg.label}</span> },
                { label: 'Board Type', value: (job as any).board_types?.name || '—' },
                { label: 'Lamination', value: (job as any).lamination_types?.name || '—' },
                { label: 'UV Coating', value: job.uv_coating || '—' },
                { label: 'Hot Foil', value: (job as any).foil_types?.name || '—' },
                { label: 'Pasting', value: job.pasting || '—' },
                { label: 'Special Finishing', value: job.special_finishing || '—' },
              ].map(f => (
                <div key={f.label}>
                  <p className="text-xs text-[var(--color-text-muted)] mb-0.5">{f.label}</p>
                  <p className="text-sm text-[var(--color-text-primary)]">{f.value}</p>
                </div>
              ))}
            </div>
          </div>

          {/* Right sidebar */}
          <div className="space-y-4">
            {/* Dates */}
            <div className="rounded-xl border border-[var(--color-border)] bg-[var(--color-bg-secondary)] p-4 space-y-3">
              {[
                { icon: Calendar, label: 'Order Date', value: formatDate(job.order_date) },
                { icon: Clock, label: 'Required Date', value: job.required_date ? formatDate(job.required_date) : '—' },
                { icon: CheckCircle2, label: 'Completed', value: job.completed_date ? formatDate(job.completed_date) : '—' },
              ].map(f => (
                <div key={f.label} className="flex items-center gap-3">
                  <f.icon size={14} className="text-[var(--color-text-muted)] flex-shrink-0" />
                  <div>
                    <p className="text-xs text-[var(--color-text-muted)]">{f.label}</p>
                    <p className="text-sm text-[var(--color-text-primary)]">{f.value}</p>
                  </div>
                </div>
              ))}
            </div>

            {/* Customer */}
            <div className="rounded-xl border border-[var(--color-border)] bg-[var(--color-bg-secondary)] p-4">
              <p className="text-xs text-[var(--color-text-muted)] mb-2">Customer</p>
              <p className="text-sm font-semibold text-[var(--color-text-primary)]">{(job as any).customers?.name}</p>
              <p className="text-xs text-[var(--color-text-muted)] mt-0.5">{(job as any).customers?.customer_code}</p>
              {(job as any).customers?.phone && <p className="text-xs text-[var(--color-text-muted)] mt-0.5">{(job as any).customers.phone}</p>}
            </div>

            {/* Financial */}
            {job.quoted_amount && (
              <div className="rounded-xl border border-[var(--color-border)] bg-[var(--color-bg-secondary)] p-4">
                <p className="text-xs text-[var(--color-text-muted)] mb-1">Quoted Amount</p>
                <p className="text-lg font-bold text-[var(--color-text-primary)]">PKR {job.quoted_amount.toLocaleString()}</p>
              </div>
            )}

            {/* Hold info */}
            {job.is_on_hold && (
              <div className="rounded-xl border border-[var(--color-danger)]/30 bg-[var(--color-danger)]/5 p-4">
                <p className="text-xs font-semibold text-[var(--color-danger)] mb-1 flex items-center gap-1.5"><PauseCircle size={12} /> On Hold Since</p>
                <p className="text-xs text-[var(--color-text-secondary)]">{job.hold_started_at ? formatDateTime(job.hold_started_at) : '—'}</p>
                {job.hold_notes && <p className="text-xs text-[var(--color-text-muted)] mt-1 italic">{job.hold_notes}</p>}
              </div>
            )}

            {/* Parent job link */}
            {job.parent_job_id && (
              <Link href={`/dashboard/jobs/${job.parent_job_id}`}
                className="flex items-center justify-between rounded-xl border border-[var(--color-border)] bg-[var(--color-bg-secondary)] p-4 hover:bg-[var(--color-bg-elevated)] transition-colors">
                <div>
                  <p className="text-xs text-[var(--color-text-muted)]">Original Job</p>
                  <p className="text-sm font-medium text-[var(--color-accent)]">View original →</p>
                </div>
                <ChevronRight size={15} className="text-[var(--color-text-muted)]" />
              </Link>
            )}
          </div>
        </div>
      )}

      {/* ─── Tab: Workflow ───────────────────────────────────────────────────── */}
      {activeTab === 'workflow' && (
        <div className="rounded-xl border border-[var(--color-border)] bg-[var(--color-bg-secondary)] overflow-hidden">
          {stages.length === 0 ? (
            <div className="p-12 text-center">
              <Layers size={28} className="text-[var(--color-text-muted)] opacity-30 mx-auto mb-2" />
              <p className="text-sm text-[var(--color-text-muted)]">No workflow assigned to this job.</p>
            </div>
          ) : (
            <div className="divide-y divide-[var(--color-border-subtle)]">
              {stages.map((stage, idx) => {
                const stageName = (stage as any).workflow_stages?.name || 'Stage'
                const estimated = (stage as any).workflow_stages?.estimated_hours
                const isOptional = (stage as any).workflow_stages?.is_optional
                const isCurrent = stage.status === 'in_progress'
                const isPending = stage.status === 'pending'
                const isDone = stage.status === 'completed'
                const isSkipped = stage.status === 'skipped'

                return (
                  <div key={stage.id} className={cn('flex items-center gap-4 px-5 py-4',
                    isCurrent && 'bg-[var(--color-warning)]/5 border-l-2 border-l-[var(--color-warning)]',
                    idx % 2 === 1 && !isCurrent && 'bg-[var(--color-bg-elevated)]/20')}>
                    {/* Step number */}
                    <div className={cn('w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold flex-shrink-0 border',
                      isDone    ? 'bg-[var(--color-success)] text-white border-[var(--color-success)]' :
                      isCurrent ? 'bg-[var(--color-warning)] text-white border-[var(--color-warning)]' :
                      isSkipped ? 'bg-[var(--color-bg-elevated)] text-[var(--color-text-muted)] border-[var(--color-border)] opacity-50' :
                                  'bg-[var(--color-bg-elevated)] text-[var(--color-text-muted)] border-[var(--color-border)]')}>
                      {isDone ? <CheckCircle2 size={14} /> : idx + 1}
                    </div>

                    {/* Stage info */}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <span className={cn('text-sm font-medium', isSkipped ? 'line-through text-[var(--color-text-muted)]' : 'text-[var(--color-text-primary)]')}>{stageName}</span>
                        {isOptional && <span className="text-xs text-[var(--color-text-muted)] bg-[var(--color-bg-elevated)] border border-[var(--color-border)] px-1.5 py-0.5 rounded">Optional</span>}
                        {estimated && <span className="text-xs text-[var(--color-text-muted)] flex items-center gap-1"><Clock size={10} /> {estimated}h est.</span>}
                      </div>
                      {stage.started_at && <p className="text-xs text-[var(--color-text-muted)] mt-0.5">Started {formatTimeAgo(stage.started_at)}</p>}
                      {stage.completed_at && <p className="text-xs text-[var(--color-success)] mt-0.5">Completed {formatTimeAgo(stage.completed_at)}</p>}
                      {stage.notes && <p className="text-xs text-[var(--color-text-muted)] mt-0.5 italic">{stage.notes}</p>}
                    </div>

                    {/* Stage actions */}
                    <div className="flex items-center gap-1.5 flex-shrink-0">
                      {isPending && (
                        <>
                          <button onClick={() => advanceStage(stage.id, 'start')} disabled={loading || job.is_on_hold}
                            className="flex items-center gap-1 px-3 h-7 rounded-md bg-[var(--color-warning)] text-white text-xs font-medium hover:opacity-90 disabled:opacity-40 transition-colors">
                            <PlayCircle size={11} /> Start
                          </button>
                          {isOptional && (
                            <button onClick={() => advanceStage(stage.id, 'skip')} disabled={loading}
                              className="flex items-center gap-1 px-2.5 h-7 rounded-md border border-[var(--color-border)] text-xs text-[var(--color-text-muted)] hover:bg-[var(--color-bg-elevated)] transition-colors">
                              <SkipForward size={11} /> Skip
                            </button>
                          )}
                        </>
                      )}
                      {isCurrent && (
                        <button onClick={() => advanceStage(stage.id, 'complete')} disabled={loading}
                          className="flex items-center gap-1 px-3 h-7 rounded-md bg-[var(--color-success)] text-white text-xs font-medium hover:opacity-90 disabled:opacity-40 transition-colors">
                          <CheckCircle2 size={11} /> Complete
                        </button>
                      )}
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </div>
      )}

      {/* ─── Tab: Artwork ────────────────────────────────────────────────────── */}
      {activeTab === 'artwork' && (
        <JobArtworkTab jobId={job.id} companyId={companyId} initialArtworks={artworks as any[]} />
      )}

      {/* ─── Tab: Timeline ───────────────────────────────────────────────────── */}
      {activeTab === 'timeline' && (
        <div className="space-y-3">
          {/* Group by date */}
          {events.length === 0 ? (
            <div className="rounded-xl border border-[var(--color-border)] bg-[var(--color-bg-secondary)] p-12 text-center">
              <Activity size={28} className="text-[var(--color-text-muted)] opacity-30 mx-auto mb-2" />
              <p className="text-sm text-[var(--color-text-muted)]">No events yet.</p>
            </div>
          ) : (
            <div className="rounded-xl border border-[var(--color-border)] bg-[var(--color-bg-secondary)] overflow-hidden">
              <div className="divide-y divide-[var(--color-border-subtle)]">
                {events.map(event => (
                  <div key={event.id} className="flex items-start gap-4 px-5 py-3.5 hover:bg-[var(--color-bg-elevated)]/30">
                    <div className={cn('flex-shrink-0 mt-0.5 text-xs px-2 py-0.5 rounded-full font-medium', EVENT_COLORS[event.event_type] || 'bg-[var(--color-bg-elevated)] text-[var(--color-text-muted)]')}>
                      {EVENT_LABELS[event.event_type] || event.event_type}
                    </div>
                    <div className="flex-1 min-w-0">
                      {(event.old_value || event.new_value) && (
                        <p className="text-xs text-[var(--color-text-secondary)]">
                          {event.old_value && <><span className="line-through">{event.old_value}</span> → </>}
                          {event.new_value && <span className="font-medium">{event.new_value}</span>}
                        </p>
                      )}
                      {event.notes && <p className="text-sm text-[var(--color-text-primary)] mt-0.5">{event.notes}</p>}
                    </div>
                    <div className="flex-shrink-0 text-right">
                      <p className="text-xs text-[var(--color-text-muted)]">{formatTimeAgo(event.occurred_at)}</p>
                      {(event as any).users?.full_name && <p className="text-xs text-[var(--color-text-muted)]">{(event as any).users.full_name}</p>}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {/* ─── Tab: Remarks ────────────────────────────────────────────────────── */}
      {activeTab === 'remarks' && (
        <div className="space-y-4">
          {/* Add remark */}
          <div className="rounded-xl border border-[var(--color-border)] bg-[var(--color-bg-secondary)] p-4">
            <div className="flex gap-3">
              <input value={remark} onChange={e => setRemark(e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); addRemark() } }}
                placeholder="Add a remark… (Enter to submit)"
                className={inputCls} />
              <button onClick={addRemark} disabled={addingRemark || !remark.trim()}
                className="flex items-center gap-1.5 px-4 h-9 rounded-md bg-[var(--color-accent)] text-white text-sm font-medium hover:bg-[var(--color-accent-hover)] disabled:opacity-50 transition-colors flex-shrink-0">
                <MessageSquare size={14} /> Add
              </button>
            </div>
          </div>

          {/* Remarks history */}
          <div className="rounded-xl border border-[var(--color-border)] bg-[var(--color-bg-secondary)] overflow-hidden">
            {events.filter(e => e.event_type === 'remark_added').length === 0 ? (
              <div className="p-10 text-center text-sm text-[var(--color-text-muted)]">No remarks yet.</div>
            ) : (
              <div className="divide-y divide-[var(--color-border-subtle)]">
                {events.filter(e => e.event_type === 'remark_added').map(event => (
                  <div key={event.id} className="flex items-start gap-3 px-5 py-3.5">
                    <div className="w-7 h-7 rounded-full bg-[var(--color-accent)]/10 border border-[var(--color-accent)]/20 flex items-center justify-center flex-shrink-0 mt-0.5">
                      <User size={12} className="text-[var(--color-accent)]" />
                    </div>
                    <div className="flex-1">
                      <p className="text-sm text-[var(--color-text-primary)]">{event.notes}</p>
                      <p className="text-xs text-[var(--color-text-muted)] mt-0.5">{formatDateTime(event.occurred_at)}</p>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {/* ─── Tab: Wastage ────────────────────────────────────────────────────── */}
      {activeTab === 'wastage' && (
        <div className="space-y-4">
          <div className="flex items-center justify-between rounded-xl border border-[var(--color-border)] bg-[var(--color-bg-secondary)] p-4">
            <div>
              <p className="text-xs text-[var(--color-text-muted)]">Total Wastage Recorded</p>
              <p className="text-xl font-bold text-[var(--color-text-primary)] mt-0.5">{totalWastage.toLocaleString()}</p>
            </div>
            <button onClick={() => setWastageModal(true)}
              className="flex items-center gap-1.5 px-4 h-9 rounded-md bg-[var(--color-accent)] text-white text-sm font-medium hover:bg-[var(--color-accent-hover)] transition-colors">
              <AlertTriangle size={14} /> Record Wastage
            </button>
          </div>

          <div className="rounded-xl border border-[var(--color-border)] bg-[var(--color-bg-secondary)] overflow-hidden">
            {wastage.length === 0 ? (
              <div className="p-10 text-center text-sm text-[var(--color-text-muted)]">No wastage recorded for this job.</div>
            ) : (
              <div className="divide-y divide-[var(--color-border-subtle)]">
                {wastage.map(w => (
                  <div key={w.id} className="flex items-start gap-4 px-5 py-3.5">
                    <div className="flex-shrink-0 mt-0.5 text-xs px-2 py-0.5 rounded-full font-medium bg-[var(--color-warning)]/10 text-[var(--color-warning)]">
                      {w.quantity.toLocaleString()}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-[var(--color-text-primary)]">{w.wastage_reasons?.name || 'Unknown reason'}</p>
                      {w.machines?.name && <p className="text-xs text-[var(--color-text-secondary)] mt-0.5">Machine: {w.machines.name}</p>}
                      {w.notes && <p className="text-sm text-[var(--color-text-secondary)] mt-0.5">{w.notes}</p>}
                    </div>
                    <div className="flex-shrink-0 text-right">
                      <p className="text-xs text-[var(--color-text-muted)]">{formatDateTime(w.occurred_at)}</p>
                      {w.users?.full_name && <p className="text-xs text-[var(--color-text-muted)]">{w.users.full_name}</p>}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {/* ─── HOLD MODAL ──────────────────────────────────────────────────────── */}
      <Modal open={holdModal} onClose={() => setHoldModal(false)} title="Put Job On Hold" size="sm"
        footer={
          <>
            <button onClick={() => setHoldModal(false)} className="px-4 h-9 rounded-md border border-[var(--color-border)] text-sm text-[var(--color-text-secondary)] hover:bg-[var(--color-bg-elevated)] transition-colors">Cancel</button>
            <button onClick={holdJob} disabled={loading || !holdForm.hold_reason_id}
              className="px-4 h-9 rounded-md bg-[var(--color-danger)] text-white text-sm font-medium hover:opacity-90 disabled:opacity-50 transition-colors">
              {loading ? 'Holding…' : 'Put On Hold'}
            </button>
          </>
        }>
        <div className="space-y-4">
          <div className="space-y-1.5">
            <label className="text-sm font-medium text-[var(--color-text-primary)]">Delay Reason <span className="text-[var(--color-danger)]">*</span></label>
            <select className={inputCls} value={holdForm.hold_reason_id} onChange={e => setHoldForm(p => ({ ...p, hold_reason_id: e.target.value }))}>
              <option value="">Select reason…</option>
              {delayReasons.map(r => <option key={r.id} value={r.id}>{r.name}</option>)}
            </select>
          </div>
          <div className="space-y-1.5">
            <label className="text-sm font-medium text-[var(--color-text-primary)]">Notes (optional)</label>
            <input className={inputCls} value={holdForm.hold_notes} onChange={e => setHoldForm(p => ({ ...p, hold_notes: e.target.value }))} placeholder="Additional details…" />
          </div>
        </div>
      </Modal>

      {/* ─── RESUME MODAL ────────────────────────────────────────────────────── */}
      <Modal open={resumeModal} onClose={() => setResumeModal(false)} title="Resume Job" size="sm"
        footer={
          <>
            <button onClick={() => setResumeModal(false)} className="px-4 h-9 rounded-md border border-[var(--color-border)] text-sm text-[var(--color-text-secondary)] hover:bg-[var(--color-bg-elevated)] transition-colors">Cancel</button>
            <button onClick={resumeJob} disabled={loading}
              className="px-4 h-9 rounded-md bg-[var(--color-success)] text-white text-sm font-medium hover:opacity-90 disabled:opacity-50 transition-colors">
              {loading ? 'Resuming…' : 'Resume Job'}
            </button>
          </>
        }>
        <div className="space-y-3">
          <p className="text-sm text-[var(--color-text-secondary)]">Job will return to In Progress status.</p>
          <div className="space-y-1.5">
            <label className="text-sm font-medium text-[var(--color-text-primary)]">Resume Notes (optional)</label>
            <input className={inputCls} value={resumeNotes} onChange={e => setResumeNotes(e.target.value)} placeholder="Why is this job resuming?" />
          </div>
        </div>
      </Modal>

      {/* ─── REPEAT MODAL ────────────────────────────────────────────────────── */}
      <Modal open={repeatModal} onClose={() => setRepeatModal(false)} title="Create Repeat Job" size="md"
        footer={
          <>
            <button onClick={() => setRepeatModal(false)} className="px-4 h-9 rounded-md border border-[var(--color-border)] text-sm text-[var(--color-text-secondary)] hover:bg-[var(--color-bg-elevated)] transition-colors">Cancel</button>
            <button onClick={createRepeat} disabled={loading}
              className="px-4 h-9 rounded-md bg-[var(--color-accent)] text-white text-sm font-medium hover:bg-[var(--color-accent-hover)] disabled:opacity-50 transition-colors">
              {loading ? 'Creating…' : 'Create Repeat Job'}
            </button>
          </>
        }>
        <div className="space-y-4">
          <div className="rounded-lg bg-[var(--color-bg-elevated)] border border-[var(--color-border)] p-3 text-sm text-[var(--color-text-secondary)]">
            All product specifications will be copied from <span className="font-semibold text-[var(--color-accent)]">{job.job_number}</span>. You can change quantity and due date.
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <label className="text-sm font-medium text-[var(--color-text-primary)]">Quantity</label>
              <input type="number" className={inputCls} value={repeatForm.quantity} onChange={e => setRepeatForm(p => ({ ...p, quantity: e.target.value }))} />
            </div>
            <div className="space-y-1.5">
              <label className="text-sm font-medium text-[var(--color-text-primary)]">Required Date</label>
              <input type="date" className={inputCls} value={repeatForm.required_date} onChange={e => setRepeatForm(p => ({ ...p, required_date: e.target.value }))} />
            </div>
          </div>
          <div className="space-y-1.5">
            <label className="text-sm font-medium text-[var(--color-text-primary)]">Notes</label>
            <input className={inputCls} value={repeatForm.notes} onChange={e => setRepeatForm(p => ({ ...p, notes: e.target.value }))} placeholder="Optional notes for this repeat" />
          </div>
          <label className="flex items-center gap-2 cursor-pointer">
            <input type="checkbox" checked={repeatForm.same_artwork} onChange={e => setRepeatForm(p => ({ ...p, same_artwork: e.target.checked }))} className="w-4 h-4" />
            <span className="text-sm text-[var(--color-text-primary)]">Link artwork from original job (same artwork, no new artwork needed)</span>
          </label>
        </div>
      </Modal>

      {/* ─── WASTAGE MODAL ───────────────────────────────────────────────────── */}
      <Modal open={wastageModal} onClose={() => setWastageModal(false)} title="Record Wastage" size="sm"
        footer={
          <>
            <button onClick={() => setWastageModal(false)} className="px-4 h-9 rounded-md border border-[var(--color-border)] text-sm text-[var(--color-text-secondary)] hover:bg-[var(--color-bg-elevated)] transition-colors">Cancel</button>
            <button onClick={recordWastage} disabled={recordingWastage || !wastageForm.wastage_reason_id || !wastageForm.quantity}
              className="px-4 h-9 rounded-md bg-[var(--color-accent)] text-white text-sm font-medium hover:bg-[var(--color-accent-hover)] disabled:opacity-50 transition-colors">
              {recordingWastage ? 'Saving…' : 'Record Wastage'}
            </button>
          </>
        }>
        <div className="space-y-4">
          <div className="space-y-1.5">
            <label className="text-sm font-medium text-[var(--color-text-primary)]">Reason <span className="text-[var(--color-danger)]">*</span></label>
            <select className={inputCls} value={wastageForm.wastage_reason_id} onChange={e => setWastageForm(p => ({ ...p, wastage_reason_id: e.target.value }))}>
              <option value="">Select reason…</option>
              {wastageReasons.map(r => <option key={r.id} value={r.id}>{r.name}</option>)}
            </select>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <label className="text-sm font-medium text-[var(--color-text-primary)]">Quantity Wasted <span className="text-[var(--color-danger)]">*</span></label>
              <input type="number" className={inputCls} value={wastageForm.quantity} onChange={e => setWastageForm(p => ({ ...p, quantity: e.target.value }))} placeholder="0" />
            </div>
            <div className="space-y-1.5">
              <label className="text-sm font-medium text-[var(--color-text-primary)]">Machine (optional)</label>
              <select className={inputCls} value={wastageForm.machine_id} onChange={e => setWastageForm(p => ({ ...p, machine_id: e.target.value }))}>
                <option value="">Not specified</option>
                {machines.map(m => <option key={m.id} value={m.id}>{m.name}</option>)}
              </select>
            </div>
          </div>
          <div className="space-y-1.5">
            <label className="text-sm font-medium text-[var(--color-text-primary)]">Notes (optional)</label>
            <input className={inputCls} value={wastageForm.notes} onChange={e => setWastageForm(p => ({ ...p, notes: e.target.value }))} placeholder="Additional details…" />
          </div>
        </div>
      </Modal>

      <ConfirmDialog
        open={deleteModal}
        onClose={() => setDeleteModal(false)}
        onConfirm={deleteJob}
        title="Delete Job"
        message={`Permanently delete job ${job.job_number} — "${job.job_title}"? This removes it from the database completely and cannot be undone.`}
        confirmLabel="Delete Permanently"
        confirmVariant="danger"
        loading={deleting}
      />
    </div>
  )
}
