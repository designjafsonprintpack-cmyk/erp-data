/**
 * How many rows a list page shows.
 *
 * WHY THIS LIVES IN ITS OWN FILE
 *   It used to be a `const` inside Pagination.tsx, which carries 'use client'.
 *   Every list's SERVER component needs the same number for its first-page
 *   `.range()` — and because importing it across that boundary was awkward, all
 *   fourteen of them hardcoded `.range(0, 49)` instead. That is a trap CLAUDE.md
 *   already records: if the two ever disagree, page 1 and page 2 overlap and
 *   rows go missing with nothing to show for it. Now there is one number and
 *   both sides import it.
 *
 * 20, NOT 50
 *   Mehboob's call. Fifty rows is a lot of scrolling on a phone, and with
 *   numbered pages nothing is out of reach anyway.
 */
export const LIST_PAGE_SIZE = 20

/** What the per-list size picker offers. */
export const PAGE_SIZE_OPTIONS = [10, 20, 30, 40, 50] as const

/**
 * The chosen size is remembered per browser, not per list — someone who wants
 * 10 rows wants 10 everywhere, and asking them again on each page would be the
 * annoying half of a preference.
 */
export const PAGE_SIZE_STORAGE_KEY = 'jafson.list.pageSize'

/** Anything unrecognised (a hand-edited localStorage value, an old key) falls
 *  back to the default rather than paging by NaN. */
export function normalizePageSize(value: unknown): number {
  const n = Number(value)
  return (PAGE_SIZE_OPTIONS as readonly number[]).includes(n) ? n : LIST_PAGE_SIZE
}
