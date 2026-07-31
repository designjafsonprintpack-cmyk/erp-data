/**
 * How a job's dimensions are written, everywhere.
 *
 * WHY ONE PLACE
 *   Mehboob: *"job list main LxWxH aur sheet size WxH b show ho, main search
 *   main b show ho."* That is three separate surfaces already — the Jobs list,
 *   the global search palette and the Excel export — and the printed Job Card
 *   and Job Detail write the same numbers too. Three hand-rolled
 *   `${l} × ${w} × ${h}` templates is how one of them ends up showing a
 *   trailing "× " on a job with no height.
 *
 * THE SEPARATOR IS "×", NOT "x"
 *   U+00D7, matching `describeSizeQuery()` in parseSizeQuery.ts, so what the
 *   screen shows and what the search box understands read the same. The search
 *   PARSER still accepts a plain "x" as input — nobody should have to find ×
 *   on a keyboard — but output is always the real sign.
 *
 * A MISSING DIMENSION IS DROPPED, NOT ZEROED
 *   409 of 479 live jobs carry a size and the rest carry none; a label is
 *   never padded out to "190 × 100 × 0", which would read as a real flat box.
 *   All-empty returns null so the caller can render its own em-dash.
 */

/** Trims a numeric column for display: 190.50 → "190.5", 190.00 → "190". */
function num(v: unknown): string | null {
  if (v === null || v === undefined || v === '') return null
  const n = Number(v)
  if (!Number.isFinite(n)) return null
  // parseFloat via Number already drops trailing zeros; String() keeps the
  // shortest round-trippable form, which is what a spec sheet wants.
  return String(n)
}

export interface JobSizeFields {
  size_l?: unknown
  size_w?: unknown
  size_h?: unknown
  sheet_width_in?: unknown
  sheet_height_in?: unknown
}

/** "190 × 100 × 45", or "190 × 100" when there is no height. Null if none. */
export function formatBoxSize(job: JobSizeFields | null | undefined): string | null {
  if (!job) return null
  const parts = [num(job.size_l), num(job.size_w), num(job.size_h)].filter(Boolean)
  return parts.length ? parts.join(' × ') : null
}

/** "20 × 27" — the sheet the job is printed on. Null if either side is blank. */
export function formatSheetSize(job: JobSizeFields | null | undefined): string | null {
  if (!job) return null
  const w = num(job.sheet_width_in)
  const h = num(job.sheet_height_in)
  // Both or nothing: half a sheet size is meaningless on the floor and would
  // read as a box dimension.
  return w && h ? `${w} × ${h}` : null
}

/**
 * One line for places with a single slot — a search result, a tooltip:
 * "190 × 100 × 45 · Sheet 20 × 27". Null when the job has neither.
 */
export function formatJobSizeLine(job: JobSizeFields | null | undefined): string | null {
  const box = formatBoxSize(job)
  const sheet = formatSheetSize(job)
  const parts = [box, sheet ? `Sheet ${sheet}` : null].filter(Boolean)
  return parts.length ? parts.join(' · ') : null
}

export default formatJobSizeLine
