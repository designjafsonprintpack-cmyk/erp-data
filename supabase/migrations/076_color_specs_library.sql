-- ══════════════════════════════════════════════════════════════════════════════
-- MIGRATION 076: COLOR / SPEC MATCHING LIBRARY — Task 25
-- ══════════════════════════════════════════════════════════════════════════════
-- Centralized repository of named color specs (Pantone / CMYK build / custom
-- spot mix) so staff can search-and-reuse an exact spec instead of retyping a
-- color name/shade from memory on every job. Purely additive: existing
-- plates.color / ink_types.color_code free-text fields are untouched — a
-- plate can optionally link to a color_specs row via the new nullable
-- plates.color_spec_id, or keep using free text exactly as before.
-- ══════════════════════════════════════════════════════════════════════════════

CREATE TABLE color_specs (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id    UUID NOT NULL REFERENCES companies(id),
  name          TEXT NOT NULL,                 -- e.g. "ABC Brand Red", "Pantone 286C"
  color_type    TEXT NOT NULL DEFAULT 'custom' CHECK (color_type IN ('pantone','cmyk','spot','custom')),
  pantone_code  TEXT,                           -- e.g. "286 C", only meaningful when color_type='pantone'
  cmyk_c        NUMERIC(5,2),
  cmyk_m        NUMERIC(5,2),
  cmyk_y        NUMERIC(5,2),
  cmyk_k        NUMERIC(5,2),
  hex_preview   TEXT,                           -- optional swatch color for the UI, display only
  customer_id   UUID REFERENCES customers(id),  -- NULL = global/house spec, set = customer-specific brand color
  notes         TEXT,

  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_by    UUID,
  updated_by    UUID,
  deleted_at    TIMESTAMPTZ,
  is_active     BOOLEAN NOT NULL DEFAULT TRUE
);

CREATE INDEX idx_color_specs_company  ON color_specs(company_id);
CREATE INDEX idx_color_specs_customer ON color_specs(customer_id);

CREATE TRIGGER trg_color_specs_updated_at BEFORE UPDATE ON color_specs
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

ALTER TABLE color_specs ENABLE ROW LEVEL SECURITY;
CREATE POLICY color_specs_tenant ON color_specs
  USING (company_id = (auth.jwt() ->> 'company_id')::UUID);

CREATE TRIGGER trg_audit_color_specs AFTER INSERT OR UPDATE OR DELETE ON color_specs
  FOR EACH ROW EXECUTE FUNCTION log_audit_event();

-- Optional link from an existing plate to a library spec. Nullable, additive —
-- plates.color (free text) keeps working exactly as before for anyone who
-- doesn't use the library.
ALTER TABLE plates ADD COLUMN color_spec_id UUID REFERENCES color_specs(id);

NOTIFY pgrst, 'reload schema';
