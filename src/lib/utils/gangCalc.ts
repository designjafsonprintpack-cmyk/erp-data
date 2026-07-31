/**
 * The arithmetic behind a gang run — kept out of the routes and the screen so
 * both do the same sums, and so the sums can be asserted on their own.
 *
 * THE SHOP'S OWN METHOD, in Mehboob's words and numbers:
 *
 *   "layout 8 ups ka hay per 4 ups aik job k aur 4 ups aik job k, kabi 3 aur 5,
 *    kabi 2 aur 6."
 *
 *   Job A  order 10,000  ->  3 ups  ->  12,000   (+2,000, agreed with the client)
 *   Job B  order 20,000  ->  5 ups  ->  20,000
 *                                       4,000 sheets
 *
 *   Run separately that is 1,250 + 2,500 = 3,750 sheets, TWO press setups, TWO
 *   plate sets, TWO die setups. **The saving is the setup, not the board** —
 *   the extra 250 sheets are the 2,000 extra boxes the client agreed to buy.
 *
 * WHY THE SPLIT IS NEVER SUGGESTED AS A DECISION
 *   The layout is bounded by the DIE, not by arithmetic. Mehboob: *"10 + 10 =
 *   20 ups nahi ho sakty kyu k asa kerny say sheet size change ho ga… lakin die
 *   humary pass 10 ups ki hi hay."* The ERP has no die master —
 *   `jobs.die_number` is free text — so it cannot know what layouts exist.
 *   `suggestSplit()` is a STARTING POINT for the planner to overwrite, never an
 *   instruction, and every screen must show the numbers for whatever split the
 *   planner actually types.
 */

export interface GangMemberInput {
  jobId: string
  jobNumber?: string
  jobTitle?: string
  /** What the customer ordered, before any gang agreement. */
  orderedQty: number
  /** The job's own ups when it runs alone — its die's layout. */
  ownUps: number
}

export interface GangLine {
  jobId: string
  jobNumber?: string
  jobTitle?: string
  ups: number
  orderedQty: number
  /** sheets x ups — what the run actually yields for this job. */
  produced: number
  /** produced - ordered. Zero or positive; this is what the client must accept. */
  overage: number
  overagePct: number
}

export interface SeparateScenario {
  /** One line per job, at its own ups. */
  lines: { jobId: string; ups: number; sheets: number; qty: number }[]
  totalSheets: number
  /** One press setup, one plate set and one die setup per job. */
  setups: number
}

export interface GangScenario {
  sheets: number
  lines: GangLine[]
  totalUps: number
  layoutUps: number
  /** Empty when the split is usable. Each entry is shown to the planner. */
  problems: string[]
  valid: boolean
  /** Sheets the gang costs over running separately. Can be negative. */
  extraSheets: number
  /** Press setups saved: separate.setups - 1. */
  setupsSaved: number
}

const isPos = (n: unknown): n is number => typeof n === 'number' && Number.isFinite(n) && n > 0

/** Sheets a job needs on its own. The locked rule: ceil(Box Qty / Ups). */
export function sheetsFor(qty: number, ups: number): number {
  if (!isPos(ups) || !isPos(qty)) return 0
  return Math.ceil(qty / ups)
}

/** Each job on its own press run — the thing a gang is compared against. */
export function separateScenario(members: GangMemberInput[]): SeparateScenario {
  const lines = members.map(m => ({
    jobId: m.jobId,
    ups: m.ownUps,
    sheets: sheetsFor(m.orderedQty, m.ownUps),
    qty: m.orderedQty,
  }))
  return {
    lines,
    totalSheets: lines.reduce((s, l) => s + l.sheets, 0),
    setups: members.length,
  }
}

/**
 * The gang, for a split the planner has chosen.
 *
 * The run prints as many sheets as the HUNGRIEST member needs — every other
 * member then over-produces, which is exactly the +2,000 that gets agreed with
 * the client. Any other rule would leave a job short.
 */
export function gangScenario(
  layoutUps: number,
  members: GangMemberInput[],
  upsByJob: Record<string, number>,
): GangScenario {
  const problems: string[] = []

  if (!isPos(layoutUps)) problems.push('Enter how many ups the die holds.')
  if (members.length < 2) problems.push('A gang needs at least two jobs.')

  const ups = members.map(m => Number(upsByJob[m.jobId]))
  members.forEach((m, i) => {
    if (!isPos(ups[i]) || !Number.isInteger(ups[i])) {
      problems.push(`${m.jobNumber ?? 'A job'} needs a whole number of ups, at least 1.`)
    }
  })

  const totalUps = ups.reduce((s, u) => s + (isPos(u) ? u : 0), 0)
  if (isPos(layoutUps) && totalUps !== layoutUps) {
    problems.push(
      totalUps > layoutUps
        ? `The split adds up to ${totalUps} ups but the die holds ${layoutUps}.`
        : `The split adds up to ${totalUps} ups and the die holds ${layoutUps} — ${layoutUps - totalUps} would be wasted on every sheet.`
    )
  }

  // The run's sheet count: enough for the member that needs the most.
  const sheets = problems.length
    ? 0
    : Math.max(...members.map((m, i) => sheetsFor(m.orderedQty, ups[i])))

  const lines: GangLine[] = members.map((m, i) => {
    const u = ups[i]
    const produced = sheets && isPos(u) ? sheets * u : 0
    const overage = Math.max(0, produced - m.orderedQty)
    return {
      jobId: m.jobId,
      jobNumber: m.jobNumber,
      jobTitle: m.jobTitle,
      ups: u,
      orderedQty: m.orderedQty,
      produced,
      overage,
      overagePct: m.orderedQty > 0 ? Math.round((overage / m.orderedQty) * 1000) / 10 : 0,
    }
  })

  const separate = separateScenario(members)

  return {
    sheets,
    lines,
    totalUps,
    layoutUps,
    problems,
    valid: problems.length === 0 && sheets > 0,
    extraSheets: sheets ? sheets - separate.totalSheets : 0,
    setupsSaved: separate.setups - 1,
  }
}

/**
 * A starting split, by order size. **A suggestion, not an answer** — the planner
 * overwrites it with whatever the die actually holds.
 *
 * Largest-remainder, so the parts always add up to exactly `layoutUps` (plain
 * rounding does not: 10,000 : 20,000 on 8 ups gives 2.67 and 5.33, which round
 * to 3 and 5 here but to 3 and 5 = 8 only by luck at other ratios).
 * Every member is guaranteed at least 1 up.
 */
export function suggestSplit(
  layoutUps: number,
  members: GangMemberInput[],
): Record<string, number> {
  const out: Record<string, number> = {}
  if (!isPos(layoutUps) || members.length === 0) return out
  if (layoutUps < members.length) {
    // Cannot give everyone an up. Hand back 1 each and let gangScenario say so.
    for (const m of members) out[m.jobId] = 1
    return out
  }

  const total = members.reduce((s, m) => s + Math.max(0, m.orderedQty), 0)
  if (total <= 0) {
    const even = Math.floor(layoutUps / members.length)
    members.forEach((m, i) => { out[m.jobId] = even + (i < layoutUps - even * members.length ? 1 : 0) })
    return out
  }

  // One up reserved per member first, the rest shared by order size.
  const spare = layoutUps - members.length
  const exact = members.map(m => (m.orderedQty / total) * spare)
  const base = exact.map(Math.floor)
  let left = spare - base.reduce((s, n) => s + n, 0)

  const order = exact
    .map((e, i) => ({ i, frac: e - Math.floor(e) }))
    .sort((a, b) => b.frac - a.frac)
  for (const { i } of order) {
    if (left <= 0) break
    base[i]++
    left--
  }

  members.forEach((m, i) => { out[m.jobId] = 1 + base[i] })
  return out
}

export default gangScenario
