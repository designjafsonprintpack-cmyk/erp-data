-- 085 — Editable "Per N Boxes" divisor + new Cartage Travel cost item
--
-- Why: Packing / Cartage (and the new Cartage Travel) are priced "per 1000
-- boxes", but the 1000 was hardcoded in the costing engine. Mehboob wants
-- the divisor editable per quotation line (e.g. per 500, per 2000), so it
-- becomes a real column on the saved cost line — historical quotations
-- keep exactly the divisor they were costed with.
--
-- Safe/backward compatible: DEFAULT 1000 backfills every existing row to
-- the behavior it already had; no RLS/policy changes; no locks beyond a
-- fast ADD COLUMN with default (PG11+ non-rewriting).

ALTER TABLE quotation_item_cost_lines
  ADD COLUMN IF NOT EXISTS per_unit_qty NUMERIC(12,2) NOT NULL DEFAULT 1000;

COMMENT ON COLUMN quotation_item_cost_lines.per_unit_qty IS
  'Divisor for per_1000_boxes-style bases: quantity is priced per THIS many boxes (default 1000). Ignored for other unit bases.';

-- ─── New catalog item: Cartage Travel ────────────────────────────────────────
-- Same per_1000_boxes basis as Packing (divisor editable per line, like the
-- others). sort_order lands after the current maximum so it appends at the
-- end of the checklist instead of scattering alphabetically (066 convention).
INSERT INTO cost_item_types (company_id, name, unit_basis, default_rate, sort_order)
SELECT '00000000-0000-0000-0000-000000000001', 'Cartage Travel', 'per_1000_boxes', 0,
  COALESCE((SELECT MAX(sort_order) FROM cost_item_types
            WHERE company_id = '00000000-0000-0000-0000-000000000001' AND deleted_at IS NULL), 0) + 10
WHERE NOT EXISTS (
  SELECT 1 FROM cost_item_types
  WHERE company_id = '00000000-0000-0000-0000-000000000001'
    AND name = 'Cartage Travel' AND deleted_at IS NULL
);

NOTIFY pgrst, 'reload schema';
