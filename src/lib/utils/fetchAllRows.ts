/**
 * Read EVERY row of a query, past PostgREST's silent 1000-row ceiling.
 *
 * WHY THIS EXISTS
 *   PostgREST caps every `select()` at 1000 rows. There is no error and no
 *   flag — the array just stops. CLAUDE.md records this biting twice already
 *   (a migration audit that reported `qc = 5` when the real figure was 14, and
 *   the 200-row stat cards 103 fixed). It bit a third time here:
 *   `role_permissions` passed 1000 rows once every role had a real permission
 *   set, so **Settings → Roles & Permissions rendered later roles as
 *   completely unticked** — the grants were in the database the whole time.
 *
 *   Worse, the query had no `.order()`, so *which* 613 rows went missing was
 *   whatever order Postgres felt like returning and could differ between two
 *   renders of the same page.
 *
 * WHEN TO USE IT
 *   Only when the query genuinely needs every row. The cheaper fix, and the
 *   first one to reach for, is to NARROW the query until it is provably under
 *   the cap — that is what `dashboard/help/page.tsx` does by filtering to the
 *   `view` action before joining. Use this when you cannot narrow: the
 *   permission matrix needs all 9 actions across all modules for all roles.
 *
 *   For counting, neither applies — use `{ count: 'exact', head: true }` and
 *   never total a fetched array.
 *
 * THE ORDER IS NOT OPTIONAL
 *   The caller MUST apply a total `.order()` inside `makeQuery`. Paging with
 *   `.range()` over an unordered query lets page 2 repeat rows from page 1 and
 *   drop others — the same defect §6 records for the 478 jobs that all share
 *   one backdated `created_at`.
 */

/** PostgREST's hard ceiling on a single response. */
export const POSTGREST_MAX_ROWS = 1000

/**
 * A backstop so a malformed query cannot spin forever. 200 pages is 200,000
 * rows — far past anything this app legitimately reads in one go, and if a
 * table ever does grow past it, that is a signal to narrow the query rather
 * than raise this number.
 */
const MAX_PAGES = 200

interface RangeResult<T> {
  data: T[] | null
  error: { message: string } | null
}

/**
 * @param makeQuery Applies `.range(from, to)` to an ALREADY-ORDERED query and
 *                  returns it. Called once per page.
 * @param label     Used in the thrown error so a failure says which read broke.
 */
export async function fetchAllRows<T>(
  makeQuery: (from: number, to: number) => PromiseLike<RangeResult<T>>,
  label = 'query',
): Promise<T[]> {
  const all: T[] = []

  for (let page = 0; page < MAX_PAGES; page++) {
    const from = page * POSTGREST_MAX_ROWS
    const { data, error } = await makeQuery(from, from + POSTGREST_MAX_ROWS - 1)

    // Checked, never swallowed. `(await q).data ?? []` once turned a
    // wrong-column error into "the table is empty" and produced a confidently
    // wrong audit.
    if (error) throw new Error(`${label}: ${error.message}`)

    const rows = data ?? []
    all.push(...rows)

    // A short page means the end. An exactly-full page is ambiguous, so it
    // costs one more round trip to be sure — correctness over a saved request.
    if (rows.length < POSTGREST_MAX_ROWS) return all
  }

  throw new Error(
    `${label}: still returning rows after ${MAX_PAGES} pages ` +
    `(${MAX_PAGES * POSTGREST_MAX_ROWS} rows). Narrow the query instead.`
  )
}

export default fetchAllRows
