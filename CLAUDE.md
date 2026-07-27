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
- Print pages live in `src/app/print/` — server-rendered plain HTML/CSS, no
  Tailwind, and **hardcoded hex, never CSS variables** (all 6 pages, 260
  values, zero `var(--color-*)`). Output goes on paper: a theme variable would
  make the same job card print differently depending on which of the eight
  themes the shop happens to be running, and a dark theme would print a black
  sheet. Match the file you're editing. See also the hex note in §5.
- Customer-facing links (quotation approval, customer portal, artwork approval)
  use the token-link pattern: crypto-random token + expiry column on the row,
  service-role client, validated server-side. No separate auth.
- JWT claims from `custom_access_token_hook`: `app_role`, `company_id`,
  `department_id`, `full_name`, `user_table_id`.

### Migrations
Highest migration so far: **094**. **Always `ls supabase/migrations/` and check
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
- Stage gating goes through `checkStageGate()` in
  `src/lib/utils/jobStageGate.ts` — the single gate used everywhere. Explicit
  rows in `workflow_stage_dependencies` win; unconfigured stages fall back to
  sequential.
- Printing is **hard-blocked** without an active `job_plates` row.
  Board stock shortfall is a **soft warning only** — the shop legitimately uses
  bigger board or starts short. Follow that precedent: warn, record, don't block.
- Board Issue start auto-creates a draft MRN; complete is blocked until the MRN
  is `issued`.
- Pricing/accounting fields are deliberately absent from Sales Orders and Job
  Cards. The Print Job Card shows no workflow checklist.
- Job edit/delete is **superadmin only** — deliberately excluding `owner`, unlike
  every other permission check.
- Doc prefixes: `JOB- DISP- PO- INV- QT- SO- CUST- VND- MRN-`
- Roles: superadmin, admin, owner, sales, artwork, planning, store, printing,
  dispatch. `users.role` is free text, more can be added via UI.
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
- **Hardcoded hex is deliberate on the four customer-facing pages only** —
  `artwork/approve/[token]/*`, `portal/[token]/*`, `approve/[token]/*` (242
  values). A customer opening a token link must not inherit whichever internal
  theme the shop happens to be running, so those pages carry their own fixed
  palette and `text-white` on their own fills is correct there. Everywhere else
  the rule stands: CSS variables only.
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

### Open threads
- **`plate_sets` does not exist in the database.** Migration `072_plate_sets.sql`
  was never run, yet `src/app/api/v1/jobs/[id]/plates/generate-set/route.ts`
  writes to it — plate-set generation will fail.
- **Repeat Job picker is capped at 200 rows** (`jobs/new/page.tsx:23`, newest
  first), so the backdated legacy jobs mostly don't appear in it.
- **`document_sequences` carries duplicate lowercase rows** (`job`, `so`, `po`,
  `quotation`, `dispatch`) beside the uppercase ones the app actually uses.
  Harmless today, confusing forever.
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
