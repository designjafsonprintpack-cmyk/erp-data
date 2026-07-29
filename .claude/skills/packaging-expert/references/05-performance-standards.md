# Performance Standards

An ERP's pain shows up gradually — it's fast in the demo with 50 jobs and
slow eighteen months later with 50,000. Design and review with that
trajectory in mind, not just current data volume.

## Database query performance

- **Pagination is not optional** on any list of jobs, invoices, inventory
  movements, or audit log entries. `select('*')` without `.range()` or
  `.limit()` on a table that grows daily is a guaranteed future incident —
  flag it even if it "works fine" on today's data.
- **Index foreign keys and filter/sort columns.** At minimum: every FK
  column, every `status` column used in dashboard filters, every
  `created_at`/date column used for range queries or default sort order,
  and `company_id` on every multi-tenant table.
- **Watch for N+1 queries** — fetching a list of jobs, then looping to
  fetch each job's line items/artwork/plates individually. Use joins
  (`select` with nested resource syntax in Supabase, or a view) or batch
  fetches instead.
- **Use views or materialized views for expensive aggregate reports**
  (job profitability, machine utilization) rather than recomputing joins
  across many tables on every dashboard load. Materialize and refresh on a
  schedule if the report doesn't need to be real-time to the second.
- Composite indexes should match actual query patterns (e.g.,
  `(company_id, status, created_at)` for a filtered, sorted, paginated job
  list) rather than single-column indexes added reflexively.

## Application-level performance

- Dashboards showing many jobs/cards (production board, dispatch board)
  should fetch only the columns needed for the card view, not the full row
  including large text fields (notes, artwork metadata) — fetch details on
  demand when a card is opened.
- Debounce/throttle search-as-you-type inputs (customer search, job search)
  before firing a query.
- Cache reference/lookup data that rarely changes (status labels, machine
  list, paper types) client-side or via a short-TTL cache rather than
  refetching on every render.
- Realtime subscriptions (if used for live boards) should be scoped/filtered
  server-side, not "subscribe to everything and filter client-side" — that
  pattern degrades badly as data volume grows and doesn't actually reduce
  server load the way people assume.

## File handling performance

- Artwork files can be large (high-res print-ready PDFs). Don't load full
  files into memory in a serverless function without checking size limits;
  use signed URLs / streaming where the platform supports it rather than
  proxying large files through application code unnecessarily.
- Generate and cache thumbnails/previews for artwork rather than rendering
  full-resolution files in list views.

## Reporting-specific performance

- Job-profitability and similar cross-module reports (joining Estimation,
  Production, Purchase, Invoice) are the queries most likely to become slow
  first, because they touch the most tables and the most historical rows.
  When building these, default to a materialized/aggregated approach and
  say so, rather than a live multi-join query, unless the user specifically
  needs real-time freshness and has confirmed the data volume is small.
- Date-range filters on reports should be indexed and, ideally, the report
  should default to a bounded range (e.g., "this month") rather than
  querying full history by default.

## When to actually worry vs. not

Be calibrated, not reflexively cautious — don't recommend
materialized-view infrastructure for a table that will realistically hold a
few thousand rows. Ask or infer scale (how many jobs/day, how many
companies) before prescribing heavy solutions; a small shop's ERP doesn't
need the same architecture as a 50-company multi-tenant platform. State the
assumption you're making about scale so the user can correct it.
