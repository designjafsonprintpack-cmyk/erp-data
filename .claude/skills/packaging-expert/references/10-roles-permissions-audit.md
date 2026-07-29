# Multi-Company, Roles & Permissions, Audit Logs

## Multi-company design

- Decide (or ask, per `02`) whether companies are **fully isolated**
  (separate customers, machines, stock, users see only their company) or
  **share some master data** (a group with shared customers or shared
  machine inventory across branches). This decision drives whether
  `company_id` scoping is absolute or whether some tables are shared with
  a different access model. Don't assume — this varies a lot by business
  structure, and it's expensive to unwind after data exists.
- A user may belong to more than one company (e.g., an owner overseeing two
  branches) — model this as a `user_companies` join table with a role per
  company-membership, not a single `company_id` column on `users`, unless
  the user has confirmed single-company-per-user is intentional.
- Cross-company reporting (a group-level dashboard rolling up multiple
  companies) is a legitimate need for owners/admins but must be explicitly
  permissioned — it's a common place where multi-tenant isolation gets
  accidentally weakened "just for the admin view." Keep it behind an
  explicit role check, and prefer a separate, clearly-named
  query/view/role rather than a flag that quietly disables RLS.

## Role design

Typical roles worth supporting explicitly (adapt to what the shop actually
has — confirm rather than assuming this exact list applies):

- **Owner/Admin** — full access within their company/companies, including
  costing/pricing data and user management.
- **Sales** — customers, orders, estimates; typically not raw
  material cost or machine-rate data.
- **Production Manager / Planner** — Job Planning, scheduling, all
  production stages, plates; often can see cost data, sometimes not
  pricing/margin.
- **Machine Operator / Shop Floor** — narrow access: their assigned jobs'
  current-stage actions (start/complete/QC note) only, not the full order/
  customer/pricing picture. This role benefits most from the
  simplified-UI guidance in `06`.
- **Purchase** — purchase requests/orders, inventory, vendor data.
- **Dispatch** — dispatch records, customer contact for delivery
  coordination.
- **Accounts/Finance** — invoicing, cost/margin reports, possibly purchase
  approval above a threshold.
- **Client (external, if the ERP exposes anything to customers directly)**
  — extremely narrow: view/approve their own artwork, view their own order
  status. Treat as a fundamentally different trust level from internal
  roles — never reuse internal role/permission logic for client-facing
  access without a dedicated review.

## Permission granularity

- Two axes usually matter: **what module/action** (view orders, edit
  purchase orders, approve purchases over threshold) and **what scope**
  (own company only, own jobs only, all jobs). Model both explicitly rather
  than conflating "role" with "permission" — a role is a named bundle of
  permissions, and shops often want to customize the bundle (e.g., "this
  particular Sales person can also approve purchases") without inventing a
  whole new role each time. A `permissions` table plus `role_permissions`
  and optional `user_permission_overrides` is a defensible pattern if the
  project needs that flexibility — confirm the shop actually needs
  per-user overrides before adding that complexity; a fixed role set is
  simpler and often sufficient.
- Enforce permission checks **server-side** for every mutation (see `04`);
  UI-level hiding of buttons is a UX nicety, not a security control.
- Threshold-based approval (e.g., purchases over a currency amount need a
  second approver) is a common real rule in this industry — support it as
  configurable data (a threshold value per company/role), not a hardcoded
  constant in application code.

## Audit logs

- Maintain a general-purpose `audit_log` (or well-named equivalent)
  capturing, at minimum: `table_name`, `record_id`, `action` (insert/
  update/delete/status_change), `actor_user_id`, `old_value`/`new_value`
  (jsonb is a reasonable choice for flexibility across tables), `company_id`,
  `created_at`.
- Populate it via **database triggers** where feasible, not solely
  application-code logging — triggers guarantee the log happens regardless
  of which code path performed the change (including admin scripts, RPC
  calls, or future code you haven't reviewed), whereas application-level
  logging only covers the paths someone remembered to instrument.
- Workflow **stage transitions specifically** deserve either their own
  dedicated history table (`job_stage_history`: job_id, from_stage,
  to_stage, actor, timestamp, notes) or clearly filterable entries in the
  general audit log — this is the data that answers "who approved this and
  when" and "how long did this job sit in each stage," both of which come
  up constantly (disputes, process improvement, Reports).
- **Client approvals** need audit-grade record-keeping specifically (see
  `01`) — capture not just that it was approved but how (system login,
  WhatsApp confirmation, signed proof) since this may matter for resolving
  a later disagreement about what was approved.
- Audit log tables should be **append-only** at the application permission
  level — no role should have UPDATE/DELETE on `audit_log` through normal
  application paths; if correction is ever needed, it should itself be a
  new audit entry, not a mutation of history.
- Don't let audit logging become a performance bottleneck (see `05`) —
  index `(table_name, record_id)` and `(company_id, created_at)` for the
  common query patterns (history of one record; recent activity for a
  company), and consider retention/archival policy for very old entries if
  volume becomes large, rather than assuming the table can grow forever
  with the same query performance.

## Confirm before building

Role/permission and multi-company design encode real business decisions
(who's allowed to see cost data, whether branches share customers, what
approval thresholds apply) that Claude cannot correctly guess. When asked
to implement or change this area, ask for the specific rules rather than
inventing a plausible-sounding default — getting this wrong is both a
security issue and, often, an internal trust/politics issue for the
business.
