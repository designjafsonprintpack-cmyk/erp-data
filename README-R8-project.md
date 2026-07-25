# Jafson ERP — Phase R8: Final Polish — Responsive Roadmap Complete

**Verified before delivery:** `npx tsc --noEmit` → 0 errors · `npm run build` → 125/125 routes ·
skip-link render-tested inside the real AppShell (renders before content, targets main,
hidden until focused — ALL PASS).
**Migrations:** NONE. **New env vars:** NONE.

⚠️ **Cumulative ZIP — contains the ENTIRE responsive project, R0 through R8.**
Deploy this one alone; it supersedes every earlier responsive zip.

---

## What's in the final batch

### Connection-aware auto-refresh
The 2-minute background refresh now skips ticks while the device is **offline**
(no more waking the radio for a request that will fail), refreshes
**immediately when connectivity returns**, and **halves its polling rate when
the user has Data Saver on**. It already paused while the tab was hidden.
On factory Wi-Fi and mobile data this is a real battery and data saving.

### Print documents readable on a phone
The six print documents (job card, SO, SO doc, invoice, finance doc, challan)
are fixed A4 sheets — 794px wide, forcing pinch-zoom on a phone. On screens
below 840px they now **reflow to the screen width for reading**, with tables
scrolling sideways. The printed output is byte-for-byte untouched — the change
lives entirely in a `@media screen` block.

### Keyboard & screen-reader basics
A **"Skip to content"** link is the first focusable element in the app shell —
invisible until focused, then jumps past the header and nav. The content area
is a proper `main` landmark. Icon-only buttons across the shell already
carried `aria-label`s from earlier phases; this closes the loop.

### Control-height contract
Five ad-hoc control heights are consolidated into a **documented 3-tier
system** in `tailwind.config.ts`, next to the breakpoint contract:
`h-11` (44px) touch · existing `h-9/h-8/h-7` desktop compact · `h-14` (56px)
operator primaries. Deliberately a *forward-looking contract plus the pattern
already applied in R0–R7* — bulk-resizing every desktop control would have
broken the desktop-pixel-identical promise that has held through this project.

---

## The project, in one view

| Phase | What it did |
|---|---|
| R0 | Safe areas, iOS zoom fix, rebuilt Modal (sheet on phones), PWA manifest + icons |
| R1 | Tablet freed from the sidebar (`lg:` switch), bottom tab bar, nav single-source, 2 real permission bugs fixed |
| R2 | Six primitives (DataList, FormGrid, Toolbar, TabStrip, PageHeader, DesktopOnly) |
| R3 | All 10 operational lists responsive — 58 broken grids gone |
| R4 | Forms: sticky save bar, reflowing field grids, Vendors + Plates |
| R5 | Role-based mobile home tiles, 56px operator queue |
| R6 | Honest desktop-only guards (costing, workflow builder, permission matrix); Reports + Finance mobile |
| R7 | Tablet tier: 6-up KPI band, snap-scroll planning window (~3 days on tablet) |
| R8 | Connection-aware refresh, print reflow, skip link, height contract |

Audit scores at the start: Desktop 8.0 · Tablet 3.5 · Mobile 2.0.
Every structural cause behind those tablet/mobile numbers has been addressed.

## What to test (one pass, as you planned)
1. Phone: dashboard tiles per your role → a list (Jobs) → a form (New Job, watch the sticky Save bar) → a modal (bottom sheet) → planning calendar swipe → an operator queue → a print page.
2. Tablet: dashboard KPI band (2 rows of 6), lists condensed, planning ~3 days.
3. Desktop: everything should look exactly as it always has. Anything moved = bug, tell me.

## Files changed in R8
AutoRefresh · AppShell (skip link + main id) · 6 print pages · tailwind.config.ts

Everything else in the ZIP is R0–R7 unchanged.
