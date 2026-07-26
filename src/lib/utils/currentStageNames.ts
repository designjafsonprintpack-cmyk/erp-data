import type { SupabaseClient } from '@supabase/supabase-js'

/**
 * job_stage_progress id → the workflow stage's display name, for a batch of ids.
 *
 * Used to turn jobs.current_stage_id into something a list can print. It is a
 * separate lookup rather than a PostgREST embed because jobs.current_stage_id
 * has no foreign key — migration 014 left it as a bare UUID ("FK to
 * job_stage_progress added later", which never happened), and PostgREST can
 * only embed across a real constraint. One extra batched query is cheaper than
 * a schema change on a live table.
 */
export async function getCurrentStageNames(
  supabase: SupabaseClient,
  companyId: string,
  stageProgressIds: (string | null | undefined)[]
): Promise<Map<string, string>> {
  const byId = new Map<string, string>()
  const ids = Array.from(new Set(stageProgressIds.filter((v): v is string => !!v)))
  if (ids.length === 0) return byId

  const { data } = await supabase.from('job_stage_progress' as any)
    .select('id, workflow_stages(name)')
    .eq('company_id', companyId)
    .in('id', ids)

  for (const row of ((data ?? []) as any[])) {
    const name = row.workflow_stages?.name
    if (name) byId.set(row.id, name)
  }
  return byId
}

/**
 * Stamps `current_stage_name` onto a list of job rows that carry
 * `current_stage_id`. Kept next to the lookup so the jobs list page and the
 * jobs API can't drift apart on how the column is filled.
 */
export async function withCurrentStageNames<T extends { current_stage_id?: string | null }>(
  supabase: SupabaseClient,
  companyId: string,
  rows: T[]
): Promise<(T & { current_stage_name: string | null })[]> {
  const names = await getCurrentStageNames(supabase, companyId, rows.map(r => r.current_stage_id))
  return rows.map(r => ({
    ...r,
    current_stage_name: r.current_stage_id ? names.get(r.current_stage_id) ?? null : null,
  }))
}

export default getCurrentStageNames
