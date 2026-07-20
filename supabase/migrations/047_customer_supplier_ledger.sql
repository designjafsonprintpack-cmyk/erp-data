-- ═══════════════════════════════════════════════════════════════════════════
-- PHASE A — CUSTOMER & SUPPLIER LEDGER
-- ═══════════════════════════════════════════════════════════════════════════
-- Running-balance ledgers for both sides of the business:
--   customer_ledger_entries — what each customer owes us (AR)
--   supplier_ledger_entries — what we owe each vendor (AP)
-- Both follow the same convention already used elsewhere in this schema
-- (board_inventory_movements.balance_after): every entry snapshots the
-- running balance at insert time via an atomic, row-locked RPC — never
-- computed client-side, never re-derived by summing history at read time.
--
-- Sign convention (matches standard double-entry bookkeeping):
--   Customer ledger: debit increases what they owe us (invoice), credit
--     decreases it (payment, credit note). balance_after = running AR.
--   Supplier ledger: credit increases what we owe them (PO/bill), debit
--     decreases it (payment we make). balance_after = running AP.
-- ═══════════════════════════════════════════════════════════════════════════

-- ─── CUSTOMER LEDGER ────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS customer_ledger_entries (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id      UUID NOT NULL REFERENCES companies(id),
  customer_id     UUID NOT NULL REFERENCES customers(id),
  entry_date      DATE NOT NULL DEFAULT CURRENT_DATE,
  entry_type      TEXT NOT NULL CHECK (entry_type IN
                    ('invoice','payment','credit_note','debit_note','opening_balance','adjustment')),
  reference_type  TEXT,             -- 'invoice' | 'payment' | null for manual entries
  reference_id    UUID,             -- FK to invoices.id / payments.id (not enforced — polymorphic)
  description     TEXT NOT NULL,
  debit           NUMERIC(14,2) NOT NULL DEFAULT 0,
  credit          NUMERIC(14,2) NOT NULL DEFAULT 0,
  balance_after   NUMERIC(14,2) NOT NULL,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_by UUID, updated_by UUID, deleted_at TIMESTAMPTZ,
  is_active  BOOLEAN NOT NULL DEFAULT TRUE,
  CHECK (debit = 0 OR credit = 0)   -- an entry moves the balance one direction, never both
);

CREATE INDEX IF NOT EXISTS idx_cle_customer ON customer_ledger_entries(company_id, customer_id, entry_date, created_at);
CREATE INDEX IF NOT EXISTS idx_cle_ref      ON customer_ledger_entries(reference_type, reference_id);
DROP TRIGGER IF EXISTS trg_cle_upd ON customer_ledger_entries;
CREATE TRIGGER trg_cle_upd BEFORE UPDATE ON customer_ledger_entries
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
ALTER TABLE customer_ledger_entries ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS cle_tenant ON customer_ledger_entries;
CREATE POLICY cle_tenant ON customer_ledger_entries
  USING (company_id = (auth.jwt() ->> 'company_id')::UUID)
  WITH CHECK (company_id = (auth.jwt() ->> 'company_id')::UUID);
DROP TRIGGER IF EXISTS trg_audit_cle ON customer_ledger_entries;
CREATE TRIGGER trg_audit_cle AFTER INSERT OR UPDATE OR DELETE ON customer_ledger_entries
  FOR EACH ROW EXECUTE FUNCTION log_audit_event();

-- ─── SUPPLIER LEDGER ────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS supplier_ledger_entries (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id      UUID NOT NULL REFERENCES companies(id),
  vendor_id       UUID NOT NULL REFERENCES vendors(id),
  entry_date      DATE NOT NULL DEFAULT CURRENT_DATE,
  entry_type      TEXT NOT NULL CHECK (entry_type IN
                    ('purchase_order','payment','credit_note','debit_note','opening_balance','adjustment')),
  reference_type  TEXT,             -- 'purchase_order' | 'vendor_payment' | null
  reference_id    UUID,
  description     TEXT NOT NULL,
  debit           NUMERIC(14,2) NOT NULL DEFAULT 0,
  credit          NUMERIC(14,2) NOT NULL DEFAULT 0,
  balance_after   NUMERIC(14,2) NOT NULL,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_by UUID, updated_by UUID, deleted_at TIMESTAMPTZ,
  is_active  BOOLEAN NOT NULL DEFAULT TRUE,
  CHECK (debit = 0 OR credit = 0)
);

CREATE INDEX IF NOT EXISTS idx_sle_vendor ON supplier_ledger_entries(company_id, vendor_id, entry_date, created_at);
CREATE INDEX IF NOT EXISTS idx_sle_ref    ON supplier_ledger_entries(reference_type, reference_id);
DROP TRIGGER IF EXISTS trg_sle_upd ON supplier_ledger_entries;
CREATE TRIGGER trg_sle_upd BEFORE UPDATE ON supplier_ledger_entries
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
ALTER TABLE supplier_ledger_entries ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS sle_tenant ON supplier_ledger_entries;
CREATE POLICY sle_tenant ON supplier_ledger_entries
  USING (company_id = (auth.jwt() ->> 'company_id')::UUID)
  WITH CHECK (company_id = (auth.jwt() ->> 'company_id')::UUID);
DROP TRIGGER IF EXISTS trg_audit_sle ON supplier_ledger_entries;
CREATE TRIGGER trg_audit_sle AFTER INSERT OR UPDATE OR DELETE ON supplier_ledger_entries
  FOR EACH ROW EXECUTE FUNCTION log_audit_event();

-- ─── VENDOR PAYMENTS (new — mirrors `payments`, which was customer-only) ────
CREATE TABLE IF NOT EXISTS vendor_payments (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id      UUID NOT NULL REFERENCES companies(id),
  vendor_id       UUID NOT NULL REFERENCES vendors(id),
  po_id           UUID REFERENCES purchase_orders(id),   -- nullable: some payments aren't tied to one PO
  amount          NUMERIC(14,2) NOT NULL,
  payment_date    DATE NOT NULL DEFAULT CURRENT_DATE,
  payment_method  TEXT NOT NULL DEFAULT 'bank_transfer'
                  CHECK (payment_method IN ('cash','cheque','bank_transfer','online','other')),
  reference       TEXT,
  bank_name       TEXT,
  notes           TEXT,
  paid_by         UUID REFERENCES users(id),
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_by UUID, updated_by UUID, deleted_at TIMESTAMPTZ,
  is_active  BOOLEAN NOT NULL DEFAULT TRUE
);

CREATE INDEX IF NOT EXISTS idx_vp_vendor  ON vendor_payments(vendor_id);
CREATE INDEX IF NOT EXISTS idx_vp_po      ON vendor_payments(po_id);
CREATE INDEX IF NOT EXISTS idx_vp_company ON vendor_payments(company_id, payment_date DESC);
DROP TRIGGER IF EXISTS trg_vp_upd ON vendor_payments;
CREATE TRIGGER trg_vp_upd BEFORE UPDATE ON vendor_payments
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
ALTER TABLE vendor_payments ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS vp_tenant ON vendor_payments;
CREATE POLICY vp_tenant ON vendor_payments
  USING (company_id = (auth.jwt() ->> 'company_id')::UUID)
  WITH CHECK (company_id = (auth.jwt() ->> 'company_id')::UUID);
DROP TRIGGER IF EXISTS trg_audit_vp ON vendor_payments;
CREATE TRIGGER trg_audit_vp AFTER INSERT OR UPDATE OR DELETE ON vendor_payments
  FOR EACH ROW EXECUTE FUNCTION log_audit_event();

-- ─── ATOMIC RPC: record a customer ledger entry ─────────────────────────────
-- Row-locks the customer's most recent entry (if any) so two concurrent
-- writes (e.g. an invoice created at the same moment a payment posts) can
-- never compute their running balance from the same stale snapshot.
CREATE OR REPLACE FUNCTION record_customer_ledger_entry(
  p_company_id     UUID,
  p_customer_id    UUID,
  p_entry_type     TEXT,
  p_description    TEXT,
  p_debit          NUMERIC DEFAULT 0,
  p_credit         NUMERIC DEFAULT 0,
  p_reference_type TEXT DEFAULT NULL,
  p_reference_id   UUID DEFAULT NULL,
  p_entry_date     DATE DEFAULT CURRENT_DATE,
  p_created_by     UUID DEFAULT NULL
)
RETURNS customer_ledger_entries
LANGUAGE plpgsql
SECURITY INVOKER
AS $$
DECLARE
  v_last_balance NUMERIC(14,2);
  v_new_row      customer_ledger_entries;
BEGIN
  SELECT balance_after INTO v_last_balance
  FROM customer_ledger_entries
  WHERE company_id = p_company_id AND customer_id = p_customer_id AND deleted_at IS NULL
  ORDER BY entry_date DESC, created_at DESC
  LIMIT 1
  FOR UPDATE;

  IF v_last_balance IS NULL THEN v_last_balance := 0; END IF;

  INSERT INTO customer_ledger_entries (
    company_id, customer_id, entry_date, entry_type, reference_type, reference_id,
    description, debit, credit, balance_after, created_by
  ) VALUES (
    p_company_id, p_customer_id, p_entry_date, p_entry_type, p_reference_type, p_reference_id,
    p_description, p_debit, p_credit, v_last_balance + p_debit - p_credit, p_created_by
  )
  RETURNING * INTO v_new_row;

  RETURN v_new_row;
END;
$$;

-- ─── ATOMIC RPC: record a supplier ledger entry ─────────────────────────────
CREATE OR REPLACE FUNCTION record_supplier_ledger_entry(
  p_company_id     UUID,
  p_vendor_id      UUID,
  p_entry_type     TEXT,
  p_description    TEXT,
  p_debit          NUMERIC DEFAULT 0,
  p_credit         NUMERIC DEFAULT 0,
  p_reference_type TEXT DEFAULT NULL,
  p_reference_id   UUID DEFAULT NULL,
  p_entry_date     DATE DEFAULT CURRENT_DATE,
  p_created_by     UUID DEFAULT NULL
)
RETURNS supplier_ledger_entries
LANGUAGE plpgsql
SECURITY INVOKER
AS $$
DECLARE
  v_last_balance NUMERIC(14,2);
  v_new_row      supplier_ledger_entries;
BEGIN
  SELECT balance_after INTO v_last_balance
  FROM supplier_ledger_entries
  WHERE company_id = p_company_id AND vendor_id = p_vendor_id AND deleted_at IS NULL
  ORDER BY entry_date DESC, created_at DESC
  LIMIT 1
  FOR UPDATE;

  IF v_last_balance IS NULL THEN v_last_balance := 0; END IF;

  INSERT INTO supplier_ledger_entries (
    company_id, vendor_id, entry_date, entry_type, reference_type, reference_id,
    description, debit, credit, balance_after, created_by
  ) VALUES (
    p_company_id, p_vendor_id, p_entry_date, p_entry_type, p_reference_type, p_reference_id,
    p_description, p_debit, p_credit, v_last_balance + p_credit - p_debit, p_created_by
  )
  RETURNING * INTO v_new_row;

  RETURN v_new_row;
END;
$$;

-- ─── PERMISSIONS: extend existing 'finance' and 'purchase' modules ──────────
-- No new permission module needed — ledger reads/writes are gated by the
-- same 'finance' (customer ledger, vendor payments viewed from Finance) and
-- 'purchase' (supplier ledger, vendor payments made) modules already seeded.

NOTIFY pgrst, 'reload schema';
