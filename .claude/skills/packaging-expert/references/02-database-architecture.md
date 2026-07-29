# Database Design & Architecture — Supabase / PostgreSQL

## Before touching schema at all

Never propose a `CREATE TABLE`, `ALTER TABLE`, or column change without
having actually seen the current schema (migration files, `schema.sql`,
generated Supabase TypeScript types, or the user pasting `\d table_name`
output). If you haven't seen it, ask for it — specifically ask for the
migration history or current schema dump, not just "tell me about your
database." Guessing column names/types in an ERP is how you get silent data
corruption.

When you *do* have the schema, actually read it: check existing naming
conventions, whether they use `uuid` or `bigint` PKs, whether soft deletes
exist, whether RLS is already enabled on similar tables, and whether there's
an existing pattern for audit columns. Match it. Don't introduce a second
convention into a codebase that already has one.

## Core design principles for this ERP

### 1. Multi-company from the start
If the ERP supports multiple companies (tenants), **every business table**
needs a `company_id` (or `organization_id`) foreign key, and RLS policies
must filter on it. Retrofitting multi-tenancy later is a major migration —
if there's any chance this ERP will ever run more than one company, design
for it now rather than bolting it on. Ask the user directly if this is
unclear; don't assume single-tenant.

### 2. Ledger tables over mutable balances
Inventory stock, plate usage, and job costing all have a "current balance"
that people want to see, but the source of truth should be an **append-only
ledger** (`inventory_movements`, `plate_usage_log`, etc.) with the balance
computed (via view, materialized view, or trigger-maintained cache column)
— not a single row that gets UPDATEd in place. This is what makes "why is
stock wrong" answerable six months later.

### 3. Status/state as an explicit, constrained field
Every workflow-stage table needs a `status` column with a **constrained set
of values** — either a Postgres `ENUM` type or a `CHECK` constraint, plus
(ideally) a small reference/lookup table if the set of statuses might grow
or needs metadata (display label, color, sort order). Don't leave `status`
as a free-text column with values enforced only in application code — that
drifts.

### 4. Versioning for artwork and any client-facing approval
Artwork files are never overwritten — new version, new row, `version_number`
column, link to the previous version. Same principle applies to any
document a client formally approves (proofs, final specs) — you need to be
able to show, later, exactly what was approved.

### 5. Audit trail as a first-class concern, not an afterthought
Minimum on every business table: `created_at`, `created_by`, `updated_at`,
`updated_by`. For workflow-stage transitions specifically, also maintain a
separate `*_history` or generic `audit_log` table capturing
`(table_name, record_id, action, old_value, new_value, actor, timestamp)` —
see `10` for the full pattern. Triggers are usually the reliable way to
guarantee this happens even if application code has a bug.

### 6. Foreign keys are not optional
Every relationship should be an enforced FK, not "an ID that happens to
match." An ERP with orphaned `job_id` references is an ERP that will
eventually show a report with silently-dropped rows or a crash on a join.
If a FK is being intentionally deferred (e.g., during a migration), say so
explicitly rather than leaving it implicit.

### 7. Money and quantities
- Use `numeric`/`decimal`, never `float`/`double precision`, for money,
  costs, and any quantity that feeds costing or invoicing. Floating point
  rounding errors compounding across job costing → invoicing is a real,
  embarrassing bug class.
- Store currency explicitly if multi-currency is even remotely possible.
- Be explicit about units (GSM, sheets vs. reams, per-unit vs. per-job) in
  column names or comments — "quantity" alone is ambiguous in this industry
  (ordered qty, produced qty, dispatched qty, wastage qty are all different
  numbers that must not be conflated).

## Row Level Security (RLS)

Supabase's value proposition is largely RLS-enforced multi-tenant security —
use it, don't bypass it with service-role keys from client-reachable code.

- Enable RLS on every table containing business data. A table with RLS
  disabled "temporarily to make development easier" is a security incident
  waiting to happen — flag this every time you see it, even if it's not
  what you were asked to look at.
- Standard policy pattern for multi-company data:
  ```sql
  create policy "company_isolation_select"
  on public.jobs
  for select
  using (company_id = (select auth.jwt() ->> 'company_id')::uuid);
  ```
  Adapt to however this project resolves the current user's company (JWT
  claim, a `user_companies` mapping table, etc.) — check what pattern
  already exists before proposing a new one.
- Layer role-based policies on top of company isolation, don't replace it
  — a user should never see another company's data regardless of role.
- Service-role key usage (which bypasses RLS) belongs only in trusted
  server-side code (API routes, server actions, edge functions) — never
  shipped to the browser. If you see a service-role key anywhere in
  client-bundled code, that's a critical security finding, say so plainly.
- Write policies for `select`, `insert`, `update`, and `delete` separately
  and explicitly — don't assume a `select` policy implies safety on writes.

## Migration discipline

For every migration, think through and state:

1. **Is it backward compatible with currently-deployed application code?**
   Adding a nullable column: yes. Renaming/dropping a column the app still
   reads: no — needs a coordinated deploy or an expand/contract approach
   (add new column → backfill → migrate app to new column → drop old column
   in a later migration).
2. **Does it lock a large table?** `ALTER TABLE ... ADD COLUMN ... NOT NULL
   DEFAULT ...` on Postgres 11+ is fast for a constant default, but adding a
   `NOT NULL` without a default, or changing a column type, can require a
   full table rewrite and an exclusive lock — flag this for any table
   likely to have significant rows (jobs, inventory_movements, invoices).
3. **Does it need a backfill?** If yes, write the backfill as a separate,
   explicit step (and mention whether it should run in batches for a large
   table), don't bury it inside a migration that also changes constraints.
4. **Does it touch RLS policies?** Adding a column doesn't usually require
   policy changes, but adding a new table always needs its own RLS policies
   — don't let a new table go live without them.
5. **Is it reversible?** State whether there's a safe rollback and what it
   is. If not reversible (e.g., a destructive column drop), say so
   explicitly and confirm the user wants to proceed.
6. **Supabase-specific**: check whether generated TypeScript types
   (`database.types.ts` or similar) need regenerating after the migration,
   and mention it if the project uses generated types.

## Suggested high-level schema shape (starting point, not gospel)

Treat this as a sanity-check reference, not something to impose on an
existing project. Core tables you'd expect to find or need in a system like
this:

- `companies`, `users`, `user_companies` (or a roles/membership table)
- `customers`, `customer_contacts`
- `orders` / `jobs` (the central spine — most other tables reference this)
- `estimates`, `estimate_line_items`
- `job_planning` (schedule, machine assignment)
- `artwork_versions`
- `client_approvals`
- `plates`, `plate_usage_log`
- `purchase_requests`, `purchase_orders`, `goods_receipts`
- `inventory_items`, `inventory_movements`
- `production_stages` (or one table per stage: `printing_runs`,
  `lamination_runs`, `die_cutting_runs`, `pasting_runs`, `packing_runs`)
- `dispatches`, `dispatch_items`
- `invoices`, `invoice_line_items`
- `audit_log`
- `notifications` (or `notification_log` if WhatsApp/email are fire-and-log)

A common, defensible pattern for the Production stages: **one parent
`production_jobs` row per job**, with **child rows per stage** in either a
single polymorphic `production_stage_events` table (`stage` enum +
`status` + timestamps + operator + notes) or separate tables per stage if
each stage genuinely has different structured fields (e.g., Printing needs
`ink_used`, `plates_used`; Lamination needs `film_type`). Prefer separate
typed tables when the fields genuinely differ — a single table with twenty
mostly-null columns is a worse design than five focused tables, even though
it looks simpler at first.

Don't impose this structure on an existing project without checking first —
if the user already has a schema, work with it and suggest changes
incrementally rather than proposing a rewrite.
