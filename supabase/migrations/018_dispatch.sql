-- ══════════════════════════════════════════════════════════════════════════════
-- JAFSON PRINT ERP — MIGRATION 018: DISPATCH & DELIVERY
-- Phase 41 — Dispatch Orders
-- Phase 42 — Delivery Challan
-- Phase 43 — POD (Proof of Delivery)
-- Phase 44 — Courier / Vehicle Tracking
-- ══════════════════════════════════════════════════════════════════════════════

-- ─── DISPATCH ORDERS ──────────────────────────────────────────────────────────
CREATE TABLE dispatch_orders (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id          UUID NOT NULL REFERENCES companies(id),
  dispatch_number     TEXT NOT NULL,
  customer_id         UUID NOT NULL REFERENCES customers(id),
  status              TEXT NOT NULL DEFAULT 'pending'
                      CHECK (status IN ('pending','ready','dispatched','delivered','returned','cancelled')),

  -- Delivery details
  delivery_address    TEXT,
  delivery_city       TEXT,
  delivery_contact    TEXT,
  delivery_phone      TEXT,

  -- Dispatch method
  dispatch_method     TEXT DEFAULT 'own_vehicle'
                      CHECK (dispatch_method IN ('own_vehicle','courier','customer_pickup','third_party')),
  vehicle_number      TEXT,
  driver_name         TEXT,
  driver_phone        TEXT,
  courier_name        TEXT,
  tracking_number     TEXT,

  -- Scheduling
  scheduled_date      DATE,
  dispatched_at       TIMESTAMPTZ,
  delivered_at        TIMESTAMPTZ,

  -- Financials
  delivery_charges    NUMERIC(10,2) DEFAULT 0,
  notes               TEXT,

  created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_by UUID, updated_by UUID, deleted_at TIMESTAMPTZ,
  is_active   BOOLEAN NOT NULL DEFAULT TRUE,
  UNIQUE (company_id, dispatch_number)
);

CREATE INDEX idx_do_company  ON dispatch_orders(company_id);
CREATE INDEX idx_do_customer ON dispatch_orders(customer_id);
CREATE INDEX idx_do_status   ON dispatch_orders(company_id, status);
CREATE INDEX idx_do_date     ON dispatch_orders(company_id, scheduled_date);
CREATE TRIGGER trg_do_upd BEFORE UPDATE ON dispatch_orders
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
ALTER TABLE dispatch_orders ENABLE ROW LEVEL SECURITY;
CREATE POLICY do_tenant ON dispatch_orders
  USING (company_id = (auth.jwt() ->> 'company_id')::UUID);
CREATE TRIGGER trg_audit_do AFTER INSERT OR UPDATE OR DELETE ON dispatch_orders
  FOR EACH ROW EXECUTE FUNCTION log_audit_event();

-- ─── DISPATCH LINE ITEMS (jobs being dispatched) ──────────────────────────────
CREATE TABLE dispatch_items (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id      UUID NOT NULL REFERENCES companies(id),
  dispatch_id     UUID NOT NULL REFERENCES dispatch_orders(id) ON DELETE CASCADE,
  job_id          UUID NOT NULL REFERENCES jobs(id),
  quantity_ordered  NUMERIC(12,2) NOT NULL DEFAULT 0,
  quantity_dispatched NUMERIC(12,2) NOT NULL DEFAULT 0,
  carton_count    INTEGER DEFAULT 0,
  weight_kg       NUMERIC(8,2),
  notes           TEXT,
  sort_order      INTEGER NOT NULL DEFAULT 1,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_by UUID, updated_by UUID,
  is_active  BOOLEAN NOT NULL DEFAULT TRUE
);

CREATE INDEX idx_di_dispatch ON dispatch_items(dispatch_id);
CREATE INDEX idx_di_job      ON dispatch_items(job_id);
CREATE TRIGGER trg_di_upd BEFORE UPDATE ON dispatch_items
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
ALTER TABLE dispatch_items ENABLE ROW LEVEL SECURITY;
CREATE POLICY di_tenant ON dispatch_items
  USING (company_id = (auth.jwt() ->> 'company_id')::UUID);

-- ─── PROOF OF DELIVERY ────────────────────────────────────────────────────────
CREATE TABLE proof_of_delivery (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id      UUID NOT NULL REFERENCES companies(id),
  dispatch_id     UUID NOT NULL REFERENCES dispatch_orders(id) ON DELETE CASCADE,
  received_by     TEXT,           -- name of person who received
  received_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  signature_url   TEXT,           -- Supabase Storage URL
  photo_url       TEXT,           -- optional delivery photo
  condition       TEXT DEFAULT 'good'
                  CHECK (condition IN ('good','damaged','partial')),
  damage_notes    TEXT,
  confirmed_by    UUID REFERENCES users(id),  -- our staff who confirmed
  notes           TEXT,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_by UUID, updated_by UUID,
  is_active  BOOLEAN NOT NULL DEFAULT TRUE,
  UNIQUE (company_id, dispatch_id)
);

CREATE INDEX idx_pod_dispatch ON proof_of_delivery(dispatch_id);
CREATE TRIGGER trg_pod_upd BEFORE UPDATE ON proof_of_delivery
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
ALTER TABLE proof_of_delivery ENABLE ROW LEVEL SECURITY;
CREATE POLICY pod_tenant ON proof_of_delivery
  USING (company_id = (auth.jwt() ->> 'company_id')::UUID);
CREATE TRIGGER trg_audit_pod AFTER INSERT OR UPDATE OR DELETE ON proof_of_delivery
  FOR EACH ROW EXECUTE FUNCTION log_audit_event();

-- ─── DISPATCH SEQUENCE ────────────────────────────────────────────────────────
INSERT INTO document_sequences (company_id, document_type, year, prefix, padding, current_value)
VALUES ('00000000-0000-0000-0000-000000000001', 'DISP', 2026, 'DC', 5, 0)
ON CONFLICT DO NOTHING;

NOTIFY pgrst, 'reload schema';
