import type { SupabaseClient } from '@supabase/supabase-js'

export interface StageGateResult {
  blocked: boolean
  reason?: string
}

/**
 * Determines whether a job's workflow stage is allowed to move (start /
 * complete / skip) right now. Feature 4 (Intelligent Manufacturing
 * Workflow Automation) — hybrid rule, additive over the original
 * hard-sequential gate rather than replacing it:
 *
 *   1. If workflow_stage_dependencies has explicit rows for this stage,
 *      those rows are authoritative — check each one:
 *        'stage_complete' — the depended-on stage must be completed/skipped
 *        'stage_started'  — the depended-on stage must be in_progress,
 *                            completed, or skipped (skipped still counts —
 *                            a skipped stage was never going to block
 *                            anything downstream either way)
 *   2. If NO explicit rows exist for this stage, fall back to the
 *      ORIGINAL rule: every earlier sequence_order stage in this job must
 *      be completed or skipped. This is what keeps every
 *      not-explicitly-configured stage behaving exactly as it did before
 *      Feature 4 — only the stages Mehboob asked to overlap (Die Cutting
 *      on Printing start, Pasting on Die Cutting start) get explicit rows,
 *      seeded in migration 083.
 *
 * Used by both /api/v1/jobs/[id]/workflow (the normal staff-driven PATCH)
 * and anywhere else that needs to ask "can this stage move right now" —
 * e.g. the production-assignment scheduler.
 */
export async function checkStageGate(
  supabase: SupabaseClient,
  companyId: string,
  jobId: string,
  workflowStageId: string,
  sequenceOrder: number,
  targetStageName: string
): Promise<StageGateResult> {
  const { data: deps } = await supabase
    .from('workflow_stage_dependencies' as any)
    .select('depends_on_stage_id, dependency_type')
    .eq('company_id', companyId)
    .eq('workflow_stage_id', workflowStageId)
    .is('deleted_at', null)
    .eq('is_active', true)

  const depRows = (deps ?? []) as any[]

  if (depRows.length > 0) {
    const dependsOnIds = depRows.map(d => d.depends_on_stage_id)
    const { data: dependsOnProgress } = await supabase
      .from('job_stage_progress' as any)
      .select('workflow_stage_id, status, workflow_stages(name)')
      .eq('job_id', jobId).eq('company_id', companyId)
      .in('workflow_stage_id', dependsOnIds)

    const byStageId = new Map(((dependsOnProgress ?? []) as any[]).map(r => [r.workflow_stage_id, r]))
    const unmet: string[] = []
    for (const dep of depRows) {
      const row = byStageId.get(dep.depends_on_stage_id)
      const status = row?.status ?? 'pending'
      const ok = dep.dependency_type === 'stage_started'
        ? ['in_progress', 'completed', 'skipped'].includes(status)
        : ['completed', 'skipped'].includes(status)
      if (!ok) unmet.push(row?.workflow_stages?.name || 'a required stage')
    }
    if (unmet.length > 0) {
      return { blocked: true, reason: `Cannot update "${targetStageName}" — waiting on: ${unmet.join(', ')}` }
    }
    return { blocked: false }
  }

  // Fallback: original full-sequential rule (unchanged from before Feature 4).
  const { data: earlierStages } = await supabase
    .from('job_stage_progress' as any)
    .select('status, workflow_stages(name)')
    .eq('job_id', jobId).eq('company_id', companyId)
    .lt('sequence_order', sequenceOrder)

  const blocking = ((earlierStages ?? []) as any[]).filter(s => !['completed', 'skipped'].includes(s.status))
  if (blocking.length > 0) {
    const names = blocking.map(s => s.workflow_stages?.name || 'a previous stage').join(', ')
    return { blocked: true, reason: `Cannot update "${targetStageName}" — earlier stage(s) not yet finished: ${names}` }
  }
  return { blocked: false }
}
