import type { SupabaseClient } from '@supabase/supabase-js'

/**
 * Recomputes jobs.current_stage_id — the single answer to "yeh job abhi kis
 * stage par hai".
 *
 * Before this existed the column was only ever written once, on the very
 * first stage start (and only while jobs.status was still 'new'), so from the
 * second stage onwards it pointed at a stage that had long since completed.
 * Nothing in the UI read it, which is exactly why the drift went unnoticed —
 * the Jobs list / queue work that needs a trustworthy "current stage" is
 * built on top of this.
 *
 * The rule: whichever live stage the shop is actually standing on —
 *   · a stage that is in_progress wins (lowest sequence_order if several
 *     overlap, which they legitimately can — Die Cutting is configured to
 *     start on Printing's start, not its completion)
 *   · otherwise the earliest pending stage — the one that is next up
 *   · nothing pending or in progress left → NULL, the job is through its
 *     workflow
 *
 * Best-effort by design: callers use it as a bookkeeping step after the real
 * stage transition has already been persisted, so a failure here must never
 * fail the request.
 */
export async function syncJobCurrentStage(
  supabase: SupabaseClient,
  companyId: string,
  jobId: string
): Promise<void> {
  const { data: rows } = await supabase
    .from('job_stage_progress' as any)
    .select('id, status, sequence_order')
    .eq('job_id', jobId)
    .eq('company_id', companyId)
    .in('status', ['in_progress', 'pending'])
    .eq('is_active', true)
    .order('sequence_order')

  const live = (rows ?? []) as any[]
  const current = live.find(r => r.status === 'in_progress') ?? live[0] ?? null

  await supabase
    .from('jobs' as any)
    .update({ current_stage_id: current?.id ?? null })
    .eq('id', jobId)
    .eq('company_id', companyId)
}

export default syncJobCurrentStage
