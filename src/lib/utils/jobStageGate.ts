import type { SupabaseClient } from '@supabase/supabase-js'
import { fetchAllRows } from './fetchAllRows'

export interface StageGateResult {
  blocked: boolean
  reason?: string
}

/** A dependency row: "this stage waits on that one". */
interface DepRow {
  depends_on_stage_id: string
  dependency_type: string
}

/** One of a job's stage rows, flattened — the embedded stage name lifted out. */
interface ProgressRow {
  workflow_stage_id: string
  sequence_order: number
  status: string
  stage_name: string | null
}

/**
 * Everything the gate rule needs, already read.
 *
 * Built once for a whole queue instead of twice per row — see
 * loadStageGateContext() for the arithmetic that made this necessary.
 */
export interface StageGateContext {
  depsByStage: Map<string, DepRow[]>
  progressByJob: Map<string, ProgressRow[]>
}

/**
 * THE RULE ITSELF, with no database in it.
 *
 * Both entry points below funnel through this, so the batch path and the
 * single-row path cannot drift — the failure mode CLAUDE.md warns about
 * whenever one check gets a "faster copy" living beside it.
 */
function evaluateStageGate(
  depRows: DepRow[],
  jobProgress: ProgressRow[],
  sequenceOrder: number,
  targetStageName: string,
): StageGateResult {
  if (depRows.length > 0) {
    const byStageId = new Map(jobProgress.map(r => [r.workflow_stage_id, r]))
    const unmet: string[] = []
    for (const dep of depRows) {
      const row = byStageId.get(dep.depends_on_stage_id)
      const status = row?.status ?? 'pending'
      const ok = dep.dependency_type === 'stage_started'
        ? ['in_progress', 'completed', 'skipped'].includes(status)
        : ['completed', 'skipped'].includes(status)
      if (!ok) unmet.push(row?.stage_name || 'a required stage')
    }
    if (unmet.length > 0) {
      return { blocked: true, reason: `Cannot update "${targetStageName}" — waiting on: ${unmet.join(', ')}` }
    }
    return { blocked: false }
  }

  // Fallback: original full-sequential rule (unchanged from before Feature 4).
  const blocking = jobProgress.filter(
    s => s.sequence_order < sequenceOrder && !['completed', 'skipped'].includes(s.status)
  )
  if (blocking.length > 0) {
    const names = blocking.map(s => s.stage_name || 'a previous stage').join(', ')
    return { blocked: true, reason: `Cannot update "${targetStageName}" — earlier stage(s) not yet finished: ${names}` }
  }
  return { blocked: false }
}

/**
 * Reads the gate's inputs for MANY stages at once.
 *
 * WHY
 *   checkStageGate() costs two round trips. A work queue calls it once per
 *   pending stage, in a loop, and every call waits for the one before it.
 *   Measured on live 2026-08-04: the Department Queue's "All departments" view
 *   walks **89 pending rows**, so the page was making ~178 sequential requests
 *   to Supabase before it could render anything. That is the whole of the delay
 *   Mehboob reported — not the query, the number of them.
 *
 *   This reads the same facts in TWO requests regardless of queue size.
 *
 * WHAT IS DELIBERATELY NOT FILTERED
 *   `job_stage_progress` is read WITHOUT an is_active filter and with every
 *   status, because that is exactly what the two per-row queries did. A stage
 *   deactivated but not completed still blocks the ones after it, and narrowing
 *   here would quietly open a gate.
 */
export async function loadStageGateContext(
  supabase: SupabaseClient,
  companyId: string,
  jobIds: string[],
  workflowStageIds: string[],
): Promise<StageGateContext> {
  const depsByStage = new Map<string, DepRow[]>()
  const progressByJob = new Map<string, ProgressRow[]>()

  const jobs = Array.from(new Set(jobIds.filter(Boolean)))
  const stages = Array.from(new Set(workflowStageIds.filter(Boolean)))
  if (jobs.length === 0) return { depsByStage, progressByJob }

  const [deps, progress] = await Promise.all([
    stages.length === 0 ? Promise.resolve([]) : fetchAllRows<any>(
      (from, to) => supabase.from('workflow_stage_dependencies' as any)
        .select('workflow_stage_id, depends_on_stage_id, dependency_type')
        .eq('company_id', companyId)
        .in('workflow_stage_id', stages)
        .is('deleted_at', null)
        .eq('is_active', true)
        .order('id')
        .range(from, to) as any,
      'stage gate dependencies',
    ),
    fetchAllRows<any>(
      (from, to) => supabase.from('job_stage_progress' as any)
        .select('job_id, workflow_stage_id, sequence_order, status, workflow_stages(name)')
        .eq('company_id', companyId)
        .in('job_id', jobs)
        // Total order for paging (§6), and it makes the "waiting on" list read
        // in workflow order instead of whatever Postgres happened to return.
        .order('sequence_order')
        .order('id')
        .range(from, to) as any,
      'stage gate progress',
    ),
  ])

  for (const d of deps) {
    const list = depsByStage.get(d.workflow_stage_id)
    if (list) list.push(d); else depsByStage.set(d.workflow_stage_id, [d])
  }

  for (const p of progress) {
    const row: ProgressRow = {
      workflow_stage_id: p.workflow_stage_id,
      sequence_order: p.sequence_order,
      status: p.status,
      stage_name: p.workflow_stages?.name ?? null,
    }
    const list = progressByJob.get(p.job_id)
    if (list) list.push(row); else progressByJob.set(p.job_id, [row])
  }

  return { depsByStage, progressByJob }
}

/**
 * The gate decision for one stage, from an already-loaded context. No I/O.
 *
 * Same rule and same wording as checkStageGate() — they share evaluateStageGate.
 */
export function checkStageGateFrom(
  ctx: StageGateContext,
  jobId: string,
  workflowStageId: string,
  sequenceOrder: number,
  targetStageName: string,
): StageGateResult {
  return evaluateStageGate(
    ctx.depsByStage.get(workflowStageId) ?? [],
    ctx.progressByJob.get(jobId) ?? [],
    sequenceOrder,
    targetStageName,
  )
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
  // One job's context, then the shared rule. Still two round trips, exactly as
  // before — the batch loader above is for callers deciding many stages at once.
  const ctx = await loadStageGateContext(supabase, companyId, [jobId], [workflowStageId])
  return checkStageGateFrom(ctx, jobId, workflowStageId, sequenceOrder, targetStageName)
}
