import type { SupabaseClient } from '@supabase/supabase-js'
import { getPlannedDates } from './plannedDates'

export interface JobAwaitingQC {
  job_id: string
  job_number: string
  job_title: string
  customer_name: string | null
  priority: string
  quantity: number | null
  planned_date: string | null
  required_date: string | null
  /** 'pending' — QC hasn't been started; 'in_progress' — it has. */
  stage_status: string
  /** Latest inspection result for this job, if any: pass / fail / conditional_pass. */
  last_result: string | null
}

/**
 * "Kis job ka QC baqi hai" — every live job standing at the QC stage that does
 * not yet have a passing inspection.
 *
 * Migration 092 made QC a real workflow stage and the workflow route now blocks
 * completing it without a passing inspection. This is the other half: the list
 * that shows whose lot is waiting, so the gate is something the shop can see
 * coming rather than an error it hits at the end.
 *
 * A job with a failed inspection stays on the list — it needs a re-inspection or
 * a reprint, and either way QC still owns it.
 */
export async function loadJobsAwaitingQC(
  supabase: SupabaseClient,
  companyId: string
): Promise<JobAwaitingQC[]> {
  const { data: stageRows } = await supabase.from('job_stage_progress' as any)
    .select('job_id, status, workflow_stages!inner(name, stage_type), jobs!inner(job_number, job_title, priority, quantity, required_date, status, deleted_at, customers(name))')
    .eq('company_id', companyId)
    .in('status', ['pending', 'in_progress'])
    .eq('is_active', true)

  const candidates = ((stageRows ?? []) as any[]).filter(r => {
    if (!r.jobs || r.jobs.deleted_at) return false
    if (!['new', 'in_progress', 'completed'].includes(r.jobs.status)) return false
    const type = r.workflow_stages?.stage_type
    const name = (r.workflow_stages?.name ?? '').trim().toLowerCase()
    return type === 'qc' || name === 'quality check' || name === 'qc'
  })

  if (candidates.length === 0) return []

  const jobIds = Array.from(new Set(candidates.map(r => r.job_id)))

  const [{ data: inspections }, plannedDates] = await Promise.all([
    supabase.from('qc_inspections' as any)
      .select('job_id, result, created_at')
      .eq('company_id', companyId)
      .in('job_id', jobIds)
      .is('deleted_at', null)
      .order('created_at', { ascending: false }),
    getPlannedDates(supabase, companyId, jobIds),
  ])

  const rows = (inspections ?? []) as any[]
  const passedJobs = new Set(
    rows.filter(i => i.result === 'pass' || i.result === 'conditional_pass').map(i => i.job_id)
  )
  const latestResult = new Map<string, string>()
  for (const i of rows) {
    if (!latestResult.has(i.job_id) && i.result) latestResult.set(i.job_id, i.result)
  }

  const pending = candidates.filter(r => !passedJobs.has(r.job_id))
  if (pending.length === 0) return []

  const out: JobAwaitingQC[] = pending.map(r => ({
    job_id: r.job_id,
    job_number: r.jobs.job_number,
    job_title: r.jobs.job_title,
    customer_name: r.jobs.customers?.name ?? null,
    priority: r.jobs.priority,
    quantity: r.jobs.quantity ?? null,
    planned_date: plannedDates.get(r.job_id) ?? null,
    required_date: r.jobs.required_date ?? null,
    stage_status: r.status,
    last_result: latestResult.get(r.job_id) ?? null,
  }))

  // A failed inspection first — that lot is stuck and someone has to decide.
  const rank = (r: JobAwaitingQC) => (r.last_result === 'fail' ? 0 : 1)
  const key = (r: JobAwaitingQC) => r.required_date ?? r.planned_date ?? '9999-12-31'
  out.sort((a, b) => (rank(a) - rank(b)) || key(a).localeCompare(key(b)))

  return out
}

export default loadJobsAwaitingQC
