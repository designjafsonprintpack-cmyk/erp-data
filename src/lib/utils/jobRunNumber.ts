import type { SupabaseClient } from '@supabase/supabase-js'

/**
 * One number per carton, with the run on the end.
 *
 * WHY
 *   Mehboob: "job number aik hi hona chahiye jo us ka hi ho, hum job ko us
 *   number se bhi yaad rakh sakein." He remembers a carton BY its number — Al
 *   Safwa Mint *is* JOB-00408 to him. Giving its reorder a brand-new
 *   number (JOB-2026-00010) took that away: one box, two numbers, and search
 *   showing what looked like two unrelated jobs.
 *
 *   So a repeat no longer takes a fresh number from the JOB series. It carries
 *   the ORIGINAL's number with the run appended:
 *
 *       JOB-00408        run 1, the original
 *       JOB-00408-R2     the 2026 reorder
 *       JOB-00408-R3     the next one
 *
 * THIS IS AN EXISTING CONVENTION, NOT A NEW ONE
 *   Press proofs are already numbered `${parent}-P1`, `-P2` off their parent
 *   (migration 104). `-R` is the same idea for the same reason, so the two read
 *   as one scheme rather than two.
 *
 * WHY THE ROW IS STILL SEPARATE
 *   Only the NUMBER is shared. Each run stays its own `jobs` row because it
 *   carries its own quantity, stages, MRN, board issue, costing, dispatch and
 *   invoice — which is exactly the history Mehboob asked to keep in the same
 *   breath ("pata bhi chale ke job kab chala kitna chala").
 *
 * THE STEM IS THE IDENTITY
 *   Because every run shares one stem, "which jobs are the same carton" is
 *   answerable from the number alone, with no join — which is what lets the
 *   search palette collapse a family into one result.
 */

/** Matches the run/proof suffix on a job number: `-R2`, `-P1`. */
const RUN_SUFFIX = /-(?:R|P)\d+$/

/**
 * The number without its run suffix — the carton's identity.
 * `JOB-00408-R2` → `JOB-00408`. A plain number is its own stem.
 */
export function jobNumberStem(jobNumber: string | null | undefined): string {
  return (jobNumber ?? '').replace(RUN_SUFFIX, '')
}

/** True when this number is a run/proof of something else. */
export function isRunNumber(jobNumber: string | null | undefined): boolean {
  return RUN_SUFFIX.test(jobNumber ?? '')
}

/**
 * Which run this number IS, read from the number alone — no join, no query.
 * `JOB-00408-R3` → 3, a plain number → 1. A proof (`-P1`) is not a run of the
 * carton, so it reads as 1 like its parent.
 *
 * Migration 144's `job_run_no()` is the SQL twin of this. Both must keep the
 * same rule, or the list will hide a row the app thinks is the newest.
 */
export function runNoFromJobNumber(jobNumber: string | null | undefined): number {
  const m = /-R(\d+)$/.exec(jobNumber ?? '')
  return m ? parseInt(m[1], 10) : 1
}

export interface NextRunNumber {
  /** The full number for the new run, e.g. `JOB-00408-R3`. */
  jobNumber: string
  /** Which run this is. The original is 1, so a first repeat is 2. */
  runNo: number
  /** The carton's identity — the original's number. */
  stem: string
}

/**
 * Works out the next run's number for a repeat of `parentJobId`.
 *
 * Reads the family through `get_job_family()` (migration 132) rather than just
 * the parent, for two reasons:
 *   · a repeat OF a repeat must still stem from the original, or numbers would
 *     grow `-R2-R3`;
 *   · the run count has to be the family's, not the parent's child count —
 *     otherwise repeating the original twice and then repeating one of those
 *     produces two jobs both called `-R3`, and the unique index rejects the
 *     second (a 500 the user cannot act on).
 *
 * Falls back to the parent's own number if the family lookup returns nothing,
 * so a repeat is never blocked by this.
 */
export async function nextRunNumber(
  supabase: SupabaseClient,
  companyId: string,
  parentJobId: string,
  parentJobNumber: string,
): Promise<NextRunNumber> {
  const stem = jobNumberStem(parentJobNumber)

  const { data, error } = await (supabase as any)
    .rpc('get_job_family', { p_company_id: companyId, p_job_id: parentJobId })

  if (error) console.error('[jobRunNumber] family lookup failed:', error.message)

  const family = (data ?? []) as any[]
  const root = family.find(r => r.is_root)
  const rootStem = jobNumberStem(root?.job_number) || stem

  // Highest run already used, not the count — a deleted middle run must not
  // let the next one reuse a number that is still printed on a job card.
  const highest = family.reduce((max, r) => {
    const m = String(r.job_number ?? '').match(/-R(\d+)$/)
    const n = m ? Number(m[1]) : 1
    return n > max ? n : max
  }, family.length ? 1 : 0)

  const runNo = Math.max(highest, family.length) + 1

  return { jobNumber: `${rootStem}-R${runNo}`, runNo, stem: rootStem }
}

export default nextRunNumber
