JAFSON PRINT ERP — GSM DONE PROPERLY (v3)            Jul 26, 2026
Built against GitHub commit 5c4844f.

*** THIS ZIP REPLACES BOTH EARLIER ZIPS ***
  jafson-erp-ui-order-batch.zip      (v1)
  jafson-erp-ui-order-batch-v2.zip   (v2)
Everything they contained is in here. Extract THIS one only.

>>> RUN BOTH MIGRATIONS FIRST, IN ORDER <<<
    1. supabase/migrations/087_jobs_gsm.sql
    2. supabase/migrations/088_sales_order_items_gsm.sql
    Both are additive (ADD COLUMN IF NOT EXISTS) — safe to re-run.
    If 087 was already run, running it again does nothing.

===========================================================================
WHY THIS VERSION EXISTS
===========================================================================
v2 pulled the job's GSM from board_types.gsm. That was wrong, and you were
right to catch it: one board type is stocked in many weights, so a single
GSM on the board type row can never be correct. That autofill has been
removed entirely.

GSM is a property of the STOCK ITEM. Your board_inventory table already
models this correctly — every row has its own gsm, sheet size, stock and
rate. So that is where GSM now comes from.

===========================================================================
THE THREE GSM VALUES
===========================================================================
QUOTED   quotation_items.board_gsm — what the price was built on.
         Frozen. Nothing downstream ever writes back to it.

PLANNED  jobs.gsm — what the job says to run.
         Filled from the quoted GSM when the job comes from a sales order,
         otherwise chosen from the weights actually in stock.

ACTUAL   Not stored, and not typed by anyone. Derived from the MRN: the
         requisition line points at a board_inventory row, and that row
         already carries the real GSM. Issue 290 gsm board and the system
         knows 290 ran, without anybody re-entering it.

Your 300 / 300 / 290 case is now three separate readable records instead of
one number that quietly loses the argument.

===========================================================================
WHAT CHANGED
===========================================================================
1. JOB GSM FIELD — no longer guessed from the board type. It now offers the
   real weights that exist in board_inventory for the selected board type
   ("In stock: 250, 280, 300"). You can still type any value — the shop may
   run a weight that isn't stocked yet. Nothing to maintain on the board
   type master; the list builds itself from stock.

2. QUOTED GSM NOW REACHES THE JOB — migration 088 adds
   sales_order_items.gsm. Converting a quotation copies board_gsm onto the
   sales order line, and a job created from that line starts on the GSM
   that was actually priced. Previously this was dropped silently.
   Historical rows stay blank on purpose — backfilling would have invented
   a "quoted GSM" for old orders that may have run on something else.

3. PLANNED vs ISSUED, VISIBLE — Job Detail and the printed Job Card both
   now show:
       GSM (planned)   300
       GSM (issued)    290     <- highlighted when it differs
   Issued shows "Not issued yet" until the store issues board.

4. GSM SUBSTITUTION IS RECORDED, NOT BLOCKED — in Store > Issue Materials,
   the stock picker now shows each item's GSM, and if you pick a weight
   that differs from the job's plan you get a warning and a reason box:
       "Job planned 300 gsm, this stock is 290 gsm. You can still issue it
        — please note why."
   The issue is never prevented. The reason is saved on the requisition
   line, so months later you can still see who decided and why.
   This matches how the board stock check already behaves — soft warning,
   because the shop legitimately substitutes.

5. THE PLANNED VALUE IS NEVER OVERWRITTEN. Issuing 290 does not rewrite the
   job's 300. What was promised and what was done stay separate records —
   that is the whole point, and it is what makes the costing variance and
   any future customer question answerable.

===========================================================================
ALSO IN THIS ZIP (from v1 / v2, unchanged)
===========================================================================
- Dashboard row 2: Recent Jobs | Machines | Alerts
- Quotation: Box Type on the line item, after Colors, before Board Type
- New Job spec order: L / W / H / Ups · Sheet W / Sheet H / Board / GSM ·
  Colors / Quantity / Die Number / Box Type  (Edit Job matches)
- Grain Direction removed from the forms; DB column kept, not dropped
- New / Repeat toggle on New Job, with searchable parent-job picker
- Repeat bug fix: ups, grain_direction and sheet_qty now carried over

===========================================================================
FILES (24) — extract from repo root
===========================================================================
NEW:
  supabase/migrations/087_jobs_gsm.sql
  supabase/migrations/088_sales_order_items_gsm.sql
  src/lib/utils/jobIssuedGsm.ts
CHANGED: 21 files across api/, dashboard/, print/, schemas/, types/

VERIFIED: npx tsc --noEmit = 0 errors. npm run build = compiled
successfully. 22 scripted assertions covering the GSM source, the quoted
chain, the planned/issued display, and that the store warning does not
block issuing.

DEPLOY ORDER:
  1. Run 087 then 088 in Supabase
  2. Extract this zip over the repo root
  3. npm run dev — check: New Job GSM list, a Job Card, Store > Issue
  4. npm run build
  5. GitHub Desktop commit + push
