-- ═══════════════════════════════════════════════════════════════════════════
-- QUOTATION COSTING — DYNAMIC COST-LINE CATALOG + WEIGHT-BASED BOARD COSTING
-- ═══════════════════════════════════════════════════════════════════════════
-- Replaces the fixed plate/printing/foiling/embossing/die-making/die-cutting/
-- breaking/pasting/packing/cartage columns added in 046/060 with a catalog +
-- child-line pattern: every new cost item (today or in the future — e.g.
-- "Varnish", "Perforation") is a row in cost_item_types with a name + unit
-- basis + default rate, and a quotation line picks any number of them via
-- "+ Add Cost Line" instead of the estimator being limited to whatever
-- fixed columns happen to exist.
--
-- Board and Lamination/Coating stay as they were — board is the one driver
-- everything else (sheet_qty) is computed FROM, so it can't be "just
-- another line item"; lamination/coating already work as type-pickers with
-- their own area/sheet-based rate and weren't part of the complaint.
--
-- NOT dropping the old fixed columns on quotation_items (plate_cost,
-- printing_cost, foiling_cost, etc.) — they stay for any already-saved
-- quotations and the version-history snapshots already taken. New
-- quotations use cost lines instead; the calculation engine no longer
-- writes to those fixed columns going forward.
-- ═══════════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS cost_item_types (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id   UUID NOT NULL REFERENCES companies(id),
  name         TEXT NOT NULL,
  unit_basis   TEXT NOT NULL CHECK (unit_basis IN
                 ('per_sheet','per_1000_sheets','per_plate','per_ups','per_1000_boxes','per_1000_boxes_carton')),
  default_rate NUMERIC(12,4) NOT NULL DEFAULT 0,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_by UUID, updated_by UUID, deleted_at TIMESTAMPTZ,
  is_active  BOOLEAN NOT NULL DEFAULT TRUE
);
CREATE INDEX IF NOT EXISTS idx_cost_item_types_company ON cost_item_types(company_id) WHERE deleted_at IS NULL;
DROP TRIGGER IF EXISTS trg_cost_item_types_upd ON cost_item_types;
CREATE TRIGGER trg_cost_item_types_upd BEFORE UPDATE ON cost_item_types
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
ALTER TABLE cost_item_types ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS cost_item_types_tenant ON cost_item_types;
CREATE POLICY cost_item_types_tenant ON cost_item_types
  USING (company_id = (auth.jwt() ->> 'company_id')::UUID)
  WITH CHECK (company_id = (auth.jwt() ->> 'company_id')::UUID);

-- Seed from the rates already set under 046/060 so nothing resets to zero.
INSERT INTO cost_item_types (company_id, name, unit_basis, default_rate)
SELECT '00000000-0000-0000-0000-000000000001', t.name, t.unit_basis,
  COALESCE((SELECT value::NUMERIC FROM system_settings
            WHERE company_id = '00000000-0000-0000-0000-000000000001' AND key = t.rate_key), 0)
FROM (VALUES
  ('Plate',       'per_plate',            'costing_plate_rate_per_color'),
  ('Printing',    'per_1000_sheets',      'costing_printing_rate_per_1000'),
  ('Die Cutting', 'per_1000_sheets',      'costing_die_cutting_rate_per_1000'),
  ('Pasting',     'per_1000_sheets',      'costing_pasting_rate_per_1000'),
  ('Foiling',     'per_sheet',            'costing_foiling_rate_per_sheet'),
  ('Embossing',   'per_1000_sheets',      'costing_embossing_rate_per_1000'),
  ('Die Making',  'per_ups',              'costing_die_making_rate_per_ups'),
  ('Breaking',    'per_1000_sheets',      'costing_breaking_rate_per_1000'),
  ('Packing',     'per_1000_boxes',       'costing_packing_rate_per_1000_boxes'),
  ('Cartage',     'per_1000_boxes_carton','costing_cartage_rate_per_1000_boxes')
) AS t(name, unit_basis, rate_key)
ON CONFLICT DO NOTHING;

-- ─── QUOTATION LINE'S CHOSEN COST LINES ──────────────────────────────────────
CREATE TABLE IF NOT EXISTS quotation_item_cost_lines (
  id                 UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id         UUID NOT NULL REFERENCES companies(id),
  quotation_item_id  UUID NOT NULL REFERENCES quotation_items(id) ON DELETE CASCADE,
  cost_item_type_id  UUID REFERENCES cost_item_types(id),
  name               TEXT NOT NULL,     -- denormalized at time of use — a later rename/delete
  unit_basis         TEXT NOT NULL,     -- of the catalog entry must not change historical quotations
  rate               NUMERIC(12,4) NOT NULL DEFAULT 0,
  quantity           NUMERIC(12,4) NOT NULL DEFAULT 0,
  amount             NUMERIC(14,2) NOT NULL DEFAULT 0,
  sort_order         INTEGER NOT NULL DEFAULT 1,
  created_at         TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at         TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_by UUID, updated_by UUID
);
CREATE INDEX IF NOT EXISTS idx_qicl_item ON quotation_item_cost_lines(quotation_item_id);
ALTER TABLE quotation_item_cost_lines ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS qicl_tenant ON quotation_item_cost_lines;
CREATE POLICY qicl_tenant ON quotation_item_cost_lines
  USING (company_id = (auth.jwt() ->> 'company_id')::UUID)
  WITH CHECK (company_id = (auth.jwt() ->> 'company_id')::UUID);

-- ─── BOARD: WEIGHT-BASED COSTING OPTION ──────────────────────────────────────
ALTER TABLE board_types
  ADD COLUMN IF NOT EXISTS rate_per_kg NUMERIC(12,4);

ALTER TABLE quotation_items
  ADD COLUMN IF NOT EXISTS board_costing_method TEXT NOT NULL DEFAULT 'per_sheet'
    CHECK (board_costing_method IN ('per_sheet','per_kg'));

NOTIFY pgrst, 'reload schema';
