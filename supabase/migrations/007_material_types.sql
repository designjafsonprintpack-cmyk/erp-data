-- ══════════════════════════════════════════════════════════════════════════════
-- JAFSON PRINT ERP — MIGRATION 007: MATERIAL TYPE SETTINGS
-- Phase 9 — Board, Paper, Ink, Glue, Foil, Lamination types
-- ══════════════════════════════════════════════════════════════════════════════

CREATE TABLE board_types (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id  UUID NOT NULL REFERENCES companies(id),
  name        TEXT NOT NULL,
  flute_type  TEXT,
  gsm         INTEGER,
  default_sheet_size TEXT,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_by  UUID, updated_by UUID, deleted_at TIMESTAMPTZ,
  is_active   BOOLEAN NOT NULL DEFAULT TRUE
);

CREATE TABLE paper_types (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id  UUID NOT NULL REFERENCES companies(id),
  name        TEXT NOT NULL,
  gsm         INTEGER,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_by  UUID, updated_by UUID, deleted_at TIMESTAMPTZ,
  is_active   BOOLEAN NOT NULL DEFAULT TRUE
);

CREATE TABLE ink_types (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id  UUID NOT NULL REFERENCES companies(id),
  name        TEXT NOT NULL,
  color_code  TEXT,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_by  UUID, updated_by UUID, deleted_at TIMESTAMPTZ,
  is_active   BOOLEAN NOT NULL DEFAULT TRUE
);

CREATE TABLE glue_types (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id  UUID NOT NULL REFERENCES companies(id),
  name        TEXT NOT NULL,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_by  UUID, updated_by UUID, deleted_at TIMESTAMPTZ,
  is_active   BOOLEAN NOT NULL DEFAULT TRUE
);

CREATE TABLE foil_types (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id  UUID NOT NULL REFERENCES companies(id),
  name        TEXT NOT NULL,
  color       TEXT,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_by  UUID, updated_by UUID, deleted_at TIMESTAMPTZ,
  is_active   BOOLEAN NOT NULL DEFAULT TRUE
);

CREATE TABLE lamination_types (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id  UUID NOT NULL REFERENCES companies(id),
  name        TEXT NOT NULL,
  material    TEXT,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_by  UUID, updated_by UUID, deleted_at TIMESTAMPTZ,
  is_active   BOOLEAN NOT NULL DEFAULT TRUE
);

-- Indexes
CREATE INDEX idx_board_types_company ON board_types(company_id);
CREATE INDEX idx_paper_types_company ON paper_types(company_id);
CREATE INDEX idx_ink_types_company   ON ink_types(company_id);
CREATE INDEX idx_glue_types_company  ON glue_types(company_id);
CREATE INDEX idx_foil_types_company  ON foil_types(company_id);
CREATE INDEX idx_lam_types_company   ON lamination_types(company_id);

-- Triggers
CREATE TRIGGER trg_board_types_upd    BEFORE UPDATE ON board_types    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER trg_paper_types_upd    BEFORE UPDATE ON paper_types    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER trg_ink_types_upd      BEFORE UPDATE ON ink_types      FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER trg_glue_types_upd     BEFORE UPDATE ON glue_types     FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER trg_foil_types_upd     BEFORE UPDATE ON foil_types     FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER trg_lam_types_upd      BEFORE UPDATE ON lamination_types FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- RLS
ALTER TABLE board_types      ENABLE ROW LEVEL SECURITY;
ALTER TABLE paper_types      ENABLE ROW LEVEL SECURITY;
ALTER TABLE ink_types        ENABLE ROW LEVEL SECURITY;
ALTER TABLE glue_types       ENABLE ROW LEVEL SECURITY;
ALTER TABLE foil_types       ENABLE ROW LEVEL SECURITY;
ALTER TABLE lamination_types ENABLE ROW LEVEL SECURITY;

CREATE POLICY board_types_tenant      ON board_types      USING (company_id = (auth.jwt() ->> 'company_id')::UUID);
CREATE POLICY paper_types_tenant      ON paper_types      USING (company_id = (auth.jwt() ->> 'company_id')::UUID);
CREATE POLICY ink_types_tenant        ON ink_types        USING (company_id = (auth.jwt() ->> 'company_id')::UUID);
CREATE POLICY glue_types_tenant       ON glue_types       USING (company_id = (auth.jwt() ->> 'company_id')::UUID);
CREATE POLICY foil_types_tenant       ON foil_types       USING (company_id = (auth.jwt() ->> 'company_id')::UUID);
CREATE POLICY lamination_types_tenant ON lamination_types USING (company_id = (auth.jwt() ->> 'company_id')::UUID);

-- Audit triggers
CREATE TRIGGER trg_audit_board_types AFTER INSERT OR UPDATE OR DELETE ON board_types FOR EACH ROW EXECUTE FUNCTION log_audit_event();
CREATE TRIGGER trg_audit_ink_types   AFTER INSERT OR UPDATE OR DELETE ON ink_types   FOR EACH ROW EXECUTE FUNCTION log_audit_event();

-- ─── SEED DATA FOR JAFSON ─────────────────────────────────────────────────────
INSERT INTO board_types (company_id, name, flute_type, gsm) VALUES
  ('00000000-0000-0000-0000-000000000001', 'B Flute',  'B', 150),
  ('00000000-0000-0000-0000-000000000001', 'C Flute',  'C', 150),
  ('00000000-0000-0000-0000-000000000001', 'E Flute',  'E', 120),
  ('00000000-0000-0000-0000-000000000001', 'BC Flute', 'BC', 200),
  ('00000000-0000-0000-0000-000000000001', 'Rigid Board', NULL, 350),
  ('00000000-0000-0000-0000-000000000001', 'Duplex Board', NULL, 300);

INSERT INTO paper_types (company_id, name, gsm) VALUES
  ('00000000-0000-0000-0000-000000000001', 'Art Paper',     130),
  ('00000000-0000-0000-0000-000000000001', 'Kraft Paper',   90),
  ('00000000-0000-0000-0000-000000000001', 'Bond Paper',    80),
  ('00000000-0000-0000-0000-000000000001', 'Gloss Coated',  150),
  ('00000000-0000-0000-0000-000000000001', 'Matt Coated',   150);

INSERT INTO ink_types (company_id, name, color_code) VALUES
  ('00000000-0000-0000-0000-000000000001', 'Cyan',    '#00FFFF'),
  ('00000000-0000-0000-0000-000000000001', 'Magenta', '#FF00FF'),
  ('00000000-0000-0000-0000-000000000001', 'Yellow',  '#FFFF00'),
  ('00000000-0000-0000-0000-000000000001', 'Black',   '#000000'),
  ('00000000-0000-0000-0000-000000000001', 'White',   '#FFFFFF'),
  ('00000000-0000-0000-0000-000000000001', 'UV Varnish', NULL);

INSERT INTO glue_types (company_id, name) VALUES
  ('00000000-0000-0000-0000-000000000001', 'Cold Glue'),
  ('00000000-0000-0000-0000-000000000001', 'Hot Melt Glue'),
  ('00000000-0000-0000-0000-000000000001', 'PVA Glue');

INSERT INTO foil_types (company_id, name, color) VALUES
  ('00000000-0000-0000-0000-000000000001', 'Gold Foil',   'Gold'),
  ('00000000-0000-0000-0000-000000000001', 'Silver Foil', 'Silver'),
  ('00000000-0000-0000-0000-000000000001', 'Red Foil',    'Red'),
  ('00000000-0000-0000-0000-000000000001', 'Blue Foil',   'Blue'),
  ('00000000-0000-0000-0000-000000000001', 'Black Foil',  'Black');

INSERT INTO lamination_types (company_id, name, material) VALUES
  ('00000000-0000-0000-0000-000000000001', 'Gloss Lamination', 'BOPP'),
  ('00000000-0000-0000-0000-000000000001', 'Matt Lamination',  'BOPP Matt'),
  ('00000000-0000-0000-0000-000000000001', 'Soft Touch',       'Soft Touch Film'),
  ('00000000-0000-0000-0000-000000000001', 'Anti-Scratch',     'AS Film');

NOTIFY pgrst, 'reload schema';
