JAFSON PRINT ERP — GSM + TOPBAR EDGE FIX (v5)        Jul 26, 2026
Built against GitHub commit 5c4844f.

*** REPLACES ALL EARLIER ZIPS ***
  jafson-erp-ui-order-batch.zip       (v1)
  jafson-erp-ui-order-batch-v2.zip    (v2)
  jafson-erp-gsm-v3.zip               (v3)
  jafson-erp-gsm-topbar-v4.zip        (v4)
Extract THIS one only.

>>> RUN BOTH MIGRATIONS FIRST, IN ORDER <<<
    1. supabase/migrations/087_jobs_gsm.sql
    2. supabase/migrations/088_sales_order_items_gsm.sql

===========================================================================
NEW IN v5 — THE EDGE PROBLEM (logo left, avatar right)
===========================================================================
One root cause for both. The header carried:

    px-4 pl-safe pr-safe

.pl-safe and .pr-safe are custom utilities in globals.css and they SET
padding rather than adding to it:

    .pl-safe { padding-left: var(--safe-left); }

They are declared after Tailwind's own utilities, so they win the cascade
and overwrite px-4. And --safe-left / --safe-right resolve to 0px on
desktop and on any phone held in portrait — there is no notch on the sides.

So the header's 16px side gutter was being set to zero at BOTH ends. On
desktop you saw it on the left (the logo), on the phone you saw it on the
right (the avatar) — same bug, different end, because those are the items
that sit hard against each edge on each layout.

Fix — padding that ADDS the inset instead of being replaced by it:

    pl-[calc(1rem+var(--safe-left))]
    pr-[calc(1rem+var(--safe-right))]

16px everywhere, plus the notch inset when a phone is actually rotated into
a notch. Confirmed in the compiled CSS, not just the source.

Also added a warning comment above the utility definitions in globals.css.
This same trap was already worked around once in Modal.tsx's footer; the
header hit it again. The comment says plainly: never pair a p*-safe with a
p*-N on the same element.

FILES: src/components/layout/Header.tsx, src/app/globals.css

===========================================================================
ALSO IN v5 (carried from v4)
===========================================================================
- Desktop topbar: the right-hand group (clock, theme, bell, profile) now
  takes ml-auto and pins to the right edge. Previously the capped search box
  was the only growable item, so all leftover width piled up to the RIGHT of
  those controls and stranded them mid-bar on a wide screen.
- Search may grow to max-w-lg at 1280px+; GlobalSearch's button no longer
  carries its own duplicate max-w-md, so the wrapper is the one place the
  width is set.
- Company name now shows on phones (capped 120px, truncates). The logo tile
  cannot shrink, the name can — so the controls never get pushed off-screen.
  Still a judgment call; say the word and I'll revert just that.

And from v1-v3: GSM modelled as quoted / planned / actual, the stock-sourced
GSM list, migration 088 carrying the quoted GSM through to the job, planned
vs issued on Job Detail and the Job Card, the store GSM-mismatch warning
with a reason, dashboard panel order, quotation Box Type on the line item,
New/Edit Job field order, and the New/Repeat toggle plus the repeat
ups/sheet_qty fix.

STILL NOT CHANGED: the notification bell is hidden below md, so a phone has
no way to see notifications. Say the word and I'll fit it in.

===========================================================================
VERIFIED
===========================================================================
npx tsc --noEmit = 0 errors. npm run build = compiled successfully.
Header render-tested 10/10 across a top-level route and a sub-route.
Compiled CSS grep-confirmed to contain
  padding-left:calc(1rem + var(--safe-left))
  padding-right:calc(1rem + var(--safe-right))
Plus the 22 GSM assertions from v3.

DEPLOY:
  1. Run 087 then 088 in Supabase
  2. Extract over the repo root
  3. npm run dev — check the topbar edges on a wide screen AND a phone
  4. npm run build, then commit + push
