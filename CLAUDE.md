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
Highest migration so far: **112**. **Always `ls supabase/migrations/` and check
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

### Open threads
- **The `admin` role has `customers` and `dashboard` switched OFF** — 18
  `role_permissions` rows with `is_active = false`, and `has_permission()`
  requires `rp.is_active`, so an Admin genuinely cannot open the dashboard or
  the customer list. Flip them in Settings → Roles & Permissions if that wasn't
  intended. (Admin also has no `admin` module at all — 243 of 252.)
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
