'use client'
import { useState, useRef, useEffect } from 'react'
import { Calendar, Plus, AlertTriangle, CheckCircle2, Clock, Cpu, ChevronUp, ChevronDown, Pencil } from 'lucide-react'
import { cn } from '@/lib/utils/cn'
import { ScrollRow } from '@/components/ui/ScrollRow'
import { toast } from '@/components/ui/Toast'
import { Modal } from '@/components/ui/Modal'
import { formatDate } from '@/lib/utils/format'
import { JOB_PRIORITY_CONFIG } from '@/modules/jobs/types/job.types'
import Link from 'next/link'
import { ArtworkThumb, useJobThumbnails } from '@/components/artwork/ArtworkThumb'

interface Assignment {
  id: string; machine_id: string; estimated_hours: number | null
  machines?: { name: string; machine_type: string } | null
}
interface Plan {
  id: string; job_id: string; planned_date: string; status: string; notes: string | null
  // Running order within planned_date (migration 112). 0 only on a row nothing
  // has ever sequenced.
  day_order: number
  jobs?: { job_number: string; job_title: string; status: string; priority: string; customers?: { name: string } | null } | null
  job_machine_assignments?: Assignment[]
}
interface Machine { id: string; name: string; machine_type: string }
interface Job { id: string; job_number: string; job_title: string; priority: string; required_date: string | null; customers?: { name: string } | null }

const PLAN_STATUS_CONFIG = {
  scheduled:   { label: 'Scheduled',   color: 'text-[var(--color-accent)] bg-[color:color-mix(in_srgb,var(--color-accent)_10%,transparent)] border-[color:color-mix(in_srgb,var(--color-accent)_20%,transparent)]' },
  in_progress: { label: 'In Progress', color: 'text-[var(--color-warning)] bg-[color:color-mix(in_srgb,var(--color-warning)_10%,transparent)] border-[color:color-mix(in_srgb,var(--color-warning)_20%,transparent)]' },
  completed:   { label: 'Completed',   color: 'text-[var(--color-success)] bg-[color:color-mix(in_srgb,var(--color-success)_10%,transparent)] border-[color:color-mix(in_srgb,var(--color-success)_20%,transparent)]' },
  cancelled:   { label: 'Cancelled',   color: 'text-[var(--color-muted)] bg-[var(--color-bg-elevated)] border-[var(--color-border)]' },
}

const inputCls = 'w-full h-9 px-3 rounded-md border text-sm bg-[var(--color-bg-elevated)] text-[var(--color-text-primary)] border-[var(--color-border)] placeholder:text-[var(--color-text-muted)] focus:outline-none focus:border-[var(--color-accent)] focus:ring-1 focus:ring-[var(--color-accent)] transition-colors'

// Mirrors the server's canonical order: planned_date, day_order, id. The id
// tiebreaker matters here too — two plans can share a day_order between an
// optimistic update and the server's reply.
const sortPlans = (arr: Plan[]) => [...arr].sort((a, b) =>
  a.planned_date.localeCompare(b.planned_date) ||
  (a.day_order ?? 0) - (b.day_order ?? 0) ||
  a.id.localeCompare(b.id)
)

const iconBtnCls = 'flex items-center justify-center rounded border border-[var(--color-border)] text-[var(--color-text-muted)] h-11 w-11 md:h-7 md:w-7 hover:text-[var(--color-text-primary)] hover:bg-[var(--color-bg-elevated)] disabled:opacity-40 disabled:cursor-not-allowed disabled:hover:bg-transparent transition-colors flex-shrink-0'

export default function PlanningClient({ initialPlans, machines, unplannedJobs: initialUnplanned }: { initialPlans: Plan[]; machines: Machine[]; unplannedJobs: Job[] }) {
  const [plans, setPlans] = useState(initialPlans)
  // Local copy so a job drops out of Unplanned the moment it's scheduled,
  // instead of lingering until the next server render.
  const [unplannedJobs, setUnplannedJobs] = useState(initialUnplanned)
  const [planModal, setPlanModal] = useState(false)
  const [loading, setLoading] = useState(false)
  const [form, setForm] = useState({ job_id: '', planned_date: new Date().toISOString().slice(0, 10), notes: '' })
  const [selectedMachines, setSelectedMachines] = useState<{ machine_id: string; estimated_hours: string }[]>([])
  const [activeTab, setActiveTab] = useState<'schedule' | 'unplanned'>('schedule')
  // Both tabs show real jobs; one batched lookup covers whichever is active
  // (and both, since switching tabs doesn't unmount the other's data).
  const jobThumbs = useJobThumbnails([...plans.map(p => p.job_id), ...unplannedJobs.map(j => j.id)])
  const [scheduleView, setScheduleView] = useState<'timeline' | 'calendar'>('timeline')
  const [editPlan, setEditPlan] = useState<Plan | null>(null)
  const [editForm, setEditForm] = useState({ planned_date: '', notes: '' })
  const [editMachines, setEditMachines] = useState<{ id?: string; machine_id: string; estimated_hours: string }[]>([])
  const [savingEdit, setSavingEdit] = useState(false)
  // One reorder in flight at a time — two overlapping calls for the same day
  // would race and the loser's order would win.
  const [reordering, setReordering] = useState(false)

  // Group plans by date
  const grouped = plans.reduce((acc, p) => {
    const d = p.planned_date
    if (!acc[d]) acc[d] = []
    acc[d].push(p)
    return acc
  }, {} as Record<string, Plan[]>)

  const addMachineRow = () => setSelectedMachines(p => [...p, { machine_id: '', estimated_hours: '' }])
  const removeMachineRow = (idx: number) => setSelectedMachines(p => p.filter((_, i) => i !== idx))
  const setMachineField = (idx: number, key: string, val: string) =>
    setSelectedMachines(p => p.map((m, i) => i === idx ? { ...m, [key]: val } : m))

  // Same three for the edit modal. A row keeps its `id` through every change, so
  // the server updates the existing assignment (and its recorded hours) instead
  // of deleting and reinserting it.
  const addEditMachineRow = () => setEditMachines(p => [...p, { machine_id: '', estimated_hours: '' }])
  const removeEditMachineRow = (idx: number) => setEditMachines(p => p.filter((_, i) => i !== idx))
  const setEditMachineField = (idx: number, key: string, val: string) =>
    setEditMachines(p => p.map((m, i) => i === idx ? { ...m, [key]: val } : m))

  const createPlan = async () => {
    if (!form.job_id || !form.planned_date) { toast.error('Job and date required'); return }
    setLoading(true)
    try {
      const res = await fetch('/api/v1/planning', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...form,
          machines: selectedMachines.filter(m => m.machine_id),
        }),
      })
      if (!res.ok) { const e = await res.json(); throw new Error(e.error) }
      // `machines` here are the real inserted rows (with their real ids), not a
      // locally rebuilt list — the edit modal needs those ids.
      const { data, machines: created } = await res.json()
      const job = unplannedJobs.find(j => j.id === form.job_id)
      setPlans(prev => sortPlans([...prev, { ...data, jobs: job ? { job_number: job.job_number, job_title: job.job_title, status: 'new', priority: job.priority, customers: job.customers } : null, job_machine_assignments: (created ?? []) as Assignment[] }]))
      setUnplannedJobs(prev => prev.filter(j => j.id !== form.job_id))
      setPlanModal(false)
      setForm({ job_id: '', planned_date: new Date().toISOString().slice(0, 10), notes: '' })
      setSelectedMachines([])
      toast.success('Plan created')
    } catch (e: any) { toast.error(e.message || 'Failed') }
    finally { setLoading(false) }
  }

  // Move one plan up or down within its own day. The whole day's new order goes
  // to the server in a single call, so the result can't drift out of step with
  // what's on screen.
  const movePlan = async (plan: Plan, dir: -1 | 1) => {
    if (reordering) return
    const day = plans.filter(p => p.planned_date === plan.planned_date)
    const idx = day.findIndex(p => p.id === plan.id)
    const target = idx + dir
    if (idx < 0 || target < 0 || target >= day.length) return

    const next = [...day]
    ;[next[idx], next[target]] = [next[target], next[idx]]
    const orderedIds = next.map(p => p.id)
    const position = new Map(orderedIds.map((id, i) => [id, i + 1]))

    const before = plans
    setPlans(sortPlans(plans.map(p =>
      position.has(p.id) ? { ...p, day_order: position.get(p.id)! } : p
    )))
    setReordering(true)
    try {
      const res = await fetch('/api/v1/planning/reorder', {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ planned_date: plan.planned_date, ordered_ids: orderedIds }),
      })
      if (!res.ok) { const e = await res.json().catch(() => ({})); throw new Error(e.error || 'Reorder failed') }
    } catch (e: any) {
      setPlans(before)   // put the list back rather than leave a lie on screen
      toast.error(e.message || 'Could not save the new order')
    } finally { setReordering(false) }
  }

  const openEdit = (plan: Plan) => {
    setEditPlan(plan)
    setEditForm({ planned_date: plan.planned_date, notes: plan.notes ?? '' })
    setEditMachines((plan.job_machine_assignments ?? []).map(m => ({
      id: m.id,
      machine_id: m.machine_id,
      estimated_hours: m.estimated_hours != null ? String(m.estimated_hours) : '',
    })))
  }

  const saveEdit = async () => {
    if (!editPlan) return
    if (!editForm.planned_date) { toast.error('Date required'); return }
    setSavingEdit(true)
    const plan = editPlan
    try {
      const dateChanged  = editForm.planned_date !== plan.planned_date
      const notesChanged = (editForm.notes || '') !== (plan.notes ?? '')
      let patched: Partial<Plan> = {}

      if (dateChanged || notesChanged) {
        const res = await fetch(`/api/v1/planning/${plan.id}`, {
          method: 'PATCH', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ planned_date: editForm.planned_date, notes: editForm.notes }),
        })
        if (!res.ok) { const e = await res.json().catch(() => ({})); throw new Error(e.error || 'Could not save the plan') }
        // day_order comes back from the server — a moved plan is re-slotted to
        // the end of its new day there, not here.
        const { data } = await res.json()
        patched = { planned_date: data.planned_date, notes: data.notes, day_order: data.day_order }
      }

      // Machines go in their own call: it can legitimately be refused (work
      // already recorded) without losing the date change.
      const rows = editMachines.filter(m => m.machine_id)
      const machinesChanged =
        rows.length !== (plan.job_machine_assignments ?? []).length ||
        rows.some(r => {
          const was = (plan.job_machine_assignments ?? []).find(a => a.id === r.id)
          return !was || was.machine_id !== r.machine_id ||
            String(was.estimated_hours ?? '') !== r.estimated_hours
        })

      let assignments = plan.job_machine_assignments
      if (machinesChanged) {
        const res = await fetch(`/api/v1/planning/${plan.id}/machines`, {
          method: 'PUT', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ machines: rows.map(m => ({
            id: m.id,
            machine_id: m.machine_id,
            estimated_hours: m.estimated_hours || null,
          })) }),
        })
        if (!res.ok) { const e = await res.json().catch(() => ({})); throw new Error(e.error || 'Could not save the machines') }
        const { data } = await res.json()
        assignments = data as Assignment[]
      }

      setPlans(prev => sortPlans(prev.map(p =>
        p.id === plan.id ? { ...p, ...patched, job_machine_assignments: assignments } : p
      )))
      setEditPlan(null)
      toast.success('Plan updated')
    } catch (e: any) { toast.error(e.message || 'Failed') }
    finally { setSavingEdit(false) }
  }

  const updateStatus = async (planId: string, status: string) => {
    try {
      await fetch(`/api/v1/planning/${planId}`, {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status }),
      })
      setPlans(prev => prev.map(p => p.id === planId ? { ...p, status } : p))
      toast.success('Status updated')
    } catch { toast.error('Failed') }
  }

  return (
    <div className="space-y-4">
      {/* Tabs + Add button */}
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-2.5">
        <ScrollRow className="md:flex-1" wrap role="tablist" activeSelector="[data-tab-active='true']" activeKey={activeTab} contentClassName="gap-1 -mx-1 px-1">
          {([['schedule', 'Schedule'], ['unplanned', `Unplanned Jobs (${unplannedJobs.length})`]] as const).map(([key, label]) => (
            <button key={key} onClick={() => setActiveTab(key)} role="tab" aria-selected={activeTab === key} data-tab-active={activeTab === key}
              className={cn('px-4 h-11 md:h-8 rounded-md text-sm font-medium border transition-all flex-shrink-0 whitespace-nowrap',
                activeTab === key ? 'bg-[var(--color-accent)] text-[var(--color-on-accent)] border-transparent' : 'border-[var(--color-border)] text-[var(--color-text-secondary)] hover:text-[var(--color-text-primary)]')}>
              {label}
            </button>
          ))}
          {activeTab === 'schedule' && (
            <div className="flex items-center gap-1 ml-2 bg-[var(--color-bg-elevated)] border border-[var(--color-border)] rounded-md p-0.5 flex-shrink-0">
              {(['timeline', 'calendar'] as const).map(v => (
                <button key={v} onClick={() => setScheduleView(v)}
                  className={cn('px-3 h-9 md:h-6 rounded text-xs font-medium capitalize transition-colors', scheduleView === v ? 'bg-[var(--color-accent)] text-[var(--color-on-accent)]' : 'text-[var(--color-text-muted)]')}>
                  {v}
                </button>
              ))}
            </div>
          )}
        </ScrollRow>
        <button onClick={() => setPlanModal(true)}
          className="flex items-center justify-center gap-1.5 px-4 h-11 md:h-9 rounded-md bg-[var(--color-accent)] text-[var(--color-on-accent)] text-sm font-medium hover:bg-[var(--color-accent-hover)] transition-colors flex-shrink-0">
          <Plus size={15} /> Plan Job
        </button>
      </div>

      {/* ── SCHEDULE TAB ─────────────────────────────────────────────────────── */}
      {activeTab === 'schedule' && scheduleView === 'calendar' && (
        <PlanningCalendar plans={plans} />
      )}
      {activeTab === 'schedule' && scheduleView === 'timeline' && (
        Object.keys(grouped).length === 0 ? (
          <div className="rounded-xl border border-[var(--color-border)] bg-[var(--color-bg-secondary)] p-16 text-center">
            <Calendar size={32} className="text-[var(--color-text-muted)] opacity-30 mx-auto mb-3" />
            <p className="text-xs sm:text-sm font-medium text-[var(--color-text-primary)] text-center min-w-0 px-2">No plans scheduled</p>
            <p className="text-xs text-[var(--color-text-muted)] mt-1">Plan a job to get started</p>
          </div>
        ) : (
          <div className="space-y-4">
            {Object.entries(grouped).sort(([a], [b]) => a.localeCompare(b)).map(([date, dayPlans]) => {
              const isToday = date === new Date().toISOString().slice(0, 10)
              return (
                <div key={date}>
                  <div className={cn('flex items-center gap-2 mb-2')}>
                    <div className={cn('text-sm font-semibold', isToday ? 'text-[var(--color-accent)]' : 'text-[var(--color-text-primary)]')}>
                      {isToday ? '📅 Today — ' : ''}{formatDate(date, { weekday: 'long', day: 'numeric', month: 'long' })}
                    </div>
                    <div className="flex-1 h-px bg-[var(--color-border)]" />
                    <span className="text-xs text-[var(--color-text-muted)]">{dayPlans.length} job{dayPlans.length !== 1 ? 's' : ''}</span>
                  </div>
                  <div className="rounded-xl border border-[var(--color-border)] bg-[var(--color-bg-secondary)] overflow-hidden divide-y divide-[var(--color-border-subtle)]">
                    {dayPlans.map((plan, pIdx) => {
                      const statusCfg = PLAN_STATUS_CONFIG[plan.status as keyof typeof PLAN_STATUS_CONFIG] || PLAN_STATUS_CONFIG.scheduled
                      const priorityCfg = JOB_PRIORITY_CONFIG[plan.jobs?.priority as keyof typeof JOB_PRIORITY_CONFIG] || JOB_PRIORITY_CONFIG.normal
                      const totalHours = plan.job_machine_assignments?.reduce((s, m) => s + (m.estimated_hours || 0), 0) || 0
                      return (
                        <div key={plan.id} className="flex flex-wrap items-center gap-x-4 gap-y-2 px-4 md:px-5 py-3.5">
                          {/* Running order, and the shuffle itself. Buttons rather
                              than drag-and-drop — dragging inside a vertically
                              scrolling list is unreliable on touch, and this needs
                              no library. */}
                          <div className="flex items-center gap-1.5 flex-shrink-0">
                            <span className="w-5 text-center text-xs font-semibold font-mono text-[var(--color-text-muted)]">
                              {plan.day_order || '—'}
                            </span>
                            <button onClick={() => movePlan(plan, -1)} disabled={pIdx === 0 || reordering}
                              className={iconBtnCls} aria-label="Move up" title="Move up">
                              <ChevronUp size={14} />
                            </button>
                            <button onClick={() => movePlan(plan, 1)} disabled={pIdx === dayPlans.length - 1 || reordering}
                              className={iconBtnCls} aria-label="Move down" title="Move down">
                              <ChevronDown size={14} />
                            </button>
                          </div>
                          <ArtworkThumb
                            size="sm"
                            interactive={false}
                            url={jobThumbs[plan.job_id]?.url ?? undefined}
                            fileName={jobThumbs[plan.job_id]?.fileName ?? plan.jobs?.job_title ?? ''}
                            fileType={jobThumbs[plan.job_id]?.fileType}
                            version={jobThumbs[plan.job_id]?.version ?? 1}
                            approved={jobThumbs[plan.job_id]?.approved}
                          />
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2">
                              <Link href={`/dashboard/jobs/${plan.job_id}`} className="text-sm font-semibold text-[var(--color-accent)] font-mono hover:underline">
                                {plan.jobs?.job_number}
                              </Link>
                              <span className="text-sm text-[var(--color-text-primary)] truncate">{plan.jobs?.job_title}</span>
                              <span className={cn('text-xs font-medium', priorityCfg.color)}>{priorityCfg.label}</span>
                            </div>
                            <div className="flex items-center gap-3 mt-1 flex-wrap">
                              <span className="text-xs text-[var(--color-text-muted)]">{plan.jobs?.customers?.name}</span>
                              {plan.job_machine_assignments?.filter(m => m.machines).map(m => (
                                <span key={m.id} className="flex items-center gap-1 text-xs text-[var(--color-text-muted)] bg-[var(--color-bg-elevated)] border border-[var(--color-border)] px-2 py-0.5 rounded">
                                  <Cpu size={10} /> {m.machines?.name}
                                  {m.estimated_hours ? ` (${m.estimated_hours}h)` : ''}
                                </span>
                              ))}
                              {totalHours > 0 && <span className="text-xs text-[var(--color-text-muted)] flex items-center gap-1"><Clock size={10} /> {totalHours}h total</span>}
                            </div>
                            {plan.notes && <p className="text-xs text-[var(--color-text-muted)] mt-0.5 italic">{plan.notes}</p>}
                          </div>
                          <div className="flex items-center gap-2 flex-shrink-0">
                            <span className={cn('text-xs px-2.5 py-1 rounded-full border font-medium', statusCfg.color)}>{statusCfg.label}</span>
                            <button onClick={() => openEdit(plan)} className={iconBtnCls}
                              aria-label="Edit plan" title="Edit plan — date & machines">
                              <Pencil size={13} />
                            </button>
                            <select value={plan.status} onChange={e => updateStatus(plan.id, e.target.value)}
                              className="h-7 px-2 rounded border text-xs bg-[var(--color-bg-elevated)] text-[var(--color-text-secondary)] border-[var(--color-border)] focus:outline-none transition-colors">
                              <option value="scheduled">Scheduled</option>
                              <option value="in_progress">In Progress</option>
                              <option value="completed">Completed</option>
                              <option value="cancelled">Cancelled</option>
                            </select>
                          </div>
                        </div>
                      )
                    })}
                  </div>
                </div>
              )
            })}
          </div>
        )
      )}

      {/* ── UNPLANNED TAB ────────────────────────────────────────────────────── */}
      {activeTab === 'unplanned' && (
        <div className="rounded-xl border border-[var(--color-border)] bg-[var(--color-bg-secondary)] overflow-hidden">
          {unplannedJobs.length === 0 ? (
            <div className="p-12 text-center">
              <CheckCircle2 size={28} className="text-[var(--color-success)] opacity-50 mx-auto mb-2" />
              <p className="text-sm text-[var(--color-text-muted)]">All active jobs are planned!</p>
            </div>
          ) : (
            <>
              <div className="hidden md:grid grid-cols-12 gap-3 px-5 py-2.5 bg-[var(--color-bg-elevated)] border-b border-[var(--color-border)] text-xs font-semibold text-[var(--color-text-muted)] uppercase tracking-wider">
                <div className="col-span-2">Job #</div>
                <div className="col-span-4">Title</div>
                <div className="col-span-3">Customer</div>
                <div className="col-span-1">Priority</div>
                <div className="col-span-2 text-right">Due Date</div>
              </div>
              <div className="divide-y divide-[var(--color-border-subtle)]">
                {unplannedJobs.map((job, idx) => {
                  const priorityCfg = JOB_PRIORITY_CONFIG[job.priority as keyof typeof JOB_PRIORITY_CONFIG] || JOB_PRIORITY_CONFIG.normal
                  const isOverdue = job.required_date && new Date(job.required_date) < new Date()
                  return (
                    <div key={job.id} className={cn('flex items-center gap-3 px-4 md:px-5 py-3', idx % 2 === 1 && 'bg-[color:color-mix(in_srgb,var(--color-bg-elevated)_15%,transparent)]')}>
                      <ArtworkThumb
                        size="sm"
                        interactive={false}
                        className="flex-shrink-0"
                        url={jobThumbs[job.id]?.url ?? undefined}
                        fileName={jobThumbs[job.id]?.fileName ?? job.job_title}
                        fileType={jobThumbs[job.id]?.fileType}
                        version={jobThumbs[job.id]?.version ?? 1}
                        approved={jobThumbs[job.id]?.approved}
                      />
                    <div className="grid grid-cols-2 md:grid-cols-12 gap-x-3 gap-y-1 flex-1 min-w-0">
                      <div className="col-span-1 md:col-span-2">
                        <Link href={`/dashboard/jobs/${job.id}`} className="text-xs font-mono text-[var(--color-accent)] hover:underline">{job.job_number}</Link>
                      </div>
                      <div className="col-span-2 md:col-span-4 text-sm text-[var(--color-text-primary)] truncate order-first md:order-none">{job.job_title}</div>
                      <div className="col-span-2 md:col-span-3 text-xs text-[var(--color-text-muted)] truncate">{job.customers?.name}</div>
                      <div className="hidden md:block md:col-span-1">
                        <span className={cn('text-xs font-medium', priorityCfg.color)}>{priorityCfg.label}</span>
                      </div>
                      <div className="col-span-1 md:col-span-2 text-right">
                        {job.required_date ? (
                          <span className={cn('text-xs font-medium', isOverdue ? 'text-[var(--color-danger)]' : 'text-[var(--color-text-muted)]')}>
                            {isOverdue && <AlertTriangle size={10} className="inline mr-1" />}
                            {formatDate(job.required_date, { day: 'numeric', month: 'short' })}
                          </span>
                        ) : <span className="text-xs text-[var(--color-text-muted)]">—</span>}
                      </div>
                    </div>
                    </div>
                  )
                })}
              </div>
            </>
          )}
        </div>
      )}

      {/* Plan Modal */}
      <Modal open={planModal} onClose={() => setPlanModal(false)} title="Plan a Job" size="lg"
        footer={
          <>
            <button onClick={() => setPlanModal(false)} className="px-4 h-11 md:h-9 rounded-md border border-[var(--color-border)] text-sm text-[var(--color-text-secondary)] hover:bg-[var(--color-bg-elevated)] transition-colors">Cancel</button>
            <button onClick={createPlan} disabled={loading || !form.job_id || !form.planned_date}
              className="flex items-center gap-2 px-4 h-9 rounded-md bg-[var(--color-accent)] text-[var(--color-on-accent)] text-sm font-medium hover:bg-[var(--color-accent-hover)] disabled:opacity-50 transition-colors">
              <Calendar size={14} /> {loading ? 'Creating…' : 'Create Plan'}
            </button>
          </>
        }>
        <div className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <label htmlFor="planningclient-1" className="text-sm font-medium text-[var(--color-text-primary)]">Job <span className="text-[var(--color-danger)]">*</span></label>
              <select id="planningclient-1" className={inputCls} value={form.job_id} onChange={e => setForm(p => ({ ...p, job_id: e.target.value }))}>
                <option value="">Select job…</option>
                {unplannedJobs.map(j => <option key={j.id} value={j.id}>{j.job_number} — {j.job_title}</option>)}
              </select>
            </div>
            <div className="space-y-1.5">
              <label htmlFor="planningclient-2" className="text-sm font-medium text-[var(--color-text-primary)]">Planned Date <span className="text-[var(--color-danger)]">*</span></label>
              <input id="planningclient-2" type="date" className={inputCls} value={form.planned_date} onChange={e => setForm(p => ({ ...p, planned_date: e.target.value }))} />
            </div>
          </div>

          {/* Machine assignments */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <label className="text-sm font-medium text-[var(--color-text-primary)]">Machine Assignments</label>
              <button onClick={addMachineRow} className="flex items-center gap-1 text-xs text-[var(--color-accent)] hover:underline">
                <Plus size={12} /> Add Machine
              </button>
            </div>
            {selectedMachines.length === 0 ? (
              <p className="text-xs text-[var(--color-text-muted)]">No machines assigned. Click &ldquo;Add Machine&rdquo; to assign.</p>
            ) : (
              <div className="space-y-2">
                {selectedMachines.map((m, idx) => (
                  <div key={idx} className="flex items-center gap-2">
                    <select className={inputCls} value={m.machine_id} onChange={e => setMachineField(idx, 'machine_id', e.target.value)}>
                      <option value="">Select machine…</option>
                      {machines.map(mx => <option key={mx.id} value={mx.id}>{mx.name} ({mx.machine_type})</option>)}
                    </select>
                    <input type="number" className="w-28 h-11 md:h-9 px-3 rounded-md border text-sm bg-[var(--color-bg-elevated)] text-[var(--color-text-primary)] border-[var(--color-border)] focus:outline-none focus:border-[var(--color-accent)] transition-colors"
                      value={m.estimated_hours} onChange={e => setMachineField(idx, 'estimated_hours', e.target.value)} placeholder="Hours" />
                    <button onClick={() => removeMachineRow(idx)} className="text-[var(--color-text-muted)] hover:text-[var(--color-danger)] transition-colors flex-shrink-0">✕</button>
                  </div>
                ))}
              </div>
            )}
          </div>

          <div className="space-y-1.5">
            <label htmlFor="planningclient-3" className="text-sm font-medium text-[var(--color-text-primary)]">Notes</label>
            <input id="planningclient-3" className={inputCls} value={form.notes} onChange={e => setForm(p => ({ ...p, notes: e.target.value }))} placeholder="Optional planning notes" />
          </div>
        </div>
      </Modal>

      {/* Edit Plan — the one place a plan's date and machines can change. Before
          this the only editable thing on a live plan was its status, so moving a
          job to another day meant cancelling it and planning it again. */}
      <Modal open={!!editPlan} onClose={() => setEditPlan(null)} title={`Edit Plan — ${editPlan?.jobs?.job_number ?? ''}`} size="lg"
        footer={
          <>
            <button onClick={() => setEditPlan(null)} className="px-4 h-11 md:h-9 rounded-md border border-[var(--color-border)] text-sm text-[var(--color-text-secondary)] hover:bg-[var(--color-bg-elevated)] transition-colors">Cancel</button>
            <button onClick={saveEdit} disabled={savingEdit || !editForm.planned_date}
              className="flex items-center gap-2 px-4 h-9 rounded-md bg-[var(--color-accent)] text-[var(--color-on-accent)] text-sm font-medium hover:bg-[var(--color-accent-hover)] disabled:opacity-50 transition-colors">
              <Calendar size={14} /> {savingEdit ? 'Saving…' : 'Save Changes'}
            </button>
          </>
        }>
        <div className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <label htmlFor="planningclient-edit-date" className="text-sm font-medium text-[var(--color-text-primary)]">Planned Date <span className="text-[var(--color-danger)]">*</span></label>
              <input id="planningclient-edit-date" type="date" className={inputCls} value={editForm.planned_date}
                onChange={e => setEditForm(p => ({ ...p, planned_date: e.target.value }))} />
              {editPlan && editForm.planned_date !== editPlan.planned_date && (
                <p className="text-xs text-[var(--color-text-muted)]">Moves to the end of that day&rsquo;s running order.</p>
              )}
            </div>
          </div>

          <div>
            <div className="flex items-center justify-between mb-2">
              <label className="text-sm font-medium text-[var(--color-text-primary)]">Machine Assignments</label>
              <button onClick={addEditMachineRow} className="flex items-center gap-1 text-xs text-[var(--color-accent)] hover:underline">
                <Plus size={12} /> Add Machine
              </button>
            </div>
            {editMachines.length === 0 ? (
              <p className="text-xs text-[var(--color-text-muted)]">No machines assigned. Click &ldquo;Add Machine&rdquo; to assign.</p>
            ) : (
              <div className="space-y-2">
                {editMachines.map((m, idx) => (
                  <div key={m.id ?? `new-${idx}`} className="flex items-center gap-2">
                    <select className={inputCls} value={m.machine_id} onChange={e => setEditMachineField(idx, 'machine_id', e.target.value)}>
                      <option value="">Select machine…</option>
                      {machines.map(mx => <option key={mx.id} value={mx.id}>{mx.name} ({mx.machine_type})</option>)}
                    </select>
                    <input type="number" className="w-28 h-11 md:h-9 px-3 rounded-md border text-sm bg-[var(--color-bg-elevated)] text-[var(--color-text-primary)] border-[var(--color-border)] focus:outline-none focus:border-[var(--color-accent)] transition-colors"
                      value={m.estimated_hours} onChange={e => setEditMachineField(idx, 'estimated_hours', e.target.value)} placeholder="Hours" />
                    <button onClick={() => removeEditMachineRow(idx)} className="text-[var(--color-text-muted)] hover:text-[var(--color-danger)] transition-colors flex-shrink-0">✕</button>
                  </div>
                ))}
              </div>
            )}
            <p className="text-xs text-[var(--color-text-muted)] mt-2">
              A machine that already has recorded time on it can&rsquo;t be removed — the save will say so.
            </p>
          </div>

          <div className="space-y-1.5">
            <label htmlFor="planningclient-edit-notes" className="text-sm font-medium text-[var(--color-text-primary)]">Notes</label>
            <input id="planningclient-edit-notes" className={inputCls} value={editForm.notes}
              onChange={e => setEditForm(p => ({ ...p, notes: e.target.value }))} placeholder="Optional planning notes" />
          </div>
        </div>
      </Modal>
    </div>
  )
}

function PlanningCalendar({ plans }: { plans: Plan[] }) {
  // Scrolls the strip to today on first paint (no-op at lg+, where the grid
  // shows the whole week anyway).
  const todayRef = useRef<HTMLDivElement | null>(null)
  useEffect(() => {
    todayRef.current?.scrollIntoView({ inline: 'start', block: 'nearest' })
  }, [])
  const [weekStart, setWeekStart] = useState(() => {
    const d = new Date()
    const day = d.getDay() // 0 = Sunday
    d.setDate(d.getDate() - day)
    d.setHours(0, 0, 0, 0)
    return d
  })

  const days = Array.from({ length: 7 }, (_, i) => {
    const d = new Date(weekStart)
    d.setDate(d.getDate() + i)
    return d
  })

  const byDate = plans.reduce((acc, p) => {
    if (!acc[p.planned_date]) acc[p.planned_date] = []
    acc[p.planned_date].push(p)
    return acc
  }, {} as Record<string, Plan[]>)

  const today = new Date().toISOString().slice(0, 10)

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <button onClick={() => setWeekStart(d => { const n = new Date(d); n.setDate(n.getDate() - 7); return n })}
          className="px-3 h-11 md:h-8 rounded-md border border-[var(--color-border)] text-sm text-[var(--color-text-secondary)] hover:bg-[var(--color-bg-elevated)] transition-colors flex-shrink-0">
          ← <span className="hidden sm:inline">Previous Week</span><span className="sm:hidden">Prev</span>
        </button>
        <p className="text-xs sm:text-sm font-medium text-[var(--color-text-primary)] text-center min-w-0 px-2">
          {formatDate(days[0].toISOString().slice(0, 10), { day: 'numeric', month: 'short' })} — {formatDate(days[6].toISOString().slice(0, 10), { day: 'numeric', month: 'short', year: 'numeric' })}
        </p>
        <button onClick={() => setWeekStart(d => { const n = new Date(d); n.setDate(n.getDate() + 7); return n })}
          className="px-3 h-11 md:h-8 rounded-md border border-[var(--color-border)] text-sm text-[var(--color-text-secondary)] hover:bg-[var(--color-bg-elevated)] transition-colors flex-shrink-0">
          <span className="hidden sm:inline">Next Week</span><span className="sm:hidden">Next</span> →
        </button>
      </div>

      {/* lg+: the full week as a 7-column grid, exactly as before.
          Below lg: the same seven days as a horizontally scrolling snap strip —
          each day panel is 240px, so a tablet shows about three days at a time
          (the working window planning actually needs) and a phone about one
          and a half, with today snapped into view first. */}
      <div className="flex lg:grid lg:grid-cols-7 gap-2 overflow-x-auto lg:overflow-visible scrollbar-none snap-x snap-mandatory -mx-1 px-1 lg:mx-0 lg:px-0">
        {days.map(d => {
          const dateStr = d.toISOString().slice(0, 10)
          const dayPlans = byDate[dateStr] || []
          const isToday = dateStr === today
          return (
            <div key={dateStr} ref={isToday ? todayRef : undefined}
              className={cn('rounded-lg border min-h-[220px] min-w-[240px] lg:min-w-0 flex-shrink-0 lg:flex-shrink snap-start', isToday ? 'border-[var(--color-accent)]' : 'border-[var(--color-border)]')}>
              <div className={cn('px-2 py-1.5 text-center border-b', isToday ? 'bg-[color:color-mix(in_srgb,var(--color-accent)_10%,transparent)] border-[color:color-mix(in_srgb,var(--color-accent)_20%,transparent)]' : 'bg-[var(--color-bg-elevated)] border-[var(--color-border-subtle)]')}>
                <p className="text-xs font-medium text-[var(--color-text-muted)]">{d.toLocaleDateString('en-PK', { weekday: 'short' })}</p>
                <p className={cn('text-sm font-semibold', isToday ? 'text-[var(--color-accent)]' : 'text-[var(--color-text-primary)]')}>{d.getDate()}</p>
              </div>
              <div className="p-1.5 space-y-1.5">
                {dayPlans.length === 0 ? (
                  <p className="text-xs text-[var(--color-text-muted)] text-center py-4">—</p>
                ) : dayPlans.map(p => {
                  const priorityCfg = JOB_PRIORITY_CONFIG[p.jobs?.priority as keyof typeof JOB_PRIORITY_CONFIG] || JOB_PRIORITY_CONFIG.normal
                  return (
                    <Link key={p.id} href={`/dashboard/jobs/${p.job_id}`}
                      className="block px-2 py-1.5 rounded-md bg-[var(--color-bg-elevated)] border border-[var(--color-border-subtle)] hover:border-[color:color-mix(in_srgb,var(--color-accent)_40%,transparent)] transition-colors">
                      <p className="text-xs font-mono text-[var(--color-accent)] truncate">{p.jobs?.job_number}</p>
                      <p className="text-xs text-[var(--color-text-primary)] truncate">{p.jobs?.job_title}</p>
                      {p.job_machine_assignments && p.job_machine_assignments.length > 0 && (
                        <p className="text-[10px] text-[var(--color-text-muted)] truncate mt-0.5">
                          {p.job_machine_assignments.map(m => m.machines?.name).filter(Boolean).join(', ')}
                        </p>
                      )}
                    </Link>
                  )
                })}
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}
