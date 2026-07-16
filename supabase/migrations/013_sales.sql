-- ══════════════════════════════════════════════════════════════════════════════
-- JAFSON PRINT ERP — MIGRATION 013: QUOTATIONS & SALES ORDERS
-- Phase 18–21
-- ══════════════════════════════════════════════════════════════════════════════

-- ─── QUOTATIONS ───────────────────────────────────────────────────────────────
CREATE TABLE quotations (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id        UUID NOT NULL REFERENCES companies(id),
  quotation_number  TEXT NOT NULL,
  customer_id       UUID NOT NULL REFERENCES customers(id),
  customer_contact_id UUID REFERENCES customer_contacts(id),
  status            TEXT NOT NULL DEFAULT 'draft'
                    CHECK (status IN ('draft','sent','approved','rejected','expired','converted')),
  valid_until       DATE,
  currency_id       UUID REFERENCES currencies(id),
  tax_id            UUID REFERENCES taxes(id),
  discount_percent  NUMERIC(5,2) DEFAULT 0,
  notes             TEXT,
  terms_conditions  TEXT,
  subtotal          NUMERIC(14,2) NOT NULL DEFAULT 0,
  tax_amount        NUMERIC(14,2) NOT NULL DEFAULT 0,
  discount_amount   NUMERIC(14,2) NOT NULL DEFAULT 0,
  total_amount      NUMERIC(14,2) NOT NULL DEFAULT 0,
  revision          INTEGER NOT NULL DEFAULT 1,
  parent_quotation_id UUID REFERENCES quotations(id),
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_by UUID, updated_by UUID, deleted_at TIMESTAMPTZ,
  is_active  BOOLEAN NOT NULL DEFAULT TRUE,
  UNIQUE (company_id, quotation_number)
);

CREATE INDEX idx_quotations_company    ON quotations(company_id);
CREATE INDEX idx_quotations_customer   ON quotations(customer_id);
CREATE INDEX idx_quotations_status     ON quotations(company_id, status);
CREATE TRIGGER trg_quotations_upd BEFORE UPDATE ON quotations FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
ALTER TABLE quotations ENABLE ROW LEVEL SECURITY;
CREATE POLICY quotations_tenant ON quotations USING (company_id = (auth.jwt() ->> 'company_id')::UUID);
CREATE TRIGGER trg_audit_quotations AFTER INSERT OR UPDATE OR DELETE ON quotations FOR EACH ROW EXECUTE FUNCTION log_audit_event();

-- ─── QUOTATION LINE ITEMS ─────────────────────────────────────────────────────
CREATE TABLE quotation_items (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id        UUID NOT NULL REFERENCES companies(id),
  quotation_id      UUID NOT NULL REFERENCES quotations(id) ON DELETE CASCADE,
  line_no           INTEGER NOT NULL DEFAULT 1,
  product_desc      TEXT NOT NULL,
  size_l            NUMERIC(10,2),
  size_w            NUMERIC(10,2),
  size_h            NUMERIC(10,2),
  quantity          NUMERIC(12,2) NOT NULL DEFAULT 1,
  unit_id           UUID REFERENCES units(id),
  board_type_id     UUID REFERENCES board_types(id),
  no_of_colors      INTEGER DEFAULT 4,
  lamination_type_id UUID REFERENCES lamination_types(id),
  unit_price        NUMERIC(14,4) NOT NULL DEFAULT 0,
  subtotal          NUMERIC(14,2) NOT NULL DEFAULT 0,
  notes             TEXT,
  sort_order        INTEGER NOT NULL DEFAULT 1,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_by UUID, updated_by UUID, deleted_at TIMESTAMPTZ,
  is_active  BOOLEAN NOT NULL DEFAULT TRUE
);

CREATE INDEX idx_qt_items_quotation ON quotation_items(quotation_id, sort_order);
CREATE TRIGGER trg_qt_items_upd BEFORE UPDATE ON quotation_items FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
ALTER TABLE quotation_items ENABLE ROW LEVEL SECURITY;
CREATE POLICY qt_items_tenant ON quotation_items USING (company_id = (auth.jwt() ->> 'company_id')::UUID);

-- ─── SALES ORDERS ─────────────────────────────────────────────────────────────
CREATE TABLE sales_orders (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id        UUID NOT NULL REFERENCES companies(id),
  so_number         TEXT NOT NULL,
  quotation_id      UUID REFERENCES quotations(id),
  customer_id       UUID NOT NULL REFERENCES customers(id),
  customer_contact_id UUID REFERENCES customer_contacts(id),
  delivery_address_id UUID REFERENCES customer_addresses(id),
  status            TEXT NOT NULL DEFAULT 'confirmed'
                    CHECK (status IN ('confirmed','in_production','completed','dispatched','cancelled')),
  order_date        DATE NOT NULL DEFAULT CURRENT_DATE,
  required_date     DATE,
  currency_id       UUID REFERENCES currencies(id),
  tax_id            UUID REFERENCES taxes(id),
  discount_percent  NUMERIC(5,2) DEFAULT 0,
  special_instructions TEXT,
  subtotal          NUMERIC(14,2) NOT NULL DEFAULT 0,
  tax_amount        NUMERIC(14,2) NOT NULL DEFAULT 0,
  discount_amount   NUMERIC(14,2) NOT NULL DEFAULT 0,
  total_amount      NUMERIC(14,2) NOT NULL DEFAULT 0,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_by UUID, updated_by UUID, deleted_at TIMESTAMPTZ,
  is_active  BOOLEAN NOT NULL DEFAULT TRUE,
  UNIQUE (company_id, so_number)
);

CREATE INDEX idx_so_company   ON sales_orders(company_id);
CREATE INDEX idx_so_customer  ON sales_orders(customer_id);
CREATE INDEX idx_so_status    ON sales_orders(company_id, status);
CREATE TRIGGER trg_so_upd BEFORE UPDATE ON sales_orders FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
ALTER TABLE sales_orders ENABLE ROW LEVEL SECURITY;
CREATE POLICY so_tenant ON sales_orders USING (company_id = (auth.jwt() ->> 'company_id')::UUID);
CREATE TRIGGER trg_audit_so AFTER INSERT OR UPDATE OR DELETE ON sales_orders FOR EACH ROW EXECUTE FUNCTION log_audit_event();

-- ─── SALES ORDER LINE ITEMS ───────────────────────────────────────────────────
CREATE TABLE sales_order_items (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id        UUID NOT NULL REFERENCES companies(id),
  sales_order_id    UUID NOT NULL REFERENCES sales_orders(id) ON DELETE CASCADE,
  quotation_item_id UUID REFERENCES quotation_items(id),
  line_no           INTEGER NOT NULL DEFAULT 1,
  product_desc      TEXT NOT NULL,
  size_l            NUMERIC(10,2),
  size_w            NUMERIC(10,2),
  size_h            NUMERIC(10,2),
  quantity          NUMERIC(12,2) NOT NULL DEFAULT 1,
  unit_id           UUID REFERENCES units(id),
  board_type_id     UUID REFERENCES board_types(id),
  no_of_colors      INTEGER DEFAULT 4,
  lamination_type_id UUID REFERENCES lamination_types(id),
  unit_price        NUMERIC(14,4) NOT NULL DEFAULT 0,
  subtotal          NUMERIC(14,2) NOT NULL DEFAULT 0,
  notes             TEXT,
  sort_order        INTEGER NOT NULL DEFAULT 1,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_by UUID, updated_by UUID, deleted_at TIMESTAMPTZ,
  is_active  BOOLEAN NOT NULL DEFAULT TRUE
);

CREATE INDEX idx_so_items_so ON sales_order_items(sales_order_id, sort_order);
CREATE TRIGGER trg_so_items_upd BEFORE UPDATE ON sales_order_items FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
ALTER TABLE sales_order_items ENABLE ROW LEVEL SECURITY;
CREATE POLICY so_items_tenant ON sales_order_items USING (company_id = (auth.jwt() ->> 'company_id')::UUID);

-- ─── SEQUENCES FOR QT AND SO ──────────────────────────────────────────────────
INSERT INTO document_sequences (company_id, document_type, year, prefix, padding, current_value) VALUES
  ('00000000-0000-0000-0000-000000000001', 'QT', 2026, 'QT', 5, 0),
  ('00000000-0000-0000-0000-000000000001', 'SO', 2026, 'SO', 5, 0)
ON CONFLICT DO NOTHING;

NOTIFY pgrst, 'reload schema';
