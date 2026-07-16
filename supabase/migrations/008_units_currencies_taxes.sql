-- ══════════════════════════════════════════════════════════════════════════════
-- JAFSON PRINT ERP — MIGRATION 008: UNITS, CURRENCIES, TAXES
-- Phase 10
-- ══════════════════════════════════════════════════════════════════════════════

CREATE TABLE units (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id  UUID NOT NULL REFERENCES companies(id),
  name        TEXT NOT NULL,
  symbol      TEXT NOT NULL,
  unit_type   TEXT NOT NULL CHECK (unit_type IN ('quantity','weight','length','area','volume')),
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_by  UUID, updated_by UUID, deleted_at TIMESTAMPTZ,
  is_active   BOOLEAN NOT NULL DEFAULT TRUE
);

CREATE TABLE currencies (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id            UUID NOT NULL REFERENCES companies(id),
  code                  TEXT NOT NULL,
  symbol                TEXT NOT NULL,
  name                  TEXT NOT NULL,
  is_base               BOOLEAN NOT NULL DEFAULT FALSE,
  exchange_rate_to_base NUMERIC(18,6) NOT NULL DEFAULT 1,
  created_at            TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at            TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_by  UUID, updated_by UUID, deleted_at TIMESTAMPTZ,
  is_active   BOOLEAN NOT NULL DEFAULT TRUE,
  UNIQUE (company_id, code)
);

CREATE TABLE taxes (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id  UUID NOT NULL REFERENCES companies(id),
  name        TEXT NOT NULL,
  rate_percent NUMERIC(5,2) NOT NULL,
  is_default  BOOLEAN NOT NULL DEFAULT FALSE,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_by  UUID, updated_by UUID, deleted_at TIMESTAMPTZ,
  is_active   BOOLEAN NOT NULL DEFAULT TRUE
);

-- Indexes
CREATE INDEX idx_units_company      ON units(company_id);
CREATE INDEX idx_currencies_company ON currencies(company_id);
CREATE INDEX idx_taxes_company      ON taxes(company_id);

-- Triggers
CREATE TRIGGER trg_units_upd      BEFORE UPDATE ON units      FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER trg_currencies_upd BEFORE UPDATE ON currencies FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER trg_taxes_upd      BEFORE UPDATE ON taxes      FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- RLS
ALTER TABLE units      ENABLE ROW LEVEL SECURITY;
ALTER TABLE currencies ENABLE ROW LEVEL SECURITY;
ALTER TABLE taxes      ENABLE ROW LEVEL SECURITY;

CREATE POLICY units_tenant      ON units      USING (company_id = (auth.jwt() ->> 'company_id')::UUID);
CREATE POLICY currencies_tenant ON currencies USING (company_id = (auth.jwt() ->> 'company_id')::UUID);
CREATE POLICY taxes_tenant      ON taxes      USING (company_id = (auth.jwt() ->> 'company_id')::UUID);

-- Add base_currency_id FK now that currencies table exists
ALTER TABLE companies ADD CONSTRAINT fk_companies_base_currency FOREIGN KEY (base_currency_id) REFERENCES currencies(id);

-- ─── SEED ─────────────────────────────────────────────────────────────────────
INSERT INTO units (company_id, name, symbol, unit_type) VALUES
  ('00000000-0000-0000-0000-000000000001', 'Pieces',       'Pcs',  'quantity'),
  ('00000000-0000-0000-0000-000000000001', 'Box',          'Box',  'quantity'),
  ('00000000-0000-0000-0000-000000000001', 'Set',          'Set',  'quantity'),
  ('00000000-0000-0000-0000-000000000001', 'Sheet',        'Sht',  'quantity'),
  ('00000000-0000-0000-0000-000000000001', 'Roll',         'Roll', 'quantity'),
  ('00000000-0000-0000-0000-000000000001', 'Kilogram',     'KG',   'weight'),
  ('00000000-0000-0000-0000-000000000001', 'Gram',         'g',    'weight'),
  ('00000000-0000-0000-0000-000000000001', 'Ton',          'Ton',  'weight'),
  ('00000000-0000-0000-0000-000000000001', 'Meter',        'm',    'length'),
  ('00000000-0000-0000-0000-000000000001', 'Millimeter',   'mm',   'length'),
  ('00000000-0000-0000-0000-000000000001', 'Centimeter',   'cm',   'length'),
  ('00000000-0000-0000-0000-000000000001', 'Square Meter', 'm²',   'area'),
  ('00000000-0000-0000-0000-000000000001', 'Liter',        'L',    'volume'),
  ('00000000-0000-0000-0000-000000000001', 'Milliliter',   'ml',   'volume');

INSERT INTO currencies (company_id, code, symbol, name, is_base, exchange_rate_to_base) VALUES
  ('00000000-0000-0000-0000-000000000001', 'PKR', '₨', 'Pakistani Rupee', TRUE,  1),
  ('00000000-0000-0000-0000-000000000001', 'USD', '$', 'US Dollar',        FALSE, 278),
  ('00000000-0000-0000-0000-000000000001', 'AED', 'د.إ', 'UAE Dirham',    FALSE, 75);

INSERT INTO taxes (company_id, name, rate_percent, is_default) VALUES
  ('00000000-0000-0000-0000-000000000001', 'GST 17%',  17.00, TRUE),
  ('00000000-0000-0000-0000-000000000001', 'GST 0%',    0.00, FALSE),
  ('00000000-0000-0000-0000-000000000001', 'WHT 4.5%',  4.50, FALSE);

-- Set PKR as base currency for Jafson
UPDATE companies SET base_currency_id = (
  SELECT id FROM currencies WHERE company_id = '00000000-0000-0000-0000-000000000001' AND code = 'PKR'
) WHERE id = '00000000-0000-0000-0000-000000000001';

NOTIFY pgrst, 'reload schema';
