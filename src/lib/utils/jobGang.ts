/**
 * "Is this job sharing a sheet with another one, and what follows from that?"
 *
 * Everything the production side needs to know about a gang run (126) lives
 * here, so the plate gate, the auto-MRN, the Board Issue check and the shared
 * stage completion cannot drift apart. Each of those used to ask a question
 * about ONE job; each now has to ask it about the RUN.
 *
 * WHAT A GANG CHANGES, AND WHAT IT DOES NOT
 *   Shared (Board Issue -> Folder Gluing, flagged by `workflow_stages.
 *   is_gang_shared`): one MRN for the whole run, one plate set, and completing
 *   the stage on one member completes it on all.
 *   Untouched: Artwork and its approval (different products, different
 *   approvals) and everything from Packing on — by then the sheet is cut and
 *   the jobs are separate again. Mehboob: *"sirf packing alag ho gi bas."*
 */

export interface GangMemberRow {
  job_id: string
  ups_on_layout: number
  jobs?: { job_number?: string | null } | null
}

export interface GangContext {
  gangId: string
  gangNumber: string
  layoutUps: number
  /** Sheets the whole run prints — NOT any one member's sheet_qty. */
  sheetCount: number
  boardTypeId: string | null
  members: GangMemberRow[]
  /** Every member except the job that was asked about. */
  siblingJobIds: string[]
  /** This job's ups on the shared layout. */
  myUps: number
  /**
   * The member that owns the run's shared paperwork — its MRN, and the row a
   * gang's plan hangs off. Deterministic (lowest job number, falling back to
   * job id) so every caller picks the SAME job without a column to store it,
   * and so a re-read never moves it.
   */
  leadJobId: string
  isLead: boolean
}

/** Lowest job number wins; ids break a tie so the answer is never ambiguous. */
export function gangLeadJobId(members: GangMemberRow[]): string {
  const sorted = [...members].sort((a, b) => {
    const an = a.jobs?.job_number ?? ''
    const bn = b.jobs?.job_number ?? ''
    if (an && bn && an !== bn) return an < bn ? -1 : 1
    return a.job_id < b.job_id ? -1 : 1
  })
  return sorted[0]?.job_id ?? ''
}

/**
 * Returns null when the job is not in a live gang — which is the overwhelming
 * majority of jobs, so every caller's fast path is "null, carry on as before".
 *
 * A query error also returns null rather than throwing: a gang lookup must
 * never be the reason a stage cannot be started. The cost of missing it is a
 * duplicate MRN, which a person can see and fix; the cost of throwing is a
 * blocked press.
 */
export async function loadGangContext(
  supabase: any,
  companyId: string,
  jobId: string,
): Promise<GangContext | null> {
  const { data, error } = await supabase
    .from('job_gang_members' as any)
    .select('ups_on_layout, job_gangs!inner(id,gang_number,layout_ups,sheet_count,board_type_id,status,deleted_at,' +
            'job_gang_members(job_id,ups_on_layout,deleted_at,jobs(job_number)))')
    .eq('job_id', jobId)
    .eq('company_id', companyId)
    .is('deleted_at', null)
    .maybeSingle()

  if (error) {
    console.error('[jobGang] lookup failed:', error.message)
    return null
  }
  if (!data) return null

  const gang = (data as any).job_gangs
  if (!gang || gang.deleted_at || gang.status === 'cancelled') return null

  const members: GangMemberRow[] = ((gang.job_gang_members ?? []) as any[])
    .filter(m => !m.deleted_at)
    .map(m => ({ job_id: m.job_id, ups_on_layout: m.ups_on_layout, jobs: m.jobs }))

  // A "gang" of one is not a gang — it can only mean the other members were
  // removed, and treating it as one would put this job's board on a run that
  // no longer exists.
  if (members.length < 2) return null

  const leadJobId = gangLeadJobId(members)

  return {
    gangId: gang.id,
    gangNumber: gang.gang_number,
    layoutUps: Number(gang.layout_ups) || 0,
    sheetCount: Number(gang.sheet_count) || 0,
    boardTypeId: gang.board_type_id ?? null,
    members,
    siblingJobIds: members.map(m => m.job_id).filter(id => id !== jobId),
    myUps: Number((data as any).ups_on_layout) || 0,
    leadJobId,
    isLead: leadJobId === jobId,
  }
}

/**
 * Applies a completed/started/skipped shared stage to every other member of the
 * run.
 *
 * MATCHED BY STAGE NAME, NOT BY workflow_stage_id. Members usually share a
 * template, but nothing guarantees it — a Standard Carton job can legitimately
 * be ganged with a `Carton with Lamination / Foil` job (111), and their
 * "Printing" rows are different `workflow_stages`. The name is what both
 * templates agree on.
 *
 * Only touches a sibling stage that is BEHIND this one. Re-completing an
 * already-completed stage would overwrite who completed it and when, and
 * re-starting one would wipe its real start time.
 */
export async function applyToGangSiblings(
  supabase: any,
  companyId: string,
  ctx: GangContext,
  stageName: string,
  patch: Record<string, any>,
  targetStatus: 'in_progress' | 'completed' | 'skipped',
): Promise<{ updatedJobIds: string[]; warnings: string[] }> {
  const warnings: string[] = []
  if (!ctx.siblingJobIds.length || !stageName) return { updatedJobIds: [], warnings }

  const { data: siblingStages, error } = await supabase
    .from('job_stage_progress' as any)
    .select('id, job_id, status, workflow_stages!inner(name, is_gang_shared)')
    .in('job_id', ctx.siblingJobIds)
    .eq('company_id', companyId)
    .eq('workflow_stages.name', stageName)
    .eq('workflow_stages.is_gang_shared', true)

  if (error) {
    warnings.push(`${ctx.gangNumber}: could not update the other jobs — ${error.message}`)
    return { updatedJobIds: [], warnings }
  }

  // 'pending' is behind everything; 'in_progress' is behind completed/skipped.
  const behind = (s: string) =>
    targetStatus === 'in_progress' ? s === 'pending' : s === 'pending' || s === 'in_progress'

  const rows = ((siblingStages ?? []) as any[]).filter(r => behind(String(r.status)))
  const updatedJobIds: string[] = []

  for (const row of rows) {
    const { error: upErr } = await supabase.from('job_stage_progress' as any)
      .update(patch).eq('id', row.id).eq('company_id', companyId)
    if (upErr) warnings.push(`${ctx.gangNumber}: ${upErr.message}`)
    else updatedJobIds.push(row.job_id)
  }

  return { updatedJobIds, warnings }
}

/**
 * Splits one number across the run's members by their share of the layout.
 *
 * WHY IT MUST PRESERVE THE TOTAL EXACTLY
 *   This divides real board and real money. Rounding each share on its own
 *   loses or invents a little every time — 4,000 sheets at 3/8 and 5/8 is
 *   1,500 and 2,500, but 4,001 at those shares rounds to 1,500 + 2,501 = 4,001
 *   only by luck. Largest-remainder assigns the leftover deliberately, so the
 *   parts always add back to the whole and no board goes missing from costing.
 *
 * @param decimals 0 for sheets (whole sheets), 2 for money.
 */
export function splitByUps(
  total: number,
  members: { job_id: string; ups_on_layout: number }[],
  decimals: 0 | 2 = 0,
): Record<string, number> {
  const out: Record<string, number> = {}
  const totalUps = members.reduce((s, m) => s + (Number(m.ups_on_layout) || 0), 0)
  if (!Number.isFinite(total) || totalUps <= 0 || members.length === 0) return out

  const step = decimals === 0 ? 1 : 0.01
  const units = Math.round(total / step)

  const exact = members.map(m => (units * (Number(m.ups_on_layout) || 0)) / totalUps)
  const base = exact.map(Math.floor)
  let left = units - base.reduce((s, n) => s + n, 0)

  // The leftover goes to the biggest fractions first — and on a tie, to the
  // member with more ups, so the same input always splits the same way.
  const order = exact
    .map((e, i) => ({ i, frac: e - Math.floor(e), ups: Number(members[i].ups_on_layout) || 0 }))
    .sort((a, b) => (b.frac - a.frac) || (b.ups - a.ups))
  for (const { i } of order) {
    if (left <= 0) break
    base[i]++
    left--
  }

  members.forEach((m, i) => {
    out[m.job_id] = decimals === 0 ? base[i] : Math.round(base[i] * step * 100) / 100
  })
  return out
}

/** Moves the run to in_progress the first time any shared stage starts. */
export async function markGangInProgress(
  supabase: any, companyId: string, gangId: string,
): Promise<void> {
  const { error } = await supabase.from('job_gangs' as any)
    .update({ status: 'in_progress' })
    .eq('id', gangId).eq('company_id', companyId).eq('status', 'planned')
  // Cosmetic only — a failed status bump must never block the press.
  if (error) console.error('[jobGang] status bump failed:', error.message)
}

export default loadGangContext
