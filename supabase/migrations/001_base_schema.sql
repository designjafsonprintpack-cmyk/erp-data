-- ══════════════════════════════════════════════════════════════════════════════
-- JAFSON PRINT ERP — MIGRATION 001: BASE SCHEMA
-- Stage 0 — Foundation
-- Phase 2: Multi-tenant base schema
-- ══════════════════════════════════════════════════════════════════════════════

-- Enable required extensions
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pg_trgm";
CREATE EXTENSION IF NOT EXISTS "unaccent";

-- ─── HELPER: auto-update updated_at ──────────────────────────────────────────
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- ─── COMPANIES ────────────────────────────────────────────────────────────────
CREATE TABLE companies (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name            TEXT NOT NULL,
  logo_url        TEXT,
  ntn             TEXT,
  address         TEXT,
  base_currency_id UUID,          -- FK added after currencies table exists
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_by      UUID,
  updated_by      UUID,
  deleted_at      TIMESTAMPTZ,
  is_active       BOOLEAN NOT NULL DEFAULT TRUE
);

CREATE TRIGGER trg_companies_updated_at
  BEFORE UPDATE ON companies
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- Seed: Jafson Print Pack
-- IMPORTANT: Verify this UUID in your Supabase project before going live
INSERT INTO companies (id, name, address)
VALUES (
  '00000000-0000-0000-0000-000000000001',
  'Jafson Print Pack',
  'Lahore, Pakistan'
);

-- ─── BRANCHES ─────────────────────────────────────────────────────────────────
CREATE TABLE branches (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id      UUID NOT NULL REFERENCES companies(id),
  name            TEXT NOT NULL,
  address         TEXT,
  is_head_office  BOOLEAN NOT NULL DEFAULT FALSE,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_by      UUID,
  updated_by      UUID,
  deleted_at      TIMESTAMPTZ,
  is_active       BOOLEAN NOT NULL DEFAULT TRUE
);

CREATE INDEX idx_branches_company_id ON branches(company_id);
CREATE TRIGGER trg_branches_updated_at BEFORE UPDATE ON branches FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- Seed: Jafson head office
INSERT INTO branches (company_id, name, is_head_office)
VALUES ('00000000-0000-0000-0000-000000000001', 'Head Office', TRUE);

-- ─── WAREHOUSES ───────────────────────────────────────────────────────────────
CREATE TABLE warehouses (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id      UUID NOT NULL REFERENCES companies(id),
  branch_id       UUID REFERENCES branches(id),
  name            TEXT NOT NULL,
  location        TEXT,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_by      UUID,
  updated_by      UUID,
  deleted_at      TIMESTAMPTZ,
  is_active       BOOLEAN NOT NULL DEFAULT TRUE
);

CREATE INDEX idx_warehouses_company_id ON warehouses(company_id);
CREATE TRIGGER trg_warehouses_updated_at BEFORE UPDATE ON warehouses FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- Seed: Main warehouse
INSERT INTO warehouses (company_id, name, location)
SELECT '00000000-0000-0000-0000-000000000001', 'Main Store', 'Lahore Factory';

-- ─── ROW LEVEL SECURITY ───────────────────────────────────────────────────────
ALTER TABLE companies ENABLE ROW LEVEL SECURITY;
ALTER TABLE branches ENABLE ROW LEVEL SECURITY;
ALTER TABLE warehouses ENABLE ROW LEVEL SECURITY;

-- Companies: each tenant only sees their own row
CREATE POLICY companies_tenant_isolation ON companies
  USING (id = (auth.jwt() ->> 'company_id')::UUID);

-- Branches: tenant isolation
CREATE POLICY branches_tenant_isolation ON branches
  USING (company_id = (auth.jwt() ->> 'company_id')::UUID);

-- Warehouses: tenant isolation
CREATE POLICY warehouses_tenant_isolation ON warehouses
  USING (company_id = (auth.jwt() ->> 'company_id')::UUID);

-- Notify PostgREST to reload schema
NOTIFY pgrst, 'reload schema';
