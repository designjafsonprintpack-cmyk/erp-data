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

Deployment is Mehboob's job: `npm run dev` → `npm run build` → **VS Code's Source
Control panel** (Ctrl+Shift+G → stage → commit → Sync) → Vercel builds on push.
He does **not** use GitHub Desktop — this line used to say he did. **Always tell
him which SQL migrations must run first, and in what order.** Code deployed
before its migration means a 500 on save.

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
  **Every one of them opens the print dialog itself** — `window.onload` (not
  DOMContentLoaded, so images and styles have landed) firing `window.print()`.
  Four of the seven were missing it and nobody could tell without opening each
  one; a new print page must carry it too.
- Customer-facing links (quotation approval, customer portal, artwork approval)
  use the token-link pattern: crypto-random token + expiry column on the row,
  service-role client, validated server-side. No separate auth.
- JWT claims from `custom_access_token_hook`: `app_role`, `company_id`,
  `department_id`, `full_name`, `user_table_id`.

### Migrations
Highest migration so far: **148**. **Always `ls supabase/migrations/` and check
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
- **A carton is one thing; each order of it is a RUN.** Mehboob: *"job hamesha
  aik hi rehna chahiye … lekin history bhi ho, pata bhi chale ke job kab chala
  kitna chala."* The row still models the run (merging rows would erase the
  earlier one — quantity, stages, MRN, costing, dispatch, invoice all hang off
  it); the IDENTITY is the `parent_job_id` chain, read by `get_job_family()`
  (132) and shown as Job Detail's **Runs** tab + a "Run 2 of 2" header chip.
  A product/item master is the real end state — not built, deliberately.
- **A GANG RUN is two jobs on one sheet** (126) — same customer, one press setup,
  one plate set, one die. Mehboob's four facts, and the model rests on them:
  the **die** bounds the layout so the ERP must never decide the split
  (`suggestSplit()` is only a starting point); they run together **until
  Packing**; the **Sales Order is rewritten to the agreed quantity**, because the
  SO is what dispatch and invoicing read; always the same customer.
  The identity that makes a split valid is §4's own rule — `ceil(quantity/ups)`
  must equal the run's sheet count for **every** member.
  `is_gang_shared` is a **column on `workflow_stages`, not an inference**
  (`stage_type` is NULL on most stages, so it cannot be derived) — 22 stages
  carry it on live. `original_ups` on the membership keeps
  the job's own die layout, or a Repeat of a ganged job would plan three times
  the board. One MRN for the run, hung off the derived lead job; the plate gate
  accepts the **run's** plates; a shared stage moves every member; board cost
  splits by ups (largest-remainder, total preserved exactly).
  **Label / Sticker jobs cannot be ganged** — that template has no Board Issue
  stage, so nothing was marked shared.
- Board Issue start auto-creates a draft MRN; complete is blocked until the MRN
  is `issued`.
- Pricing/accounting fields are deliberately absent from Sales Orders and Job
  Cards. The Print Job Card shows no workflow checklist.
- Job edit/delete is **superadmin only** — deliberately excluding `owner`, unlike
  every other permission check.
- **A job number carries NO year and never changes** — `JOB-00408`, one
  continuous series from the 478 legacy jobs onward (134). A repeat does not
  take a new number; it appends the run: `-R2`, `-R3`, the same scheme as a
  press proof's `-P1` (133). Mehboob remembers a carton BY its number, so one
  box has exactly one. The STEM (`jobNumberStem()`) is therefore the carton's
  identity, and the search palette collapses a family to one row on it.
  **Only JOB dropped the year** — `document_sequences.prefix_format` (a column
  that existed unread since day one) now drives the shape, so INV/PO/QT/SO/
  DISP/MRN/CUST/VND/GANG are byte-identical to before. JOB's counter is a
  single row keyed `year = 0`.
- **Board stock ek TARGET nahi, bacha hua maal hai.** Mehboob: *"hum board alag
  store nhi kerty, job k hisab sy board oder kerty hain … stock main wo board
  hota hy jo rah jaey … lakin ager client forcast dy dy to hum us board stock
  main mangwa ker rakh b lyty hain."* So the default is that EVERY job's board
  must be bought; stock is only checked to buy LESS. `board_demands` (135) is
  created automatically on job create / repeat / proof / QC reprint, matches
  **gsm + sheet size** (board type is a preference, not a filter — 24 of 51
  stock rows carry no `board_type_id`), reserves what it finds in
  `reserved_stock`, and sends the rest to Purchase → **To Buy**.
  Four numbers, one sum: `required = from_stock + ordered + to_purchase`.
  Status `open → partially_ordered → ordered → ready`; **there is no 'received'**
  — received board lands in stock and is immediately reserved, i.e. `ready`.
  Job cancelled → reservation returns to free stock. Gang → the demand belongs
  to the LEAD job for the whole run, exactly like the MRN.
  Vendor is a property of the board TYPE, not the size
  (`board_types.default_vendor_id`, 138) — and it is only a default, because
  *"ager nhi mil raha to bleach waly sy b board ka dosera brand mangwa sakty
  hain."* The Create-PO modal carries a vendor `<select>` per
  line so that one-off is a click, and a vendor picked BY HAND is never learned
  back onto the board type.
- Doc prefixes: `JOB- DISP- PO- INV- QT- SO- CUST- VND- MRN-`
- Roles: superadmin, admin, owner, ceo, gm, sales, artwork, planning, store,
  printing, dispatch, **plates, qc, purchase, accounts** (last four added in 105).
  `users.role` is free text, more can be added via UI.
  The `printing` role already covers lamination → die cutting → hot foil →
  folder gluing → packing, so its label is **"Production Operator"**; the slug
  stays `printing`. 105 rejected a second OPERATOR role as a duplicate — but
  **119 added `production_manager`**, the man who runs the floor and therefore
  has to see cost. Two live holders. `manager` (121) and `store_manager` (122)
  came later; 18 roles on live, seven of them with nobody on them.
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
- **`jobs` ↔ `sales_order_items` now has TWO FKs too** (141 added
  `sales_order_items.repeat_of_job_id`; `jobs.sales_order_item_id` was already
  there), so the same unhinted-embed failure applies. Correct form:
  `jobs!sales_order_items_repeat_of_job_id_fkey(...)`. Verified by running both
  forms against live before wiring anything: unhinted really does fail.
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
- **`.catch()` DOES NOT EXIST on a Supabase builder.** `PostgrestBuilder` only
  implements `then()`, so `supabase.rpc(…).catch(…)` throws *synchronously, before
  the request is sent*, and `withErrorHandling` turns it into a 500. The idiom had
  been copied to **five** write paths and **not one of them had ever succeeded** —
  PO create, invoice create, record payment, plate reuse, `apply_job_actual_cost`.
  Correct form: `const { error } = await supabase.rpc(…)` then log.
- **A zod line-item schema that omits a NOT NULL column silently deletes it.**
  `z.object()` strips unknown keys, so a schema saying `material_name` while the
  route inserts `description` threw the field away and every PO line insert failed —
  and the route still returned 200. Check the schema against the INSERT, not
  against what the form sends.
- **A `<select>` fed by an unfiltered master table lists soft-deleted rows.** Board
  Inventory and Store filtered neither `deleted_at` nor `is_active`, so all 14 units
  appeared twice with no way to tell which was real. The data was fine; the query
  was wrong.
- **A field rendering "—" usually means a missing JOIN, not missing data.** Job
  Detail and the Job Card never selected `box_types` / `board_types` /
  `lamination_types` / `foil_types` for two years. Check the page's `.select()`
  before blaming the data.
- **A migration that "was run" may only be PARTLY run — or never have run at
  all, in the middle of a range this file swore was applied.** 072 had left
  `job_plates.operator_id` behind but no `plate_sets` and no RPCs. Worse, §7
  said "everything up to 128 is on live" and **122 had never run** — the
  `store_manager` role simply did not exist, with 121 and 123 both present
  either side of it. Probe for its actual objects — table, columns, functions,
  roles, policies, triggers — one by one, and probe the WHOLE range, not the
  newest one. Get the object's real name from the migration first: `job_gangs`
  read as "126 never ran" for a minute because the probe guessed `gang_runs`.
- **Soft-deleting a workflow template in the UI does not soft-delete its stages**,
  and the orphans stay live. 107 cleaned up 16 of them.
- **Adding a `job_stage_events` event type means editing its CHECK too.** 104 added
  press-proof events and forgot; `recordJobEvent()` swallowed the rejection, so the
  route returned 200 and only the audit trail lost it. Restated in full by 028, 042,
  069, 102 and 108.
- **The auto-MRN is only created if the job has BOTH `board_type_id` and
  `sheet_qty`.** No board type → no MRN → Board Issue can never complete, and the
  error blames Store rather than the missing field.
- **`workflow_stage_dependencies` rows are `stage_started`, not `stage_complete`** —
  Die Cutting legitimately starts as soon as Printing *starts*. Sequential order is
  not what gates a configured stage.
- **`job_machine_assignments` has no `deleted_at`** — only `is_active` — and
  production writes hours onto those rows, so removal is a deactivation and a row
  with recorded work refuses to be removed (409).
- **`jobs.parent_job_id` has no ON DELETE clause**, so a job that has proof runs or
  repeats can no longer be hard-deleted.
- **React SSR inserts `<!-- -->` between adjacent text nodes**, so `Sheet {value}`
  serialises as `Sheet<!-- -->20 × 27`. Strip those before asserting on rendered text.
- **`checkStageGate()` inside a loop was the slowest thing in the app** — two
  round trips per call, serial. The Department Queue's 89 pending stages took
  **57 s**; batched it is **0.6 s**, proven identical on all 88 rows. Any list
  uses `loadStageGateContext()` + `checkStageGateFrom()`, never the loop.
- **FIVE paths copy a job's specs** — exact Repeat, QC Reprint, press Proof,
  "Repeat with Changes" and "Copy specs from an old job" — and each has its own
  field list. `internal_remarks` was missing from all five (it holds the ups
  split and component sizes, on 104 of 488 jobs). Add a spec column to all
  five, and to `spec-search` + `jobs/new/page.tsx`, whose SELECTs feed two of them.
- **A checkbox whose promise nothing reads is worse than no checkbox.** Repeat's
  "same artwork, no new artwork needed" (default ON) only wrote a
  `job_artwork_references` note; the workflow gate reads `job_artworks`, so every
  exact repeat was born unable to complete Artwork. Fixed in the route + 129.
- **Two `job_artworks` rows may share one `file_url`** (an exact repeat carries
  its parent's file). Safe on purpose: the retention sweep keeps every path a
  LIVE row points at. Any new file column must be added to that keep-set too.
- **Changing what a write path produces does not change the rows already on live.**
  "Upload = approved" was proven end to end and still left five jobs stuck, because
  every existing row kept its old status. Ask what a change does to existing data in
  the same breath as writing it — a route walk only ever tests the new path.
- **Retiring a status strands the logic hanging off it, silently.** The artwork
  stage's auto-start fired on `waiting_customer_approval`; once uploads landed on
  `approved` that status could never occur, so nothing started the stage and nothing
  errored. Same for its "Move to…" menu, which then offered no route to `approved`.
- **A backfill only covers the rows that existed when it ran.** 137 gave the 10
  open jobs a board demand; a job raised on live an hour later — before the code
  was deployed — had none, and nothing said so. Same class as the artwork
  statuses 128 had to clean up. The permanent answer is
  `sync_missing_board_demands()` (139), which the Purchase page and its API run
  on every open, so a job with no demand is caught at the next look rather than
  at the press. It skips gang members on purpose — their board is the lead's.
- **A PO's quantity is PACKETS; every board number elsewhere is SHEETS.** The old
  MRP page's "Create PO" sent the shortfall in sheets straight into a packet
  column — a 100× order — and never set `board_item_id`, so its goods could
  never credit stock. That page is deleted (135). The conversion now lives in
  exactly one place, `decorateDemands()`.
- **`purchase_order_items.quantity_received` used to be SET, not added**, while
  the stock credit beside it treated the same number as a delta. The receive
  modal pre-fills the REMAINING quantity, so a PO received in two goes ended up
  recording less than arrived and stuck on "Partially Received" forever. Both
  are deltas now.
- **A cleanup script's own writes need their `error` checked too.** A restore
  that set `job_stage_progress.started_by` failed silently — that column does not
  exist — so a walk left Planning completed and Board Issue in progress on a live
  job. The script even printed its "restored" line, because it never looked.
- **A route walk's cleanup that deletes rows with the SERVICE CLIENT skips every
  release the route would have run.** Deleting a test PO that way left two
  demands claiming 2,500 sheets were on order forever — they could never return
  to To Buy. Reset the derived counters in the cleanup too, or delete through
  the route.
- **MRN issue must consume lots FIFO, not just `current_stock`.** Board Inventory's
  manual Stock Out called `consume_board_lots_fifo()`; the MRN issue path — the
  way board actually leaves the store — did not, so all 51 lots sat at full
  `quantity_remaining` and "which delivery did this job's board come from" could
  never be answered. Both paths call it now.
- **Cancelling or deleting a PO must release its demand's `sheets_ordered`**, or
  that board reads as "on order" forever and never returns to the To Buy list.
  `releaseDemandsOfPo()` in `purchase-orders/[id]`.
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
- **Every list is page-wise, paged BY THE SERVER, 20 per page by default** —
  the pager carries a 10/20/30/40/50 picker (`useListPageSize`, one shared
  preference in localStorage, so all lists agree and no call site wires it up). `LoadMore`
  and the browser-side filtering it fed on are both gone. Three pieces:
  `Pagination` + `LIST_PAGE_SIZE` (`src/components/ui/Pagination.tsx`),
  `useServerPagedList()` + `fetchAllPages()`
  (`src/lib/hooks/useServerPagedList.ts`), and `isPageOutOfRange()`
  (`src/lib/utils/pagedResponse.ts`).
  Rules that cost something to learn:
  - **The `.range()` in the page's server component must match
    `LIST_PAGE_SIZE`**, or page 1 and page 2 overlap. All 14 now import it from
    `src/lib/constants/pagination.ts` instead of hardcoding `.range(0, 49)`, so
    the two can no longer drift.
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

**Live counts, 2026-08-05** (read from the database, not remembered): 492 jobs —
478 of them the legacy import, 14 real ones — 48 customers, 5 vendors, 15 users
(13 staff + `Admin` + the stock-load system user), 53 board items, 15 board
demands (10 open, 5 ready), **0 POs, 0 plates**.
The `JOB` counter is at 485; the 7 extra jobs are repeats, which append `-R2`
rather than take a number. Take fresh counts before treating any of this as
evidence.

**Everything up to migration 148 has been run on live and verified** — probed
object by object on 2026-08-05, not assumed. 122 was found MISSING by that
probe while this line claimed everything to 128 was on live, and was run the
same day. The rest of
this section is one line per change, newest last. **The reasoning lives in each
migration's own header comment** — read that before touching its area, not this.
Rules that govern future work are in §4 and §5, not here.

| # | What it did |
|---|---|
| 087 / 088 | `jobs.gsm`, `sales_order_items.gsm`. **If job save or edit 500s, check these first.** |
| 089 / 090 | artwork comment shape + emboss type — **the code that wrote and drew these is gone; the rows remain** |
| 091 / 092 | filled `workflow_stages.department_id` (never populated since 010, so every queue was silently empty); QC became a real workflow stage |
| 093 / 094 | coating types settings-managed and renamed to shop names ("Soft UV" never existed); `jobs.uv_coating` NOT NULL finally dropped |
| 095 / 096 / 097 | `gm` + `ceo` roles and the `user_roles` trigger that had never fired; the `plates` permission module 005 missed; "Repeat with Changes" |
| 098 – 103 | reports date range, downtime/board/reprint reporting, quotation win rate, `get_job_breakdown`, `job_ink_usage` + shift, `get_finance_summary()` |
| 104 / 108 | press proofing (a proof IS a job — see §4); 108 widened the event CHECK 104 forgot, which had been silently losing every proof from the audit trail |
| 105 / 106 / 107 | the four missing shop roles; plate sets repaired (072 was **half**-applied); duplicate/orphan workflow template cleanup |
| 109 / 110 / 111 | legacy jobs renumbered to `JOB-2025-…`; **the box type decides the workflow**; the 12-stage `Carton with Lamination / Foil` template |
| 112 / 113 | `job_plans.day_order` (read order is **`planned_date, day_order, id`** everywhere); board → job traceability, and **`current_stock` is SHEETS — packets are display only** |
| 114 | `get_board_stock_report()` — any past month reproducible forever; **sign convention written down: positive magnitude, direction in `movement_type`** |
| 117 | `board_inventory.unit_cost` is a weighted average |
| 119 / 120 / 122 | sidebar groups and the **`production_manager`** role; **money split into three scopes** — `money` (everything), `money_sales` (quotation/SO rates + the estimator), `money_purchase` (PO rates, board cost). `money::view` satisfies all three. Scope defaults to `cost`, the strictest. `store_manager` = `store` + `money_purchase`. |
| 121 / 123 | the `manager` role (one department, no money, no approve) + real staff loaded; the 17-role permission audit — **123 only ever ADDS** |
| 124 / 125 | a job can carry more than one **DESIGN** (`design_no`); 125 dropped 015's old unique key that made 124 fail on the very first two-design upload |
| 126 | **gang runs** — two jobs on one sheet (see §4) |
| 127 | the `UV Coating` workflow stage renamed to **`Coating`** (HL's "Varnish / Coating" left alone) |
| 128 | approved the 7 in-flight artwork rows left behind when upload-means-approved shipped |
| 129 | carried the parent's approved artwork onto the 3 repeats that had only a reference row |
| 130 | `job_artworks.thumb_url` — a 400px WEBP preview per artwork, so a tile stops downloading the 1 MB original |
| 131 | carried the parent's `internal_remarks` onto the 3 repeats that had lost it |
| 132 | `get_job_family()` — every RUN of one carton, from any member; feeds Job Detail's Runs tab |
| 133 | renumbered the 5 repeats to `PARENT-R2` and dropped " (Repeat 2)" from their titles |
| 134 | **the year left the job number** — 488 jobs renumbered to one series `JOB-00001…00483`; only JOB, via `prefix_format` |
| 135 – 139 | **board demands** — har job ka board khud maanga jata hai (see §4); 136 delete guard; 137 backfill; 138 board type ka default vendor; 139 `sync_missing_board_demands()` |
| 140 | MRN ki board line par GSM + sheet size — jo MRN pehle se bani thi us par bhi |
| 141 | **`repeat_of_job_id`** on quotation + SO lines, and `find_repeat_candidates()` — "ye carton pehle chala hai ya naya?" |
| 142 / 143 | repeat search sirf USI customer ke jobs mein, aur `no_of_colors` bhi wapas karta hai |
| 148 | **`machines.setup_hours`** — make-ready allowance; Planning ab machine ke hours khud bhar deta hai: `setup + qty ÷ capacity_per_hour`, 15 minute par gol. Folder gluer BOXES par chalta hai (`jobs.quantity`), baqi sab SHEETS (`sheet_qty`) — `src/lib/utils/machineHours.ts`. Sirf default hai, planner upar likh sakta hai; sab 9 machines par seed hua |
| 147 | Board **badal kar** issue karo to purane board ka reserve bhi chhooTe — `consume_board_reservation()` demand ko issue hue item se dhoondta tha, is liye substitution par purani reservation hamesha phans jati thi |
| 146 | **`user_departments`** — ek aadmi ke kai department; `users.department_id` ab sirf PRIMARY. Queue aur notifications isi table se |
| 145 | `sales_orders.status` CHECK mein **`draft`** — SO ab draft mein paida hoti hai; Confirm par hi jobs banti hain |
| 144 | **`jobs.is_superseded`** — jobs list par aik carton ka AIK row. Run khatam + naya run mojood = list se chhupa (row poori maujood). Zinda kaam kabhi nahi chhupta; proof naya run nahi ginta. Trigger `UPDATE OF` ki column list se chakkar rokta hai — `WHEN (pg_trigger_depth() = 1)` mat lagana, WHEN top-level par 0 dekhta hai aur trigger khamoshi se kabhi nahi chalta |

**No-migration work, same rule — one line each:**

- **Board Stock ka "Stock (pkt)" khana `span: 1` par kat raha tha** — `DataList` har cell ko `truncate` (overflow:hidden + nowrap) mein lapetta hai, aur "100,000 reserved · 79,500 free" ko 159px chahiyen jab ke cell 1456px par 118px thi. `span: 2` (baqi columns 11 units le rahe the, barhwan khali para tha). Naya column banate waqt cell ki chaurai NAAPO — `truncate` khamoshi se kaat deta hai, error kahin nahi aata.
- **MRN ki line par IKAI (unit)** — khana pehle din se tha, control kabhi nahi (live ki har line par NULL): board `Sht`, ink `KG`, glue/chemical `L` type se khud bhar jate hain, aur auto-MRN bhi ab `Sht` likhti hai. Saath: **board ki stock fehrist sirf board/paper lines par** (ink par board ka stock kat sakta tha aur board ke rate se ink ka kharcha job par chadh sakta tha), aur MRN create ki lines ka `error` ab parha jata hai — girne par adhoori MRN uthaa di jati hai (dono raaston par).
- **Stock `<select>` par SHEET SIZE bhi** — gsm akela pehchan nahi (135 gsm+size se match karti hai); Issue window apna label alag banata tha, ab dono `stockLabel()` → `boardSpecText()` bulate hain, aur New MRN ki line ki `specification` bhi ab dono likhti hai.

- **MRN ki line par stock ki row MRN BANTE waqt likhi jati hai, issue par nahi.**
  `board_item_id` sirf Issue window mein poochha jata tha, is liye jo baat system
  ko pehle se maloom thi — job ka board kis item par reserve hai (135) — phenk di
  jati thi aur storekeeper wohi row 54 rows mein se haath se dhoondta tha. Live
  par **koi bhi line kabhi link nahi hui**, yani stock ki katauti aur reservation
  dono us raaste par chal hi nahi sakte the. Ab teenon jagah: New MRN modal par
  per-line stock `<select>` (khali stock ke sath), `openNewMRNForJob()` aur
  auto-MRN dono demand se pre-select karte hain — sirf tab jab `sheets_from_stock
  > 0`, warna board khareedna hai aur chunne ko kuch nahi. Chunna phir bhi khula
  hai; Issue window use default banati hai.
- **Artwork approval is WhatsApp.** Upload IS the approval: the row lands
  `approved`, **starts** the Artwork stage and deliberately never **completes**
  it (a job can have two designs and nothing says how many are coming). AI
  pre-flight, comments and on-image markup are removed; their tables and columns
  are kept. Accepts JPG/PNG/WEBP — **PDF was declined**, it renders as a grey
  tile without a raster preview step.
- **Every list is server-paged, 20 a page with a 10–50 picker** — see §6, which
  carries the rules that cost something to learn. The **Jobs list opens on All**
  (it opened on New for a while; the kind-aware chip replaced the need).
  `DEFAULT_STATUS_TAB` and the server component's filter must always agree, or
  the first paint shows one tab's rows under another tab's heading.
- **`resolveWorkflowTemplateId()`** is the single answer to "which workflow does
  this job get"; `applyWorkflowTemplateOnEdit()` builds stages on PATCH, and a
  template swap is refused once any stage has started.
- **Deleted customers can be restored** (`?deleted=1` + a Deleted tab); duplicate
  names are a hard block, phone/NTN a warning, delete guarded by dependent count.
  Only Customers has this — vendors, machines and the master lists do not.
- **"Is carton ka pichhla job"** — the SO/quotation line carries
  `repeat_of_job_id` (141), so "5 lines · 3 repeat · 2 new" is answerable while
  the SO is being written, and the job born from that line is automatically
  `-R2`. That count lives on the FORM only — a `3R / 2N` column on the SO list
  was built and then removed on request. The picker only
  SUGGESTS: name similarity is not identity — `Aktive Chocolate 24 SP`
  (200×125×70) and `24 Sp.` (200×130×73) match 1.00 and are different cartons,
  so **size is shown largest** and nothing auto-links. Die number is NOT a
  carton identity either — one die number carries 10 different products on live.
  The link flows quotation → SO → job: the quotation line owns it (that is where
  the die/plate cost decision is made), `convert` copies it onto the SO line, and
  New Job turns it into `parent_job_id`, so the job is born `-R2` without anyone
  remembering. Search is scoped to that ONE customer (142).
  The picker is a **table cell in its own column** (after Unit Price), not a chip
  under the description — hanging it under one column made that column two rows
  tall and broke the whole grid's rhythm. Picking a carton fills the line's
  description, L/W/H and colours, but **never overwrites a value already typed**.
- **"New / Repeat / Repeat with Changes" is printed on the Job Card**, not only
  shown on screen — `jobKindBadge()`, the same rule the list chip uses, so the
  two can't drift. It prints **every time the card comes out**, not just while
  the job is new: paper isn't interactive, and whoever picks the card up off the
  floor later has to see it too. `-R2` in the number implies a repeat but only to
  someone who knows the scheme. It doesn't repeat itself — once a job has
  started, the status badge above it already carries the kind.
- **Copy specs from an old job** without making it a repeat, plus
  **`L x W x H` size search** shared by the Jobs list and all three New Job
  pickers, and the size shown on the list, the Kanban card and the export.
- **Artwork files are swept 30 days after deletion** by `/api/cron/artwork-cleanup`;
  orphans age from the object's own date, and a listing failure never counts as
  "no files".
- **Board stock is loaded** — 51 items, 5 vendors, 1,708,700 sheets, opening
  movements **backdated to 31 July 2026** so August's Opening chains correctly.
  The ERP's July report will not match the Excel; July happened outside the
  system. The load user is kept, renamed "Opening Stock Load (system)", because
  the ledger references it.
- **One PO, one vendor.** The Create-PO modal asks for the vendor ONCE, not per
  line — a PO goes to one supplier and a board type has one vendor, so ten
  dropdowns were the sir-khapai this whole rebuild was removing. It is still only
  a default: it pre-fills from the boards' own vendor and can be changed, and a
  hand-picked vendor is never learned back onto the board type.
- **A Purchase Order is a document the VENDOR receives** — `print/purchase-orders/[id]`.
  Money columns appear only when a line actually carries a rate: Mehboob quotes
  the rate sometimes and asks for it other times, and a column of zeroes reads
  as "free". Board type + gsm + sheet size are **one bold line**, because that is
  what the vendor is being asked for; the job appears under it by NAME, small —
  "for JOB-00483" meant nothing to him and was printed twice. The Excel export
  exports one row PER LINE now; it used to export one row per PO with
  "Items: 6" and nothing about the board.
- **Make-ready is already in the job quantity** — 3–5%, added by hand when the
  job is raised. Do NOT add a wastage % to the board demand: it would be counted
  twice. The estimator's `costing_default_wastage_percent` (3%) is a COSTING
  input only.
- **Store & Purchase rebuilt around board demands** — Purchase is now two tabs,
  **To Buy** (every job's outstanding board, ticked → one PO per vendor, stock
  item created if missing, sheets→packets converted, rate pre-filled from the
  last purchase) and **Purchase Orders**. Job Detail carries a board line.
  Board Stock shows reserved / free. **MRP is deleted** — its page, its API and
  its nav entry; see §5 for the three separate ways its Create PO was wrong.
- **The printed Sales Order carries no money** — no unit price, no line subtotal,
  no totals block. A repeat line prints **`Repeat · JOB-00215`** instead (141's
  `repeat_of_job_id`, embedded with the FK hint). Customer Acceptance is off the
  signature strip — the customer approves on the quotation / artwork link. It is
  therefore **no longer money-gated**: the `money::view` check came off the route
  AND off the print button, because production, store and dispatch all need this
  sheet. Put both back the day a rate returns to it. The one and only SO print is
  **`/api/v1/print/so`**; `src/app/print/sales-orders/` is deleted — two
  identical unreferenced copies that had 404'd on every request for ages, since
  they selected `customers.address`, a column that does not exist.
- **`File.type` is a MIME type, not an extension** — and reading one as the
  other is why **no upload had ever produced an artwork thumbnail**.
  `canMakeThumb(file.name, file.type)` uppercased `image/jpeg` into
  `"IMAGE/JPEG"`, matched no list, and returned false every single time; the
  failure only ever reached `console.error`, so the tiles quietly went on
  downloading the 0.3–1 MB original. All 22 thumbnails that existed were named
  `backfill-` — a one-off script, never the app. Found by running the real
  function's steps on a real live file in a browser, not by reading it. Both
  `canMakeThumb()` and `isPreviewable()` now accept either shape.
  **`job_artworks.file_type` stores the EXTENSION (`JPG`)** while a browser
  `File` hands you `image/jpeg` — any helper taking `fileType` gets both.
- **One person covers 2–3 departments and works from their own account** (146).
  Mehboob: *"yaha is company main aik shaks 2 ya 3 depart ko dakh raha hay is
  liyay wo apny account say hi kam kery gy."* Do not model this as one account
  per department. `users.department_id` is now only the PRIMARY department;
  `user_departments` holds the full list and always includes the primary.
  Membership — the Department Queue, `notifyDepartment()` — reads the join
  table. That is also why 8 departments looked "empty": their person was filed
  under a different one.
- **A department with nobody in it no longer swallows its notification.**
  `notifyDepartment()` used to return 0 silently, and on live **8 of 14
  departments are empty** (Planning, Printing, Packing, Dispatch, Plates,
  Lamination, Hot Foil, Folder Gluing) — so "auto-notify the next department"
  had been telling nobody, which is why 9 jobs sat unstarted at Planning. It now
  falls back to `production_manager` (then gm/ceo/owner) and prefixes the
  message with which department is empty. It is a safety net, not a substitute
  for assigning people.
- **A repeat's plates are one click** — `loadFamilyPlates()` finds the carton
  family's reusable plates by number STEM (not `parent_job_id`: R3's parent may
  be the root or R2), and `POST /api/v1/jobs/[id]/plates/reuse-family` mounts the
  whole set with `is_reused = true`. It is a BUTTON, never automatic: a
  `job_plates` row is what opens the printing gate, so auto-assigning would make
  that gate lie about plates still sitting in the store.
  **`plates.status` values are `created · mounted · printing · removed ·
  in_storage · damaged · remade · reused · archived · disposed · lost`** — there
  is no `available` and no `in_use`, so `POST /api/v1/jobs/[id]/plates`'s
  `status === 'in_use'` check has never once fired. Flagged, not fixed.
- **SO confirm karta hai, save nahi** (145) — Mehboob: *"SO save hoty nhi conform
  hoty hi kero, save k bad ager koi changes yad aa gai to."* A new SO is born
  `draft`; **Confirm** (`POST /api/v1/sales-orders/[id]/confirm`, gated on
  `sales_orders::approve`) flips it and **auto-creates a job for every REPEAT
  line** — specs, artwork and board demand from the parent, quantity from the
  line. A NEW-carton line deliberately gets none: `ups` is §4's locked manual
  estimator input, so the line shows a "Job banao" link instead. Idempotent —
  a line that already has a job is skipped, so the button doubles as "create the
  jobs still pending". Editing an SO never pushes it back to draft.
- **`createRepeatRun()` is the only place a run's specs are copied** — the
  `/repeat` route and SO confirm both call it, so §5's "FIVE paths copy a job's
  specs" did not become six. A new spec column goes here, not in two files.
- **A `jobs` embed from `sales_order_items` now needs a hint BOTH ways** —
  `jobs!sales_order_items_repeat_of_job_id_fkey` is the carton this repeats,
  `jobs!jobs_sales_order_item_id_fkey` is the job this line PRODUCED. The SO
  detail page reads both; only the first existed before.
- **Aik carton = aik row on the jobs list** (144). §4's "a carton is one thing;
  each order of it is a RUN" was modelled right and then never kept on the LIST,
  which showed `JOB-00408` and `JOB-00408-R2` as two jobs — Mehboob's own
  complaint twice over. Rows still stay separate (dispatch, invoice, MRN and
  costing all hang off a run), but a finished run with a newer run behind it
  drops out of the list — **including under search**, which was let through once
  and immediately put the two rows back the moment he searched the carton by
  name. Only the **All runs** toggle (`?runs=all`) shows every run; searching a
  stem still finds the carton, because `ilike` matches `JOB-00408` inside
  `JOB-00408-R2`. `runNoFromJobNumber()` prints the "Run 2" chip from the number
  alone.
- **Signatures sit on the bottom margin of every print page** — `.page` is a flex
  column and the signature/footer block takes `margin-top: auto`. Never
  `position: absolute; bottom`: that is out of flow, so a long invoice printed
  its content straight through the signatures. Both finance pages had it.
- **The whole workflow has been walked end to end through the real routes** more
  than once — creation → artwork gate → auto-MRN → plate block → printing → QC
  gate → dispatch → close, gang runs, plans, POs and receipts. §8 is how.


### Open threads
- **`board_types.default_vendor_id` has no Settings UI.** 138 filled the three
  types that hold stock, and `create-po` writes it back the first time a type is
  actually bought — so it fills itself. But a type nobody has bought yet cannot
  be given a vendor by hand; `settings/materials`' TypeManager only renders text
  and number inputs, and a vendor `<select>` needs a new field type there.
- **`reorder_level` is gone from the UI, not from the table.** It assumes you
  restock to a target; this shop buys per job (§4), and live had it set on 0 of
  53 items — so the column was a row of zeroes and "Low Stock" was really "out
  of stock". Board Stock now shows **nothing free** (`current_stock −
  reserved_stock ≤ 0`), the Add/Edit form no longer asks for a level, and the
  UI-less `reorder-suggestions` route is deleted. The column stays so no data
  is lost and `checkLowStock` keeps working.
- **The other three cron routes stand open when `CRON_SECRET` is unset.** They
  compare the header against `` `Bearer ${process.env.CRON_SECRET}` `` directly,
  so on a deployment missing the variable the literal string
  `Bearer undefined` is a valid credential. `artwork-cleanup` refuses to run
  instead (503), because a route that DELETES FILES is the wrong place to
  inherit that. The other three were left alone — changing auth on live crons
  unasked is its own risk.
- **`/api/cron/production-reminders` still calls `checkStageGate()` per row.**
  Left alone deliberately: it loops across companies, so batching needs one
  context per `company_id`, and a daily cron does not feel the latency.
- **Only Customers has a Restore tab.** Vendors, machines, departments and the
  master-data lists all soft-delete with no way back from the UI — same gap,
  same fix, not done unasked. `deleteGuard` is already wired to vendors.
- **`vendors` PATCH spreads the raw request body into the update** (`.update(body)`)
  rather than using an explicit allowlist the way `customers` PATCH does. A
  mass-assignment risk: `company_id`, `is_active` and `deleted_at` are
  client-settable on that route today. Flagged, not fixed — it needs its own
  pass over the vendor schema.
- **`planning` still has 22 view modules**, including `machines edit`,
  `workflow edit` and `edit` on all six production stage modules — a planner
  scheduling work does not need to edit stage progress. This is the single
  biggest reduction available; offered twice and not picked, because removals
  break people mid-shift. **Do not do it unasked.** See 123's footer for four more.
- **Aqib Ali (Store Manager) is still not created** — 122 finally ran on live
  (2026-08-05) so the `store_manager` role now exists, `store` + the three
  `money_purchase` actions, 27 permissions against `store`'s 24. Nobody holds
  it. 15 users are live; he is the 16th.
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
- **`plates` / `plate_sets` / `job_plates` are still at 0 rows** while 7 real
  jobs are in flight, so §4's "Printing is hard-blocked without an active
  `job_plates` row" is about to bite for the first time.
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
  **Then check the temp user is actually GONE.** Two live `superadmin` accounts
  from earlier walks were still active and signable-in when the roles were
  audited on 2026-08-05. Soft-deleting the `users` row does not help: nothing
  on the session path reads `users.is_active` or `deleted_at` — middleware
  gates on `auth.getUser()` alone — so **only deleting the AUTH user revokes
  access**. Delete its `notifications` first or the `users` row won't go
  (`notifications_user_id_fkey`), and check `created_by` across the real tables
  before deleting, not just the ones the walk touched.
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
