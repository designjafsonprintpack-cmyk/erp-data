JAFSON PRINT ERP — GSM v3 + TOPBAR FIX (v4)          Jul 26, 2026
Built against GitHub commit 5c4844f.

*** THIS ZIP REPLACES ALL THREE EARLIER ZIPS ***
  jafson-erp-ui-order-batch.zip      (v1)
  jafson-erp-ui-order-batch-v2.zip   (v2)
  jafson-erp-gsm-v3.zip              (v3)
Extract THIS one only.

>>> RUN BOTH MIGRATIONS FIRST, IN ORDER <<<
    1. supabase/migrations/087_jobs_gsm.sql
    2. supabase/migrations/088_sales_order_items_gsm.sql
    Both additive, safe to re-run.

===========================================================================
NEW IN v4 — TOPBAR
===========================================================================
DESKTOP — the real bug.
The header is a flex row. The search box was the only item allowed to grow,
and it was capped at 448px. Flex puts leftover space at the END of the row
when nothing claims it — so on a wide monitor every spare pixel piled up to
the RIGHT of the clock, theme, bell and profile, leaving them stranded in
the middle of the bar with a huge empty stretch beside them. The wider your
screen, the worse it looked.

Fix: the right-hand group now takes ml-auto, so it is pinned to the right
edge at every width. That is the whole bug.

Two supporting changes so a wide screen doesn't just become a bigger gap:
- The search box may grow to max-w-lg at 1280px+ (was hard-stopped at
  max-w-md at every size).
- GlobalSearch's button had its OWN max-w-md on top of the wrapper's, so
  widening the wrapper alone would have done nothing. The button now fills
  its wrapper and the wrapper is the single place the width is capped.

MOBILE — the company name now shows.
It was hidden below md, so a phone showed a lone crown icon and then a long
empty stretch before the icons on the right. The name now renders at every
width, capped at 120px on phones and 180px from md up, and truncates.
The logo link can shrink and the logo tile itself cannot, so on a narrow
phone with a back arrow present the NAME gives way — the controls never get
pushed off-screen.

This mobile part is a judgment call, not a bug fix. If you would rather the
phone bar stayed minimal, say so and I will revert just that line — the
desktop fix is independent of it.

Desktop output at 1280px+ is otherwise pixel-identical: same heights, same
gaps, same 180px name cap, same hidden/shown breakpoints for the clock,
bell and user block.

NOT CHANGED, worth knowing: the notification bell is still hidden below md
(`hidden md:flex`), so there is no way to see notifications on a phone.
Tell me if you want it in the mobile bar and I will fit it.

FILES CHANGED FOR THE TOPBAR (2):
  src/components/layout/Header.tsx
  src/components/shared/GlobalSearch.tsx

===========================================================================
EVERYTHING ELSE (from v3, unchanged)
===========================================================================
GSM done properly — three separate records:
  QUOTED   quotation_items.board_gsm, frozen
  PLANNED  jobs.gsm, from the quoted value or chosen from real stock weights
  ACTUAL   derived from the MRN's board_inventory row, never typed
- Job GSM field offers the weights that actually exist in board_inventory
  for that board type; free entry still allowed
- Migration 088 carries the quoted GSM through quotation -> SO -> job
- Job Detail + printed Job Card show GSM (planned) and GSM (issued),
  highlighted on variance
- Store > Issue Materials warns on a GSM mismatch and captures a reason;
  never blocks the issue. Planned is never overwritten by actual
Plus, from v1/v2:
- Dashboard row 2: Recent Jobs | Machines | Alerts
- Quotation: Box Type on the line item, after Colors, before Board Type
- New/Edit Job spec order: L / W / H / Ups · Sheet W / Sheet H / Board / GSM
  · Colors / Quantity / Die Number / Box Type
- Grain Direction removed from the forms; DB column kept
- New / Repeat toggle on New Job with a searchable parent-job picker
- Repeat bug fix: ups, grain_direction, sheet_qty now carried over

===========================================================================
VERIFIED
===========================================================================
npx tsc --noEmit = 0 errors. npm run build = compiled successfully.
Header render-tested across a top-level route and a sub-route: 11/11
assertions (right group pinned, search caps, name visible and truncating,
logo cannot shrink, hamburger present, back arrow only on sub-routes).
Plus the 22 GSM assertions from v3.

DEPLOY:
  1. Run 087 then 088 in Supabase
  2. Extract this zip over the repo root
  3. npm run dev — check the topbar on a wide screen AND a phone
  4. npm run build
  5. GitHub Desktop commit + push
