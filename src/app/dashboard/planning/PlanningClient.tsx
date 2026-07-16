'use client'
import { useState } from 'react'
import { Calendar, Plus, AlertTriangle, CheckCircle2, Clock, Cpu } from 'lucide-react'
import { cn } from '@/lib/utils/cn'
import { toast } from '@/components/ui/Toast'
import { Modal } from '@/components/ui/Modal'
import { formatDate } from '@/lib/utils/format'
import { JOB_PRIORITY_CONFIG } from '@/modules/jobs/types/job.types'
import Link from 'next/link'

interface Plan {
  id: string; job_id: string; planned_date: string; status: string; notes: string | null
  jobs?: { job_number: string; job_title: string; status: string; priority: string; customers?: { name: string } | null } | null
  job_machine_assignments?: { id: string; machines?: { name: string; machine_type: string } | null; estimated_hours: number | null }[]
}
interface Machine { id: string; name: string; machine_type: string }
interface Job { id: string; job_number: string; job_title: string; priority: string; required_date: string | null; customers?: { name: string } | null }

const PLAN_STATUS_CONFIG = {
  scheduled:   { label: 'Scheduled',   color: 'text-[var(--color-accent)] bg-[var(--color-accent)]/10 border-[var(--color-accent)]/20' },
  in_progress: { label: 'In Progress', color: 'text-[var(--color-warning)] bg-[var(--color-warning)]/10 border-[var(--color-warning)]/20' },
  completed:   { label: 'Completed',   color: 'text-[var(--color-success)] bg-[var(--color-success)]/10 border-[var(--color-success)]/20' },
  cancelled:   { label: 'Cancelled',   color: 'text-[var(--color-muted)] bg-[var(--color-bg-elevated)] border-[var(--color-border)]' },
}

const inputCls = 'w-full h-9 px-3 rounded-md border text-sm bg-[var(--color-bg-elevated)] text-[var(--color-text-primary)] border-[var(--color-border)] placeholder:text-[var(--color-text-muted)] focus:outline-none focus:border-[var(--color-accent)] focus:ring-1 focus:ring-[var(--color-accent)] transition-colors'

export default function PlanningClient({ initialPlans, machines, unplannedJobs }: { initialPlans: Plan[]; machines: Machine[]; unplannedJobs: Job[] }) {
  const [plans, setPlans] = useState(initialPlans)
  const [planModal, setPlanModal] = useState(false)
  const [loading, setLoading] = useState(false)
  const [form, setForm] = useState({ job_id: '', planned_date: new Date().toISOString().slice(0, 10), notes: '' })
  const [selectedMachines, setSelectedMachines] = useState<{ machine_id: string; estimated_hours: string }[]>([])
  const [activeTab, setActiveTab] = useState<'schedule' | 'unplanned'>('schedule')

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
      const { data } = await res.json()
      const job = unplannedJobs.find(j => j.id === form.job_id)
      const machineFull = selectedMachines.filter(m => m.machine_id).map(m => ({
        id: m.machine_id, machines: machines.find(mx => mx.id === m.machine_id),
        estimated_hours: m.estimated_hours ? parseFloat(m.estimated_hours) : null,
      }))
      setPlans(prev => [...prev, { ...data, jobs: job ? { job_number: job.job_number, job_title: job.job_title, status: 'new', priority: job.priority, customers: job.customers } : null, job_machine_assignments: machineFull }].sort((a, b) => a.planned_date.localeCompare(b.planned_date)))
      setPlanModal(false)
      setForm({ job_id: '', planned_date: new Date().toISOString().slice(0, 10), notes: '' })
      setSelectedMachines([])
      toast.success('Plan created')
    } catch (e: any) { toast.error(e.message || 'Failed') }
    finally { setLoading(false) }
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
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-1">
          {([['schedule', 'Schedule'], ['unplanned', `Unplanned Jobs (${unplannedJobs.length})`]] as const).map(([key, label]) => (
            <button key={key} onClick={() => setActiveTab(key)}
              className={cn('px-4 h-8 rounded-md text-sm font-medium border transition-all',
                activeTab === key ? 'bg-[var(--color-accent)] text-white border-transparent' : 'border-[var(--color-border)] text-[var(--color-text-secondary)] hover:text-[var(--color-text-primary)]')}>
              {label}
            </button>
          ))}
        </div>
        <button onClick={() => setPlanModal(true)}
          className="flex items-center gap-1.5 px-4 h-9 rounded-md bg-[var(--color-accent)] text-white text-sm font-medium hover:bg-[var(--color-accent-hover)] transition-colors">
          <Plus size={15} /> Plan Job
        </button>
      </div>

      {/* ── SCHEDULE TAB ─────────────────────────────────────────────────────── */}
      {activeTab === 'schedule' && (
        Object.keys(grouped).length === 0 ? (
          <div className="rounded-xl border border-[var(--color-border)] bg-[var(--color-bg-secondary)] p-16 text-center">
            <Calendar size={32} className="text-[var(--color-text-muted)] opacity-30 mx-auto mb-3" />
            <p className="text-sm font-medium text-[var(--color-text-primary)]">No plans scheduled</p>
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
                    {dayPlans.map(plan => {
                      const statusCfg = PLAN_STATUS_CONFIG[plan.status as keyof typeof PLAN_STATUS_CONFIG] || PLAN_STATUS_CONFIG.scheduled
                      const priorityCfg = JOB_PRIORITY_CONFIG[plan.jobs?.priority as keyof typeof JOB_PRIORITY_CONFIG] || JOB_PRIORITY_CONFIG.normal
                      const totalHours = plan.job_machine_assignments?.reduce((s, m) => s + (m.estimated_hours || 0), 0) || 0
                      return (
                        <div key={plan.id} className="flex items-center gap-4 px-5 py-3.5">
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
              <div className="grid grid-cols-12 gap-3 px-5 py-2.5 bg-[var(--color-bg-elevated)] border-b border-[var(--color-border)] text-xs font-semibold text-[var(--color-text-muted)] uppercase tracking-wider">
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
                    <div key={job.id} className={cn('grid grid-cols-12 gap-3 px-5 py-3 items-center', idx % 2 === 1 && 'bg-[var(--color-bg-elevated)]/15')}>
                      <div className="col-span-2">
                        <Link href={`/dashboard/jobs/${job.id}`} className="text-xs font-mono text-[var(--color-accent)] hover:underline">{job.job_number}</Link>
                      </div>
                      <div className="col-span-4 text-sm text-[var(--color-text-primary)] truncate">{job.job_title}</div>
                      <div className="col-span-3 text-xs text-[var(--color-text-muted)] truncate">{job.customers?.name}</div>
                      <div className="col-span-1">
                        <span className={cn('text-xs font-medium', priorityCfg.color)}>{priorityCfg.label}</span>
                      </div>
                      <div className="col-span-2 text-right">
                        {job.required_date ? (
                          <span className={cn('text-xs font-medium', isOverdue ? 'text-[var(--color-danger)]' : 'text-[var(--color-text-muted)]')}>
                            {isOverdue && <AlertTriangle size={10} className="inline mr-1" />}
                            {formatDate(job.required_date, { day: 'numeric', month: 'short' })}
                          </span>
                        ) : <span className="text-xs text-[var(--color-text-muted)]">—</span>}
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
            <button onClick={() => setPlanModal(false)} className="px-4 h-9 rounded-md border border-[var(--color-border)] text-sm text-[var(--color-text-secondary)] hover:bg-[var(--color-bg-elevated)] transition-colors">Cancel</button>
            <button onClick={createPlan} disabled={loading || !form.job_id || !form.planned_date}
              className="flex items-center gap-2 px-4 h-9 rounded-md bg-[var(--color-accent)] text-white text-sm font-medium hover:bg-[var(--color-accent-hover)] disabled:opacity-50 transition-colors">
              <Calendar size={14} /> {loading ? 'Creating…' : 'Create Plan'}
            </button>
          </>
        }>
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <label className="text-sm font-medium text-[var(--color-text-primary)]">Job <span className="text-[var(--color-danger)]">*</span></label>
              <select className={inputCls} value={form.job_id} onChange={e => setForm(p => ({ ...p, job_id: e.target.value }))}>
                <option value="">Select job…</option>
                {unplannedJobs.map(j => <option key={j.id} value={j.id}>{j.job_number} — {j.job_title}</option>)}
              </select>
            </div>
            <div className="space-y-1.5">
              <label className="text-sm font-medium text-[var(--color-text-primary)]">Planned Date <span className="text-[var(--color-danger)]">*</span></label>
              <input type="date" className={inputCls} value={form.planned_date} onChange={e => setForm(p => ({ ...p, planned_date: e.target.value }))} />
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
                    <input type="number" className="w-28 h-9 px-3 rounded-md border text-sm bg-[var(--color-bg-elevated)] text-[var(--color-text-primary)] border-[var(--color-border)] focus:outline-none focus:border-[var(--color-accent)] transition-colors"
                      value={m.estimated_hours} onChange={e => setMachineField(idx, 'estimated_hours', e.target.value)} placeholder="Hours" />
                    <button onClick={() => removeMachineRow(idx)} className="text-[var(--color-text-muted)] hover:text-[var(--color-danger)] transition-colors flex-shrink-0">✕</button>
                  </div>
                ))}
              </div>
            )}
          </div>

          <div className="space-y-1.5">
            <label className="text-sm font-medium text-[var(--color-text-primary)]">Notes</label>
            <input className={inputCls} value={form.notes} onChange={e => setForm(p => ({ ...p, notes: e.target.value }))} placeholder="Optional planning notes" />
          </div>
        </div>
      </Modal>
    </div>
  )
}
