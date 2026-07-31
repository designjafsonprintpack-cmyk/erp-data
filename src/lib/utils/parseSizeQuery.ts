/**
 * Reads "190x100x45" out of a search box and turns it into L / W / H filters.
 *
 * WHY
 *   Mehboob: *"search main mujhay L x W x H ki search b chahiyay."* Finding the
 *   old job that already has a size is the whole point of "same spec as an old
 *   job?" — and a size is what an inquiry actually arrives as. Job number and
 *   title are no help when the customer says "wohi 190 x 100 x 45 wala dabba".
 *
 * THE SEPARATOR IS REQUIRED, AND THAT IS THE POINT
 *   A bare "190" is NOT read as a size. Die numbers are bare integers (186, 254
 *   on live) and job numbers contain digits too, so treating a lone number as a
 *   dimension would break the text search that already works. A size is only a
 *   size once the user has written a separator between two numbers — `x`, `X`,
 *   the real multiplication sign `×` (phone keyboards produce it), or `*`.
 *
 * PARTIAL IS ALLOWED
 *   "190x100" matches L=190 and W=100 at any height — useful, because the
 *   height is the dimension people misremember. Unspecified parts are `null`
 *   and the caller simply does not filter on them.
 *
 * ORDER IS L, W, H — AS TYPED
 *   Not order-insensitive. The New Job form is labelled L / W / H, the Job Card
 *   prints them in that order, and Mehboob asked for it in that order. Matching
 *   any permutation would quietly return boxes that are not the box asked for.
 *
 * EXACT VALUES, NO TOLERANCE
 *   Live sizes are whole millimetres apart from a handful of .5 halves, and
 *   `.eq()` was verified against real Postgres to match both exactly (including
 *   190.5 and 82.5 — halves are exactly representable, so there is no float
 *   drift to guard against). A tolerance would make 190 silently match 190.5,
 *   which for a die is a different box.
 */

export interface SizeQuery {
  l: number | null
  w: number | null
  h: number | null
}

/** `x`, `X`, `×` (U+00D7) or `*`, with any surrounding spaces. */
const SEPARATOR = /\s*[x×*]\s*/i

/**
 * Anchored so a size query is the WHOLE search term. "carton 190x100" stays a
 * text search — mixing the two would need an AND across different columns and
 * has no obvious right answer.
 */
const SIZE_SHAPE = /^\s*\d+(?:\.\d+)?\s*[x×*]\s*\d+(?:\.\d+)?(?:\s*[x×*]\s*\d+(?:\.\d+)?)?\s*$/i

/**
 * Returns the parsed dimensions, or `null` when the term is not a size at all
 * (in which case the caller should run its normal text search).
 */
export function parseSizeQuery(query: string | null | undefined): SizeQuery | null {
  const raw = String(query ?? '').trim()
  if (!raw || !SIZE_SHAPE.test(raw)) return null

  const parts = raw.split(SEPARATOR).map(p => parseFloat(p.trim()))
  // Belt and braces: the shape regex already guarantees valid numbers, but a
  // NaN slipping into a query filter would silently return nothing.
  if (parts.some(n => !Number.isFinite(n))) return null

  return {
    l: parts[0] ?? null,
    w: parts[1] ?? null,
    h: parts[2] ?? null,
  }
}

/** "190 × 100 × 45" — for telling the user what was understood. */
export function describeSizeQuery(size: SizeQuery): string {
  return [size.l, size.w, size.h].filter(v => v !== null).join(' × ')
}

/**
 * Applies the parsed dimensions to a PostgREST builder. Kept here so every
 * caller filters on the same columns in the same way.
 */
export function applySizeFilter<T>(query: T, size: SizeQuery): T {
  let q = query as any
  if (size.l !== null) q = q.eq('size_l', size.l)
  if (size.w !== null) q = q.eq('size_w', size.w)
  if (size.h !== null) q = q.eq('size_h', size.h)
  return q as T
}

export default parseSizeQuery
