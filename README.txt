JAFSON PRINT ERP — EDIT JOB CRASH FIX (v6)           Jul 26, 2026
Built against GitHub commit 5c4844f.

*** REPLACES ALL EARLIER ZIPS (v1 through v5) ***
Extract THIS one only.

>>> RUN BOTH MIGRATIONS FIRST, IN ORDER <<<
    1. supabase/migrations/087_jobs_gsm.sql
    2. supabase/migrations/088_sales_order_items_gsm.sql

===========================================================================
THE BUG YOU HIT
===========================================================================
  new row for relation "jobs" violates check constraint
  "jobs_grain_direction_check"

You were right — grain direction was supposed to be gone. The input was
removed from the screen, but the field was still sitting in the Edit Job
form's state, so every save quietly posted grain_direction: "".

Migration 027 put this on the column:
  CHECK (grain_direction IN ('long_grain', 'short_grain'))
NULL passes that check. "" does not. Creating a job worked because the
create route mapped "" to null on the way in; editing did not, so only Edit
failed — exactly what you saw.

FIX: grain_direction is now removed from the job form type, the empty form,
the Edit Job form state, the create payload, and the request schema. The API
will not accept it from a browser at all any more, so a stale cached page
cannot bring the crash back.

The DATABASE COLUMN IS STILL THERE and still holds whatever old jobs had —
nothing was deleted. Repeat Job and QC Reprint still carry that old value
across, because those copy row-to-row and never touch a form. If you want
the column properly dropped, that is a one-line migration; say the word.

===========================================================================
THE SAME BUG WAS WAITING ON THREE MORE FIELDS
===========================================================================
The real problem was wider: an untouched form control sends "", and Postgres
rejects "" on several column types. Only the UUID fields were protected.

  required_date   DATE      -> "" is not a valid date. Any job with no
                               required date would have crashed on Edit.
  no_of_colors    INTEGER   -> clearing the field gave parseInt("") = NaN.
  quantity        NUMERIC   -> same NaN risk.

All blank handling is now in one place, in src/lib/schemas/job.ts:
  - nullable column  -> "" becomes NULL
  - NOT NULL column  -> "" is dropped, leaving the existing value alone

A side benefit: the UUID fields previously mapped "" to "ignore", which meant
once you set a Board Type on a job you could never remove it — clearing the
dropdown did nothing. Now clearing actually clears.

===========================================================================
VERIFIED
===========================================================================
npx tsc --noEmit = 0 errors. npm run build = compiled successfully.
Schema unit-tested against the exact payload EditJobClient sends (the whole
form with every untouched control blank): 13/13, including an assertion that
NO empty string survives parsing for any field, and that real values and
clearing both still work.

FILES CHANGED FOR THIS FIX (5):
  src/lib/schemas/job.ts
  src/modules/jobs/types/job.types.ts
  src/app/dashboard/jobs/[id]/edit/EditJobClient.tsx
  src/app/api/v1/jobs/route.ts
  src/app/api/v1/jobs/[id]/route.ts

===========================================================================
EVERYTHING ELSE (from v1-v5, unchanged)
===========================================================================
- GSM as three records: quoted (frozen on the quotation), planned (on the
  job, from the quote or from real stock weights), actual (derived from the
  MRN's board_inventory row, never typed). Planned vs issued shown on Job
  Detail and the Job Card; store warns on a mismatch and records a reason
  without blocking the issue.
- Topbar: right-hand controls pinned to the right edge; side gutters now add
  to the safe-area inset instead of being wiped by it.
- Dashboard row 2: Recent Jobs | Machines | Alerts.
- Quotation: Box Type on the line item, after Colors, before Board Type.
- New/Edit Job field order: L / W / H / Ups · Sheet W / Sheet H / Board / GSM
  · Colors / Quantity / Die Number / Box Type.
- New / Repeat toggle on New Job; repeat now carries ups and sheet_qty.

DEPLOY:
  1. Run 087 then 088 in Supabase
  2. Extract over the repo root
  3. npm run dev — edit a job and save; then clear a Board Type and save
  4. npm run build, then commit + push
