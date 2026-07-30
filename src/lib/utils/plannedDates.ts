import type { SupabaseClient } from '@supabase/supabase-js'

/**
 * job_id → the date this job is planned for, for a batch of jobs.
 *
 * Earliest live (non-cancelled) plan wins: a job normally has one, and if it
 * was re-planned the nearest date is the one the floor cares about. Past dates
 * are kept deliberately — a job planned for last week isn't unplanned, it's
 * late, and every queue says so.
 *
 * Shared by the stage queues, the Plates page and the Store page so "planned
 * for kab" means the same thing everywhere.
 */
export async function getPlannedDates(
  supabase: SupabaseClient,
  companyId: string,
  jobIds: string[]
): Promise<Map<string, string>> {
  const slots = await getPlannedSlots(supabase, companyId, jobIds)
  const byJob = new Map<string, string>()
  slots.forEach((slot, jobId) => byJob.set(jobId, slot.date))
  return byJob
}

export interface PlannedSlot {
  date: string
  /**
   * Running order within that date (job_plans.day_order, migration 112). 0 means
   * the plan predates any shuffle and nothing has sequenced it.
   */
  order: number
}

/**
 * The same "earliest live plan wins" rule as getPlannedDates, but returning the
 * running order with the date.
 *
 * Kept as a separate function rather than changing getPlannedDates' return type:
 * that one is shared by the Plates, Store, Dispatch and QC pages, none of which
 * care about the order, and widening it would have churned four call sites for
 * nothing. Only loadStageQueue uses this.
 */
export async function getPlannedSlots(
  supabase: SupabaseClient,
  companyId: string,
  jobIds: string[]
): Promise<Map<string, PlannedSlot>> {
  const byJob = new Map<string, PlannedSlot>()
  if (jobIds.length === 0) return byJob

  const { data, error } = await supabase.from('job_plans' as any)
    .select('job_id, planned_date, day_order, status')
    .eq('company_id', companyId)
    .in('job_id', jobIds)
    .is('deleted_at', null)
    .neq('status', 'cancelled')
    .order('planned_date').order('day_order').order('id')

  // Not swallowed into an empty map — that would read as "nothing is planned"
  // and quietly strip the date off every queue card.
  if (error) throw new Error(`Could not read planned dates: ${error.message}`)

  for (const p of ((data ?? []) as any[])) {
    if (!byJob.has(p.job_id)) byJob.set(p.job_id, { date: p.planned_date, order: p.day_order ?? 0 })
  }
  return byJob
}

export default getPlannedDates
