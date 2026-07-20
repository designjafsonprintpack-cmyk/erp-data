-- ══════════════════════════════════════════════════════════════════════════════
-- JAFSON PRINT ERP — MIGRATION 046: QUOTATION COSTING ENGINE
--
-- Estimating a quotation line was pure guesswork typed into unit_price. This
-- adds a real cost-plus-margin calculator:
--   • board_types / lamination_types get rate-card fields (sheet size + rate
--     per sheet, rate per sq.ft) — edited from Settings → Materials, same
--     generic TypeManager UI already used for GSM/flute/color fields.
--   • system_settings gets company-wide default rates for the cost drivers
--     that aren't tied to a specific material (plate/printing/die-cutting/
--     pasting rates, default wastage/overhead/margin %) — editable from a
--     new Settings → Costing Rates page.
--   • quotation_items gets the same "ups → sheet_qty" pattern already used
--     on jobs (Ups is the estimator's judgement call, never auto-derived
--     from raw geometry — box dieline nesting isn't a simple grid), plus a
--     full per-line cost breakdown so the calculated unit_price stays
--     auditable and editable rather than a black-box number.
-- ══════════════════════════════════════════════════════════════════════════════

ALTER TABLE board_types
  ADD COLUMN sheet_length_in NUMERIC(10,2),
  ADD COLUMN sheet_width_in  NUMERIC(10,2),
  ADD COLUMN rate_per_sheet  NUMERIC(12,2);

ALTER TABLE lamination_types
  ADD COLUMN rate_per_sqft NUMERIC(10,2);

ALTER TABLE quotation_items
  ADD COLUMN ups               INTEGER CHECK (ups > 0),
  ADD COLUMN sheet_qty         INTEGER,
  ADD COLUMN wastage_percent   NUMERIC(5,2),
  ADD COLUMN board_cost        NUMERIC(14,2),
  ADD COLUMN plate_cost        NUMERIC(14,2),
  ADD COLUMN printing_cost     NUMERIC(14,2),
  ADD COLUMN lamination_cost   NUMERIC(14,2),
  ADD COLUMN die_cutting_cost  NUMERIC(14,2),
  ADD COLUMN pasting_cost      NUMERIC(14,2),
  ADD COLUMN other_cost        NUMERIC(14,2),
  ADD COLUMN overhead_percent  NUMERIC(5,2),
  ADD COLUMN margin_percent    NUMERIC(5,2),
  ADD COLUMN total_cost        NUMERIC(14,2);

-- ─── DEFAULT COSTING RATE CARD (company-wide, editable) ─────────────────────
DO $$
DECLARE
  cid UUID := '00000000-0000-0000-0000-000000000001';
  defaults RECORD;
BEGIN
  FOR defaults IN SELECT * FROM (VALUES
    ('costing_plate_rate_per_color',        '800',  'Plate cost per color (PKR)'),
    ('costing_printing_rate_per_1000',      '600',  'Printing/press run cost per 1000 sheets (PKR)'),
    ('costing_die_cutting_rate_per_1000',   '400',  'Die-cutting cost per 1000 sheets (PKR)'),
    ('costing_pasting_rate_per_1000',       '300',  'Pasting/gluing cost per 1000 sheets (PKR)'),
    ('costing_default_wastage_percent',     '5',    'Default sheet wastage % added to every run'),
    ('costing_default_overhead_percent',    '15',   'Default overhead % applied on direct cost'),
    ('costing_default_margin_percent',      '20',   'Default target gross margin % used to suggest selling price')
  ) AS t(key, value, description)
  LOOP
    INSERT INTO system_settings (company_id, key, value, category, description)
    VALUES (cid, defaults.key, defaults.value, 'costing', defaults.description)
    ON CONFLICT (company_id, key) DO NOTHING;
  END LOOP;
END $$;

NOTIFY pgrst, 'reload schema';
