'use client'
import { useState } from 'react'
import Link from 'next/link'
import { Cog, ArrowLeft } from 'lucide-react'
import { cn } from '@/lib/utils/cn'

interface MachineJob {
  job_id: string
  job_number: string
  job_title: string
  customer_name: string | null
  assignment_status: string
  stage_name: string | null
}

interface Machine {
  machine_id: string
  machine_name: string
  machine_type: string
  jobs: MachineJob[]
}

interface RecentJob {
  id: string
  job_number: string
  job_title: string
  status: string
  priority: string
  created_at: string
  customers: { name: string } | null
}

const STATUS_LABEL: Record<string, string> = {
  running: 'Running', queued: 'Queued', paused: 'Paused',
  new: 'New', in_progress: 'In Progress', on_hold: 'On Hold',
  completed: 'Completed', dispatched: 'Dispatched', cancelled: 'Cancelled',
}

export default function DashboardMachinesPanel({ machines, recentJobs }: { machines: Machine[]; recentJobs: RecentJob[] }) {
  const [selectedMachineId, setSelectedMachineId] = useState<string | null>(null)

  const selectedMachine = machines.find(m => m.machine_id === selectedMachineId) || null

  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
      {/* Machines */}
      <div className="rounded-xl border border-[var(--color-border)] bg-[var(--color-bg-secondary)] overflow-hidden">
        <div className="px-4 py-3 border-b border-[var(--color-border)] bg-[var(--color-bg-elevated)]">
          <span className="text-sm font-semibold text-[var(--color-text-primary)]">Machines</span>
        </div>
        <div className="p-4 grid grid-cols-2 sm:grid-cols-3 gap-2.5">
          {machines.length === 0 && (
            <div className="col-span-full text-center text-sm text-[var(--color-text-muted)] py-4">No machines configured yet.</div>
          )}
          {machines.map(m => {
            const jobCount = m.jobs.length
            const isSelected = selectedMachineId === m.machine_id
            return (
              <button
                key={m.machine_id}
                onClick={() => setSelectedMachineId(isSelected ? null : m.machine_id)}
                className={cn(
                  'text-left rounded-lg border p-3 transition-all duration-150',
                  isSelected
                    ? 'border-[var(--color-accent)] bg-[var(--color-accent)]/10'
                    : 'border-[var(--color-border)] bg-[var(--color-bg-elevated)] hover:border-[var(--color-border-subtle)]'
                )}
              >
                <div className="flex items-center justify-between mb-2">
                  <Cog size={14} className={jobCount > 0 ? 'text-[var(--color-success)]' : 'text-[var(--color-text-muted)]'} />
                  {jobCount > 0 ? (
                    <span className="text-xs font-semibold text-[var(--color-success)] bg-[var(--color-success)]/10 px-1.5 py-0.5 rounded-full">
                      {jobCount} job{jobCount > 1 ? 's' : ''}
                    </span>
                  ) : (
                    <span className="text-xs text-[var(--color-text-muted)]">Idle</span>
                  )}
                </div>
                <div className="text-sm font-medium text-[var(--color-text-primary)] truncate">{m.machine_name}</div>
              </button>
            )
          })}
        </div>
      </div>

      {/* Recent Jobs / Machine Jobs */}
      <div className="rounded-xl border border-[var(--color-border)] bg-[var(--color-bg-secondary)] overflow-hidden">
        <div className="px-4 py-3 border-b border-[var(--color-border)] bg-[var(--color-bg-elevated)] flex items-center gap-2">
          {selectedMachine ? (
            <>
              <button onClick={() => setSelectedMachineId(null)} className="text-[var(--color-text-muted)] hover:text-[var(--color-text-primary)]">
                <ArrowLeft size={14} />
              </button>
              <span className="text-sm font-semibold text-[var(--color-text-primary)]">Jobs on {selectedMachine.machine_name}</span>
            </>
          ) : (
            <span className="text-sm font-semibold text-[var(--color-text-primary)]">Recent Jobs</span>
          )}
        </div>
        <div className="divide-y divide-[var(--color-border-subtle)] max-h-[320px] overflow-y-auto">
          {selectedMachine ? (
            selectedMachine.jobs.length === 0 ? (
              <div className="text-center text-sm text-[var(--color-text-muted)] py-6">No jobs currently on this machine.</div>
            ) : (
              selectedMachine.jobs.map(j => (
                <Link key={j.job_id} href={`/dashboard/jobs/${j.job_id}`} className="flex items-center justify-between px-4 py-2.5 hover:bg-[var(--color-bg-elevated)]/50 transition-colors">
                  <div className="min-w-0">
                    <div className="text-sm font-medium text-[var(--color-accent)] truncate">{j.job_number}</div>
                    <div className="text-xs text-[var(--color-text-muted)] truncate">{j.job_title} — {j.customer_name || '—'}</div>
                  </div>
                  <span className="text-xs text-[var(--color-text-secondary)] flex-shrink-0 ml-2">{STATUS_LABEL[j.assignment_status] || j.assignment_status}</span>
                </Link>
              ))
            )
          ) : (
            recentJobs.length === 0 ? (
              <div className="text-center text-sm text-[var(--color-text-muted)] py-6">No jobs yet.</div>
            ) : (
              recentJobs.map(j => (
                <Link key={j.id} href={`/dashboard/jobs/${j.id}`} className="flex items-center justify-between px-4 py-2.5 hover:bg-[var(--color-bg-elevated)]/50 transition-colors">
                  <div className="min-w-0">
                    <div className="text-sm font-medium text-[var(--color-accent)] truncate">{j.job_number}</div>
                    <div className="text-xs text-[var(--color-text-muted)] truncate">{j.job_title} — {j.customers?.name || '—'}</div>
                  </div>
                  <span className="text-xs text-[var(--color-text-secondary)] flex-shrink-0 ml-2">{STATUS_LABEL[j.status] || j.status}</span>
                </Link>
              ))
            )
          )}
        </div>
      </div>
    </div>
  )
}
