# Jafson ERP — Responsive R0–R8 + Scan in Bottom Bar

**Verified:** `npx tsc --noEmit` → 0 errors · `npm run build` → 125/125 routes ·
render-tested (scan button present, raised circle, 6 slots, active state on /dashboard/scan — ALL PASS).
**Migrations:** NONE. **New env vars:** NONE.

⚠️ **Cumulative ZIP — the entire responsive project R0–R8 PLUS this change.**
Deploy this one alone; it supersedes every earlier zip including phaseR8.

## New in this update

**Scan is now in the mobile bottom bar** — as a raised round accent button in
the centre, the standard placement for a bar's primary action. Scanning job
cards is *the* floor action in a printing factory, so it now sits under the
thumb on every screen without costing any role one of its four tabs.

- Bar layout: 2 role tabs · **Scan** · 2 role tabs · More
- Gated on `jobs` access like the Scan page itself; users without it see the
  previous 4-tabs + More layout
- Lights up when you're on the scan screen
- Desktop untouched (the bar only exists below `lg`)

File changed: `src/components/layout/BottomNav.tsx` only. Everything else is
R0–R8 as delivered.
