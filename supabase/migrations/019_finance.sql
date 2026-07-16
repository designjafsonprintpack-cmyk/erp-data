-- ══════════════════════════════════════════════════════════════════════════════
-- JAFSON PRINT ERP — MIGRATION 019: FINANCE & COSTING
-- Phase 45 — Job Costing Sheet
-- Phase 46 — Actual vs Quoted
-- Phase 47 — Invoice Generation
-- Phase 48 — Payment Tracking
-- ══════════════════════════════════════════════════════════════════════════════

-- ─── JOB COSTING SHEET ────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS job_costings (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id        UUID NOT NULL REFERENCES companies(id),
  job_id            UUID NOT NULL REFERENCES jobs(id) ON DELETE CASCADE,

  -- Board / Paper Material
  board_cost        NUMERIC(14,2) NOT NULL DEFAULT 0,
  board_sheets      NUMERIC(12,2),
  board_rate        NUMERIC(12,4),

  -- Printing
  printing_cost     NUMERIC(14,2) NOT NULL DEFAULT 0,
  printing_plates   INTEGER DEFAULT 0,
  plate_cost        NUMERIC(12,2) DEFAULT 0,
  ink_cost          NUMERIC(12,2) DEFAULT 0,

  -- Finishing costs
  lamination_cost   NUMERIC(12,2) DEFAULT 0,
  foiling_cost      NUMERIC(12,2) DEFAULT 0,
  uv_cost           NUMERIC(12,2) DEFAULT 0,
  die_cutting_cost  NUMERIC(12,2) DEFAULT 0,
  pasting_cost      NUMERIC(12,2) DEFAULT 0,
  other_finishing   NUMERIC(12,2) DEFAULT 0,

  -- Overhead & Labour
  labour_cost       NUMERIC(12,2) DEFAULT 0,
  overhead_pct      NUMERIC(5,2)  DEFAULT 15,  -- % of direct costs
  overhead_amount   NUMERIC(12,2) DEFAULT 0,

  -- Totals
  total_cost        NUMERIC(14,2) NOT NULL DEFAULT 0,
  quoted_amount     NUMERIC(14,2),
  margin_amount     NUMERIC(14,2),
  margin_pct        NUMERIC(6,2),

  -- Notes
  costing_notes     TEXT,
  costed_by         UUID REFERENCES users(id),
  costed_at         TIMESTAMPTZ,

  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_by UUID, updated_by UUID,
  is_active  BOOLEAN NOT NULL DEFAULT TRUE,
  UNIQUE (company_id, job_id)
);

CREATE INDEX IF NOT EXISTS idx_jc_job     ON job_costings(job_id);
CREATE INDEX IF NOT EXISTS idx_jc_company ON job_costings(company_id);
DROP TRIGGER IF EXISTS trg_jc_upd ON job_costings;
CREATE TRIGGER trg_jc_upd BEFORE UPDATE ON job_costings
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
ALTER TABLE job_costings ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS jc_tenant ON job_costings;
CREATE POLICY jc_tenant ON job_costings
  USING (company_id = (auth.jwt() ->> 'company_id')::UUID);
DROP TRIGGER IF EXISTS trg_audit_jc ON job_costings;
CREATE TRIGGER trg_audit_jc AFTER INSERT OR UPDATE OR DELETE ON job_costings
  FOR EACH ROW EXECUTE FUNCTION log_audit_event();

-- ─── COSTING LINE ITEMS (free-form additional cost lines) ────────────────────
CREATE TABLE IF NOT EXISTS job_costing_lines (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id    UUID NOT NULL REFERENCES companies(id),
  costing_id    UUID NOT NULL REFERENCES job_costings(id) ON DELETE CASCADE,
  description   TEXT NOT NULL,
  category      TEXT,
  quantity      NUMERIC(12,2) DEFAULT 1,
  unit_rate     NUMERIC(12,4) DEFAULT 0,
  amount        NUMERIC(14,2) NOT NULL DEFAULT 0,
  sort_order    INTEGER NOT NULL DEFAULT 1,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_by UUID, updated_by UUID,
  is_active  BOOLEAN NOT NULL DEFAULT TRUE
);

CREATE INDEX IF NOT EXISTS idx_jcl_costing ON job_costing_lines(costing_id, sort_order);
DROP TRIGGER IF EXISTS trg_jcl_upd ON job_costing_lines;
CREATE TRIGGER trg_jcl_upd BEFORE UPDATE ON job_costing_lines
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
ALTER TABLE job_costing_lines ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS jcl_tenant ON job_costing_lines;
CREATE POLICY jcl_tenant ON job_costing_lines
  USING (company_id = (auth.jwt() ->> 'company_id')::UUID);

-- ─── INVOICES ─────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS invoices (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id        UUID NOT NULL REFERENCES companies(id),
  invoice_number    TEXT NOT NULL,
  customer_id       UUID NOT NULL REFERENCES customers(id),
  dispatch_id       UUID REFERENCES dispatch_orders(id),
  status            TEXT NOT NULL DEFAULT 'draft'
                    CHECK (status IN ('draft','sent','partial','paid','overdue','cancelled','void')),

  -- Dates
  invoice_date      DATE NOT NULL DEFAULT CURRENT_DATE,
  due_date          DATE,
  sent_at           TIMESTAMPTZ,

  -- Amounts
  subtotal          NUMERIC(14,2) NOT NULL DEFAULT 0,
  discount_pct      NUMERIC(5,2) DEFAULT 0,
  discount_amount   NUMERIC(14,2) DEFAULT 0,
  tax_pct           NUMERIC(5,2) DEFAULT 0,
  tax_amount        NUMERIC(14,2) DEFAULT 0,
  total_amount      NUMERIC(14,2) NOT NULL DEFAULT 0,
  paid_amount       NUMERIC(14,2) NOT NULL DEFAULT 0,
  balance_due       NUMERIC(14,2) NOT NULL DEFAULT 0,

  -- Content
  notes             TEXT,
  terms             TEXT,
  payment_terms     INTEGER DEFAULT 30,

  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_by UUID, updated_by UUID, deleted_at TIMESTAMPTZ,
  is_active  BOOLEAN NOT NULL DEFAULT TRUE,
  UNIQUE (company_id, invoice_number)
);

CREATE INDEX IF NOT EXISTS idx_inv_company  ON invoices(company_id);
CREATE INDEX IF NOT EXISTS idx_inv_customer ON invoices(customer_id);
CREATE INDEX IF NOT EXISTS idx_inv_status   ON invoices(company_id, status);
CREATE INDEX IF NOT EXISTS idx_inv_due      ON invoices(company_id, due_date);
DROP TRIGGER IF EXISTS trg_inv_upd ON invoices;
CREATE TRIGGER trg_inv_upd BEFORE UPDATE ON invoices
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
ALTER TABLE invoices ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS inv_tenant ON invoices;
CREATE POLICY inv_tenant ON invoices
  USING (company_id = (auth.jwt() ->> 'company_id')::UUID);
DROP TRIGGER IF EXISTS trg_audit_inv ON invoices;
CREATE TRIGGER trg_audit_inv AFTER INSERT OR UPDATE OR DELETE ON invoices
  FOR EACH ROW EXECUTE FUNCTION log_audit_event();

-- ─── INVOICE LINE ITEMS ───────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS invoice_items (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id      UUID NOT NULL REFERENCES companies(id),
  invoice_id      UUID NOT NULL REFERENCES invoices(id) ON DELETE CASCADE,
  job_id          UUID REFERENCES jobs(id),
  description     TEXT NOT NULL,
  quantity        NUMERIC(12,2) NOT NULL DEFAULT 1,
  unit_price      NUMERIC(14,4) NOT NULL DEFAULT 0,
  subtotal        NUMERIC(14,2) NOT NULL DEFAULT 0,
  sort_order      INTEGER NOT NULL DEFAULT 1,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_by UUID, updated_by UUID,
  is_active  BOOLEAN NOT NULL DEFAULT TRUE
);

CREATE INDEX IF NOT EXISTS idx_ii_invoice ON invoice_items(invoice_id, sort_order);
CREATE INDEX IF NOT EXISTS idx_ii_job     ON invoice_items(job_id);
DROP TRIGGER IF EXISTS trg_ii_upd ON invoice_items;
CREATE TRIGGER trg_ii_upd BEFORE UPDATE ON invoice_items
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
ALTER TABLE invoice_items ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS ii_tenant ON invoice_items;
CREATE POLICY ii_tenant ON invoice_items
  USING (company_id = (auth.jwt() ->> 'company_id')::UUID);

-- ─── PAYMENTS ─────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS payments (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id      UUID NOT NULL REFERENCES companies(id),
  invoice_id      UUID NOT NULL REFERENCES invoices(id),
  customer_id     UUID NOT NULL REFERENCES customers(id),
  amount          NUMERIC(14,2) NOT NULL,
  payment_date    DATE NOT NULL DEFAULT CURRENT_DATE,
  payment_method  TEXT NOT NULL DEFAULT 'bank_transfer'
                  CHECK (payment_method IN ('cash','cheque','bank_transfer','online','other')),
  reference       TEXT,        -- cheque number / TID / bank ref
  bank_name       TEXT,
  notes           TEXT,
  received_by     UUID REFERENCES users(id),
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_by UUID, updated_by UUID, deleted_at TIMESTAMPTZ,
  is_active  BOOLEAN NOT NULL DEFAULT TRUE
);

CREATE INDEX IF NOT EXISTS idx_pay_invoice  ON payments(invoice_id);
CREATE INDEX IF NOT EXISTS idx_pay_customer ON payments(customer_id);
CREATE INDEX IF NOT EXISTS idx_pay_company  ON payments(company_id, payment_date DESC);
DROP TRIGGER IF EXISTS trg_pay_upd ON payments;
CREATE TRIGGER trg_pay_upd BEFORE UPDATE ON payments
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
ALTER TABLE payments ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS pay_tenant ON payments;
CREATE POLICY pay_tenant ON payments
  USING (company_id = (auth.jwt() ->> 'company_id')::UUID);
DROP TRIGGER IF EXISTS trg_audit_pay ON payments;
CREATE TRIGGER trg_audit_pay AFTER INSERT OR UPDATE OR DELETE ON payments
  FOR EACH ROW EXECUTE FUNCTION log_audit_event();

-- ─── AUTO-RECOMPUTE INVOICE BALANCE after payment ─────────────────────────────
CREATE OR REPLACE FUNCTION recompute_invoice_balance()
RETURNS TRIGGER AS $$
DECLARE
  v_paid   NUMERIC(14,2);
  v_total  NUMERIC(14,2);
  v_status TEXT;
BEGIN
  SELECT COALESCE(SUM(amount),0) INTO v_paid
  FROM payments
  WHERE invoice_id = COALESCE(NEW.invoice_id, OLD.invoice_id)
    AND (deleted_at IS NULL) AND is_active = TRUE;

  SELECT total_amount INTO v_total
  FROM invoices WHERE id = COALESCE(NEW.invoice_id, OLD.invoice_id);

  v_status := CASE
    WHEN v_paid <= 0         THEN 'sent'
    WHEN v_paid >= v_total   THEN 'paid'
    ELSE 'partial'
  END;

  UPDATE invoices SET
    paid_amount = v_paid,
    balance_due = GREATEST(v_total - v_paid, 0),
    status      = v_status
  WHERE id = COALESCE(NEW.invoice_id, OLD.invoice_id)
    AND status NOT IN ('draft','cancelled','void');

  RETURN COALESCE(NEW, OLD);
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_payment_balance ON payments;
CREATE TRIGGER trg_payment_balance
  AFTER INSERT OR UPDATE OR DELETE ON payments
  FOR EACH ROW EXECUTE FUNCTION recompute_invoice_balance();

-- ─── SEQUENCE FOR INVOICES ────────────────────────────────────────────────────
INSERT INTO document_sequences (company_id, document_type, year, prefix, padding, current_value)
VALUES ('00000000-0000-0000-0000-000000000001', 'INV', 2026, 'INV', 5, 0)
ON CONFLICT DO NOTHING;

NOTIFY pgrst, 'reload schema';
