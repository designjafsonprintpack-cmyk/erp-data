JAFSON PRINT ERP — UI ORDER BATCH (Jul 26, 2026)
Built against GitHub commit 5c4844f "changes" — includes Stage 1 + Stage 2.

NO SQL MIGRATION REQUIRED. Every column used already exists (migration 086).

FILES (5) — extract from repo root, overwrite:
  src/app/dashboard/DashboardPanel.tsx
  src/app/dashboard/quotations/QuotationFormClient.tsx
  src/app/dashboard/jobs/new/NewJobClient.tsx
  src/app/dashboard/jobs/new/page.tsx
  src/app/api/v1/jobs/[id]/repeat/route.ts

SUPERSEDES: jafson-erp-dashboard-panel-order.zip (Jul 25). That zip was never
applied — its change is included here. Do not extract the old one afterwards.

---------------------------------------------------------------------------
1. DASHBOARD PANEL ORDER
   Row 2 is now  Recent Jobs | Machines | Alerts  (was Machines first).
   File: DashboardPanel.tsx. Panels moved as whole blocks — no logic touched.

2. QUOTATION — BOX TYPE MOVED OUT OF COSTING
   Box Type is now a line-item column, after Colors and before Board Type.
   Removed from the Cost calculator panel.
   The line-item table changed from a 12-unit grid to 9 explicit fractional
   tracks, because a 9th column could not fit in 12 integer units without
   squeezing Description. Header and rows share one constant (lineGridCls) —
   if you ever add a column, edit that one line and both stay aligned.
   Existing quotations are unaffected: same box_type_id field, same save path.

3. NEW JOB — PRODUCT SPECIFICATIONS ORDER
   Row 1:  Length (mm)      Width (mm)        Height (mm)         Ups
   Row 2:  Sheet Width (in) Sheet Height (in) Board / Paper Type  Box Type
   Row 3:  Quantity         No. of Colors     Die Number          Grain Direction
   Fields moved only — every input, handler and validation is unchanged.

4. NEW / REPEAT JOB TOGGLE  (answers "new ya repeat kaise karein")
   New Job page now opens with a segmented toggle: [New Job] [Repeat Job].
   Repeat mode gives you: a searchable picker of the last 200 jobs (search by
   job number, title, customer or die number), a summary card showing what
   will be copied, plus Quantity / Required Date / Notes / reuse-artwork.
   It POSTs to the EXISTING /api/v1/jobs/[id]/repeat endpoint — no duplicated
   logic. The old "Repeat Job" button on the Job Detail page still works and
   is unchanged; this is simply a second, more discoverable way in.

5. BUG FIX — REPEAT JOB WAS LOSING UPS
   /api/v1/jobs/[id]/repeat did not copy ups, grain_direction or sheet_qty.
   Since Sheet Qty = ceil(Box Qty / Ups) and Ups is manual-entry only, every
   repeat job arrived at Planning with a blank Ups and had to be re-entered.
   Now all three carry over, and sheet_qty is recomputed from the repeat's own
   quantity (not copied blindly, since the repeat may be a different qty).
   This matches what QC Reprint already did correctly.

VERIFIED: npx tsc --noEmit = 0 errors. npm run build = compiled successfully.
Plus scripted assertions on panel order, column order and field order.

DEPLOY: extract → npm run dev (check the 4 screens) → npm run build →
GitHub Desktop commit + push → Vercel.
