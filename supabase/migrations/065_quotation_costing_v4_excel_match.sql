-- ══════════════════════════════════════════════════════════════════════════════
-- MIGRATION 065: QUOTATION COSTING v4 — EXACT MATCH TO Cost.xlsx
-- ══════════════════════════════════════════════════════════════════════════════
-- Rebuild of the per-line costing calculator to mirror Mehboob's actual
-- Cost.xlsx line by line (analyzed formula-by-formula, not just item names).
--
-- Fixes a real bug found in the previous engine: Board Weight (kg) was
-- computed as `L(in) x W(in) x GSM / 15500` per sheet and multiplied
-- directly by sheet count. The Excel's own "Packets / Pkt Weight" section
-- proves that constant is actually the weight of a BATCH OF 100 SHEETS in
-- kg, not one sheet — the correct formula divides by 100 again. The old
-- formula therefore overstated Board Weight (and Board Cost, when using
-- Per-KG costing) by 100x. Fixed in the TS engine (lib/costing/quotationCosting.ts),
-- no schema change needed for that specific fix.
--
-- New fields:
--   • margin_percent already existed (migration 046, unused since the v3
--     "remove auto-pricing" decision) — REPURPOSED here as the Excel's
--     "Profit Margin %" input, which now DOES drive the suggested unit
--     price again, per Mehboob's explicit request to restore this.
--   • packet_length_in / packet_width_in / packet_div — the Excel's
--     "Packet Size" + "Div" fields. In the raw Excel these are dead code
--     (the Pkt Weight formula actually reads the Sheet Size cells, not the
--     Packet Size cells, and Div cancels out of the final Total KG either
--     way) — kept editable per Mehboob's request for future use. Wired to
--     an actual (corrected) formula in the TS engine using the real packet
--     dimensions, rather than reproducing the Excel's dead reference, so
--     they're not just decorative.
--
-- Business-logic confirmations from Mehboob (differ from the raw Excel,
-- which has known copy-paste errors in these two spots):
--   • Printing Charges: rate DOES multiply by color count (Excel's copy
--     does not — confirmed as an Excel mistake).
--   • Breaking: rate does NOT multiply by color count (Excel's copy does —
--     confirmed as a leftover copy-paste error from the Printing row).
-- Both already match the existing 'per_1000_sheets_per_color' (Printing)
-- and 'per_1000_sheets' (Breaking) unit_basis values already seeded in
-- migration 063 — no cost_item_types change needed, only confirmed.
-- ══════════════════════════════════════════════════════════════════════════════

ALTER TABLE quotation_items
  ADD COLUMN IF NOT EXISTS packet_length_in NUMERIC(8,2),
  ADD COLUMN IF NOT EXISTS packet_width_in  NUMERIC(8,2),
  ADD COLUMN IF NOT EXISTS packet_div       NUMERIC(8,2) DEFAULT 1;

COMMENT ON COLUMN quotation_items.margin_percent IS
  'Profit Margin % (Excel: "Profit Margin"). Drives Agreed Rate / suggested unit price = Total Cost x (1 + margin%/100). Re-activated in migration 065 after being unused since v3.';
COMMENT ON COLUMN quotation_items.packet_length_in IS
  'Excel "Packet Size" Width field — informational bundling detail, not a cost driver.';
COMMENT ON COLUMN quotation_items.packet_width_in IS
  'Excel "Packet Size" Height field — informational bundling detail, not a cost driver.';
COMMENT ON COLUMN quotation_items.packet_div IS
  'Excel "Div" field — informational bundling divisor, not a cost driver.';

NOTIFY pgrst, 'reload schema';
