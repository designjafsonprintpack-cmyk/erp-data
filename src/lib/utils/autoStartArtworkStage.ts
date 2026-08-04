import { recordJobEvent } from '@/modules/jobs/services/jobEventService'
import { syncJobCurrentStage } from '@/lib/utils/syncJobCurrentStage'

/**
 * Start a job's Artwork stage by itself, without anyone clicking Start.
 *
 * WHY THIS EXISTS, AND WHY THE TRIGGER MOVED TWICE
 *   It began in `POST /artwork/[id]/approval-link` — generating the customer
 *   approval link was the moment artwork went out. That link was retired
 *   (approval is taken on WhatsApp), so it moved to the status change to
 *   "Waiting Customer Approval", which staff then recorded by hand.
 *
 *   Then uploads started landing straight on `approved` — an upload IS the
 *   approval — so that status can no longer occur and the trigger was dead:
 *   nothing started the stage at all. The real signal is now the UPLOAD, so
 *   that is where this is called from. The PATCH path still calls it too, for
 *   a job whose status is moved by hand.
 *
 * WHAT IT DELIBERATELY DOES NOT DO — COMPLETE THE STAGE
 *   Completing on upload was considered and rejected. A job can carry more
 *   than one DESIGN (migration 124) — a lid and a base, a carton and its
 *   insert — and nothing tells the ERP how many are coming. Completing on the
 *   first upload would march the job into Planning with half its artwork
 *   missing, and would re-open the exact hole 124 was written to close: the
 *   gate requires EVERY design to be approved, and it is only evaluated at
 *   completion time. Complete stays a human act meaning "that is all of them".
 *
 * SAFETY
 *   - Only acts on a stage still `pending`. Started, completed or skipped is
 *     left alone, so a second upload cannot rewrite who started it and when.
 *   - Only if no earlier stage is unfinished — the same hard sequential rule
 *     `/api/v1/jobs/[id]/workflow` enforces. This matters: the Label / Sticker
 *     template runs Planning → Artwork, so Artwork is not always stage 1.
 *   - If blocked it silently does nothing. It must never fail the upload for a
 *     sequencing reason nobody can fix from the artwork screen.
 */
export async function autoStartArtworkStage(
  supabase: any,
  companyId: string,
  jobId: string,
  actorId: string | null,
  note: string,
): Promise<void> {
  const { data: artworkStage, error } = await supabase.from('job_stage_progress' as any)
    .select('id, status, sequence_order, workflow_stages!inner(stage_type)')
    .eq('job_id', jobId).eq('company_id', companyId)
    .in('workflow_stages.stage_type', ['artwork', 'artwork_approval'])
    .maybeSingle()

  // A job with no workflow template (every legacy job) simply has no stage —
  // that is not an error. A real read failure is logged rather than swallowed,
  // because "nothing happened" and "the query broke" look identical otherwise.
  if (error) { console.error('[artwork] auto-start stage lookup failed:', error.message); return }

  const stage = artworkStage as any
  if (!stage || stage.status !== 'pending') return

  const { data: earlierStages } = await supabase.from('job_stage_progress' as any)
    .select('status').eq('job_id', jobId).eq('company_id', companyId)
    .lt('sequence_order', stage.sequence_order)

  const blocked = ((earlierStages ?? []) as any[]).some(e => !['completed', 'skipped'].includes(e.status))
  if (blocked) return

  await supabase.from('job_stage_progress' as any)
    .update({ status: 'in_progress', started_at: new Date().toISOString() })
    .eq('id', stage.id)

  await recordJobEvent({
    company_id: companyId, job_id: jobId,
    event_type: 'stage_started',
    new_value: 'Artwork',
    notes: note,
    stage_id: stage.id, actor_id: actorId,
  }, supabase)

  // Mirrors the "first activity on this job" transition the manual stage-start
  // performs, including the current-stage bookkeeping, so both paths leave the
  // job pointing at the same live stage.
  await supabase.from('jobs' as any)
    .update({ status: 'in_progress' })
    .eq('id', jobId).eq('company_id', companyId)
    .eq('status', 'new')

  await syncJobCurrentStage(supabase, companyId, jobId).catch(() => null)
}

export default autoStartArtworkStage
