-- ═══════════════════════════════════════════════════════════════════════════
-- COSTING v2 — EXACT MATCH TO MEHBOOB'S MANUAL WORKSHEET (Coast.xlsx)
-- ═══════════════════════════════════════════════════════════════════════════
-- Corrections/additions found by reviewing the actual formulas (not just the
-- item names) in the worksheet:
--
--   1. Board weight constant was wrong (0.00064516 m²-conversion based) —
--      the real trade formula used is Weight(kg) = L(in) × W(in) × GSM / 15500
--      per sheet. Fixed in the calculation engine (TS), not this migration —
--      no schema change needed for that, board_types.rate_per_kg already exists.
--
--   2. UV, Lamination, and Foiling are all area-based (rate × sheet sqft ×
--      sheet count), not flat per-sheet — same formula as each other. Folding
--      all three into the dynamic cost-line catalog with a new 'per_sqft'
--      basis, rather than keeping Lamination/Coating as separate dropdowns.
--      The worksheet also had a broken duplicate "Foiling" row referencing
--      empty cells (B3/D3/H6) — confirmed with Mehboob as a leftover/mistake,
--      dropped.
--
--   3. Printing needs BOTH a color multiplier AND the stepped-1000 rounding
--      Embossing/Die-Cutting/Breaking use — none of the existing unit_basis
--      values combine those two, so a new 'per_1000_sheets_per_color' basis
--      is added specifically for it.
--
--   4. Embossing/Die-Cutting/Breaking in the worksheet formula also multiply
--      by color count — confirmed with Mehboob this was copied from the
--      Printing row by mistake and should NOT multiply by color. No schema
--      change needed (they already use plain 'per_1000_sheets' in this
--      system, never had a color multiplier here).
--
--   5. Pasting is priced on BOX quantity (+ wastage%) per 1000, not sheet
--      quantity — was seeded as 'per_1000_sheets' in 062, corrected here.
-- ═══════════════════════════════════════════════════════════════════════════

ALTER TABLE cost_item_types DROP CONSTRAINT IF EXISTS cost_item_types_unit_basis_check;
ALTER TABLE cost_item_types ADD CONSTRAINT cost_item_types_unit_basis_check CHECK (unit_basis IN
  ('per_sheet','per_1000_sheets','per_1000_sheets_per_color','per_plate','per_ups',
   'per_1000_boxes','per_1000_boxes_carton','per_sqft','per_1000_boxes_wastage'));

-- quotation_item_cost_lines.unit_basis has no CHECK constraint (denormalized
-- free text so historical rows survive a later catalog change) — nothing to
-- alter there.

-- Fix Pasting's basis (was wrongly seeded as per_1000_sheets in 062 — it's
-- actually box-quantity-based with wastage applied, same as the worksheet's
-- "(B5+B5*3%)*H21/1000" but using the editable wastage% instead of a
-- hardcoded 3%).
UPDATE cost_item_types SET unit_basis = 'per_1000_boxes_wastage' WHERE name = 'Pasting';

-- Fix Printing's basis to the new color-aware stepped-rounding one.
UPDATE cost_item_types SET unit_basis = 'per_1000_sheets_per_color' WHERE name = 'Printing';

-- Add UV, Lamination, and (single, correct) Foiling as area-based catalog
-- items, seeded from the old lamination_types default (if any) — new rows
-- only, existing lamination_type_id-based quotations are untouched.
INSERT INTO cost_item_types (company_id, name, unit_basis, default_rate)
SELECT '00000000-0000-0000-0000-000000000001', name, 'per_sqft', 0
FROM (VALUES ('UV'), ('Lamination')) AS t(name)
WHERE NOT EXISTS (
  SELECT 1 FROM cost_item_types
  WHERE company_id = '00000000-0000-0000-0000-000000000001' AND name = t.name AND deleted_at IS NULL
);

-- Foiling already exists from 062 (seeded as 'per_sheet') — correct it to
-- area-based per the worksheet's actual (non-broken) Foiling row.
UPDATE cost_item_types SET unit_basis = 'per_sqft' WHERE name = 'Foiling';

NOTIFY pgrst, 'reload schema';
