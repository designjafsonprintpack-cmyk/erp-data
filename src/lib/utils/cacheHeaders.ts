/**
 * Cache-Control for reference/lookup-data GET endpoints (material types,
 * workflow templates, units/currencies/taxes, cost item types, etc.) —
 * data that changes rarely (a settings page edit, not a business
 * transaction) but is fetched repeatedly for dropdowns across the app.
 *
 * `private` — this response is scoped to the caller's own company (from
 * their JWT), so it must never be cached by a shared/CDN cache that could
 * serve one company's reference data to another. Only the browser making
 * the request may cache it.
 *
 * `max-age=300` (5 minutes) — short enough that an edit to a reference-data
 * table (e.g. adding a new Board Type) shows up for that browser tab within
 * a few minutes without needing any manual cache-invalidation wiring on the
 * write routes; long enough to meaningfully cut repeat requests for data
 * that's read far more often than it's written.
 */
export const REFERENCE_DATA_CACHE_HEADERS = {
  'Cache-Control': 'private, max-age=300',
} as const
