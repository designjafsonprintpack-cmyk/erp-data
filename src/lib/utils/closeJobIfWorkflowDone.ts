import type { SupabaseClient } from '@supabase/supabase-js'

/**
 * Closes a job once every stage of its workflow is completed or skipped.
 *
 * Until this existed, nothing ever moved a job out of 'in_progress': the
 * workflow route only handled 'new' → 'in_progress' on the first start. So a
 * job that had been through Dispatch still counted as work in progress
 * forever — it stayed in the Jobs list's In Progress tab, kept showing up in
 * the QC and Dispatch job dropdowns, and skewed every "how many jobs are
 * running" figure on the dashboard.
 *
 * `jobs.completed_date` gets stamped at the same time. That column has existed
 * since migration 014 and the turnaround-time reporting view (migration 020)
 * is built on it, but nothing ever wrote to it — so those report columns were
 * blank for every job.
 *
 * Deliberately narrow:
 *   · only fires when NO stage is left pending or in progress, and the job
 *     actually has stages (a job with no workflow template is never "done")
 *   · only moves a job that is 'new' or 'in_progress' — never touches
 *     cancelled, already-completed, or 'dispatched' (the dispatch module owns
 *     that transition, and it reads 'completed' as its valid starting point)
 *   · completed_date is only stamped if it wasn't already set
 *
 * Returns true if it closed the job, so the caller can report it.
 */
export async function closeJobIfWorkflowDone(
  supabase: SupabaseClient,
  companyId: string,
  jobId: string
): Promise<boolean> {
  const base = () => supabase.from('job_stage_progress' as any)
    .select('*', { count: 'exact', head: true })
    .eq('job_id', jobId)
    .eq('company_id', companyId)
    .eq('is_active', true)

  const [{ count: liveCount }, { count: totalCount }] = await Promise.all([
    base().in('status', ['pending', 'in_progress']),
    base(),
  ])

  if ((totalCount ?? 0) === 0) return false
  if ((liveCount ?? 0) > 0) return false

  const { data: job } = await supabase.from('jobs' as any)
    .select('status, completed_date')
    .eq('id', jobId).eq('company_id', companyId)
    .maybeSingle()

  const current = (job as any)?.status
  if (!current || !['new', 'in_progress'].includes(current)) return false

  const update: Record<string, any> = { status: 'completed' }
  if (!(job as any).completed_date) {
    update.completed_date = new Date().toISOString().slice(0, 10)
  }

  const { error } = await supabase.from('jobs' as any)
    .update(update)
    .eq('id', jobId)
    .eq('company_id', companyId)
    .in('status', ['new', 'in_progress'])

  return !error
}

export default closeJobIfWorkflowDone
