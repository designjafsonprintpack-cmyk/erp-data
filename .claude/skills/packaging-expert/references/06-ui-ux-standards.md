# UI/UX Standards

## Know the actual users

This ERP's users are not developers and often not full-time office staff —
they include shop-floor supervisors, machine operators, and dispatch staff,
frequently using it on a shared terminal or a phone, sometimes with ink on
their hands or between production runs. Design decisions should reflect
that, not assume the polished-SaaS-dashboard user profile.

- Large, unambiguous tap targets on any screen likely to be used on a
  tablet/phone at a machine (stage completion, QC pass/fail).
- Minimize required typing on the floor — prefer selects, toggles, scan
  (barcode/QR if in use), and numeric keypads over free-text where the
  value is one of a known set.
- Status should be visually obvious at a glance (color-coded stage badges)
  — someone glancing at a production board from across the room needs to
  read job status without reading text.

## Workflow-first navigation

- The primary navigation should mirror the actual workflow (Sales →
  ... → Reports), not an arbitrary feature list — users think in terms of
  "where is this job right now," not "which database table am I editing."
- A job's detail view should show its **current stage and history**
  prominently — don't bury workflow state below tabs; it's the single most
  important piece of information on that screen for most roles.
- Make the "next action" obvious. If a job is sitting in Client Approval
  awaiting response, the UI should surface that as an actionable item
  (e.g., "3 jobs awaiting client approval, 2 overdue"), not just a filter
  the user has to remember to apply.

## Forms

- Long forms (Estimation, Job Planning) should be broken into logical
  steps/sections with clear progress indication, not one enormous scroll —
  but don't force a rigid wizard if users need to jump between sections
  (real estimation work is non-linear: someone checks paper cost, goes back
  to adjust quantity, checks it again).
- Auto-save or clear save-state indication on longer forms — losing an
  estimate someone spent twenty minutes on because of a session timeout is
  a genuinely damaging UX failure in this context.
- Validation errors should be specific and inline ("Plate count is required
  for a 4-color job") not a generic "form invalid" banner.
- Pre-fill from history where it saves real time (repeat customer →
  suggest last order's spec as a starting point) — printing/packaging has a
  lot of repeat business, and the UI should reward that rather than
  treating every order as starting from zero.

## Dashboards

- Lead with what's overdue or blocked, not just a count of everything —
  "jobs stuck in Client Approval > 3 days" is more useful than "12 jobs in
  Client Approval."
- KPIs should be role-relevant: a machine operator's dashboard and an
  owner's dashboard should not look the same. Don't build one dashboard and
  hide/show widgets by permission as an afterthought — design each role's
  view around what decisions that role actually makes day to day.
- Common KPIs worth surfacing (see `01`/`08` for the underlying data):
  job profitability (estimated vs. actual), on-time dispatch rate, machine
  utilization, plate/die reuse savings, wastage rate by stage, purchase
  approval turnaround, overdue client approvals.

## Artwork & approval UI specifically

- Version history must be visually clear — show version number, who
  uploaded, when, and status, with an obvious way to view/download any
  prior version, not just the latest.
- The client-facing approval view (if clients interact with the system
  directly, e.g., via a shared link) should be dead simple — a proof image,
  an approve/reject action, and an optional comment field. Don't expose
  internal workflow complexity to an external client.

## Accessibility and reliability basics

- Sufficient color contrast on status badges — color-coding is useful but
  should not be the *only* signal (pair color with a text label/icon) for
  colorblind users, which matters more than usual in a color-heavy printing
  context.
- Every screen that fetches data needs a visible loading state and a
  recoverable error state (retry action, not a dead end) — see `03`.
- Confirm destructive or hard-to-reverse actions (cancelling a job,
  deleting a purchase order, rejecting artwork past a certain point) with
  an explicit confirmation step, proportional to how costly a mistake would
  be.

## Consistency

Match whatever design system/component library the project already uses
(check for shadcn/ui, MUI, a custom component set, Tailwind conventions,
etc. in the codebase) rather than introducing new patterns. If asked to
design something new and no convention exists yet, keep it simple, dense
where operational efficiency matters (data tables, production boards), and
avoid decorative complexity that slows down someone using this system fifty
times a day.
