'use client'
import { useState, useCallback } from 'react'
import {
  Cpu, Play, Pause, CheckCircle2, AlertTriangle, Clock, User,
  Plus, RefreshCw, Activity, MessageSquare, XCircle, Layers, ChevronDown, ChevronRight
} from 'lucide-react'
import { cn } from '@/lib/utils/cn'
import { toast } from '@/components/ui/Toast'
import { Modal } from '@/components/ui/Modal'
import { formatTimeAgo, formatDateTime } from '@/lib/utils/format'
import { JOB_PRIORITY_CONFIG } from '@/modules/jobs/types/job.types'
import Link from 'next/link'

interface Assignment {
  id: string; job_id: string; machine_id: string; operator_id: string | null
  status: 'queued' | 'running' | 'paused' | 'completed' | 'cancelled'
  scheduled_start: string | null; actual_start: string | null; actual_end: string | null
  estimated_minutes: number | null; actual_minutes: number | null; notes: string | null
  jobs?: { job_number: string; job_title: string; priority: string; quantity: number; required_date: string | null; customers?: { name: string } | null } | null
  machines?: { name: string; machine_type: string } | null
  users?: { full_name: string } | null
}
interface MachineStatus {
  machine_id: string; machine_name: string; machine_type: string; machine_active: boolean
  assignment_id: string | null; assignment_status: string | null
  job_id: string | null; job_number: string | null; job_title: string | null
  job_priority: string | null; required_date: string | null; customer_name: string | null
  operator_name: string | null; actual_start: string | null; stage_name: string | null
}
interface Operator { id: string; full_name: string; employee_code: string | null }
interface PendingJob {
  id: string; job_number: string; job_title: string; priority: string
  customers?: { name: string } | null
  job_stage_progress?: { id: string; sequence_order: number; status: string; workflow_stages?: { name: string } | null }[]
}

const MACHINE_TYPE_COLORS: Record<string, string> = {
  printing:    'var(--color-accent)',
  die_cutting: 'var(--color-warning)',
  lamination:  'var(--color-info)',
  foiling:     '#a855f7',
  folder_gluer:'var(--color-success)',
  uv:          '#f59e0b',
  packing:     'var(--color-text-muted)',
}

function elapsedMins(start: string | null): number {
  if (!start) return 0
  return Math.floor((Date.now() - new Date(start).getTime()) / 60000)
}

function formatMins(mins: number): string {
  if (mins < 60) return `${mins}m`
  return `${Math.floor(mins / 60)}h ${mins % 60}m`
}

const inputCls = 'w-full h-9 px-3 rounded-md border text-sm bg-[var(--color-bg-elevated)] text-[var(--color-text-primary)] border-[var(--color-border)] placeholder:text-[var(--color-text-muted)] focus:outline-none focus:border-[var(--color-accent)] focus:ring-1 focus:ring-[var(--color-accent)] transition-colors'

type Tab = 'floor' | 'queue' | 'running'

export default function FloorDashboardClient({
  machines, activeJobs, queued, operators, pendingJobs, completedToday
}: {
  machines: MachineStatus[]; activeJobs: Assignment[]; queued: Assignment[]
  operators: Operator[]; pendingJobs: PendingJob[]; completedToday: number
}) {
  const [active, setActive] = useState(activeJobs)
  const [queue, setQueue]   = useState(queued)
  const [tab, setTab] = useState<Tab>('floor')
  const [loading, setLoading] = useState(false)

  // Assign modal
  const [assignModal, setAssignModal] = useState(false)
  const [assignForm, setAssignForm] = useState({
    job_id: '', machine_id: '', operator_id: '', stage_progress_id: '',
    scheduled_start: '', estimated_minutes: '', notes: '',
  })
  const selectedJob = pendingJobs.find(j => j.id === assignForm.job_id)
  const pendingStages = selectedJob?.job_stage_progress?.filter(s => ['pending','in_progress'].includes(s.status)) ?? []

  // Action modal (start/pause/complete/note)
  const [actionModal, setActionModal] = useState<{ assignment: Assignment; action: 'start'|'pause'|'resume'|'complete'|'note'|'issue' } | null>(null)
  const [actionNotes, setActionNotes] = useState('')
  const [actionQty, setActionQty] = useState('')

  // Machine cards from floor status — all machines
  const allMachines = machines

  const assign = async () => {
    if (!assignForm.job_id || !assignForm.machine_id) { toast.error('Job and machine are required'); return }
    setLoading(true)
    try {
      const res = await fetch('/api/v1/production/assignments', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(assignForm),
      })
      if (!res.ok) { const e = await res.json(); throw new Error(e.error) }
      const { data } = await res.json()
      setQueue(prev => [data, ...prev])
      setAssignModal(false)
      setAssignForm({ job_id: '', machine_id: '', operator_id: '', stage_progress_id: '', scheduled_start: '', estimated_minutes: '', notes: '' })
      toast.success('Job assigned to machine')
    } catch (e: any) { toast.error(e.message || 'Failed') }
    finally { setLoading(false) }
  }

  const applyAction = async () => {
    if (!actionModal) return
    setLoading(true)
    try {
      const res = await fetch(`/api/v1/production/assignments/${actionModal.assignment.id}`, {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: actionModal.action, notes: actionNotes || null, quantity_done: actionQty || null }),
      })
      if (!res.ok) throw new Error()
      const { data } = await res.json()
      // Update local state
      if (actionModal.action === 'start' || actionModal.action === 'resume') {
        setActive(prev => {
          const exists = prev.find(a => a.id === data.id)
          return exists ? prev.map(a => a.id === data.id ? { ...a, ...data } : a) : [{ ...actionModal.assignment, ...data }, ...prev]
        })
        setQueue(prev => prev.filter(a => a.id !== data.id))
      } else if (actionModal.action === 'complete') {
        setActive(prev => prev.filter(a => a.id !== data.id))
      } else if (actionModal.action === 'pause') {
        setActive(prev => prev.map(a => a.id === data.id ? { ...a, status: 'paused' } : a))
      }
      setActionModal(null)
      setActionNotes(''); setActionQty('')
      toast.success(
        actionModal.action === 'start'    ? 'Machine started' :
        actionModal.action === 'pause'    ? 'Paused' :
        actionModal.action === 'resume'   ? 'Resumed' :
        actionModal.action === 'complete' ? '✅ Job completed!' :
        'Note added'
      )
    } catch { toast.error('Failed') }
    finally { setLoading(false) }
  }

  const refreshFloor = useCallback(async () => {
    setLoading(true)
    try {
      const res = await fetch('/api/v1/production/floor')
      const json = await res.json()
      setActive(json.queued?.filter((a: Assignment) => a.status === 'running') ?? [])
      setQueue(json.queued?.filter((a: Assignment) => a.status === 'queued') ?? [])
    } catch { toast.error('Refresh failed') }
    finally { setLoading(false) }
  }, [])

  const machineStatusColor = (status: string | null) => {
    if (status === 'running') return 'var(--color-success)'
    if (status === 'paused')  return 'var(--color-warning)'
    if (status === 'queued')  return 'var(--color-accent)'
    return 'var(--color-border)'
  }

  return (
    <div className="space-y-4">
      {/* ── Stat Bar ─────────────────────────────────────────────────────────── */}
      <div className="grid grid-cols-4 gap-4">
        {[
          { label: 'Running Now',      value: active.filter(a => a.status === 'running').length, color: 'var(--color-success)', icon: Activity },
          { label: 'Queued',           value: queue.length,      color: 'var(--color-accent)',  icon: Layers },
          { label: 'Completed Today',  value: completedToday,    color: 'var(--color-info)',    icon: CheckCircle2 },
          { label: 'Active Machines',  value: allMachines.filter(m => m.assignment_status === 'running').length + '/' + allMachines.length,
            color: 'var(--color-warning)', icon: Cpu },
        ].map(stat => (
          <div key={stat.label} className="rounded-xl border border-[var(--color-border)] bg-[var(--color-bg-secondary)] p-4 flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg flex items-center justify-center flex-shrink-0"
              style={{ background: `color-mix(in srgb, ${stat.color} 12%, transparent)` }}>
              <stat.icon size={18} style={{ color: stat.color }} />
            </div>
            <div>
              <p className="text-xs text-[var(--color-text-muted)]">{stat.label}</p>
              <p className="text-xl font-bold text-[var(--color-text-primary)]">{stat.value}</p>
            </div>
          </div>
        ))}
      </div>

      {/* ── Toolbar ──────────────────────────────────────────────────────────── */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-1">
          {([
            ['floor',   `Floor View (${allMachines.length})`],
            ['running', `Running (${active.filter(a=>a.status==='running').length})`],
            ['queue',   `Queue (${queue.length})`],
          ] as const).map(([key, label]) => (
            <button key={key} onClick={() => setTab(key)}
              className={cn('px-4 h-8 rounded-md text-sm font-medium border transition-all',
                tab === key ? 'bg-[var(--color-accent)] text-white border-transparent' : 'border-[var(--color-border)] text-[var(--color-text-secondary)] hover:text-[var(--color-text-primary)]')}>
              {label}
            </button>
          ))}
        </div>
        <div className="flex items-center gap-2">
          <button onClick={refreshFloor} disabled={loading}
            className="flex items-center gap-1.5 px-3 h-8 rounded-md border border-[var(--color-border)] text-sm text-[var(--color-text-secondary)] hover:bg-[var(--color-bg-elevated)] transition-colors disabled:opacity-50">
            <RefreshCw size={13} className={loading ? 'animate-spin' : ''} /> Refresh
          </button>
          <button onClick={() => setAssignModal(true)}
            className="flex items-center gap-1.5 px-4 h-9 rounded-md bg-[var(--color-accent)] text-white text-sm font-medium hover:bg-[var(--color-accent-hover)] transition-colors">
            <Plus size={15} /> Assign Job
          </button>
        </div>
      </div>

      {/* ── FLOOR VIEW — Machine Cards ────────────────────────────────────────── */}
      {tab === 'floor' && (
        <div className="grid grid-cols-3 gap-4">
          {allMachines.length === 0 ? (
            <div className="col-span-3 rounded-xl border border-[var(--color-border)] bg-[var(--color-bg-secondary)] p-12 text-center">
              <Cpu size={32} className="text-[var(--color-text-muted)] opacity-30 mx-auto mb-3" />
              <p className="text-sm text-[var(--color-text-muted)]">No machines configured. Add machines in Settings.</p>
            </div>
          ) : allMachines.map(m => {
            const isRunning = m.assignment_status === 'running'
            const isPaused  = m.assignment_status === 'paused'
            const isQueued  = m.assignment_status === 'queued'
            const isIdle    = !m.assignment_id
            const typeColor = MACHINE_TYPE_COLORS[m.machine_type] || 'var(--color-text-muted)'
            const elapsed   = isRunning ? elapsedMins(m.actual_start) : 0
            const priorityCfg = m.job_priority ? JOB_PRIORITY_CONFIG[m.job_priority as keyof typeof JOB_PRIORITY_CONFIG] : null

            return (
              <div key={m.machine_id} className={cn(
                'rounded-xl border bg-[var(--color-bg-secondary)] overflow-hidden transition-all',
                isRunning ? 'border-[var(--color-success)]/40 shadow-sm' :
                isPaused  ? 'border-[var(--color-warning)]/40' :
                isQueued  ? 'border-[var(--color-accent)]/30' :
                            'border-[var(--color-border)]'
              )}>
                {/* Machine header */}
                <div className="px-4 py-3 border-b border-[var(--color-border)] flex items-center justify-between"
                  style={{ borderLeftWidth: 3, borderLeftColor: typeColor }}>
                  <div>
                    <div className="flex items-center gap-2">
                      <Cpu size={13} style={{ color: typeColor }} />
                      <span className="text-sm font-semibold text-[var(--color-text-primary)]">{m.machine_name}</span>
                    </div>
                    <span className="text-xs text-[var(--color-text-muted)] capitalize">{m.machine_type?.replace('_',' ')}</span>
                  </div>
                  {/* Status pill */}
                  <div className={cn('flex items-center gap-1.5 text-xs px-2.5 py-1 rounded-full border font-medium',
                    isRunning ? 'text-[var(--color-success)] bg-[var(--color-success)]/10 border-[var(--color-success)]/20' :
                    isPaused  ? 'text-[var(--color-warning)] bg-[var(--color-warning)]/10 border-[var(--color-warning)]/20' :
                    isQueued  ? 'text-[var(--color-accent)] bg-[var(--color-accent)]/10 border-[var(--color-accent)]/20' :
                                'text-[var(--color-text-muted)] bg-[var(--color-bg-elevated)] border-[var(--color-border)]')}>
                    <span className={cn('w-1.5 h-1.5 rounded-full', isRunning ? 'bg-[var(--color-success)] animate-pulse' : isQueued ? 'bg-[var(--color-accent)]' : isPaused ? 'bg-[var(--color-warning)]' : 'bg-[var(--color-border)]')} />
                    {isRunning ? 'Running' : isPaused ? 'Paused' : isQueued ? 'Queued' : 'Idle'}
                  </div>
                </div>

                {/* Job info */}
                <div className="p-4">
                  {isIdle ? (
                    <div className="text-center py-4">
                      <p className="text-xs text-[var(--color-text-muted)]">No job assigned</p>
                      <button onClick={() => { setAssignModal(true); setAssignForm(f => ({ ...f, machine_id: m.machine_id })) }}
                        className="mt-2 text-xs text-[var(--color-accent)] hover:underline flex items-center gap-1 mx-auto">
                        <Plus size={11} /> Assign job
                      </button>
                    </div>
                  ) : (
                    <div className="space-y-3">
                      <div>
                        <Link href={`/dashboard/jobs/${m.job_id}`}
                          className="text-sm font-semibold text-[var(--color-accent)] font-mono hover:underline">
                          {m.job_number}
                        </Link>
                        <p className="text-sm text-[var(--color-text-primary)] mt-0.5 leading-tight">{m.job_title}</p>
                        <p className="text-xs text-[var(--color-text-muted)] mt-0.5">{m.customer_name}</p>
                      </div>
                      <div className="flex items-center gap-3 text-xs flex-wrap">
                        {priorityCfg && <span className={cn('font-medium', priorityCfg.color)}>{priorityCfg.label}</span>}
                        {m.stage_name && (
                          <span className="text-[var(--color-text-muted)] flex items-center gap-1"><Layers size={10} />{m.stage_name}</span>
                        )}
                        {m.operator_name && (
                          <span className="text-[var(--color-text-muted)] flex items-center gap-1"><User size={10} />{m.operator_name}</span>
                        )}
                        {isRunning && elapsed > 0 && (
                          <span className="text-[var(--color-text-muted)] flex items-center gap-1"><Clock size={10} />{formatMins(elapsed)}</span>
                        )}
                      </div>

                      {/* Quick action buttons */}
                      {m.assignment_id && (() => {
                        const asgn = [...active, ...queue].find(a => a.id === m.assignment_id)
                        if (!asgn) return null
                        return (
                          <div className="flex items-center gap-1.5 flex-wrap pt-1 border-t border-[var(--color-border-subtle)]">
                            {asgn.status === 'queued' && (
                              <button onClick={() => setActionModal({ assignment: asgn, action: 'start' })}
                                className="flex items-center gap-1 px-2.5 h-7 rounded-md bg-[var(--color-success)] text-white text-xs font-medium hover:opacity-90 transition-colors">
                                <Play size={11} /> Start
                              </button>
                            )}
                            {asgn.status === 'running' && <>
                              <button onClick={() => setActionModal({ assignment: asgn, action: 'pause' })}
                                className="flex items-center gap-1 px-2.5 h-7 rounded-md border border-[var(--color-warning)]/40 text-xs text-[var(--color-warning)] hover:bg-[var(--color-warning)]/10 transition-colors">
                                <Pause size={11} /> Pause
                              </button>
                              <button onClick={() => setActionModal({ assignment: asgn, action: 'complete' })}
                                className="flex items-center gap-1 px-2.5 h-7 rounded-md bg-[var(--color-success)] text-white text-xs font-medium hover:opacity-90 transition-colors">
                                <CheckCircle2 size={11} /> Done
                              </button>
                              <button onClick={() => setActionModal({ assignment: asgn, action: 'issue' })}
                                className="flex items-center gap-1 px-2 h-7 rounded-md border border-[var(--color-danger)]/30 text-xs text-[var(--color-danger)] hover:bg-[var(--color-danger)]/10 transition-colors">
                                <AlertTriangle size={11} />
                              </button>
                            </>}
                            {asgn.status === 'paused' && (
                              <button onClick={() => setActionModal({ assignment: asgn, action: 'resume' })}
                                className="flex items-center gap-1 px-2.5 h-7 rounded-md bg-[var(--color-warning)] text-white text-xs font-medium hover:opacity-90 transition-colors">
                                <Play size={11} /> Resume
                              </button>
                            )}
                            <button onClick={() => setActionModal({ assignment: asgn, action: 'note' })}
                              className="flex items-center gap-1 px-2 h-7 rounded-md border border-[var(--color-border)] text-xs text-[var(--color-text-muted)] hover:bg-[var(--color-bg-elevated)] transition-colors ml-auto">
                              <MessageSquare size={11} />
                            </button>
                          </div>
                        )
                      })()}
                    </div>
                  )}
                </div>
              </div>
            )
          })}
        </div>
      )}

      {/* ── RUNNING TAB ──────────────────────────────────────────────────────── */}
      {tab === 'running' && (
        <AssignmentTable
          assignments={active}
          onAction={(a, action) => { setActionModal({ assignment: a, action }); setActionNotes(''); setActionQty('') }}
          emptyText="No jobs currently running"
          emptyIcon={<Activity size={28} className="text-[var(--color-text-muted)] opacity-30 mx-auto mb-2" />}
          showElapsed
        />
      )}

      {/* ── QUEUE TAB ────────────────────────────────────────────────────────── */}
      {tab === 'queue' && (
        <AssignmentTable
          assignments={queue}
          onAction={(a, action) => { setActionModal({ assignment: a, action }); setActionNotes(''); setActionQty('') }}
          emptyText="Queue is empty"
          emptyIcon={<Layers size={28} className="text-[var(--color-text-muted)] opacity-30 mx-auto mb-2" />}
        />
      )}

      {/* ── ASSIGN MODAL ─────────────────────────────────────────────────────── */}
      <Modal open={assignModal} onClose={() => setAssignModal(false)} title="Assign Job to Machine" size="md"
        footer={
          <>
            <button onClick={() => setAssignModal(false)} className="px-4 h-9 rounded-md border border-[var(--color-border)] text-sm text-[var(--color-text-secondary)] hover:bg-[var(--color-bg-elevated)] transition-colors">Cancel</button>
            <button onClick={assign} disabled={loading || !assignForm.job_id || !assignForm.machine_id}
              className="flex items-center gap-2 px-4 h-9 rounded-md bg-[var(--color-accent)] text-white text-sm font-medium hover:bg-[var(--color-accent-hover)] disabled:opacity-50 transition-colors">
              <Cpu size={14} /> {loading ? 'Assigning…' : 'Assign to Machine'}
            </button>
          </>
        }>
        <div className="space-y-4">
          <div className="space-y-1.5">
            <label className="text-sm font-medium text-[var(--color-text-primary)]">Job <span className="text-[var(--color-danger)]">*</span></label>
            <select className={inputCls} value={assignForm.job_id} onChange={e => setAssignForm(p => ({ ...p, job_id: e.target.value, stage_progress_id: '' }))}>
              <option value="">Select job…</option>
              {pendingJobs.map(j => <option key={j.id} value={j.id}>{j.job_number} — {j.job_title} ({j.customers?.name})</option>)}
            </select>
          </div>

          {pendingStages.length > 0 && (
            <div className="space-y-1.5">
              <label className="text-sm font-medium text-[var(--color-text-primary)]">Stage (optional)</label>
              <select className={inputCls} value={assignForm.stage_progress_id} onChange={e => setAssignForm(p => ({ ...p, stage_progress_id: e.target.value }))}>
                <option value="">No specific stage</option>
                {pendingStages.map(s => (
                  <option key={s.id} value={s.id}>
                    {s.sequence_order}. {s.workflow_stages?.name} ({s.status})
                  </option>
                ))}
              </select>
            </div>
          )}

          <div className="space-y-1.5">
            <label className="text-sm font-medium text-[var(--color-text-primary)]">Machine <span className="text-[var(--color-danger)]">*</span></label>
            <select className={inputCls} value={assignForm.machine_id} onChange={e => setAssignForm(p => ({ ...p, machine_id: e.target.value }))}>
              <option value="">Select machine…</option>
              {allMachines.filter(m => !m.assignment_status || m.assignment_status === 'queued').map(m => (
                <option key={m.machine_id} value={m.machine_id}>
                  {m.machine_name} ({m.machine_type?.replace('_',' ')}) {m.assignment_status ? '— Queued' : '— Idle'}
                </option>
              ))}
            </select>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <label className="text-sm font-medium text-[var(--color-text-primary)]">Operator</label>
              <select className={inputCls} value={assignForm.operator_id} onChange={e => setAssignForm(p => ({ ...p, operator_id: e.target.value }))}>
                <option value="">Unassigned</option>
                {operators.map(op => <option key={op.id} value={op.id}>{op.full_name}{op.employee_code ? ` (${op.employee_code})` : ''}</option>)}
              </select>
            </div>
            <div className="space-y-1.5">
              <label className="text-sm font-medium text-[var(--color-text-primary)]">Estimated Time (mins)</label>
              <input type="number" className={inputCls} value={assignForm.estimated_minutes}
                onChange={e => setAssignForm(p => ({ ...p, estimated_minutes: e.target.value }))} placeholder="e.g. 120" />
            </div>
          </div>

          <div className="space-y-1.5">
            <label className="text-sm font-medium text-[var(--color-text-primary)]">Scheduled Start</label>
            <input type="datetime-local" className={inputCls} value={assignForm.scheduled_start}
              onChange={e => setAssignForm(p => ({ ...p, scheduled_start: e.target.value }))} />
          </div>

          <div className="space-y-1.5">
            <label className="text-sm font-medium text-[var(--color-text-primary)]">Notes</label>
            <input className={inputCls} value={assignForm.notes} onChange={e => setAssignForm(p => ({ ...p, notes: e.target.value }))} placeholder="Special instructions…" />
          </div>
        </div>
      </Modal>

      {/* ── ACTION MODAL ─────────────────────────────────────────────────────── */}
      {actionModal && (
        <Modal open={true} onClose={() => setActionModal(null)}
          title={
            actionModal.action === 'start'    ? '▶ Start Production' :
            actionModal.action === 'pause'    ? '⏸ Pause Job' :
            actionModal.action === 'resume'   ? '▶ Resume Job' :
            actionModal.action === 'complete' ? '✅ Mark Complete' :
            actionModal.action === 'issue'    ? '⚠️ Report Issue' :
                                               '💬 Add Note'
          }
          size="sm"
          footer={
            <>
              <button onClick={() => setActionModal(null)} className="px-4 h-9 rounded-md border border-[var(--color-border)] text-sm text-[var(--color-text-secondary)] hover:bg-[var(--color-bg-elevated)] transition-colors">Cancel</button>
              <button onClick={applyAction} disabled={loading}
                className={cn('px-4 h-9 rounded-md text-white text-sm font-medium disabled:opacity-50 transition-colors',
                  actionModal.action === 'complete' ? 'bg-[var(--color-success)] hover:opacity-90' :
                  actionModal.action === 'issue'    ? 'bg-[var(--color-danger)] hover:opacity-90' :
                  actionModal.action === 'pause'    ? 'bg-[var(--color-warning)] hover:opacity-90' :
                                                     'bg-[var(--color-accent)] hover:bg-[var(--color-accent-hover)]')}>
                {loading ? 'Saving…' : 'Confirm'}
              </button>
            </>
          }>
          <div className="space-y-3">
            <div className="rounded-lg bg-[var(--color-bg-elevated)] border border-[var(--color-border)] p-3 text-sm">
              <span className="font-semibold text-[var(--color-accent)]">{actionModal.assignment.jobs?.job_number}</span>
              <span className="text-[var(--color-text-primary)] ml-2">{actionModal.assignment.jobs?.job_title}</span>
              <p className="text-xs text-[var(--color-text-muted)] mt-0.5">{actionModal.assignment.machines?.name}</p>
            </div>

            {actionModal.action === 'complete' && (
              <div className="space-y-1.5">
                <label className="text-sm font-medium text-[var(--color-text-primary)]">Quantity Completed</label>
                <input type="number" className={inputCls} value={actionQty} onChange={e => setActionQty(e.target.value)}
                  placeholder={String(actionModal.assignment.jobs?.quantity ?? '')} />
              </div>
            )}

            <div className="space-y-1.5">
              <label className="text-sm font-medium text-[var(--color-text-primary)]">
                {actionModal.action === 'issue' ? 'Issue Description *' : 'Notes (optional)'}
              </label>
              <input className={inputCls} value={actionNotes} onChange={e => setActionNotes(e.target.value)}
                placeholder={
                  actionModal.action === 'pause'    ? 'Reason for pausing…' :
                  actionModal.action === 'issue'    ? 'Describe the problem…' :
                  actionModal.action === 'complete' ? 'Any finishing notes…' : 'Notes…'
                } />
            </div>
          </div>
        </Modal>
      )}
    </div>
  )
}

// ── Reusable assignment table ─────────────────────────────────────────────────
function AssignmentTable({
  assignments, onAction, emptyText, emptyIcon, showElapsed
}: {
  assignments: Assignment[]
  onAction: (a: Assignment, action: 'start'|'pause'|'resume'|'complete'|'note'|'issue') => void
  emptyText: string; emptyIcon: React.ReactNode; showElapsed?: boolean
}) {
  const [expanded, setExpanded] = useState<Set<string>>(new Set())
  const toggle = (id: string) => setExpanded(p => { const n = new Set(p); n.has(id) ? n.delete(id) : n.add(id); return n })

  if (assignments.length === 0) {
    return (
      <div className="rounded-xl border border-[var(--color-border)] bg-[var(--color-bg-secondary)] p-12 text-center">
        {emptyIcon}
        <p className="text-sm text-[var(--color-text-muted)]">{emptyText}</p>
      </div>
    )
  }

  return (
    <div className="rounded-xl border border-[var(--color-border)] bg-[var(--color-bg-secondary)] overflow-hidden">
      <div className="grid grid-cols-12 gap-3 px-5 py-2.5 bg-[var(--color-bg-elevated)] border-b border-[var(--color-border)] text-xs font-semibold text-[var(--color-text-muted)] uppercase tracking-wider">
        <div className="col-span-1" />
        <div className="col-span-2">Job</div>
        <div className="col-span-3">Title</div>
        <div className="col-span-2">Machine</div>
        <div className="col-span-2">Operator</div>
        <div className="col-span-2 text-right">Actions</div>
      </div>
      <div className="divide-y divide-[var(--color-border-subtle)]">
        {assignments.map((a, idx) => {
          const priorityCfg = JOB_PRIORITY_CONFIG[a.jobs?.priority as keyof typeof JOB_PRIORITY_CONFIG] || JOB_PRIORITY_CONFIG.normal
          const elapsed = showElapsed ? elapsedMins(a.actual_start) : 0
          const isOpen = expanded.has(a.id)
          return (
            <div key={a.id}>
              <div className={cn('grid grid-cols-12 gap-3 px-5 py-3.5 items-center', idx % 2 === 1 && 'bg-[var(--color-bg-elevated)]/15')}>
                <div className="col-span-1">
                  <button onClick={() => toggle(a.id)} className="text-[var(--color-text-muted)]">
                    {isOpen ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
                  </button>
                </div>
                <div className="col-span-2">
                  <Link href={`/dashboard/jobs/${a.job_id}`} className="text-xs font-mono text-[var(--color-accent)] hover:underline">{a.jobs?.job_number}</Link>
                  <p className={cn('text-xs mt-0.5 font-medium', priorityCfg.color)}>{priorityCfg.label}</p>
                </div>
                <div className="col-span-3 min-w-0">
                  <p className="text-sm text-[var(--color-text-primary)] truncate">{a.jobs?.job_title}</p>
                  <p className="text-xs text-[var(--color-text-muted)] truncate">{a.jobs?.customers?.name}</p>
                </div>
                <div className="col-span-2">
                  <p className="text-sm text-[var(--color-text-primary)]">{a.machines?.name}</p>
                  <p className="text-xs text-[var(--color-text-muted)] capitalize">{a.machines?.machine_type?.replace('_',' ')}</p>
                </div>
                <div className="col-span-2">
                  <p className="text-xs text-[var(--color-text-secondary)]">{a.users?.full_name || '—'}</p>
                  {showElapsed && elapsed > 0 && (
                    <p className="text-xs text-[var(--color-text-muted)] flex items-center gap-1"><Clock size={9} />{formatMins(elapsed)}</p>
                  )}
                </div>
                <div className="col-span-2 flex items-center gap-1 justify-end">
                  {a.status === 'queued' && (
                    <button onClick={() => onAction(a, 'start')}
                      className="flex items-center gap-1 px-2.5 h-7 rounded bg-[var(--color-success)] text-white text-xs font-medium hover:opacity-90 transition-colors">
                      <Play size={10} /> Start
                    </button>
                  )}
                  {a.status === 'running' && <>
                    <button onClick={() => onAction(a, 'pause')}
                      className="flex items-center gap-1 px-2 h-7 rounded border border-[var(--color-warning)]/40 text-xs text-[var(--color-warning)] hover:bg-[var(--color-warning)]/10 transition-colors">
                      <Pause size={10} />
                    </button>
                    <button onClick={() => onAction(a, 'complete')}
                      className="flex items-center gap-1 px-2.5 h-7 rounded bg-[var(--color-success)] text-white text-xs font-medium hover:opacity-90 transition-colors">
                      <CheckCircle2 size={10} /> Done
                    </button>
                  </>}
                  {a.status === 'paused' && (
                    <button onClick={() => onAction(a, 'resume')}
                      className="flex items-center gap-1 px-2.5 h-7 rounded bg-[var(--color-warning)] text-white text-xs font-medium hover:opacity-90 transition-colors">
                      <Play size={10} /> Resume
                    </button>
                  )}
                  <button onClick={() => onAction(a, 'note')}
                    className="flex items-center gap-1 px-2 h-7 rounded border border-[var(--color-border)] text-xs text-[var(--color-text-muted)] hover:bg-[var(--color-bg-elevated)] transition-colors">
                    <MessageSquare size={10} />
                  </button>
                </div>
              </div>
              {isOpen && (
                <div className="px-10 py-2.5 bg-[var(--color-bg-elevated)]/30 border-t border-[var(--color-border-subtle)] text-xs text-[var(--color-text-muted)] space-y-1">
                  {a.actual_start && <p>Started: {formatDateTime(a.actual_start)}</p>}
                  {a.estimated_minutes && <p>Estimated: {formatMins(a.estimated_minutes)}</p>}
                  {a.notes && <p className="italic">{a.notes}</p>}
                </div>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}
