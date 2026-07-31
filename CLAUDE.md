# Jafson Print ERP

Multi-tenant ERP for Jafson Print Pack, a printing & packaging company in Lahore.
Built and maintained entirely through conversation with Claude — Mehboob is a
designer and business owner, not a developer.

**Read this whole file before touching anything.**

---

## 1. How to work here

These rules exist because breaking them has cost real time on this project.

1. **Verify fresh against the actual code. Never trust a description — including
   this file.** Repeatedly, tasks framed as "big risky rebuilds" turned out to be
   already built, or already broken in a different way, or not needed at all.
   Read the files before forming a plan.

2. **Never guess the schema.** Check `src/types/database.types.ts` and the
   relevant file in `supabase/migrations/` before writing a query, a column, or a
   migration. The universal table pattern below has real exceptions.

3. **Before saying a task is done, run both:**
   ```
   npx tsc --noEmit      # must be 0 errors
   npm run build         # must say "Compiled successfully"
   ```
   `tsc` alone misses ESLint errors that fail the Vercel build. Both, every time.

4. **Prove the change, don't just compile it.** A build passing says nothing about
   whether the feature works. Grep the output, write a scratch assertion script,
   or render-test the component (see §8). Several bugs here passed `tsc` and the
   build and were still wrong.

5. **One task at a time.** Finish, verify, report, stop.

6. **Flag what you noticed but didn't fix.** Out-of-scope problems get mentioned,
   not silently fixed and not silently ignored.

---

## 2. Stack & commands

- Next.js 14.2.5 App Router · TypeScript strict · Tailwind 3.4
- Supabase (Postgres + RLS + Storage + Realtime) · deployed on Vercel
- Repo `designjafsonprintpack-cmyk/erp-data`, branch `main`. Vercel project
  is named `jafson-erp`.

```
npm run dev            # local
npm run build          # full production build — the real gate
npx tsc --noEmit       # type check
```

Company seed UUID: `00000000-0000-0000-0000-000000000001`

Deployment is Mehboob's job: `npm run dev` → `npm run build` → GitHub Desktop →
Vercel. **Always tell him which SQL migrations must run first, and in what
order.** Code deployed before its migration means a 500 on save.

---

## 3. Architecture rules

- Every table carries `id, company_id, created_at, updated_at, created_by,
  updated_by, deleted_at, is_active`. Soft-delete only.
  **Exceptions — verify, don't assume:** line-item child tables
  (`sales_order_items`, `purchase_order_items`, `invoice_items`,
  `dispatch_items`) have `is_active` but no `deleted_at`; `jobs` delete is a
  real hard delete.
- `company_id` is **always** resolved server-side from the JWT, never taken from
  a client request body. `createSupabaseServerClient()` is synchronous.
- Every migration ends with `NOTIFY pgrst, 'reload schema';`
- Supabase calls use the `(supabase as any)` / `.from('x' as any)` convention
  throughout. This is deliberate and codebase-wide — do not "clean it up"
  file-by-file; removing it properly is a dedicated typed-client refactor.
- Every component: named export **and** default export. `'use client'` on
  interactive ones.
- Print pages live in `src/app/print/` — plain HTML/CSS, no Tailwind, and
  **hardcoded hex, never CSS variables** (paper output must not follow the theme).
- Customer-facing links (quotation approval, customer portal, artwork approval)
  use the token-link pattern: crypto-random token + expiry column on the row,
  service-role client, validated server-side. No separate auth.
- JWT claims from `custom_access_token_hook`: `app_role`, `company_id`,
  `department_id`, `full_name`, `user_table_id`.

### Migrations
Highest migration so far: **125**. **Always `ls supabase/migrations/` and check
the real highest number** before creating a new one — don't trust this line.
Additive and reversible wherever possible. Say so in a header comment: what
broke, why this fixes it, and how to undo it.

---

## 4. Domain rules (locked in — don't redesign these)

- **Sheet Qty = ceil(Box Qty / Ups).** `ups` is *always* a manual estimator
  input. Imposition/auto-nesting was considered and permanently declined.
- Standard Carton workflow: Artwork → Customer Approval → Planning → Board Issue
  → Printing → Lamination → UV Coating → Die Cutting → Hot Foil → Folder Gluing
  → Packing → Dispatch.
  **The live `Standard Carton Workflow` template has 10 stages, not this 12** —
  Lamination and Hot Foil were removed by hand and stay removed; those jobs use
  the `Carton with Lamination / Foil` template (111). See 107 and 111.
- **Which template a new job gets is decided by its box type** (110), through
  `resolveWorkflowTemplateId()`. Not by whoever remembers the dropdown.
- Stage gating goes through `checkStageGate()` in
  `src/lib/utils/jobStageGate.ts` — the single gate used everywhere. Explicit
  rows in `workflow_stage_dependencies` win; unconfigured stages fall back to
  sequential.
- Printing is **hard-blocked** without an active `job_plates` row.
  Board stock shortfall is a **soft warning only** — the shop legitimately uses
  bigger board or starts short. Follow that precedent: warn, record, don't block.
- **A press proof IS a job**, not a child table. Mehboob's own correction:
  *"yay job ki terha hi hay bas is ka tag proofing hota hay"* — 100/200/500
  sheets pulled on the real press so the customer sees real colour. Modelled as
  `jobs.job_kind = 'proofing'` + `parent_job_id`, so it reuses board issue, MRN,
  plates and costing with zero new machinery. Numbered `PARENT-P1`, `-P2`…
  Its `sheet_qty` is the sheet count and `quantity` is 0 — a proof has no boxes.
  Once any proof run exists, **Printing on the parent is hard-blocked until one
  is approved**; a proof job itself is exempt or nothing could ever print.
  Proof runs are hidden from the jobs list by default (`?kind=` filter).
- Board Issue start auto-creates a draft MRN; complete is blocked until the MRN
  is `issued`.
- Pricing/accounting fields are deliberately absent from Sales Orders and Job
  Cards. The Print Job Card shows no workflow checklist.
- Job edit/delete is **superadmin only** — deliberately excluding `owner`, unlike
  every other permission check.
- Doc prefixes: `JOB- DISP- PO- INV- QT- SO- CUST- VND- MRN-`
- Roles: superadmin, admin, owner, ceo, gm, sales, artwork, planning, store,
  printing, dispatch, **plates, qc, purchase, accounts** (last four added in 105).
  `users.role` is free text, more can be added via UI.
  The `printing` role already covers lamination → die cutting → hot foil →
  folder gluing → packing, so its label is **"Production Operator"**; the slug
  stays `printing`. A separate production role would be a duplicate — 105
  considered and rejected one.
  **Only superadmin / owner / ceo / gm get `delete`, `settings`, `admin`.**
  Purchase and Accounts deliberately get **no `approve`** — whoever raises a PO
  or an invoice must not also approve it. QC is the exception: approve/reject
  *is* its job.
- Single location. Multi-branch, multi-plant and inter-plant transfer were
  explicitly declined — do not propose them again.

### GSM — three separate values, never collapsed into one
This was worked out carefully; don't "simplify" it.

| | Where | Rule |
|---|---|---|
| **Quoted** | `quotation_items.board_gsm` | Frozen. Nothing ever writes back to it. |
| **Planned** | `jobs.gsm` | From the quoted value via the sales order, else chosen from GSMs that exist in `board_inventory`. |
| **Actual** | derived, never stored | From the MRN's `board_item_id` → `board_inventory.gsm`. See `src/lib/utils/jobIssuedGsm.ts`. |

**Planned is never overwritten by actual.** The gap between them is the audit
trail — the customer approved one weight, purchasing may have bought another to
save cost, and both facts have to survive.

GSM belongs to the **stock item**, never to the board type — one board type is
stocked in many weights. `board_types.gsm` exists but is meaningless and
deliberately left empty. Never read from it.

---

## 5. Traps that have actually bitten

- **A pglite migration test proves the MIGRATION, not the real table.** 124's
  test rebuilt `job_artworks` from scratch with only the columns 124 touches,
  so it never saw 015's `UNIQUE (company_id, job_id, version)` — which
  contradicted the new per-design index and made the very first two-design
  upload on live fail with a duplicate-key error. 26 assertions had passed.
  **Before adding a rule that overlaps an existing one, read the original
  `CREATE TABLE`** for constraints, triggers and indexes, and rebuild the test
  table with them. `information_schema.columns` is not the schema. Fixed by 125.
- **`.pl-safe` / `.pr-safe` / `.pb-safe` SET padding, they don't add to it.**
  They're declared after Tailwind's utilities so they win the cascade, and the
  insets are `0px` on desktop and on any phone in portrait. Never pair one with
  a `p*-4`. Use `pl-[calc(1rem+var(--safe-left))]`. Cost two separate bugs.
- **Never write an opacity modifier on a CSS variable colour** —
  `bg-[var(--color-danger)]/10`, `border-[var(--color-warning)]/30`. Tailwind
  v3 cannot inject alpha into a `var()`, so it emits **no rule at all**: the
  background tint silently vanishes and the border falls back to Preflight's
  `#e5e7eb`, which reads as a bright white line on every dark theme. It cost
  **573 broken utilities across 64 files** before anyone spotted it, because
  nothing errors — the UI just looks flat and off-theme. The working form is
  `bg-[color:color-mix(in_srgb,var(--color-danger)_10%,transparent)]`
  (underscores for spaces, `[color:...]` hint required so Tailwind treats the
  function as a colour). Verify by grepping the built CSS in
  `.next/static/css/` for the rule — if it isn't there, the class didn't exist.
- **Filled buttons take `--color-on-*`, never `text-white`.** White on the
  accent/success/warning/danger/info fills fails WCAG AA in all four dark
  themes (worst: white on dark-orange's warning at **1.67:1**). Each theme
  publishes `--color-on-accent`, `-on-accent-hover`, `-on-success`,
  `-on-warning`, `-on-danger`, `-on-info`, resolved per palette: white where it
  clears 3.2:1 (the band GitHub/Stripe/Linear ship for blue and red buttons),
  the theme's darkest surface where it doesn't. `-on-accent-hover` deliberately
  mirrors `-on-accent` so a label never flips colour mid-hover. `text-white` is
  still correct on hardcoded-hex backgrounds (the customer-facing approval
  pages) and on overlay badges.
  **Known residual, accepted:** 6 of 30 pairs stay in the 3.0–3.8 band rather
  than reaching 4.5 — the blue accent in `github-dark` and the red danger fill
  in all four dark themes. Dark ink on blue or red reads as broken, and this is
  what mainstream products ship. Closing it properly means separate darker
  *fill* tokens (Primer's `bgColor-accent-emphasis` pattern), not a label swap.
  Don't "fix" it by flipping those labels to ink.
- **Hardcoded hex is deliberate in two places only** — the token pages
  (`artwork/approve`, `portal`, `approve`; `text-white` is correct there) and all
  of `src/app/print/`. Both leave the building, so neither may follow the theme.
  Everywhere else: CSS variables only.
- **`cn()` is tailwind-merge.** Class order matters — a class passed in later
  silently cancels an earlier conflicting one. Caught only by render assertions.
- **Empty string vs Postgres.** A blank form control sends `''`, and Postgres
  rejects it on DATE, UUID, INTEGER and CHECK-constrained columns. All blank
  handling lives in one place — `blankToNull` / `blankToUndefined` in
  `src/lib/schemas/job.ts`. Nullable column → `NULL`; NOT NULL column → drop the
  key. Follow that pattern in other schemas.
- **Removing a field from a form means removing it from the form STATE and the
  request schema**, not just the JSX. A field nobody can see is still submitted.
- **A server component passing a function to a client one clears BOTH gates.**
  `settings/page.tsx` passed icon *components* to `SettingsClient`: `tsc` gave 0
  errors, `npm run build` said "Compiled successfully", and it still threw at
  render. Grep the whole build log, not the summary line. Anything holding a
  component or callback belongs inside the client file.
- **A `<select>` whose value isn't in the options renders blank — and the next
  save writes that blank back.** Hits any column storing a master-table *name*
  as text (`jobs.uv_coating`) once that row is renamed in Settings.
  `EditJobClient` appends the saved value back for this reason.
- **`ALTER COLUMN … TYPE` leaves NOT NULL behind.** 068 made `jobs.uv_coating`
  TEXT and made "no coating" mean NULL, but left the old NOT NULL — so saving a
  job with UV Coating = "None" 500'd for two years while the column's own
  COMMENT said NULL was fine. Fixed in **094**. Trust the constraint, never the
  comment.
- **`col-span-N` can't be built from a runtime number** — Tailwind scans source
  text and purges it. `DataList` solves this by publishing spans as CSS vars
  (`--sp-md`, `--sp-xl`) picked up by `.dl-cell` in globals.css.
- **`jobs` ↔ `job_artworks` can no longer be embedded without an FK hint.**
  Migration 104 added `jobs.proof_artwork_id → job_artworks(id)`, so there are
  now TWO relationships between those tables and PostgREST refuses to guess:
  *"Could not embed because more than one relationship was found"*. The whole
  query fails, and because the error was never read, **the Artwork page silently
  showed nothing** and the customer-facing artwork-approval token route was
  broken too, from 104 until this was found by the paging work.
  Correct form: `jobs!job_artworks_job_id_fkey(...)` going one way,
  `job_artworks!jobs_proof_artwork_id_fkey(...)` going the other. Fixed in
  `api/v1/artwork`, `api/v1/artwork/[id]/ai-preflight`,
  `api/v1/public/artwork/[token]`, `api/v1/dashboard/card-jobs` and
  `dashboard/artwork/page.tsx`.
  **Adding a FK between two already-related tables breaks every unhinted embed
  between them.** Grep for the pair before writing that migration.
- **A page past the end is a PostgREST ERROR, not an empty page** — `PGRST103`,
  *"An offset of 4900 was requested, but there are only 478 rows"* — so
  `?page=99` used to return a 500. Every paged route now answers with
  `outOfRangeResponse()` and `useServerPagedList` drops back to page 1.
- **PostgREST silently caps every `select()` at 1000 rows.** No error, no flag —
  the array just stops. Verifying migration 105 this way reported `qc = 5` and
  `purchase = accounts = 0` when the real figures are 14 / 18 / 17: the fetch had
  hit exactly 1000 rows partway through. Same disease as the 200-row stat cards
  103 fixed, one layer lower and far easier to miss because 1000 looks like
  "everything". **Count with `{ count: 'exact', head: true }`, or narrow the
  filter until the result is provably under the cap.** Never total a fetched
  array — not on a page, not in a throwaway audit script.
- **RLS on `user_roles` / `role_permissions` is COMPANY-scoped, not user-scoped.**
  Any client query must filter `user_id` explicitly or it returns every user's
  rows. This silently made client-side permission gating a no-op once.
- JWT: the claim is `app_role`, never `role` (reserved). The hook needs
  `SECURITY DEFINER`.
- Sidebar width 170px is set in **two** places — `src/styles/themes/index.css`
  (`--sidebar-width`, 5 occurrences) and hardcoded in `AppShell.tsx`. Both must
  stay in sync; drift once caused a 70px content gap.
- `StatCard` is duplicated across dashboard `page.tsx` and `DashboardPanel.tsx` —
  change both.
- `getUserTableId()` returns `string | null` — guard before passing on.
- Tailwind Preflight's `input::placeholder, textarea::placeholder` rule outranks
  a bare `::placeholder` override; match the selector shape exactly.
- `router.refresh()` does not refetch client-side fetches. `AutoRefresh.tsx` also
  dispatches an `erp:refresh` CustomEvent for that.
- Vercel Hobby rejects sub-daily crons at deploy time. `vercel.json` uses
  `0 4 * * *`. If the plan is upgraded to Pro, that one line can go back to
  `*/15 * * * *`.

---

## 6. Responsive / mobile

A full 9-phase responsive project (R0–R8) shipped. Before hand-rolling layout:

- Breakpoints: mobile `<768` (no prefix) · tablet `md:` · desktop `lg:` ·
  wide `xl:`. Desktop is `lg:`, **not** `md:`.
- Shared primitives already exist — use them instead of new grids:
  `DataList` (replaces 12-col list grids, gives cards on mobile automatically),
  `FormGrid` + `FormField`, `Toolbar`, `TabStrip`, `ScrollRow`, `PageHeader`,
  `DesktopOnly`, and a rebuilt `Modal`.
- **Every list is page-wise, 50 per page, and paged BY THE SERVER.** `LoadMore`
  and the browser-side filtering it fed on are both gone. Three pieces:
  `Pagination` + `LIST_PAGE_SIZE` (`src/components/ui/Pagination.tsx`),
  `useServerPagedList()` + `fetchAllPages()`
  (`src/lib/hooks/useServerPagedList.ts`), and `isPageOutOfRange()`
  (`src/lib/utils/pagedResponse.ts`).
  Rules that cost something to learn:
  - **The `.range()` in the page's server component must match
    `LIST_PAGE_SIZE`**, or page 1 and page 2 overlap.
  - **Every paged query needs `.order('id')` as a tiebreaker.** Rows sharing a
    `created_at` have no guaranteed order, so page 2 repeats rows page 1 already
    showed and drops others. The 478 legacy jobs all share one backdated
    `created_at`, which is how this was found.
  - **A filter that stays in the browser silently reinstates the cap** — it can
    only filter the page in hand. Every filter is a query param now: Dispatch's
    tabs (`statuses=pending,ready`), Plates' `assigned=none` / `job_number`,
    QC's `unresolved`.
  - **Export must not shrink to the current page.** `fetchAllPages()` walks the
    filter's pages so Export still means "what I filtered to".
  - **Anything the client used to derive from the whole array now needs its own
    query.** Plates' reuse dropdown and its job-number filter are two separate
    server-side lookups for exactly this reason.
  - **Clear row selection on page change** — ids that left the screen stay
    ticked otherwise, and Export includes them.
  - Stat cards NEVER come from the rows. Dispatch's three header counts are
    `count: 'exact', head: true` queries; QC's and Finance's come from exact
    counts / `get_finance_summary()`.
  QC has three independent pagers over three endpoints, one per tab, each scoped
  inside its own `{tab === '…' && …}` — a shared page number across tabs of
  different lengths shows an empty list.
  Numbered buttons are `hidden md:flex`; a phone gets Prev / "Page 2 of 10" /
  Next, because seven number buttons wrap at 360px.
  Proven end to end against the live database: all 10 pages of the 478 jobs
  walked with 0 repeats and all 478 reachable; 120 seeded plates all reachable
  with `status` / `search` / `assigned` applied in the query.
- Control heights: touch `h-11` · desktop `h-9`/`h-8`/`h-7` · operator `h-14`.
- **Desktop output must stay pixel-identical** unless a change is clearly an
  improvement. That promise has been kept through every phase.
- When Mehboob says something is "bahir ja raha hai", make it **fit** — don't add
  a scroll affordance and call it done. That mistake was made once.

Still unconverted (known, not urgent): several `settings/*` pages,
`admin/AdminClient`, `settings/audit-log`, `jobs/JobsKanban`, and the quotation
line-item table (fixed grid, no breakpoints, inside `overflow-hidden`).

---

## 7. Current state

Everything through v6 of the July 26 batch is built. If the working tree is
clean and matches, the following are live:

- GSM modelled as quoted/planned/actual, with planned-vs-issued shown on Job
  Detail and the printed Job Card, and a soft mismatch warning + reason capture
  in Store → Issue Materials
- Dashboard row 2: Recent Jobs | Machines | Alerts
- Quotation: Box Type on the line item (after Colors, before Board Type)
- New/Edit Job spec order: L / W / H / Ups · Sheet W / Sheet H / Board / GSM ·
  Colors / Quantity / Die Number / Box Type
- New / Repeat toggle on New Job, with a searchable parent-job picker
- Topbar: right controls pinned right, gutters additive to safe-area insets
- Artwork approval: WhatsApp-style markup editor (draw/arrow/box/text/emboss +
  undo, drafts saved in one `save_marks` call, shapes stored as 0–100 % points
  in `artwork_comments.shape`, rendered everywhere by `MarkupOverlay`); approver
  email optional, name still required — **needs migrations 089 + 090**

**Migrations 087 and 088 must have been run** (`jobs.gsm`,
`sales_order_items.gsm`). If job save or edit 500s, check these first.

### Workflow automation batch (migrations 091 + 092)
The "job apne aap agli stage par dikhe" work — a job now surfaces wherever it is
without anyone re-adding it:

- **091** filled `workflow_stages.department_id` for every stage (it had existed
  since 010 and was never populated, which is why Department Queue and stage
  notifications were silently empty for everyone), flipped `job_auto_assign` to
  `true`, and backfilled `jobs.current_stage_id`.
- **092** made **QC a real workflow stage** (`stage_type = 'qc'`, inserted before
  Dispatch in every template, owned by a new Quality Control department) and gave
  `job_costings` a `deleted_at`. The workflow route now refuses to complete a QC
  stage without a passing inspection — `pass` or `conditional_pass`; a `fail` or
  no inspection blocks it. **In-flight jobs do not get a QC row** (only jobs
  created after 092), the same precedent 086 set.
- `jobs.current_stage_id` is kept true by `syncJobCurrentStage()` on every
  start/complete/skip, and `closeJobIfWorkflowDone()` closes the job (status +
  `completed_date`) when the last stage finishes. Nothing else moves a job out of
  `in_progress`.
- Work queues: `loadStageQueue()` powers both `/api/v1/production/department-queue`
  and `/api/v1/production/stage-queue`; the six shop-floor pages (Printing …
  Packing) render `StageQueueClient`. Plates / Store / Dispatch / QC each carry an
  "action needed" panel fed by `jobsNeedingPlates` / `jobsAwaitingBoardIssue` /
  `jobsAwaitingDispatch` / `jobsAwaitingQC`.

### Going live (migrations 093 + 094)
Test data purged and document counters reset to `0`, then real history loaded.

- **Coating is settings-managed** — `Settings → Materials → Coating Types` drives
  the UV Coating dropdown on New and Edit Job; no hardcoded list remains.
  **"Soft UV" never existed** — S/UV is *Spot* UV in the trade. 093 renamed the
  master rows to `UV`, `Spot UV`, `Water Base`, `Drip-off`.
- **Legacy import — 48 customers + 478 jobs** from the old Excel, shaped so it
  never pollutes live work: `JOB-OLD-0001…0478` (a **separate series**; the live
  `JOB` counter stays at `0`), `status = 'completed'`, **no workflow template**,
  and all dates backdated to `2025-01-01`. Customers got real `CUST-2026-…`
  codes. `quantity = 0` — the column was dropped from the sheet.
- **Backups: `F:\erp-data-backups\`**, one timestamped folder each, with
  `restore.mjs` (dry-run by default, `--go` to write). Tested against the live
  DB. **Passwords can't be backed up** — a new project needs auth accounts
  recreated and `users.auth_user_id` re-pointed.

### Roles, passwords & changed repeats (migrations 095 + 096 + 097)
- **095** — added `gm` + `ceo` roles, and fixed `user_roles` never being written by
  anything (so every role but superadmin/owner had silently had zero permissions).
- **096** — seeded the `plates` permission module, which 005 had missed entirely,
  plus default permissions for `admin` / `artwork` / `planning` (also unseeded).
- **Passwords can't be shown, only reset** — bcrypt hash, one-way. Superadmin-only
  reset route returns the new one once; anyone can change their own from the Header.
- **Deleting a user also deletes the auth account** to free the email — `auth_user_id`
  must be NULLed first or the `ON DELETE CASCADE` hard-deletes the `users` row.
- **097** — "Repeat with Changes": `repeat_kind`/`changed_aspects`/`change_note` on
  `jobs`, an editable prefilled copy (vs Repeat's locked one), shouted on the Job Card.
  Artwork **skip is now hard-blocked** on a changed repeat (unless the only changes
  are board_gsm/finishing, which leave the printed image alone); plate reuse warns.

- **098** — Reports date range (URL `?from=&to=`); the `*_range` functions exist
  because 4 report sources couldn't be date-filtered. Wastage/Turnaround tabs added.

- **099** — downtime / board consumption / planned-vs-issued GSM / reprint cost, all
  from data captured for years and never read. Materials tab; open downtime runs to now.

- **100** — quotation win rate (latest revision only, decided-only denominator) and
  customer margin from `job_costings`, both on the Customers tab.

- **101** — `get_job_breakdown(…, p_dimension)` groups jobs by any column (box type,
  customer, colours, qty band, repeat…) — one Breakdown tab instead of a report each.
- **A field rendering "—" usually means a missing JOIN, not missing data.** Job Detail
  and the Job Card read `box_types/board_types/lamination_types/foil_types` for two years
  without ever selecting them. Check the page's `.select()` before blaming the data.

- **102** — `job_ink_usage` (kg, mirrors `job_wastage`) + A/B/C `shift` on wastage,
  ink and production assignments. Shift is an explicit column, never derived from a
  clock — boundaries move, and a rule would re-attribute history retroactively.

- **103** — `get_finance_summary()`. Finance stat cards were summing the **capped
  200-row array the page had already fetched**, so every total silently went wrong
  past 200 invoices. QC got the same fix without a migration (`count: 'exact',
  head: true`) plus a client-side tally so the numbers stay right after an edit.
  **Any stat card built from an array a page already fetched is a bug** — count in
  the database, not in JavaScript. Overdue still counts void/cancelled/draft, on
  purpose, to match the old numbers; the one-line change is in 103's header.

- **104** — press proofing (see §4). Adds `job_kind`, `proof_round`,
  `proof_result`, `proof_notes`, `proof_decided_at/_by`, `proof_artwork_id` to
  `jobs`, and a two-stage "Proofing Run" template (Board Issue → Printing) whose
  `department_id` is looked up **by name** so it can't repeat 091's null-department
  bug. **Known consequence:** `parent_job_id` has no ON DELETE clause, so a job
  that has proof runs can no longer be hard-deleted.

- **105** — the four missing shop roles (see §4). The permission modules and the
  departments had existed since 005/010; only the roles in between never did, so
  there was literally nobody to give the plate maker or the QC inspector.
  Run alongside 096, which finally gave `admin` / `artwork` / `planning` theirs.

- **106** — plate sets repair. **072 was half-applied, not un-run**:
  `job_plates.operator_id` was already there (only 072 adds it) while
  `plate_sets`, the three `plates` columns and both RPCs were missing, which is
  why `plates/generate-set` 500'd. 072 has **no `IF NOT EXISTS` anywhere**, so
  re-running it dies on the existing column — proved, not assumed. 106 redoes the
  same work fully guarded and idempotent, and fixes 042's `mark_plate_reused()`
  which wrote the now-illegal status `in_use`.
  **A migration that "was run" may only be partly run.** Probe for its actual
  objects — table, columns, functions, policies, triggers — one by one before
  concluding anything.

- **107** — data-only cleanup, no schema change. Retires the empty duplicate
  "Standard Box Workflow" template (0 stages, 0 jobs — anyone who picked it got a
  job with no workflow at all), closes **16 live stage rows left behind under two
  soft-deleted templates** plus the dependency rows pointing at them, drops the 5
  duplicate lowercase `document_sequences` rows, and resets the `JOB` counter.
  **Soft-deleting a template in the UI does not soft-delete its stages** — 107's
  rule is written generically so it catches the next one too.
  Deliberately NOT restored: `Standard Carton Workflow` is missing **Lamination
  (seq 6) and Hot Foil (seq 9)**, but both were soft-deleted by hand on
  2026-07-26 at 16:09, a minute apart — a person in Settings, not a bug. §4's
  stage list and the live default template therefore disagree. **Resolved by
  111** — Standard Carton stays at 10 stages and the rare lamination/foil job
  gets its own 12-stage template instead.

- **108** — lets `job_stage_events` accept `proof_created` / `proof_decided`.
  **104 added the press-proof events but never widened the event_type CHECK**,
  and `recordJobEvent()` didn't read its own insert error — so the route returned
  200, the proof run was created, and only the audit trail silently lost it.
  `recordJobEvent()` now `console.error`s on failure (still swallowed — an audit
  line must never fail the action that caused it, but it must not be invisible).
  **Adding an event type means editing this CHECK too** — it has been restated
  in full by 028, 042, 069, 102 and now 108.

- **109** — legacy job numbers `JOB-OLD-0001…0478` → `JOB-2025-00001…00478`.
  Same 5-digit shape as live numbers, and the year matches the backdated
  `order_date`. **The live series is untouched** — old work is the 2025 series,
  new work is 2026, and the two stay tellable apart at a glance. Safe because
  `job_number` lives on `jobs` alone; every other table reaches a job by id.
  (It would NOT have been safe with plates in the shop — `generate_plate_set()`
  bakes `job_number` into `plate_code`. There were 0 plates.)

- **110** — `box_types.workflow_template_id`, i.e. **the box type decides the
  workflow**: Box → Standard Carton, HL → HL (Hinge Lid), Label/Sticker →
  Label / Sticker. Mapping is **data, not code** (same precedent as coating
  types in 093). **What was broken:** a job's workflow came only from the one
  `is_default` template, so a sticker job got the 10-stage carton route; and
  Repeat / QC Reprint copied the parent's template verbatim — every one of the
  478 legacy jobs has `workflow_template_id = NULL` by design, so **each repeat
  of a legacy job came out with no workflow, no stages, and never appeared in
  any department queue.** Nothing errored.

- **111** — template **"Carton with Lamination / Foil"**: the standard carton
  route with Lamination (5) and Hot Foil (8) put back, both `is_optional`, both
  with a real department this time — 091 left those two stages' `department_id`
  NULL, which is very likely why someone deleted them from Standard Carton in
  the first place. Not default, not mapped to any box type; picked by hand for
  the two-to-four jobs a year that need it. Purely additive.

- **112** — `job_plans.day_order`, the **running order within a planned day**, plus
  the planning-shuffle code that uses it. **What was broken:** there was no
  ordering column at all, so the order of jobs inside one date was whatever
  Postgres returned and could differ between two renders; a plan's date could not
  be changed from the UI (cancel and re-plan was the only way, though the PATCH
  route had always accepted `planned_date`); machines could only be attached at
  create time; and `loadStageQueue()` sorted only by the stage's own
  `sequence_order`, so **the shop floor had no job order either** — nobody could
  say which job ran first.
  Canonical read order everywhere is now **`planned_date, day_order, id`** — the
  `id` tiebreaker for the same reason §6 records. Backfill numbered every existing
  plan `1..n` per date by `created_at`, and only touches rows still at `0`, so
  **re-running cannot undo a real shuffle** (asserted, not assumed).
  New: `PATCH /api/v1/planning/reorder` (whole day's order in one call —
  idempotent, closes gaps, can't drift), `PUT /api/v1/planning/[id]/machines`,
  and `nextDayOrder()` in `src/lib/utils/planDayOrder.ts` used by both create and
  date-move so a plan always lands at the **end** of its new day.
  **`job_machine_assignments` has no `deleted_at`** — only `is_active` — and
  production writes `start_time` / `actual_hours` onto those rows, so removal is a
  deactivation, and a row with recorded work **refuses** to be removed (409).
  `getPlannedSlots()` was added to `plannedDates.ts` rather than widening
  `getPlannedDates()`, whose four other callers don't care about the order.
  Verified: 17 assertions on the migration against real Postgres, 14 on the
  route behaviour, 5 read-only against the live PostgREST. **Not yet walked
  through the real HTTP routes** — that needs 112 on live first.

- **113** — board → job traceability, and the **packet**. Two holes, one run.
  **A. "Kon sa board kis job ke liye aaya?" had nowhere to be recorded.** The
  issue side was always traceable (`store/[id]` writes `job_id` onto the `out`
  movement); the receipt side had no column on `purchase_orders`,
  `purchase_order_items` or `board_inventory_lots`, and the receipt's `in`
  movement never set the `job_id` that has existed since 015. Adds `job_id` to
  the PO **line** (not the header — one purchase covers several sizes for
  several jobs, as the shop's own stock sheet shows) and to the lot, both
  **nullable because general stock is a real answer**, not a missing field.
  **B. `current_stock` had no declared unit and the two halves disagreed.** The
  store counts **packets** (1 packet = 100 sheets); the job side counts
  **sheets** (`jobs.sheet_qty`, the auto-MRN's `quantity_required`, every
  movement). Loading packets would have made every issue wrong by 100×.
  **The rule now: `current_stock` / `reserved_stock` / `reorder_level` and all
  board movements are SHEETS. Packets are display and data entry only.**
  Sheets is provably the right store: every fractional packet on the July 2026
  sheet is a whole number of sheets (4707.4 → 470,740 · 79.8 → 7,980 ·
  44.68 → 4,468 — that last one is 44 packets plus 68 loose sheets).
  `board_inventory.sheets_per_packet` (default 100) is per-item because paper
  reams are 500 or 250, not 100.
  **C. `board_inventory.vendor_id` had never had a foreign key** — a bare UUID
  since 015 — so PostgREST could not embed it and the Board Stock screen has
  never shown a vendor, which is the *first* grouping on the shop's own report.
  Safe as a validated FK only because the table was empty (probed, 0 rows).
  Verified: 39 assertions on the migration against real Postgres, 14 on the
  receive behaviour, 14 read-only against live after it was run.

### What 113 exposed in the code (no migration — same commit)
- **Receiving a PO had NEVER added board to stock.** The PO line UI had no board
  item picker and the receive call never sent `board_item_id`, so
  `if (item.board_item_id && …)` was always false: no stock change, no `in`
  movement, no lot — while the modal promised "Board inventory will be updated
  automatically". That is why `board_inventory_movements` sat at 0 rows. The
  route now reads `board_item_id` **and** `job_id` from the PO line in the
  database rather than trusting the request body, and the PO form has both a
  board-item and a job picker per line.
- **The stock ledger / lot inserts swallowed their errors**, so a failed insert
  moved `current_stock` and silently lost the audit row — every stock report
  quietly wrong afterwards. Now collected and returned as `warnings` and toasted.
  Making receipt atomic needs an RPC; flagged, not done.
- **A `<select>` fed by an unfiltered master table lists soft-deleted rows.**
  The units seed ran twice on 2026-07-15 and one copy of each of the 14 units
  was soft-deleted by hand, leaving 28 rows. Board Inventory and Store fetched
  units with **neither** `deleted_at` nor `is_active` filtered, so every unit
  appeared twice — "Sheet", "KG", "Box" — with no way to tell which was real.
  **The data was fine; the query was wrong.** Settings → Units already filtered
  correctly. Both pages fixed; 28 → 14 confirmed against live.

**096 and 103 → 111 have all been run and verified against the live database
(2026-07-30).** Probed read-only: 478 jobs renumbered to `JOB-2025-%`, all four
box types mapped, `Carton with Lamination / Foil` live with its 12 stages, five
live templates in all, `plate_sets` + both RPCs present. **108's CHECK is the
one thing a read-only probe cannot confirm** — it would need a real insert of a
`proof_created` event. Assume it ran with the rest; confirm the first time a
press proof is raised.

### Workflow resolution (no migration — code, commits `b15f7d9` / `c231710`)
Two gaps 110 exposed, both fixed in code:

- **`resolveWorkflowTemplateId()`** (`src/lib/utils/resolveWorkflowTemplate.ts`)
  is now the single answer to "which workflow does this job get", used by New
  Job, Repeat and QC Reprint so they can't disagree. Order: explicit form
  choice → box-type mapping (110) → `is_default` → NULL. Steps 2 and 3 are both
  gated on the `job_auto_assign` setting, and a mapped-but-soft-deleted template
  falls through to the default rather than being handed back — otherwise
  `initializeJobWorkflow()` finds no stages and **silently no-ops**, which is
  the whole failure this removes. New Job's box-type dropdown also moves the
  Production Workflow dropdown so the form shows what the API will actually do.
- **`applyWorkflowTemplateOnEdit()`** (`jobEventService.ts`) — `initializeJobWorkflow()`
  only ever ran on create, so **picking a workflow on the Edit Job form set the
  column and built nothing**: no instance, no stages, job invisible in every
  queue, unfixable from the UI. `JOB-2026-00001`, the shop's first real job, was
  created that way. Now PATCH builds the stages, and a template *swap* is
  allowed only while every stage is still `pending` — any started/completed/
  skipped stage refuses the swap and says so in a toast, because
  `job_stage_progress` has no `deleted_at` and a rebuild is a real delete.

### End-to-end walk, 2026-07-29 — the whole workflow works
One job was driven from creation to closure through the **real API routes**
against the live database, then deleted and the counters put back. Everything
below is now proven, not assumed:
`POST /api/v1/jobs` → workflow initialised with all 10 stages → out-of-order
start refused → **artwork gate** (complete refused until an approved
`job_artworks` row exists) → **Board Issue auto-MRN** (`MRN-2026-00001`, line
item carrying the board and the 250 sheets, complete refused while `pending`,
allowed at `issued`) → **plates hard-block** → `generate_plate_set()` producing
CMYK → `POST /jobs/:id/plates` ×4 → Printing → UV Coating → Die Cutting →
Folder Gluing → Packing → **QC gate** (complete refused on a `fail`, allowed on
`pass`) → Dispatch → `closeJobIfWorkflowDone()` setting `status = completed` and
`completed_date`. 27 audit events recorded. Job Card, Job Detail, Jobs list,
Plates, QC, Reports, Finance, Dispatch and Store all rendered 200.

Two things that walk taught, worth keeping:
- **The MRN is only auto-created if the job has BOTH `board_type_id` and
  `sheet_qty`.** No board type → no MRN → Board Issue can never complete, and
  the error message blames Store rather than the missing field.
- **`workflow_stage_dependencies` rows are `stage_started`, not
  `stage_complete`** — Die Cutting legitimately starts as soon as Printing
  *starts*. Sequential order is not what actually gates a configured stage.
  There are also **three identical "Die Cutting depends on Printing" rows**;
  harmless, never cleaned up.

- **114** — `get_board_stock_report(company, from, to)`: the shop's own monthly
  board sheet — Opening / Received / Return From Production / Issued / Balance
  per item, grouped by vendor — rebuilt from `board_inventory_movements`. Read
  only; no table or column changes. **Why it matters:** the Excel is overwritten
  every month, so July's figures die when August starts; the ledger has been
  immutable since 015, so with this function **any past month can be reproduced
  exactly, forever**.
  **Opening is read from `balance_after`**, not by re-adding history, so it
  survives any sign mistake. `closing_sheets` is computed and `ledger_closing`
  is read from `balance_after`, and the API returns a **warning** when the two
  disagree — drift is surfaced, not hidden.
  **Month bounds are Asia/Karachi**, not UTC: a movement at 1 Aug 02:00 PKT
  belongs to August, and a naive UTC compare put it in July. Written as range
  bounds so the `(company_id, occurred_at)` index is still usable.
  **The sign convention is now written down** on `board_inventory_movements.quantity`:
  **a positive magnitude, direction in `movement_type`** (only `adjustment`
  carries a signed delta). Three routes wrote `out` movements and they disagreed —
  `store/[id]` and `qc/reprint` wrote positive, `board-inventory/[id]` wrote
  negative — so any report that summed `quantity` would have been wrong once both
  paths were used. The outlier is fixed in the same commit; the table was at 0
  rows on live (probed), so there is no history in the old convention. The
  function still uses `abs()` per type so a stray sign cannot flip a total.
  **Return to Store** ships with it: an `in` movement with
  `reference_type = 'production_return'` plus the job it came off, reported in
  its own column. It also creates a `RET-` lot at the item's own unit cost —
  issuing draws lots down via FIFO, so without one `sum(quantity_remaining)`
  would drift permanently below `current_stock`.
  Verified: 25 assertions on the function against real Postgres (including the
  PKT boundary, month chaining, and a past month still reproducible), 20 on the
  Return/sign behaviour through the real HTTP routes against live.

### Live route walk, 2026-07-30 — 112 + 113, and six dead write paths it found
Both migrations were applied to live, then driven through the **real HTTP routes**
(`npm run dev -- -p 3123`, temp superadmin, cleanup script written first).
**40 assertions, all passing** — plans created with `day_order` 1,2,3 in turn;
whole-day reorder; a cross-date id and a duplicate id both refused; a date move
re-slotted to the end of the new day; machines attached to a live plan and a
machine with recorded work refusing removal (409, naming the machine); a PO with
a job-linked line, a general-stock line and a non-stock line; receipt crediting
**4,468 sheets from 44.68 packets** and **1,000 from 2 reams at 500**; both `in`
movements and both lots carrying the job (and `null` for general stock); and
`"kon sa board kis job ke liye aaya"` answered through PostgREST with the vendor
resolved. Live was returned to its exact prior state (`job_plans` back to 1,
everything else 0, PO/VND counters restored, temp user and auth account removed).

**`.catch()` DOES NOT EXIST on a Supabase builder.** `PostgrestBuilder`
*implements PromiseLike* — `then()` and nothing else — so
`supabase.rpc(…).catch(…)` throws `catch is not a function` **synchronously,
before the request is sent**, and `withErrorHandling` turns it into a 500. The
idiom had been copied to **five** places, and every one of them was a write path
that had never once succeeded:
`purchase-orders` (PO create), `finance/invoices` (invoice create),
`finance/invoices/[id]/payments` (record payment), `plates` (the reuse branch),
`store/[id]` (`apply_job_actual_cost`). Confirmed by counts, not assumed:
invoices, payments, plates, customer_ledger_entries, supplier_ledger_entries and
job_costings were **all at 0 rows**. Two of the five never surfaced because their
branch needs stock or a plate to exist, and both tables were empty — which is
also why the 2026-07-29 walk passed straight over the Store one. Correct form:
`const { error } = await supabase.rpc(…)` then log; the builder reports failure
in `error`, never by rejecting.

**A zod line-item schema that omits a NOT NULL column silently deletes it.**
`poLineItemSchema` declared `material_name` but the route inserts
`description` — and `z.object()` strips unknown keys, so the field the form
actually sends was thrown away and **every PO line-item insert failed**.
`specification` and `notes` went the same way. The insert never checked its
error, so the route returned **200 with a header-only PO**. Both fixed: the
schema carries the real column names, and a failed line insert is now a 500.
**When a request schema and an insert disagree about a field name, the schema
wins and the column goes NULL — check them against each other, not against
what the form sends.**

### Board stock loaded, 2026-07-30 — 51 items, 5 vendors, 17,087 packets
The shop's July-2026 board stock sheet is in. Loaded **through the real API
routes** with a temp superadmin, not by direct insert, so vendor codes came from
the `VND` sequence (`VND-2026-0001…0005`: Saud Traders, Najm Impex, Local
Purchase, madni Papers, Horizon Mill) and every item got its opening-stock
ledger row. **20 assertions, all passing.** 1,708,700 sheets — Saud Traders
15,600 packets · Horizon Mill 1,067 · Najm Impex 313 · madni Papers 106 · Local
Purchase 1.

Rules applied, from Mehboob's own decisions: **zero-balance rows skipped** (9 of
them), Bleach 10+11 merged to 20 packets, Bleach 25+32 merged to 164, Bleach
row 3 read as 1795 (the sheet's 1795.4 was a typing mistake), and a **third
duplicate pair he had not spotted** — Duplex rows 7+9, both Econo Board
20×27 290 — merged to 858.

Three things worth keeping:

- **The opening movements are backdated to 31 July 2026.** The figures are the
  sheet's *Balance* column, i.e. stock as it stood at month end, so dating them
  `now` would have made them show as July *Received* forever. Backdated once,
  deliberately, by the load script — **not** by letting the API accept an
  `occurred_at`, which would make the ledger forgeable. August's Opening is
  therefore exactly right and every month chains from there. **The ERP's July
  report will not match the Excel** — July happened outside the system.
- **`board_inventory_lots` needed opening lots.** The item-create route only
  writes a movement, no lot, so `sum(quantity_remaining)` was 0 against
  1,708,700 sheets of stock and `consume_board_lots_fifo()` would have found
  nothing to draw down — then consumed a later PO's lot first, which is not
  FIFO. One `OPEN-` lot per item (`reference_type = 'opening_stock'`, the value
  055 already declares), dated 31 July, vendor from the item, no cost. Stock and
  lots now tie up exactly.
- **The temp load user cannot be deleted, and should not be.**
  `board_inventory_movements.moved_by` references it from all 51 rows — the
  ledger records who moved the stock. It is renamed
  **"Opening Stock Load (system)"**, deactivated, and its auth account removed,
  so the audit trail stays readable and nobody can sign in as it. Any future
  load through the routes will hit the same thing; rename rather than fight it.

**Still missing from the load:** the Bleach sheet's photo is cut at row 33 and
Prime Coated at row 9, so whatever follows is not in. Duplex is complete (its
total row, 2838/33/2804.57, proves it). Also, the sheet's displayed integers are
**rounded** — Duplex's own total is 2804.57 against 2805 from the visible rows —
so some items are out by up to half a packet. Correct those with Adjust.
`unit_cost` is 0 on every item; costing needs it eventually.
Board type matched by exact name only, so 12 descriptions have none — including
**Econo Board, whose master row is spelled "Ecano"**. Not guessed; set by hand
in Settings if wanted.

### Sidebar groups + money visibility (migration 119)
Mehboob: *"side bar bohat lambi ho chuki hay… price to sirf account admin gm
production manager ko hi show ho"*. Two separate problems, one batch.

**A. The sidebar was already permission-gated; that was never the issue.**
Probed live first: Store sees 7 links, Dispatch 7, Sales 9, printing 11 — those
roles were fine. The long list belongs to the roles that genuinely need
everything (superadmin/owner/ceo 29–30, gm 29, admin 26) and to **planning,
which has 22 view modules and should not** (purchase, dispatch, workflow,
machines, quotations, sales_orders…). Permissions cannot shorten the first
group, so `NAV_ITEMS`' two inline dividers became **eight collapsible sections**
(`NAV_SECTIONS` + `buildSidebarSections()` in `navConfig.ts`).
- Membership is keyed by **href, not module** — Board Inventory and MRP share
  `board_inventory`; Jobs, My Queue and Scan all share `jobs`, and they belong
  in different groups.
- Dashboard / My Queue / Scan are pinned at the top and Help at the bottom,
  ungrouped and never collapsible.
- **Groups start open when the user has ≤14 links and closed above that**, so a
  Store user's nav is unchanged and a Super Admin's 29 rows become 10. The
  choice is then remembered per group in `localStorage` (`SIDEBAR_GROUPS_KEY`).
- **The group holding the current page is force-open and its heading disabled** —
  collapsing the section you are standing in hides the one row that says where
  you are.
- The collapsed 56px icon rail drops the grouping entirely and lists every link
  flat; there is no room for a heading.
- **A link missing from `NAV_SECTIONS` falls into a "More" group, never
  vanishes.** The assertion script checks that group stays empty.
- `NavDivider` / `isDivider` are gone. `NavItem` is now an alias of `NavLink`
  and `isNavLink` stays, because Header, HelpClient and the mobile builders all
  call `NAV_ITEMS.filter(isNavLink)`.
- **Not done, and deliberately** — planning's and admin's over-broad permission
  sets were offered and Mehboob picked only the grouping. Both are still open
  (see Open threads).

**B. There was no way to hide a rupee figure from someone who needs the page
it sits on.** Module permissions gate whole PAGES and always have. Finance and
Costing Rates were fine; Quotations, Sales Orders, Purchase, Board Inventory,
MRP, Customers, Vendors, Jobs, Dispatch and Reports were not — Store, Purchase,
Planning, Artwork, Plates, QC and Dispatch could all read the company's rates
and margins. 119 adds a **`money` permission module** whose `view` action is the
single switch, granted to **superadmin / owner / ceo / gm / admin / accounts /
production_manager and nobody else**.
- **`money` gates NO page.** It decides whether the figures on a page you can
  already open are drawn. `finance` / `purchase` / `settings` still gate access.
- **`MoneyGate` is a wrapper, not a `<Money value={n}/>` component.** Amounts
  here are inline JSX, template strings inside Excel export columns, `<input>`
  rate fields, whole stat cards and whole table columns — a per-number
  component would have fitted half of them and missed the exports. Two shapes:
  `<MoneyGate>` masks to `•••` (use where a fixed grid must keep its cell), and
  `<MoneyGate hide>` removes (whole cards, totals blocks, rate inputs).
  `useMoneyVisible()` / `maskMoney()` cover strings being built rather than
  rendered.
- **`useCanSeeMoney()` fails CLOSED — the opposite of `useNavPermissions()`.**
  That one fails open because an empty nav looks like an outage; this one must
  not flash the number before hiding it. Masked → visible is safe; the reverse
  is not.
- **Hiding a rate input never removes it from form state.** The saved value is
  posted back unchanged, so an operator editing a job cannot blank the quoted
  amount just by not being allowed to see it. (§5's rule is about *removing* a
  field; this is deliberately the other case.)
- **Excel exports are gated too** — Board Inventory's unit cost, Dispatch's
  charges, and six Reports sheets. An export file leaves the building; that is
  where a leak actually costs something.
- **`src/app/print/*` needed a SERVER gate** — they are server components
  reachable by URL, so the client wrapper cannot touch them.
  `canSeeMoneyServer()` (`src/lib/utils/canSeeMoneyServer.ts`) wraps
  `has_permission()`. The two SO print pages, both invoice print pages and
  `/api/v1/print/so` refuse outright; the dispatch challan only drops its
  Delivery Charges line, because the driver still needs the challan.
- **This is a DISPLAY gate, not a data gate.** The API still returns the
  figures. Stripping them server-side means editing ~30 routes and would break
  the very forms whose job is entering a rate.

Verified: 93 assertions on the nav sections, 27 render assertions on the real
`Sidebar` (headings, closed groups leaking no links, active group forced open,
icon rail flat with all 29), 62 on migration 119 against real Postgres
(idempotent, a permission switched off by hand stays off, the undo block
restores exactly the 15 roles and 252 permissions), and 84 on the money gate
(fail-closed first paint, every money site within reach of a gate, no ungated
money page left).

**119 has been run on live and probed read-only (2026-07-31): 52 assertions,
all passing.** `money` present with all 9 actions; `Production Manager` live and
active; `money::view` granted to exactly accounts / admin / ceo / gm / owner /
production_manager / superadmin and to nobody else; production_manager's 22 view
modules exactly as intended with no `delete` / `settings` / `approve` / `reject`
anywhere; **261 permissions and 16 roles** (252 + 9, 15 + 1), counted with
`{ count: 'exact', head: true }` rather than by totalling a fetched array.
The probe reports any `money::view` row switched OFF by hand in Settings rather
than treating it as a failure — that is a legitimate state (it is how Sales or
Purchase would be given rates back), but it must be visible.

### Artwork accepts JPG + PNG + WEBP (no migration)
Upload was **JPG-only, checked by identical hand-written code in TWO places** —
`ArtworkClient` and `JobArtworkTab` — and by **nothing at all on the server**.
The list now lives once in `src/lib/utils/artworkFileTypes.ts`
(`ARTWORK_ACCEPT`, `isAcceptedArtworkFile()`, `artworkMimeType()`), read by both
forms and asserted in `artworkSchema` so the route can no longer record a row
for a file the form would have refused.

- **PNG and WEBP needed nothing downstream.** `ArtworkThumb`'s `IMAGE_EXT`,
  `api/v1/jobs/thumbnails` and the printed Job Card already listed both, and the
  approval page is a plain `<img src={preview_url}>` + `MarkupOverlay`. Only the
  upload gate was in the way.
- **PDF was raised and declined** — Mehboob: *"pdf rahny do"*. It is the one
  type that cannot work as-is: a PDF will not render in an `<img>`, so the
  customer would be asked to approve a grey file-type tile with nothing to mark
  up. Doing it properly means rasterising the PDF at upload and storing that
  preview beside it (a new column). **His shape for it, if it ever comes back:
  one page, low resolution.** Don't add PDF to the accept list without that
  preview step — accepting a type the chain renders as a grey tile is worse
  than refusing it.
- **AI pre-flight hardcoded `image/jpeg` for every file.** Harmless while
  upload was JPG-only, a lie for every PNG. It now derives the type with
  `artworkMimeType()` and refuses (rather than mislabels) a legacy PDF/AI/EPS
  row, whose file-type tile still renders exactly as before.
- **Three independent `PREVIEWABLE_EXT` copies** (ArtworkThumb,
  `jobs/thumbnails`, the printed Job Card) are a broader "can a browser draw
  this" list, not the accept list — deliberately not merged, but the assertion
  script checks all three know every accepted type, so an added type cannot
  silently show as a grey tile.

Verified: 68 assertions — accept/reject per extension and per mime (including
an empty `type`, which some Android pickers send and the old check failed), the
derived mime type, the zod schema refusing a PDF and an unknown extension, and
both uploaders proven to have lost the old regex, message, `accept` attribute
and "JPG only" help text.

### Help → "Job ka safar" now opens with a diagram (no migration)
Mehboob asked for images in the workflow tutorial. Offered screenshots vs a
drawn diagram; he picked the diagram, for the reason that decided it: **a
screenshot is stale the day a button moves**, and this UI moves weekly.

`src/components/help/JourneyMap.tsx` renders the whole journey as four bands
(Sales → Job → Production → Paisa) of step chips, above the existing written
list. Two rules it is built on:
- **It holds no content of its own.** Every chip's number, label, band, owner
  and lock come off the same `JOURNEY` array the written list uses, so the
  picture cannot disagree with the prose. A hand-drawn copy would already be
  wrong — Lamination and Hot Foil were removed from Standard Carton by hand,
  and 110 changed which template a job even gets. The assertion script checks
  the map names neither of them.
- **HTML/CSS, not `<svg>`.** An SVG needs a viewBox and fixed coordinates, so
  on a 360px phone it is either 6px text or a sideways scroll — and §6's rule
  is that it has to FIT. Flex wrapping reflows at every width, inherits the
  theme variables directly, and leaves the labels as real text.

`JourneyStep` gained `short` (the chip label — written out, not sliced off
`title`, because 7 of the 17 steps have no "Stage N — " prefix to slice) and
`phase`. **Phase is data on the step, not a range of step numbers**, so
inserting a step can't silently re-band everything after it.

The **lock marker is derived from `gate`**, not a second flag — one less thing
to keep in sync.

Verified: 112 assertions — all 17 steps present as chips, bands and their
counts, one lock per gated step, the viewer's own steps counted per role (and a
role with none reading sensibly rather than "aap ke 0 step"), no hardcoded hex,
no opacity-on-`var()`, no runtime `grid-cols-N`. Measured in a real browser at
360px: **zero overflowing elements and no sideways scroll**, chips wrapping 2
per row on a phone and 4 on desktop.

### Money, split into three scopes (migration 120) — 119's correction
119 read the instruction literally and made `money::view` one all-or-nothing
switch. That was one switch too few, and Mehboob said so the same day:

> *"Sales apni quotation ka rate dekh sake baqi nahi, Purchase apne PO ka dekh
> sake baqi nahi, mere kehne ka matlab yeh tha ke production wale rates na dekh
> saken — production manager se aage wale log."*

**The line is not seniority, it is ownership.** Money belongs to the document
you own: Sales prices the job, Purchase buys the board, and the production floor
owns neither. 120 adds two narrow modules beside the master:

| | sees |
|---|---|
| `money` (119) | every amount, everywhere — management + Accounts + production_manager |
| `money_sales` | quotation & sales-order rates, line totals, **and the estimator's cost calculator** — Sales |
| `money_purchase` | PO rates and totals, board unit cost, Stock In rate — Purchase |

- **`money::view` is the master and satisfies all three in code**, so the seven
  roles that already hold it needed no behaviour change. They are granted the
  scopes anyway so the Settings matrix isn't showing an unticked box that is
  really on — the same reason 119 granted `money` to superadmin.
- **`scope` defaults to `'cost'`, the strictest.** A money site nobody
  remembered to scope stays hidden from Sales and Purchase rather than being
  accidentally shown — the same "fail to the tight setting" reasoning as the
  hook failing closed. `'cost'` deliberately has **no narrow module**: internal
  cost and margin are exactly what the master is for, and a fourth row that only
  ever mirrored it would be one more thing to keep in sync.
- **The quotation's cost calculator is `sales`, not `cost`.** Sales *is* the
  estimator here (see JOURNEY step 2, "Sales / Estimator") — the calculator is
  how the price gets made, so without it a salesman cannot quote at all.
- **Vendor ledger and Record Payment stay `cost`, not `purchase`** — 105's
  separation of duties: whoever raises a PO does not also settle it.
- The **printed Sales Order** (both print pages and `/api/v1/print/so`) is
  `sales`; invoices and the dispatch challan's charges line stay `cost`.

**Consequence to know: Store loses the purchase-rate box on a manual Stock In.**
Store is on the production side of the line, so it gets no scope — but Store is
also who physically receives board, and that rate is what keeps
`board_inventory.unit_cost` (a weighted average, 117) true. Receiving *against a
PO* is unaffected — the rate comes off the PO line Purchase entered. Only a
walk-in / cash Stock In loses it. One tick fixes it if it bites:
Settings → Roles & Permissions → Store → Money (Purchase) → View.

Verified: 50 assertions on 120 against real Postgres — grants asserted as a
**diff against the post-119 snapshot**, not a whole-table total (119's own
production_manager grant covers 21 modules and would have swamped it);
idempotent; a scope switched off by hand stays off; the undo block leaves 119
working alone. Plus 59 code assertions — scope resolution per role (including
that `money::print` and `finance::view` are near-misses that must not pass),
every gated file proven to carry exactly its intended scope, `cost` files proven
to carry **none** (so a stray `sales` there would fail), and no file importing
the gate left without a decided scope.

### The Manager role, and real staff loaded (migration 121)
Mehboob brought in the staff list (`D:\Packaging\Jafson\Business Card\`). Seven
people have the title "Manager" and there was no role for any of them — `roles`
had the operator (`printing`) and the whole-floor `production_manager` (119),
but nobody who runs **one** department. 121 adds `manager`, specced from his own
two descriptions: runs its department's stages, plus **plates**, **dielines
(artwork)** and **board demand**, without owning the plan, the purchasing or the
money. The slug was already anticipated by `ROLE_CFG` and `FALLBACK_ROLES` in
UsersClient, so no frontend change was needed for the label to appear.

**Manager sits below the money line 120 drew** — no `money`, no `money_sales`,
no `money_purchase`. They can see how much board there is; not what it cost.
No `approve`/`reject` either: a department manager signing off their own
department's work is exactly what 105's separation exists to prevent.

**Thirteen of the fourteen are live** (created 2026-07-31 through the same two steps
the admin route uses, with the auth-account rollback on insert failure): Syed
Shoaib + Muhammad Imran (production_manager), Muhammad Tanveer (gm), Hassan Raza (ceo),
Jafar Shah (owner), Rana Abrar + Muhammad Shahzad (accounts), Mehboob Ahmed
(artwork), M. Afaq Mirza (store), Muhammad Saqib (qc), and — once 121 was on
live — Riaz Ahmad, Aslam Pervaiz and Zahid Mahmood (manager). Verified per user that
**095's trigger wrote the `user_roles` row** — without it they log in with zero
permissions, the exact failure 095 was written to fix. Phones normalised to
`923…` with no spaces, which is the shape WhatsApp needs.

**The first CSV had `production@` on THREE people**, plus two more shared
addresses. Email is the login id, so that was a hard stop; Mehboob issued
`supervisor@`, `store@`, `qc@` and `owner@` and it cleared. The loader now
**aborts on a duplicate inside the input** before creating anything, rather than
discovering it halfway through.

**Jafar Shah was moved ceo -> owner** on Mehboob's instruction. Only
`users.role` was touched: 095's trigger fires `AFTER INSERT OR UPDATE OF role`
and retires the previous link itself, so he ended with one active `user_roles`
row (owner) and the ceo one deactivated — asserted, not assumed. Note the
trigger no-ops on an unknown slug rather than stripping permissions, so the
target role has to exist before the update or nothing happens and nothing says so.

Two mappings were taken from the job, not the CSV's Role column, and flagged
rather than assumed: **M. Afaq Mirza (Store Incharge) → `store`** and
**Muhammad Saqib (dept Quality Control) → `qc`**. Both say "Manager" in the CSV,
but `manager` can only *read* store and QC (121) — a store incharge who cannot
issue an MRN, or a QC man who cannot pass a job, would be useless.

- **There is no `Accounts` department**, so the two accounts staff have
  `department_id = NULL`. Harmless (Accounts owns no workflow stage) but worth
  adding in Settings → Departments if he wants it on their profile.

**Help had a blank tab for any role with no written guide** — the role tab was
`{tab === 'role' && guide && …}` and nothing else, which is what every role
added from Settings gets, and what `production_manager` got from the moment 119
created it. Both new roles now have guides (all 17 live roles do), and the
no-guide case falls back to the role's database description plus the
live-permission screen list, which is useful on its own.

Verified: 49 assertions on 121 against real Postgres (its permission set line by
line against Mehboob's two sentences, no money of any scope, no
`delete`/`settings`/`approve`/`reject`, cannot create a job, idempotent, a
permission switched off by hand stays off, undo clean) and 81 on the guides and
mobile hints.

### 122 — the Store Manager, and why Store needed its own tier
**120's flagged consequence came true.** It had warned that giving Store no
money scope would take the purchase-rate box off a manual Stock In. Then Mehboob
corrected the staff sheet: Aqib Ali is not the HR Manager the CSV calls him, he
is the **Store Manager, and board inventory is his**.

The `store` role already did all the WORK (Store/MRN, Board Inventory, Purchase,
Reports, Dashboard, with create/edit) — the only gap was money, and for someone
who receives board and checks it against the vendor's invoice that gap is the
job. Without it, board arriving without a PO can never have its cost recorded
and `board_inventory.unit_cost` — a weighted average since 117 — drifts with
nothing to flag it. `store` can also raise a PO but could not type a rate on it.

**Why a new role and not just giving `store` the scope:** permissions attach to
a role, not a person (095's trigger keeps exactly one active role per user), so
granting it to `store` would also hand buying rates to M. Afaq Mirza, the Store
Incharge, who issues material rather than buying it. Mehboob chose to keep that
line — `store_manager` for Aqib, plain `store` for Afaq.

`store_manager` is **`store`'s permission set plus `money_purchase`, exactly** —
no `money` master, no `money_sales`, no jobs/vendors/production. It is built by
**SELECTing from the live `store` role** rather than re-listing modules, so the
two cannot drift; adjusting `store` in Settings and re-running lines the manager
back up with it (asserted).

Also fixed in the same pass: **ten roles had no `ROLE_CFG` entry** in
UsersClient — production_manager, store_manager, store, printing, planning,
artwork, plates, purchase, dispatch and qc all rendered in the grey "Staff"
colour, which is most of the staff now on the system. The label was always right
(it reads `roles.name` first); only the colour was missing.

Verified: 54 assertions on 122 against real Postgres — that it equals
store + money_purchase and nothing more, that **`store` itself gained and lost
nothing**, idempotent, a permission switched off by hand stays off, a module
later added to `store` flows through on re-run, and undo leaves `store` exactly
as found.

### 123 — the role permission audit
Mehboob: *"kuch role ki Permissions abhi b empty hay, sub roles ki permission
apny hisab say set ker do."*

Audited all **17 roles x 31 modules x 9 actions** against live before writing
anything. **No role was actually empty** — the thinnest, `plates`, has 13 grants
and works. What the audit found was nine roles missing something they
demonstrably need, and one lockout:

| Role | Was missing | Why it mattered |
|---|---|---|
| `admin` | customers + dashboard **switched OFF** (18 rows), no `admin` module | An Admin could not open the dashboard or the customer list at all |
| `dispatch` | `customers` | The person delivering could not look up the address or phone |
| `store` | `jobs`, `vendors` | Board is issued AGAINST a job; the storeman could not open it |
| `accounts` | `jobs` | An invoice is raised against a job |
| `purchase` | `jobs` | 113's whole point was "kon sa board kis job ke liye aaya" |
| `printing` | `qc`, `production`, `reports` | An operator could not see that his job was failed by QC |
| `qc` | `artwork` | An inspector compares the sheet to the APPROVED artwork |
| `plates` | `production` | A plate maker could not see what was running |
| `sales` | `dispatch` | "Mera order gaya ya nahi" is the daily customer question |
| `owner`, `gm` | modules absent from the matrix | Owner bypasses `has_permission()`, so the Settings screen was lying |

**123 only ADDS. Nothing is revoked**, and every grant is `view`/`print`/`export`
unless the role already owned the module — nobody can change anything they could
not change before. The single exception is `admin`'s 18 disabled rows, switched
back on and called out separately because it is the only place the migration
reverses an explicit existing state (and it re-enables on every re-run, unlike
every other guard here, which respects a permission turned off by hand).

**No money scope is granted.** 119/120/122 decided who sees rates and 123 does
not revisit it — `jobs` view exposes no amount (the quoted-amount card is
`MoneyGate hide` on `cost`), nor does `dispatch` or `customers`.

Five things the audit found that are REMOVALS are written into 123's own footer
rather than acted on, so the next person does not re-derive them: planning's
over-broad edit rights, meaningless `create`/`edit` on dashboard and reports,
`store` holding `purchase create/edit`, `artwork` holding `plates
approve/reject`, and `admin` holding `delete` on 26 modules against CLAUDE.md's
own stated rule.

Verified: 41 assertions against real Postgres, and **through a real
`has_permission()`** rather than by counting rows — the Admin lockout asserted
to exist BEFORE and be gone after, every gap closed, every pre-existing grant
proven still active, no `edit` handed out with a `view`, no money row created,
idempotent, and a hand-disabled grant proven to stay disabled.

### The permissions screen was lying — the 1000-row cap, third time (no migration)
Mehboob, after 123 was already live: *"permission to abhi b set nhi hoi."*
He was right about what he saw and it was never a migration problem.

`role_permissions` passed **1613 active rows** once every role had a real
permission set. `buildPermissionMatrix()` read it with one plain `select()` —
no `.range()`, no `.order()` — so **PostgREST returned exactly 1000 with no
error** and the remaining 613 grants simply did not reach the page. Measured
against live before fixing: **all 17 roles rendered wrong, and 7 rendered
COMPLETELY EMPTY** — accounts, admin, artwork, manager, planning,
production_manager and purchase, whose real grants are 28, 257, 27, 50, 42, 64
and 23. Nothing was wrong in the database at any point.

With no `.order()` either, *which* rows vanished was whatever order Postgres
returned, so the same page could disagree with itself between renders.

Fixed with `fetchAllRows()` (`src/lib/utils/fetchAllRows.ts`), used by
`buildPermissionMatrix()` and `GET /api/v1/permissions` — the only two
unbounded reads of that table. It pages with `.range()` and **requires the
caller to order first**: `(role_id, permission_id)` is unique per the table's
own constraint, so pages cannot repeat or skip, which is the same defect §6
records for the 478 jobs sharing one `created_at`.

**Reach for narrowing before paging.** `dashboard/help/page.tsx` filters to the
`view` action and is provably under the cap — that is the cheaper fix and it was
already right. Paging is for reads that genuinely need every row, and the
permission matrix does: all 9 actions x 31 modules x 17 roles.

Verified against live: the old read proven to truncate at exactly 1000, the new
one to return all 1613 with no duplicate across pages, and every one of the 17
roles proven non-empty — 21 assertions.

**This is the third time this cap has bitten** (a migration audit reporting
`qc = 5` against a real 14; the 200-row stat cards 103 fixed; now this). Any
`select()` on a table that can exceed 1000 rows is a bug until proven otherwise.

### Duplicates, delete guards and Restore (no migration)
Mehboob: *"customer main Ags Molasses tha jo ghalti say delete ho gya us k 4
jobs b thay"* — then *"dublicate entry b na ho, same name phir say add ho gya
sirf capital letter aur small letter ka ferq tha."*

**What actually happened**, read off the live rows: `CUST-2026-0001` "Ags
Molasses" (the legacy import, 4 jobs) and `CUST-2026-0049` "AGS Molasses"
(created by hand at 11:32:17) were both live at once. Both were deleted 35
seconds apart while trying to clean that up. **The 4 jobs were never touched** —
a customer soft-delete does not cascade — but they pointed at a row no screen
would show. `CUST-2026-0001` was restored and asserted back (16 assertions);
the empty duplicate was deliberately left deleted.

**Why nothing stopped it.** `customers` POST *did* have duplicate detection —
on NTN and phone/mobile only, **never on the name** — and the duplicate row had
all three blank (`''`), so `body.ntn?.trim()` was falsy and **not one check
ran**. PATCH had no check at all. Every other named table (vendors, the eight
material-type tables, units/currencies/taxes, machines, departments,
job_statuses, delay_reasons, cost_item_types) had none of any kind, and DELETE
nowhere looked at what was attached.

Three shared helpers, so the answer is the same everywhere:

- **`duplicateName.ts`** — `normalizeName()` (trim → collapse whitespace →
  lowercase) plus `guardDuplicateName()`. Wired into POST **and** PATCH of all
  eleven routes above.
  - **Name is a HARD block; phone/NTN stays a warning with `force`.** A phone
    can legitimately be shared (two branches, one landline). Two rows reading
    "AGS Molasses" in a dropdown cannot be told apart by anyone afterwards, and
    the fix is free — give one a distinguishing name. `force` is deliberately
    **not** honoured for a name.
  - **Soft-deleted rows are included on purpose**, so re-adding a deleted name
    answers *"restore it instead"* (`DUPLICATE_NAME_DELETED`) rather than
    orphaning the first row for good.
  - **The `ilike` narrowing puts a wildcard BETWEEN each word**, not around the
    whole string. Wrapping the trimmed value meant `"AGS   Molasses"` never
    found the stored `"AGS Molasses"` — ilike is case-insensitive but not
    whitespace-insensitive. **Caught by a failing assertion, not by reading the
    code**, and the failed run created a customer the script had not recorded,
    which is why the cleanup now sweeps by name as well as by id.
  - Deliberately NOT fuzzy: "AGS Molasses" vs "AGS Molasses Pvt Ltd" pass. There
    is no safe near-match threshold to guess at.
- **`deleteGuard.ts`** — counts dependents (`{ count: 'exact', head: true }`,
  never a fetched array) and answers 409 with them; `?force=1` proceeds.
  Customers check jobs/quotations/sales_orders/invoices/dispatch_orders, vendors
  check purchase_orders/board_inventory/board_inventory_lots.
  **Warn, don't block** — a customer entered by mistake with a job entered by
  mistake still has to be removable. That is only safe because delete is now
  recoverable; **do not reuse this to guard a hard delete.**
- **`duplicateJob.ts`** — a **warning only, never a block**. Running the same
  carton again is the business, not a mistake. Flags same customer + same
  normalized title when the twin is **still open, or was created in the last 24
  hours** — which catches a double submit while leaving a normal repeat of
  finished work alone. Skipped outright when `parent_job_id` is set (pressing
  Repeat already answers the question).
  **Placed before `get_next_sequence_number`**: that RPC consumes a real job
  number, so warning after calling it would burn one per warning and leave
  permanent gaps in the JOB series. Asserted.

Restore: `?deleted=1` on the customers GET, `POST /api/v1/customers/[id]` to
undo, and a **Deleted tab with a Restore button** on the list.
- Restore uses the **`edit`** permission, not `delete` — gating it behind
  `delete` means the people most likely to spot the mistake cannot fix it.
- **The restore clash check counts LIVE rows only.** Using the shared helper
  as-is would have let the deleted "AGS Molasses" twin block the real one from
  coming back — the exact pair on live. Asserted both ways.
- The Restore column is `role: 'meta'`, not `'desktop'`, or it would not render
  on a phone at all. `ConfirmDialog`'s "This cannot be undone" is gone for
  customers, because it is no longer true.

**Two client bugs found on the way:** the customer DELETE call never read its
response, so a 409 would have been ignored and the page would have navigated
away as though the delete worked; and `onClick={save}` on New Job passes the
click event straight into the new `force` parameter, which would have skipped
the duplicate check on every first attempt. Both fixed.

Also fixed in passing: `departments`, `job_statuses` and `delay_reasons` PATCH
updated **by id alone with no `company_id` filter**, leaving RLS as the only
tenant boundary — every other route in the codebase filters it explicitly.

Verified: **44 assertions through the real HTTP routes against live** (temp
superadmin, cleanup written first, `npm run dev -- -p 3123`) — capitals,
extra spaces and `force:true` all refused on a name; a different name and a
row keeping its own name both allowed; the job warning raised, overridden,
skipped for a repeat, and not raised for a different customer; the refused job
proven to consume no job number; delete refused naming "3 jobs" and proven to
have changed nothing; `force=1` soft-deleting with all 3 jobs surviving; the
Deleted list, restore, the already-live 400, and both twin cases. Live was
returned to its exact prior state — **9 further assertions**: 48 live
customers, only the AGS duplicate still deleted, Ags Molasses restored with its
4 jobs, 479 jobs, counters back to CUST 49 / JOB 1 / VND 5, temp user gone.

### "Same spec as an old job?" — copy specs without making it a repeat
Mehboob: *"aik job jo already save hay same spec wala, doosra job aata hy new
name k sath — to purany job main say sary spec kasy copy ho gy."*

**What existed:** only "Repeat with Changes", which fills the whole spec form
from the parent — but also sets `parent_job_id` / `is_repeat` / `repeat_kind`,
**demands at least one "what changed" tick**, and shouts REPEAT on the printed
Job Card. For a job that is genuinely new and merely shares a spec, every one
of those is false record. The alternative was retyping ~18 fields.

New Job (plain mode only) now carries a **Copy specs from** picker. It copies
the production spec — size, sheet, box type, board, GSM, colours, ups, die,
lamination, coating, foil, finishing, pasting, workflow, customer — and links
nothing.

- **Deliberately NOT copied: job title, quantity, required date, quoted
  amount.** Each is a per-order decision, and silently inheriting one is how a
  wrong quantity or a stale price reaches the floor. The title especially — a
  new name is the whole premise, and leaving it blank also means the new
  duplicate-job warning does not fire on a legitimate copy.
- **Safe to leave unlinked** because plate reuse does not depend on a parent
  job: the operator picks any in-storage plate of the matching size from a
  dropdown (`PlatesClient` filters on `status === 'in_storage' && plate_size`).
  Checked before deciding, not assumed.
- The panel says outright that if it really is the same product running again,
  Repeat is the right button — so the two features don't blur.

**`GET /api/v1/jobs/spec-search`** backs it, and exists because the picker
would otherwise have been useless for the exact case he described.
`jobs/new/page.tsx` pre-loads `.limit(200)` and the old picker filtered that
array **in the browser** — with 479 jobs live, **279 of them could not be found
no matter what was typed**, and since the 478 legacy jobs share one backdated
`created_at`, which 200 arrived was not even stable. Same defect §6 records:
a filter that stays in the browser silently reinstates the cap.
- Customer name is matched by **resolving names to ids first**, then
  `customer_id.in.(…)` — PostgREST cannot put an embedded column inside a
  parent-level `.or()`, and the browser filter it replaces did support customer
  name, so dropping it would have been a quiet regression.
- Returns **no `quoted_amount`**: the route is open to anyone with `jobs create`,
  which by 120's line includes the production side, and the copy never uses it.
- `.eq('job_kind','production')` so press proofs aren't offered as a spec to
  copy, and `.order('id')` as the tiebreaker the legacy jobs need.

Verified: **21 assertions through the real routes against live** — a real job
proven to sit outside the pre-loaded 200 and then proven findable by the new
route; every field the copy fills present in the payload; `quoted_amount`
absent; search by job number, by customer name (all 4 Ags Molasses jobs), and a
nonsense search returning an empty list rather than an error; the 50-row cap;
401 without a session; and a job created from a copied spec proven to have
`parent_job_id` NULL, `is_repeat` false, no `repeat_kind`, with GSM and die
number carried across. Live returned to its prior state (jobs 479, JOB counter
1, temp user removed) — 4 further assertions.

**Then both Repeat pickers were moved onto it too** (*"ker do"*), so all three
job pickers on the page share one server-side search. Two things that needed
care:
- **`parentJob` / `changedParent` / `selectChangedParent()` had to switch from
  `repeatableJobs` to the fetched list.** A job found by search is very often
  NOT in the pre-loaded 200, so looking it up there would have left the
  exact-repeat summary card blank and the changed-repeat prefill empty —
  silently, with no error.
- `filteredJobs` is declared **above every reader**; `changedParent` reads it
  during render, so a later `const` would be a temporal-dead-zone crash.
- The route grew `quantity` (the exact-repeat card shows it) and
  `quoted_amount` (the changed-repeat prefill writes it).

**`quoted_amount` is stripped SERVER-SIDE here** — the one place in this
codebase where a money gate is real rather than a display gate (119's rule is
that the API still returns the figures). It can afford to be: the field has
exactly one consumer. It also **closes a leak**: `jobs/new/page.tsx` was
selecting `quoted_amount` for 200 jobs **for every role**, so the price sat in
the page HTML with only a client-side `MoneyGate` between it and the screen. A
Planning or Production user could read it in the source. That column is now out
of the page select entirely, and the page also gained the `.order('id')`
tiebreaker its 200-row window needed.

Verified: **20 further assertions against live** — `gm` and `planning` first
proven to genuinely differ on `money::view` before trusting anything;
`planning` gets all 50 rows with **every** `quoted_amount` null and every spec
field intact, `gm` gets the amounts; every field `selectChangedParent()` writes
present in the payload; **279 jobs measured as sitting outside the pre-loaded
200**, with 5 sampled and all 5 now findable; and the rendered New Job page
proven to contain no `quoted_amount` at all. Live unchanged afterwards (479
jobs, 48 customers, counters, 14 users) — 5 more.

### Size search — "190x100x45" (no migration)
Mehboob: *"search main mujhay L x W x H ki search b chahiyay."* An inquiry
arrives as a size, not a job number — *"wohi 190 x 100 x 45 wala dabba"* — and
finding the old job that already has that size is the whole point of the spec
picker.

`parseSizeQuery()` (`src/lib/utils/parseSizeQuery.ts`) is the single parser,
used by **both** `GET /api/v1/jobs/spec-search` (all three New Job pickers) and
`GET /api/v1/jobs` (the Jobs list), so the two searches cannot drift.

- **The separator is required, and that is the point.** A bare `190` stays a
  TEXT search, because die numbers are bare integers on live (186, 254) and job
  numbers are full of digits — treating a lone number as a dimension would
  break the search that already works. Accepts `x`, `X`, `×` (U+00D7, which
  phone keyboards produce) and `*`.
- **Anchored**, so "carton 190x100" stays text. Mixing a size and a text term
  would need an AND across unrelated columns with no obvious right answer.
- **Partial is allowed**: `190x100` matches L and W at any height — the height
  is the dimension people misremember.
- **Order is L, W, H as typed, not order-insensitive.** The form is labelled
  L / W / H and the Job Card prints that order; matching any permutation would
  quietly return a different box.
- **Exact values, no tolerance.** `.eq()` was tested against real Postgres
  first, including the 13 live rows with `.5` halves (190.5, 82.5) — halves are
  exactly representable so there is no float drift to guard against. A
  tolerance would make 190 match 190.5, which for a die is a different box.

Verified: **27 unit assertions** on the parser (every separator, decimals,
partials, and fourteen things that must NOT parse as a size — bare numbers, a
real live die number, job numbers, customer names, four dimensions, dangling
separators, null/undefined) and **19 through the real routes against live** —
all five separator forms returning exactly the count the database returns, the
partial form, a decimal size resolving to `JOB-2025-00003`, a bare "190" proven
to still run a text search, an unknown size returning an empty list rather than
an error, the Jobs list agreeing with the database, job-number search proven
untouched, and **both searches proven to return the same set**.

### Artwork thumbnails show the whole design (no migration)
Mehboob: *"thumbnail ka size vertical hay jis main image cut jata — ya to
strech kero ya fill kero ta k design pora nazer aaey."*

The tile is **125x160, portrait** (his own earlier spec, with 60x77 and 40x52
scaled from the same ratio) while artwork is nearly always a **landscape
dieline**, so `object-cover` was filling the box and cropping the sides off —
which on a carton is exactly where the brand panel sits. One class:
`object-cover` → **`object-contain`** in `ArtworkThumb`.

- **Not `fill` (stretch), which he also offered.** Stretch shows the whole
  design but squashed, and this is the image a CUSTOMER approves — a
  misproportioned preview misrepresents the artwork, and a landscape dieline
  crushed into portrait is unreadable. `contain` delivers what he actually
  asked for (the design whole) with the proportions kept.
- **The box sizes are untouched.** They were a deliberate spec and the ratio is
  shared by all three sizes; only the fit changed. The tile already had
  `items-center justify-center` and a background, so the letterbox reads as a
  margin rather than a hole.
- **The printed Job Card had the identical bug** — `.artwork-thumb` at
  `30mm x 38mm; object-fit: cover`. Fixed in the same pass, and it matters more
  there: that sheet is what the operator holds at the press to confirm he has
  mounted the right job.
- `ArtworkThumb` has **no `MarkupOverlay`**, so changing the fit cannot move the
  0–100% markup coordinates. Checked before touching it, not assumed.
- The only `object-cover` left in the codebase is the Scan page's camera
  viewfinder, where filling the frame is correct.

Verified: **17 render assertions** (all three sizes carrying `object-contain`
and provably no longer `object-cover`, the tile still centring with a
background, the three box constants unchanged, and a PDF row still falling back
to the file-type tile rather than a broken `<img>`), plus the built CSS grepped
for `.object-contain{object-fit:contain}` — per §5, a class existing in source
proves nothing until the rule is in `.next/static/css/`.

### 124 — a job can carry more than one DESIGN
Mehboob: *"jobs main kabi kabi 2 artwork b hoty hain."* Asked whether those are
two versions of one design or two separate designs, he answered **two separate
designs** — an HL lid and base, a carton and its insert, two designs ganged on
one sheet. Neither is a revision of the other and neither is "older".

**`job_artworks` modelled a job's artwork as ONE version chain.** Every upload
took `max(version) + 1`, so the second design became "v2" of the first. Three
consequences, all silent:

1. **The second design was invisible.** Jobs list, Kanban, Production Floor,
   Planning and the printed Job Card all show "the latest version", so design 2
   replaced design 1 on screen and design 1 could not be seen anywhere except
   the Job Detail artwork tab.
2. **The artwork gate passed on a single approval.** It asked for ANY row with
   `status = 'approved'`, so approving the lid opened the gate for the base and
   the shop could print a design the customer never signed off. The pglite test
   asserts the OLD rule would still have passed at the exact point the new one
   refuses — otherwise the new assertion proves nothing.
3. The customer approval link is per artwork row, so a customer approving "v2"
   had only ever seen one of the two designs.

**124 adds `design_no` (default 1) and `design_label`.** Version becomes a chain
WITHIN a design; `(job_id, design_no, version)` is an artwork's real identity.
- **Group on the NUMBER, never the label.** The label is optional free text and
  will be blank half the time — "lid" / "Lid " / "LID" would fragment one job's
  designs into three. The label is display only.
- `DEFAULT 1` means **every existing row is design 1** and every current job
  behaves exactly as before. No backfill beyond the default.
- Unique index is **partial, `WHERE deleted_at IS NULL`**, so a soft-deleted v2
  cannot block re-uploading v2. Probed live first: `job_artworks` held 2 rows on
  2 different jobs, so nothing could conflict.
- `CHECK (design_no >= 1)` — a 0 would sort ahead of design 1 and break every
  "first design" read.

Code, same commit:
- **POST /api/v1/artwork**: `design_no` given → next VERSION of that design;
  omitted → a NEW DESIGN (`max + 1`). A `design_no` beyond what exists is a 400,
  not a hole in the numbering.
- **The gate now requires EVERY design to have an approved version**, and names
  the ones that don't ("Design 2 (Lid) is not approved yet"). A one-design job
  gets the original wording — no "2 designs" talk on the 99% case.
- **`/api/v1/jobs/thumbnails` returns an ARRAY per job** (latest version of each
  design). `useJobThumbnails` is now `Record<string, JobThumbData[]>`, and it
  wraps a bare object in an array so a stale build of either side degrades
  instead of rendering `[undefined]`.
- **`JobThumbStrip`** replaces five hand-written `<ArtworkThumb>` call sites.
  The Jobs list passes `max={1}` — that tile shares a 3-of-12 column with the
  title and customer, and a second 60px tile would squeeze the title to
  nothing — and gets a **"+1" chip** instead, so a design is never dropped
  silently. Planning and Floor cards have room and draw both.
- **The printed Job Card prints one tile per design, each captioned.** That
  sheet is what the operator holds at the press; printing one design's picture
  while the other runs is the mistake the card exists to prevent. Signed in one
  batch, mapped by index (Storage normalises paths).
- The upload modal asks "a new version of Design N" vs "a separate new design",
  **defaulting to a new version of design 1** when artwork already exists —
  adding a revision is much the commoner act, and defaulting to "new design"
  would fragment a job's history. The default is set when the modal opens, not
  in `useState`, because `designs` is derived below the state declarations.
- The per-row design chip only appears **once a job actually has more than one
  design**, or it would read "Design 1" on every row in the system.

Verified: **26 assertions on the migration against real Postgres** (columns,
default, existing rows untouched, the unique index refusing a true duplicate
while allowing the same version under a different design, a soft-deleted row
not blocking re-upload, the CHECK, both real read queries, idempotent re-run,
and the undo block keeping every artwork row), **18 render assertions** on
`JobThumbStrip` (0/1/2/3 designs, the `max={1}` chip, an unsigned design still
tiling, no hardcoded hex, no opacity-on-`var()`), and **26 wiring assertions**
(all four list files on the shared strip with no hand-rolled thumb left, the
route returning an array, the old single-approval query gone, the card printing
per design).

### 125 — 124 was half a fix, and only live told us
124 went onto live and the very first two-design upload failed:

> `duplicate key value violates unique constraint
> "job_artworks_company_id_job_id_version_key"`

**015's original `UNIQUE (company_id, job_id, version)` was still on the
table.** It does not know what a design is — it allows one row per version per
JOB — so design 2 version 1 collided with design 1 version 1. 124's new index
said the insert was legal; 015's constraint said it wasn't, and **the stricter
rule wins**. A job could hold two designs everywhere except the one place that
counts.

125 drops it. Nothing replaces it: 124's
`job_artworks_job_design_version_uniq` covers the same ground more precisely
(per design, and ignoring soft-deleted rows). `job_id` already implies the
company, so `company_id` in the old key added nothing. **The migration finds
the constraint by its COLUMN LIST, not its auto-generated name** — a database
rebuilt by other means can carry the same rule under a different name, and a
name-only `DROP` would silently no-op while reporting success.

**Why 124's own test missed it — the lesson.** The pglite test rebuilt
`job_artworks` from scratch to exercise the migration, and the rebuilt copy
carried only the columns 124 touches, not 015's table constraint. It asserted
the new index exhaustively and never knew the old one existed.
**Rebuilding a table for a migration test proves the migration and nothing
about the real table.** Read the original `CREATE TABLE` for constraints,
triggers and indexes before adding a rule that overlaps one — checking
`information_schema.columns` is not checking the schema.

Verified: **19 assertions against real Postgres**, this time on a table built
from 015's actual definition — the failure **reproduced with its exact error
message** before 125, gone after; design 2 v1 inserting; a true duplicate still
refused; versions still stacking within a design; a soft-deleted row still not
blocking; another job unaffected; the existing row untouched; idempotent over
three runs; and 125 proven to run cleanly on a database where 124 was only
half-applied.

Also fixed from the same screenshot: the upload modal read **"Add Artwork
Version" while "A separate new design" was selected** — the title keyed off how
many designs existed instead of what the user had chosen. It now follows the
choice.

**Still NOT walked through the real HTTP routes.** The walk script is written
and waiting in the scratchpad (`design_test.mjs`); it creates a two-design job
and asserts the gate refuses at one approval and passes at two. Run it once 125
is on live.

### Size on the Jobs list and in search (no migration)
Mehboob: *"job list main LxWxH aur sheet size WxH b show ho, main search main b
show ho."* His screenshot made the case — six results all reading
"… 50g Inner & Outer" for **Ags Molasses**, told apart by nothing on screen.
Size is the only field that separates them.

`formatJobSize.ts` is the single formatter — `formatBoxSize()`,
`formatSheetSize()`, `formatJobSizeLine()` — used by the Jobs list column, the
Kanban card, the search palette and the Excel export.
- **A missing dimension is dropped, never zeroed.** 70 of 479 live jobs carry
  no size; "190 × 100 × 0" would read as a real flat box.
- **Sheet is both sides or nothing** — half a sheet size reads as a box
  dimension on the floor.
- Output uses **U+00D7 ×**, the same sign `describeSizeQuery()` emits, so what
  the screen shows and what the search box understands read identically —
  asserted by round-tripping the displayed string back through
  `parseSizeQuery()`. Input still accepts a plain `x`; nobody should have to
  find × on a keyboard.

- **One stacked column, not two.** The row already carries 8 columns plus the
  selection checkbox; two more would push every text column to a truncating
  width. Box size over "Sheet W × H", mirroring "Title / Customer" above it.
- Both the server page and `GET /api/v1/jobs` gained the five columns — **the
  page alone would have blanked the column the moment anyone searched**, which
  is the same trap §6 records for the Stage column.
- **Search is enriched in the route, not in `global_search_index`.** That view
  is shared by every entity type; widening it for a field only jobs have means
  a migration plus a full index refresh. At most 20 rows come back, so it is
  one keyed lookup. The **ilike fallback path got the columns too** — otherwise
  the size line would vanish exactly when the search index is broken and nobody
  would connect the two.
- Kanban shows it as well: it is the same Jobs page under a different view, and
  switching should not lose the field.

Verified: **20 unit assertions** on the formatter (decimals, trailing zeros,
dropped dimensions, half a sheet, a real 0 kept as a value, and the round-trip
through the search parser), **11 through the real routes against live** — 80
`L × W × H` values and 98 `Sheet W × H` lines actually rendered on
`/dashboard/jobs`, `JOB-2026-00001`'s exact figures present, the list API
carrying all five columns, search returning them, and non-job results proven
NOT to gain phantom size fields.

**A wrong assertion worth remembering:** the first render check failed on
`/Sheet\s*\d/` while the page was perfect. **React SSR inserts `<!-- -->`
between adjacent text nodes**, so `Sheet {value}` serialises as
`Sheet<!-- -->20 × 27`. Strip those before asserting on visible text.

### Open threads
- **Only Customers has a Restore tab.** Vendors, machines, departments and the
  master-data lists all soft-delete with no way back from the UI — same gap,
  same fix, not done unasked. `deleteGuard` is already wired to vendors.
- **`vendors` PATCH spreads the raw request body into the update** (`.update(body)`)
  rather than using an explicit allowlist the way `customers` PATCH does. A
  mass-assignment risk: `company_id`, `is_active` and `deleted_at` are
  client-settable on that route today. Flagged, not fixed — it needs its own
  pass over the vendor schema.
- **`planning` still has 22 view modules** (purchase, dispatch, workflow,
  machines, quotations, sales_orders, all six production stages…), which is why
  its sidebar is 23 links and auto-collapses. Tightening it was offered and not
  picked — do not do it unasked.
- **`planning` still has 22 view modules**, including `machines edit`,
  `workflow edit` and `edit` on all six production stage modules — a planner
  scheduling work does not need to edit stage progress. This is the single
  biggest reduction available and 123 deliberately did not take it, because
  removals break people mid-shift. See 123's footer for the other four.
- **Aqib Ali is the last one uncreated**, waiting only on **migration 122**
  (`store_manager`). Re-run the loader in the scratchpad after it; the loader is
  idempotent and skips everyone already made.
- **Zahid Mahmood's address was `r&d@`** (invalid — `&` fails zod's `.email()`)
  and he was created on `rd@jafsonprintpack.pk`. **The CSV at
  `D:\Packaging\Jafson\Business Card\` still says `r&d@`**, so fix it there too
  or the next load re-breaks.
- **Staff phones are a mix of `+923…` and `923…`** — the ones Mehboob has edited
  in Settings → Users picked up a `+`. **This is harmless**: `sendWhatsApp()`
  does `replace(/[^\d]/g, '')` before sending, so both reach Meta identically.
  Checked rather than assumed; do not "fix" it.
- **Staff passwords are `firstname7510` and sit in plaintext in the CSV.**
  Everyone can change their own from the Header; superadmin can reset from
  Settings → Users. Worth doing once the accounts are handed out.
- **The first real job is now in flight** (counts taken 2026-07-30):
  `JOB-2026-00001`, `status = in_progress`, 1 `job_workflow_instances` row and
  10 `job_stage_progress` rows. The other 478 are the completed legacy import,
  still with no workflow template. `plates` / `plate_sets` / `job_plates` are
  still at **0 rows**, so "0 plates hard-blocks Printing" is about to become a
  live problem on that job. Take fresh counts before treating any of this as
  evidence.
- **`src/types/database.types.ts` is stale** — it predates everything from ~087
  on. It's the file §1 says to check before writing a query; check the migration
  too.
- **Repeat Job picker is capped at 200 rows** (`jobs/new/page.tsx:34`, newest
  first), so the backdated legacy jobs mostly don't appear in it.
- **Two `.limit(200)` caps remain, both deliberate**: the Repeat Job picker
  (`jobs/new/page.tsx`, a dropdown) and `job_costings` on the Reports page (a
  report input, not a list). Every list page is uncapped.
- **Grain Direction**: input, form state and request schema all removed. The
  **column still exists** and old jobs keep their values; Repeat and QC Reprint
  still copy it row-to-row. Dropping it properly is a separate, irreversible
  migration — only if Mehboob asks.
- **Notification bell is `hidden md:flex`** — there is no way to see
  notifications on a phone. Flagged, not fixed.
- **WhatsApp** (Meta Cloud API) half-configured: test number works, needs a
  permanent System User token, then `WHATSAPP_PHONE_NUMBER_ID` +
  `WHATSAPP_ACCESS_TOKEN` in Vercel, an approved message template, and a
  production number. Also needs user phones in `923...` format and departments
  assigned to workflow stages in Settings → Workflow Engine, or notifications
  silently no-op.
- Next.js 14.2.5 has a known vulnerability with a patched release available.
  Flagged; upgrading needs its own testing pass.

---

## 8. Testing techniques that work here

- **Scratch assertion scripts** beat eyeballing. Write a throwaway script that
  greps the built output or parses the changed file and asserts the specific
  thing you claimed. Delete it after.
- **Test migrations for real before Mehboob runs them.** Rebuild the exact broken
  state, apply the migration, then *call the functions and assert what they did* —
  106 was verified this way (CMYK set generated, `replace_plate` leaving the other
  three plates untouched, 072 failing exactly as predicted): 23 assertions, not
  "it compiled".
  Two ways, both available on this machine now:
  **PostgreSQL 18.4 is installed locally** (`psql --version`), and
  **`@electric-sql/pglite`** (~15MB WASM Postgres, no server, no Docker) works
  from the scratchpad when a throwaway database is easier than a real one.
  Python 3.14.6 is installed too, if a skill or tool needs it.
- **Walking a job end to end through the real routes is the strongest test
  here**, and it is cheap: create a temp auth user + `users` row with
  `role = 'superadmin'` via the service-role client, sign in with
  `signInWithPassword`, and send the session as
  `sb-<project-ref>-auth-token=base64-<base64(JSON session)>` — that is the
  cookie `@supabase/ssr` reads. Run `npm run dev -- -p 3123` so it can't collide
  with Mehboob's own server. Write the cleanup script BEFORE the test, record
  every created id in a state file, and reset the `JOB` / `MRN` counters at the
  end. `@supabase/ssr` rotates refresh tokens server-side, so a static cookie
  will 401 at some point — re-sign-in on 401 rather than treating it as a bug.
- **Never probe the live database with a function that writes.** Calling
  `get_next_sequence_number` "just to see if it exists" consumed a real job
  number. Read `pg_proc` / `information_schema` instead. And when probing, pass
  the **correct argument names** — an argless `rpc(fn, {})` returns "function not
  found" for every function that takes arguments, which reads exactly like a
  missing function.
- **A query that errors must not be swallowed.** `(await q).data ?? []` turned a
  wrong-column error into "the table is empty", and I reported `role_permissions`
  as having 0 rows when it had 1320. Always check `error` before trusting `data`.
- **Render tests** for components: `npx tsx` from the repo root (needed for the
  `@/` alias) with a temp tsconfig extending the real one but setting
  `"jsx": "react-jsx"` — the repo's `"preserve"` leaves JSX untransformed.
  Components using `useRouter` / `usePathname` need `AppRouterContext`,
  `PathnameContext` and `SearchParamsContext` mocks from
  `next/dist/shared/lib/...`.
- **Editing big files**: exact-string replacement with an assert guard that the
  match count is exactly 1. Regex over JSX has failed here more than once.
- Closed modals render nothing, so assertions against modal content fail on
  closed-state HTML — verify those by source grep instead.

---

## 9. Working with Mehboob

- He writes in a mix of Roman Urdu and English. Reply the same way, concisely.
- **He is not a developer.** Explain *what changed and why it matters*, not how
  the code works. No walkthroughs of syntax.
- **Make the decision.** "jo behtar hai kar do" / "shuru kero jo theek hay" means
  pick the better option and proceed — don't come back with a menu.
- **His domain corrections are almost always right.** Twice he has caught a
  design error by knowing the printing trade better than the model did — and both
  times the database was already modelled correctly and the shortcut was the
  wrong part. When he pushes back on a data model, re-examine it seriously
  before defending it.
- He dislikes narration of process. Do the work, then give a short result
  summary.
- He tests in batches, often later. Don't block waiting for approval between
  steps unless something is genuinely irreversible.
- Requirements do change — the New Job field list changed three times in one day.
  Prefer scripted/mechanical edits over hand-editing so a reorder is cheap to
  redo.
