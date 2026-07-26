'use client'
import { useState } from 'react'
import { RefreshCw } from 'lucide-react'
import { useStageQueue } from '@/components/production/useStageQueue'
import { QueueBoard } from '@/components/production/QueueBoard'

interface Department { id: string; name: string; code: string }

export default function DepartmentQueueClient({ departments, initialDepartmentId }: { departments: Department[]; initialDepartmentId: string }) {
  // No department on the user (owner / admin / superadmin, or simply not set)
  // → show the whole plant rather than silently landing on whichever
  // department happens to sort first and looking empty.
  const [departmentId, setDepartmentId] = useState(initialDepartmentId || 'all')
  const { ready, blocked, inProgress, loading, actingOn, reload, act } =
    useStageQueue(`/api/v1/production/department-queue?department_id=${departmentId}`)

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3">
        <select value={departmentId} onChange={e => setDepartmentId(e.target.value)}
          className="h-11 md:h-8 px-3 md:px-2.5 rounded-md border text-sm md:text-xs bg-[var(--color-bg-elevated)] text-[var(--color-text-primary)] border-[var(--color-border)] flex-1 md:flex-none min-w-0">
          <option value="all">All departments</option>
          {departments.map(d => <option key={d.id} value={d.id}>{d.name}</option>)}
        </select>
        <button onClick={reload} disabled={loading}
          className="flex items-center gap-1.5 h-11 md:h-8 px-3 md:px-2.5 rounded-md border border-[var(--color-border)] text-xs text-[var(--color-text-secondary)] hover:bg-[var(--color-bg-elevated)] transition-colors disabled:opacity-50">
          <RefreshCw size={14} className={loading ? 'animate-spin' : ''} /> Refresh
        </button>
      </div>

      <QueueBoard
        ready={ready} blocked={blocked} inProgress={inProgress}
        loading={loading} actingOn={actingOn} onAct={act}
        showDepartment={departmentId === 'all'}
        emptyTitle="Nothing in this queue"
        emptyDescription={departmentId === 'all'
          ? 'No job is sitting at any workflow stage right now — either everything is finished, or jobs are being created without a workflow template.'
          : 'No job is at a stage this department owns. If that looks wrong, check Settings > Workflow Engine — a stage with no department assigned never shows up here.'}
      />
    </div>
  )
}

export { DepartmentQueueClient }
