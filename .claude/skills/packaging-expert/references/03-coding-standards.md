# Coding Standards — Next.js / React / TypeScript / Supabase

## First move: match the existing codebase

Before writing a single line, look at how the project already does things —
folder structure, component patterns, data-fetching approach (Server
Components vs. client hooks vs. a data layer), naming conventions, how
Supabase clients are instantiated. Consistency with the existing codebase
beats any "best practice" imposed from outside. Only fall back to the
defaults below when there's no existing convention to follow (e.g., a new
module, or the user explicitly asks you to establish one).

## TypeScript

- No `any` in new code. If a type is genuinely unknown, use `unknown` and
  narrow it, or generate/derive it from the Supabase schema
  (`Database['public']['Tables']['jobs']['Row']` pattern from generated
  types) rather than hand-writing a parallel type that can drift from the
  DB.
- Prefer generated Supabase types as the source of truth for DB shapes;
  hand-written interfaces for DB rows are a maintenance trap — they silently
  go stale after a migration.
- Model workflow status fields as string literal unions or enums matching
  the DB constraint/enum exactly — don't let TypeScript and Postgres
  disagree about what values are valid.
- Validate all external input (form submissions, API route bodies, webhook
  payloads) with a schema library (zod or equivalent, whatever the project
  already uses) at the boundary — don't trust `req.body` shape from
  TypeScript types alone, since types don't exist at runtime.

## Next.js / React

- Default to Server Components for data fetching where the project uses App
  Router; keep client components focused on interactivity (forms, modals,
  drag/drop scheduling boards). Don't fetch data client-side just because
  it's familiar if the project has already standardized on server-side
  fetching.
- Keep Supabase calls out of deeply nested components — centralize data
  access (a `lib/data/*.ts` or `queries/*.ts` layer, matching whatever
  pattern the repo already has) so RLS-dependent queries are written once
  and reused, not copy-pasted with subtly different filters each time.
- Server actions/API routes that mutate data must re-validate
  authorization server-side (role, company membership) even though RLS is
  also a backstop — defense in depth, not either/or.
- Loading and error states are not optional for any data-fetching
  component that a shop-floor or office user will actually rely on daily —
  a blank screen or an unhandled promise rejection on the dispatch board is
  a business-stopping bug, not a cosmetic one.
- Avoid prop-drilling workflow state (current job status, permissions)
  through many layers — use context or the project's existing state
  pattern, matched to what's already there.

## Supabase usage patterns

- Use the typed client (`createClient<Database>()`) everywhere, not the
  untyped default — this is what makes the TypeScript rule above actually
  enforceable.
- Prefer `.select()` with explicit column lists over `select('*')` in
  application code that ships to production — explicit columns are
  self-documenting, avoid over-fetching (real cost on wide tables like
  `jobs` with many columns), and don't silently break when a column is
  added.
- Batch related writes in a Postgres function (RPC) or a transaction when
  multiple tables must change together atomically (e.g., approving a
  purchase order should update `purchase_orders.status` AND write an
  `inventory_movements` row for the goods receipt in one transaction, not
  two separate client calls that could partially fail).
- Realtime subscriptions (if used, e.g., for a live production board):
  clean up subscriptions on unmount, and don't subscribe to a whole table
  when a filtered subscription is sufficient — this matters at ERP scale
  once there are many concurrent users watching dashboards.

## Error handling

- Every Supabase call's `error` must be checked and handled, not just
  destructured and ignored (`const { data } = await supabase...` silently
  swallowing `error` is a recurring real bug — always destructure and
  check `error` too).
- User-facing errors should be understandable to non-technical shop-floor
  staff ("Couldn't save — plate count is required" not a raw Postgres
  constraint violation message). Log the raw error for developers, show a
  translated one to the user.
- Distinguish between validation errors (user's fault, fixable by them),
  authorization errors (they're not allowed, don't leak why in detail),
  and system errors (log and alert, show a generic retry message).

## Code review checklist (apply when reviewing, not just writing)

When asked to review code or a PR, actually work through this rather than
giving a general impression:

- [ ] Does it match the existing patterns in this codebase, or invent a new
      one without reason?
- [ ] Are all Supabase `error` results checked?
- [ ] Any raw SQL string concatenation with user input anywhere (SQL
      injection risk, even inside RPC calls)?
- [ ] Any `any` types or untyped Supabase calls introduced?
- [ ] Does a new table have RLS enabled and policies written?
- [ ] Does a migration touching an existing table follow the migration
      discipline in `02` (backward compatible, lock risk assessed)?
- [ ] Are money/quantity fields `numeric`, not `float`?
- [ ] Is there a loading/error state for new UI that fetches data?
- [ ] Does the change touch a workflow stage transition — if so, is the
      transition validated (can't skip Client Approval to reach Plates,
      etc.) and audited (see `10`)?
- [ ] Any secrets, service-role keys, or `.env` values hardcoded or shipped
      to the client bundle?
- [ ] Would this scale to realistic volume (hundreds of jobs/day, years of
      history) or does it assume a small demo dataset (e.g., unpaginated
      `select *` on `jobs`)?

## Testing expectations

Match the project's existing test setup rather than introducing a new
framework. At minimum, flag when a change to costing logic, workflow-stage
transition rules, or invoice calculation ships without any test coverage —
these are the categories of bug that are expensive in production and cheap
to catch with a unit test.
