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
  const byJob = new Map<string, string>()
  if (jobIds.length === 0) return byJob

  const { data } = await supabase.from('job_plans' as any)
    .select('job_id, planned_date, status')
    .eq('company_id', companyId)
    .in('job_id', jobIds)
    .is('deleted_at', null)
    .neq('status', 'cancelled')
    .order('planned_date')

  for (const p of ((data ?? []) as any[])) {
    if (!byJob.has(p.job_id)) byJob.set(p.job_id, p.planned_date)
  }
  return byJob
}

export default getPlannedDates
