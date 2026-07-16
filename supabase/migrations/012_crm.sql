-- ══════════════════════════════════════════════════════════════════════════════
-- JAFSON PRINT ERP — MIGRATION 012: CRM (Customers, Contacts, Addresses)
-- Phase 16 & 17
-- ══════════════════════════════════════════════════════════════════════════════

-- ─── CUSTOMERS ────────────────────────────────────────────────────────────────
CREATE TABLE customers (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id        UUID NOT NULL REFERENCES companies(id),
  customer_code     TEXT NOT NULL,
  name              TEXT NOT NULL,
  business_type     TEXT DEFAULT 'company' CHECK (business_type IN ('company','individual','government')),
  ntn               TEXT,
  strn              TEXT,
  email             TEXT,
  phone             TEXT,
  mobile            TEXT,
  website           TEXT,
  industry          TEXT,
  credit_limit      NUMERIC(14,2) DEFAULT 0,
  payment_terms     INTEGER DEFAULT 30,      -- days
  currency_id       UUID REFERENCES currencies(id),
  default_tax_id    UUID REFERENCES taxes(id),
  assigned_to       UUID REFERENCES users(id),
  notes             TEXT,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_by        UUID, updated_by UUID, deleted_at TIMESTAMPTZ,
  is_active         BOOLEAN NOT NULL DEFAULT TRUE,
  UNIQUE (company_id, customer_code)
);

CREATE INDEX idx_customers_company    ON customers(company_id);
CREATE INDEX idx_customers_name       ON customers USING gin(to_tsvector('simple', name));
CREATE INDEX idx_customers_code       ON customers(company_id, customer_code);
CREATE TRIGGER trg_customers_upd BEFORE UPDATE ON customers FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
ALTER TABLE customers ENABLE ROW LEVEL SECURITY;
CREATE POLICY customers_tenant ON customers USING (company_id = (auth.jwt() ->> 'company_id')::UUID);
CREATE TRIGGER trg_audit_customers AFTER INSERT OR UPDATE OR DELETE ON customers FOR EACH ROW EXECUTE FUNCTION log_audit_event();

-- ─── CONTACTS ─────────────────────────────────────────────────────────────────
CREATE TABLE customer_contacts (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id    UUID NOT NULL REFERENCES companies(id),
  customer_id   UUID NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
  name          TEXT NOT NULL,
  designation   TEXT,
  email         TEXT,
  phone         TEXT,
  mobile        TEXT,
  is_primary    BOOLEAN NOT NULL DEFAULT FALSE,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_by UUID, updated_by UUID, deleted_at TIMESTAMPTZ,
  is_active  BOOLEAN NOT NULL DEFAULT TRUE
);

CREATE INDEX idx_contacts_customer ON customer_contacts(customer_id);
CREATE TRIGGER trg_contacts_upd BEFORE UPDATE ON customer_contacts FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
ALTER TABLE customer_contacts ENABLE ROW LEVEL SECURITY;
CREATE POLICY contacts_tenant ON customer_contacts USING (company_id = (auth.jwt() ->> 'company_id')::UUID);

-- ─── ADDRESSES ────────────────────────────────────────────────────────────────
CREATE TABLE customer_addresses (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id    UUID NOT NULL REFERENCES companies(id),
  customer_id   UUID NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
  label         TEXT NOT NULL DEFAULT 'Main',
  address_type  TEXT NOT NULL DEFAULT 'billing' CHECK (address_type IN ('billing','delivery','both')),
  address_line1 TEXT NOT NULL,
  address_line2 TEXT,
  city          TEXT,
  state         TEXT,
  country       TEXT DEFAULT 'Pakistan',
  is_default    BOOLEAN NOT NULL DEFAULT FALSE,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_by UUID, updated_by UUID, deleted_at TIMESTAMPTZ,
  is_active  BOOLEAN NOT NULL DEFAULT TRUE
);

CREATE INDEX idx_addresses_customer ON customer_addresses(customer_id);
CREATE TRIGGER trg_addresses_upd BEFORE UPDATE ON customer_addresses FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
ALTER TABLE customer_addresses ENABLE ROW LEVEL SECURITY;
CREATE POLICY addresses_tenant ON customer_addresses USING (company_id = (auth.jwt() ->> 'company_id')::UUID);

-- ─── CUSTOMER CODE SEQUENCE ───────────────────────────────────────────────────
INSERT INTO document_sequences (company_id, document_type, year, prefix, padding, current_value)
VALUES ('00000000-0000-0000-0000-000000000001', 'CUST', 2026, 'CUST', 4, 0)
ON CONFLICT DO NOTHING;

NOTIFY pgrst, 'reload schema';
