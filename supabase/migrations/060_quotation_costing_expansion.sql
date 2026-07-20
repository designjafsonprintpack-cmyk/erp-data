-- ═══════════════════════════════════════════════════════════════════════════
-- QUOTATION COSTING ENGINE — EXPANSION TO MATCH MANUAL COSTING WORKSHEET
-- ═══════════════════════════════════════════════════════════════════════════
-- The costing engine (046) covered board/plate/printing/lamination/die-
-- cutting/pasting. Comparing against Mehboob's actual costing worksheet
-- surfaced 7 cost drivers that worksheet has and the engine didn't:
-- coating (UV/Spot UV/water-base/etc.), foiling, embossing, die making
-- (distinct from die cutting — the one-time block cost, not the per-run
-- operation), breaking, packing, and cartage/delivery.
--
-- NOT added in this pass: weight-based (KG × rate) board costing. The
-- worksheet prices board by weight; this engine prices it by sheet count
-- (board_types.rate_per_sheet, from 046). Both are valid costing methods —
-- switching board costing to weight-based is a larger change (needs GSM→KG
-- conversion from sheet dimensions) than the other 7 additions, which are
-- all independent new line items. Flagging this explicitly rather than
-- silently leaving it out.
-- ═══════════════════════════════════════════════════════════════════════════

-- ─── COATING TYPES CATALOG (same shape as lamination_types) ─────────────────
CREATE TABLE IF NOT EXISTS coating_types (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id     UUID NOT NULL REFERENCES companies(id),
  name           TEXT NOT NULL,
  rate_per_sheet NUMERIC(10,4),
  created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_by UUID, updated_by UUID, deleted_at TIMESTAMPTZ,
  is_active  BOOLEAN NOT NULL DEFAULT TRUE
);
CREATE INDEX IF NOT EXISTS idx_coating_types_company ON coating_types(company_id) WHERE deleted_at IS NULL;
DROP TRIGGER IF EXISTS trg_coating_types_upd ON coating_types;
CREATE TRIGGER trg_coating_types_upd BEFORE UPDATE ON coating_types
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
ALTER TABLE coating_types ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS coating_types_tenant ON coating_types;
CREATE POLICY coating_types_tenant ON coating_types
  USING (company_id = (auth.jwt() ->> 'company_id')::UUID)
  WITH CHECK (company_id = (auth.jwt() ->> 'company_id')::UUID);

INSERT INTO coating_types (company_id, name)
SELECT '00000000-0000-0000-0000-000000000001', n FROM (VALUES
  ('UV Coating'), ('Spot UV'), ('Gloss Water Base'), ('Matt Water Base'), ('Drip Off'), ('Blaster Coating')
) AS t(n)
ON CONFLICT DO NOTHING;

-- ─── NEW COST FIELDS ON quotation_items ──────────────────────────────────────
ALTER TABLE quotation_items
  ADD COLUMN IF NOT EXISTS coating_type_id  UUID REFERENCES coating_types(id),
  ADD COLUMN IF NOT EXISTS coating_cost     NUMERIC(14,2),
  ADD COLUMN IF NOT EXISTS foiling_cost     NUMERIC(14,2),
  ADD COLUMN IF NOT EXISTS embossing_cost   NUMERIC(14,2),
  ADD COLUMN IF NOT EXISTS die_making_cost  NUMERIC(14,2),
  ADD COLUMN IF NOT EXISTS breaking_cost    NUMERIC(14,2),
  ADD COLUMN IF NOT EXISTS packing_cost     NUMERIC(14,2),
  ADD COLUMN IF NOT EXISTS cartage_cost     NUMERIC(14,2);

-- ─── NEW DEFAULT COSTING RATES (company-wide, editable) ─────────────────────
DO $$
DECLARE
  cid UUID := '00000000-0000-0000-0000-000000000001';
  defaults RECORD;
BEGIN
  FOR defaults IN SELECT * FROM (VALUES
    ('costing_foiling_rate_per_sheet',      '0', 'Foiling cost per sheet (PKR)'),
    ('costing_embossing_rate_per_1000',     '0', 'Embossing cost per 1000 sheets (PKR)'),
    ('costing_die_making_rate_per_ups',     '0', 'Die making (block) cost per ups — one-time per job (PKR)'),
    ('costing_breaking_rate_per_1000',      '0', 'Breaking cost per 1000 sheets (PKR)'),
    ('costing_packing_rate_per_1000_boxes', '0', 'Packing cost per 1000 boxes (PKR)'),
    ('costing_cartage_rate_per_1000_boxes', '0', 'Cartage/delivery cost per 1000 boxes (PKR)')
  ) AS t(key, value, description)
  LOOP
    INSERT INTO system_settings (company_id, key, value, category, description)
    VALUES (cid, defaults.key, defaults.value, 'costing', defaults.description)
    ON CONFLICT (company_id, key) DO NOTHING;
  END LOOP;
END $$;

NOTIFY pgrst, 'reload schema';
