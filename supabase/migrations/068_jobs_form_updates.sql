-- ══════════════════════════════════════════════════════════════════════════════
-- MIGRATION 068: JOBS FORM UPDATES — Pasting side, combined material dropdown,
-- UV Coating type
-- ══════════════════════════════════════════════════════════════════════════════
-- 1. Pasting: no schema change — jobs.pasting was already TEXT (free text
--    "e.g. Auto, Manual"), now becomes a dropdown storing 'Side' or 'B/Side'
--    from the same column.
-- 2. Board Type + Paper Type: no schema change — still two separate columns
--    (board_type_id, paper_type_id) since board_type_id is depended on
--    elsewhere (MRP demand aggregation in get_mrp_summary(), board_inventory
--    lots, quotation costing) — merging the tables would be a much larger,
--    riskier change than what was asked. Only the UI now shows one combined
--    dropdown; it still writes to whichever column matches what was picked.
-- 3. UV Coating: WAS boolean (Yes/No), now a TEXT coating type — 'UV',
--    'Soft UV', 'Water Base', 'Drip-off', or NULL for none. Existing TRUE
--    rows become 'UV' (the most common/default type) rather than being lost;
--    existing FALSE rows become NULL (no coating), matching how the new
--    dropdown represents "none" (blank), not a fourth coating option.
-- ══════════════════════════════════════════════════════════════════════════════

ALTER TABLE jobs ALTER COLUMN uv_coating DROP DEFAULT;
ALTER TABLE jobs ALTER COLUMN uv_coating TYPE TEXT
  USING (CASE WHEN uv_coating THEN 'UV' ELSE NULL END);

COMMENT ON COLUMN jobs.uv_coating IS
  'Coating type: UV, Soft UV, Water Base, Drip-off, or NULL for none. Was boolean before migration 068 — existing TRUE rows were converted to ''UV''.';

NOTIFY pgrst, 'reload schema';
