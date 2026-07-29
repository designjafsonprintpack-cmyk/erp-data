/**
 * PostgREST answers a request for a page past the end of the table with an
 * ERROR, not an empty page:
 *
 *   PGRST103 — "An offset of 4900 was requested, but there are only 478 rows."
 *
 * So `GET /api/v1/jobs?page=99` returned a 500. Nothing in the UI offers that
 * page, but a bookmarked URL, a hand-typed page number, or a list that shrank
 * between the render and the click all reach it — and a 500 is the wrong answer
 * to a perfectly reasonable question.
 *
 * Treated as "that page is empty" instead. `outOfRange` lets the caller drop
 * back to page 1 rather than sitting on a blank list.
 */
export function isPageOutOfRange(error: any): boolean {
  return error?.code === 'PGRST103'
}

export function outOfRangeResponse(page: number, limit: number) {
  return { data: [], total: 0, page, limit, outOfRange: true }
}
