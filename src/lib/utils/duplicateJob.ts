/**
 * "Have we already got this job?" — a WARNING on job create, never a block.
 *
 * WHY A WARNING AND NOT A BLOCK
 *   Running the same job again is not a mistake in this trade, it is the
 *   business. A carton the customer reorders every month is the same title,
 *   the same customer and the same specs every time — that is what the Repeat
 *   feature exists for. Blocking on a name match would stop the shop's most
 *   ordinary day.
 *
 *   What IS a mistake is entering the same job twice by accident: a double
 *   submit, or two people booking the same order an hour apart. Both leave a
 *   twin that is still open. So the rule keys off STATE, not similarity.
 *
 * WHAT COUNTS AS A SUSPECTED DUPLICATE
 *   Same customer, same normalized title, AND either
 *     · the existing job is still live (not completed/cancelled), or
 *     · it was created in the last 24 hours.
 *
 *   A finished job from six months ago with the same title is a normal repeat
 *   and says nothing. A job created ten minutes ago with the same title almost
 *   certainly is one. The 24-hour arm is what catches a double submit on a job
 *   that was created and immediately closed.
 *
 * WHEN IT IS SKIPPED ENTIRELY
 *   · `parent_job_id` is set — the user pressed Repeat. They have already said
 *     "yes, this is the same job again"; asking again is noise.
 *   · press proofs (`job_kind = 'proofing'`) — a proof is deliberately a job
 *     with its parent's identity, and proof rounds P1/P2/P3 are all near-twins.
 *   · `force: true` — the user saw the warning and chose to continue.
 */
import { NextResponse } from 'next/server'
import { normalizeName } from './duplicateName'

/** How far back a completed/cancelled job still counts as a double submit. */
const RECENT_WINDOW_HOURS = 24

/** Statuses that mean the job is finished with. Anything else is still live. */
const CLOSED_STATUSES = ['completed', 'cancelled']

export interface DuplicateJobHit {
  id: string
  job_number: string
  job_title: string
  status: string
  created_at: string
  /** True when it was flagged for being live rather than merely recent. */
  is_open: boolean
}

export interface FindDuplicateJobOptions {
  companyId: string
  customerId: string | null | undefined
  jobTitle: string | null | undefined
  /** Set on edit so a job is not its own duplicate. */
  excludeId?: string | null
}

export async function findDuplicateJobs(
  supabase: any,
  opts: FindDuplicateJobOptions,
): Promise<DuplicateJobHit[]> {
  const wanted = normalizeName(opts.jobTitle)
  if (!wanted || !opts.customerId) return []

  // Scoped to the one customer, so this can never approach PostgREST's 1000-row
  // ceiling the way an unfiltered read would. Newest first, capped at 50 —
  // older matches add nothing once a recent one is found.
  const { data, error } = await supabase
    .from('jobs' as any)
    .select('id, job_number, job_title, status, created_at')
    .eq('company_id', opts.companyId)
    .eq('customer_id', opts.customerId)
    .is('deleted_at', null)
    .eq('is_active', true)
    .order('created_at', { ascending: false })
    .order('id', { ascending: false })
    .limit(50)

  // Logged, not thrown. A guard must never be the reason a job cannot be
  // booked — the shop floor is waiting on it.
  if (error) {
    console.error('[duplicateJob] lookup failed:', error.message)
    return []
  }

  const cutoff = Date.now() - RECENT_WINDOW_HOURS * 60 * 60 * 1000

  return ((data ?? []) as any[])
    .filter(j => j.id !== opts.excludeId)
    .filter(j => normalizeName(j.job_title) === wanted)
    .map(j => {
      const isOpen = !CLOSED_STATUSES.includes(String(j.status ?? '').toLowerCase())
      const isRecent = new Date(j.created_at).getTime() >= cutoff
      return { hit: { ...j, is_open: isOpen } as DuplicateJobHit, flag: isOpen || isRecent }
    })
    .filter(x => x.flag)
    .map(x => x.hit)
}

/**
 * The 409 the job route returns, or null when nothing looks like a duplicate.
 * The caller resubmits with `force: true` to create it anyway.
 */
export function duplicateJobResponse(hits: DuplicateJobHit[]): NextResponse | null {
  if (!hits.length) return null

  const hit = hits[0]
  const extra = hits.length > 1 ? ` (and ${hits.length - 1} more)` : ''

  return NextResponse.json(
    {
      error:
        `${hit.job_number} for this customer already has the title "${hit.job_title}"${extra}. ` +
        `If this is a repeat order, use Repeat on that job so the two stay linked. ` +
        `Create a separate job anyway?`,
      duplicates: hits,
      code: 'DUPLICATE_JOB',
    },
    { status: 409 },
  )
}

export default findDuplicateJobs
