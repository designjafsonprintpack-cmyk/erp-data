# Worked Examples

These show the *shape* of how to apply this skill's rules to real requests.
Adapt the specifics; keep the pattern — analyze, name affected files, flag
risk, then implement.

## Example 1: "Add a field to track lamination film type"

**Bad response (what this skill must not do):** immediately write an
`ALTER TABLE lamination_runs ADD COLUMN film_type TEXT;` and a form field,
without looking at anything else.

**Good response pattern:**
1. Ask to see (or read, if shared) the current `lamination_runs` (or
   equivalent) table definition and the form/component that creates
   lamination records — don't assume the table or component name.
2. Note it: e.g., "film type" should likely be a constrained set (gloss/
   matte/soft-touch/none), not free text — check whether the project uses
   an enum type or a lookup table pattern elsewhere and match it (`02`).
3. Check whether `film_type` should live on `lamination_runs` (per-run) or
   be inherited from Job Planning (decided once, per job) — ask if the
   shop wants operators choosing it at run time or planners deciding it
   upfront. This is a real business-process question, not a technical
   detail.
4. State affected files: the migration, the generated Supabase types (if
   the project regenerates them), the form component, and any report that
   might want to break down wastage or cost by film type later (flag as a
   future enhancement, don't build it unasked).
5. Write the migration with the discipline in `02` (nullable/default so
   it's backward compatible, no lock risk at typical table size — state
   that assumption), the typed form field with validation, and confirm the
   enum/lookup values with the user rather than inventing a list.

## Example 2: "Client approval isn't blocking jobs from reaching Plates — a job got plates made without approval"

This is a **workflow-integrity bug**, treat it as higher severity than a
cosmetic bug.

1. Trace the actual transition logic: where in the code (or DB constraint)
   is the Plates stage allowed to start? Read that code before proposing a
   fix.
2. Identify why the gate failed — likely candidates to check: the check is
   UI-only (a disabled button that a direct API call bypasses), the check
   uses the wrong status field or a stale cached value, or there's a race
   condition (approval and plate-creation happening concurrently).
3. Fix it at the **most enforceable layer** — ideally a database constraint
   or trigger that rejects a `plates` insert/status-change if the related
   job's approval status isn't `approved`, in addition to (not instead of)
   the UI check. Relying on UI-only validation for a business-critical gate
   is exactly the kind of gap this skill exists to catch.
4. Recommend an audit query to find any other jobs that may have skipped
   the gate historically, so the business can address the immediate data
   integrity issue, not just prevent recurrence.
5. Don't rewrite the whole approval module while fixing this — scope the
   fix to the actual gap (rule 7 in the main SKILL.md).

## Example 3: "Build a job profitability report"

1. Confirm what "profitability" means precisely here before building:
   estimated vs. actual cost (per `08`)? Includes overhead allocation or
   just direct material/machine cost? Per job, per customer, per period?
   Don't guess a formula for something this consequential to the business
   — ask.
2. Identify data sources per `01`/`02`: Estimation for planned cost,
   Production/Inventory movements for actual cost, Invoice for revenue.
   Confirm these are reliably populated today — if actual-cost data isn't
   consistently captured yet, say so; a report built on sparse data will
   mislead more than it helps, and that's worth flagging before building.
3. Per `05`, recommend a materialized/aggregated approach if the join
   spans several large tables and doesn't need to-the-second freshness —
   state the tradeoff (data is as fresh as the last refresh) so the user
   can decide.
4. Design the UI per `06` — default to a bounded date range, allow
   drill-down from an aggregate view to the individual job.
5. Add company_id scoping and role checks (`04`, `10`) — profitability
   data is exactly the kind of thing that shouldn't leak across companies
   or down to roles that shouldn't see margin.

## Example 4: "Review this PR that adds WhatsApp dispatch notifications"

Work through the code review checklist in `03`, plus domain-specific
checks:
- Is the webhook/send call wrapped so a provider failure doesn't block the
  dispatch record from saving (`07`)?
- Is the send logged (`notification_log`) with enough detail to answer "did
  the customer get notified" later?
- Is the message built from a template, and if it's WhatsApp, does it fit
  an approved template / session-window rule (`07`)?
- Does the phone number come from a validated, access-controlled source,
  not a free-text field with no validation (`04`)?
- Is there a retry/alert path on failure, and is it visible to a human
  (not just a swallowed error)?
- Does the notification only fire once per dispatch event, even under
  retry/race conditions (idempotency, `07`)?

Report findings by severity (`04`'s severity framework), not as one flat
list — a missing retry path is not the same severity as a phone number
field with no validation.

## Example 5: "We're adding a second company (a new branch) — what changes?"

This is the moment multi-tenancy design (`02`, `10`) gets tested for real.
1. Ask the isolation-vs-shared-data question from `10` explicitly if it
   hasn't been answered before — this determines everything else.
2. Audit existing tables/queries for `company_id` scoping — this is when
   any table that was built assuming single-company (missing the column,
   or a query without the filter) becomes a real bug, not a theoretical
   one. Check RLS policies exist and are correct on every business table,
   not just the ones obviously related to the new company's initial use
   case.
3. Check for any hardcoded assumptions in code (a single default company
   ID, a query missing a `.eq('company_id', ...)` filter that happened to
   work because there was only ever one company) — these are exactly the
   bugs that stay invisible until a second company's data shows up next to
   the first.
4. Recommend a staged rollout: verify isolation with the new company's data
   in a non-production environment first, given how costly a cross-company
   data leak would be to the business relationship.
