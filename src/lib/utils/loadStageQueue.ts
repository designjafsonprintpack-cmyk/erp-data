import type { SupabaseClient } from '@supabase/supabase-js'
import { checkStageGate } from './jobStageGate'
import { getPlannedSlots } from './plannedDates'

export interface StageQueueEntry {
  stage_progress_id: string
  job_id: string
  job_number: string
  job_title: string
  customer_name: string | null
  priority: string
  required_date: string | null
  stage_name: string
  started_at: string | null
  planned_date: string | null
  /**
   * The job's running order on its planned day (job_plans.day_order, 112). The
   * queues had no defined job order at all before this — they came back sorted
   * by the stage's own sequence_order, so the operator could not tell which job
   * was meant to run first. null when the job has no live plan.
   */
  plan_order: number | null
  department_name: string | null
  /**
   * Whether this stage may be skipped. Job Detail has always hidden Skip on
   * mandatory stages; the queues offered it on every ready stage, so the same
   * job could be skipped past Printing from the floor but not from its own
   * page. The API allows either — this makes the two screens agree.
   */
  is_optional: boolean
  blocked_reason?: string
}

export interface StageQueue {
  ready: StageQueueEntry[]
  blocked: StageQueueEntry[]
  in_progress: StageQueueEntry[]
}

export interface StageQueueFilter {
  /** Only stages owned by this department. Omit for every department. */
  departmentId?: string | null
  /**
   * Only stages whose name passes this test. Applied in JS rather than SQL
   * because a stage page covers several stage names that don't share a
   * stage_type (Lamination + UV Coating + Varnish), and PostgREST can't OR
   * ilike patterns across an embedded resource without version-specific
   * syntax. The row count here is one per live stage per active job — tens,
   * not thousands — and it runs BEFORE the per-row gate check, so nothing is
   * computed for a stage that gets filtered out.
   */
  stageNameMatch?: (stageName: string) => boolean
}

/**
 * "Kaun sa job is waqt kis stage par khara hai" — the one query behind every
 * work queue in the system, split into Ready to Start / Blocked / In Progress.
 *
 * Shared by /api/v1/production/department-queue (my department's work) and
 * /api/v1/production/stage-queue (one stage's work, e.g. the Printing page),
 * so both stay identical in what they consider ready, what counts as blocked,
 * and what a card shows. Company-scoped by the caller's resolved company_id.
 */
export async function loadStageQueue(
  supabase: SupabaseClient,
  companyId: string,
  filter: StageQueueFilter = {}
): Promise<StageQueue> {
  let query = supabase.from('job_stage_progress' as any)
    .select('id, job_id, sequence_order, workflow_stage_id, status, started_at, workflow_stages!inner(name, department_id, stage_type, is_optional, departments(name)), jobs(job_number, job_title, priority, required_date, customers(name))')
    .eq('company_id', companyId)
    .in('status', ['pending', 'in_progress'])
    .eq('is_active', true)
    .order('sequence_order')

  if (filter.departmentId) query = query.eq('workflow_stages.department_id', filter.departmentId)

  const { data, error } = await query
  if (error) throw new Error(error.message)

  let rows = (data ?? []) as any[]

  // A cancelled/deleted job can still have live job_stage_progress rows if it
  // was never cleaned up — drop them rather than show a card nobody can act on.
  rows = rows.filter(r => r.jobs)

  if (filter.stageNameMatch) {
    const match = filter.stageNameMatch
    rows = rows.filter(r => match(r.workflow_stages?.name ?? ''))
  }

  // Planned date per job, so a queue answers "yeh kab ka plan hai" without
  // anyone opening the Planning page.
  const planByJob = await getPlannedSlots(
    supabase, companyId, Array.from(new Set(rows.map(r => r.job_id)))
  )

  const ready: StageQueueEntry[] = []
  const blocked: StageQueueEntry[] = []
  const inProgress: StageQueueEntry[] = []

  for (const row of rows) {
    const entry: StageQueueEntry = {
      stage_progress_id: row.id,
      job_id: row.job_id,
      job_number: row.jobs.job_number,
      job_title: row.jobs.job_title,
      customer_name: row.jobs.customers?.name || null,
      priority: row.jobs.priority,
      required_date: row.jobs.required_date,
      stage_name: row.workflow_stages?.name || 'Stage',
      started_at: row.started_at,
      planned_date: planByJob.get(row.job_id)?.date ?? null,
      plan_order: planByJob.get(row.job_id)?.order ?? null,
      department_name: row.workflow_stages?.departments?.name ?? null,
      is_optional: row.workflow_stages?.is_optional === true,
    }

    if (row.status === 'in_progress') {
      inProgress.push(entry)
      continue
    }

    const gate = await checkStageGate(
      supabase, companyId, row.job_id, row.workflow_stage_id, row.sequence_order, entry.stage_name
    )
    if (gate.blocked) blocked.push({ ...entry, blocked_reason: gate.reason })
    else ready.push(entry)
  }

  // Planning's running order, carried onto the floor: earliest planned day
  // first, then that day's sequence. A job with no live plan sorts last — it
  // isn't first, it's unplanned. Array.sort is stable, so jobs that tie keep
  // the stage sequence_order they arrived in.
  const byPlan = (a: StageQueueEntry, b: StageQueueEntry) => {
    if (a.planned_date && b.planned_date) {
      return a.planned_date.localeCompare(b.planned_date) ||
             (a.plan_order ?? 0) - (b.plan_order ?? 0)
    }
    if (a.planned_date) return -1
    if (b.planned_date) return 1
    return 0
  }

  return {
    ready: ready.sort(byPlan),
    blocked: blocked.sort(byPlan),
    in_progress: inProgress.sort(byPlan),
  }
}

export default loadStageQueue
