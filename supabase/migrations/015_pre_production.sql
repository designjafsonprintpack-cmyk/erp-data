-- ══════════════════════════════════════════════════════════════════════════════
-- JAFSON PRINT ERP — MIGRATION 015: PRE-PRODUCTION
-- Phase 29 — Artwork Module
-- Phase 30 — Production Planning
-- Phase 31 — Store / MRN
-- Phase 32 — Board Inventory
-- Phase 33 — Purchase Orders
-- ══════════════════════════════════════════════════════════════════════════════

-- ─── PHASE 29: JOB ARTWORKS ───────────────────────────────────────────────────
CREATE TABLE job_artworks (
  id                   UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id           UUID NOT NULL REFERENCES companies(id),
  job_id               UUID NOT NULL REFERENCES jobs(id) ON DELETE CASCADE,
  version              INTEGER NOT NULL DEFAULT 1,
  file_name            TEXT NOT NULL,
  file_url             TEXT NOT NULL,
  file_size            BIGINT,
  file_type            TEXT,
  designer_notes       TEXT,
  is_production_ready  BOOLEAN NOT NULL DEFAULT FALSE,
  approved_by          UUID REFERENCES users(id),
  approved_at          TIMESTAMPTZ,
  created_at           TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at           TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_by UUID, updated_by UUID, deleted_at TIMESTAMPTZ,
  is_active  BOOLEAN NOT NULL DEFAULT TRUE,
  UNIQUE (company_id, job_id, version)
);

CREATE INDEX idx_artworks_job ON job_artworks(job_id, version);
CREATE TRIGGER trg_artworks_upd BEFORE UPDATE ON job_artworks FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
ALTER TABLE job_artworks ENABLE ROW LEVEL SECURITY;
CREATE POLICY artworks_tenant ON job_artworks USING (company_id = (auth.jwt() ->> 'company_id')::UUID);
CREATE TRIGGER trg_audit_artworks AFTER INSERT OR UPDATE OR DELETE ON job_artworks FOR EACH ROW EXECUTE FUNCTION log_audit_event();

-- ─── PHASE 30: PRODUCTION PLANS ──────────────────────────────────────────────
CREATE TABLE job_plans (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id      UUID NOT NULL REFERENCES companies(id),
  job_id          UUID NOT NULL REFERENCES jobs(id) ON DELETE CASCADE,
  planned_date    DATE NOT NULL,
  planned_by      UUID REFERENCES users(id),
  notes           TEXT,
  status          TEXT NOT NULL DEFAULT 'scheduled'
                  CHECK (status IN ('scheduled','in_progress','completed','cancelled')),
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_by UUID, updated_by UUID, deleted_at TIMESTAMPTZ,
  is_active  BOOLEAN NOT NULL DEFAULT TRUE
);

CREATE INDEX idx_plans_job     ON job_plans(job_id);
CREATE INDEX idx_plans_date    ON job_plans(company_id, planned_date);
CREATE INDEX idx_plans_status  ON job_plans(company_id, status);
CREATE TRIGGER trg_plans_upd BEFORE UPDATE ON job_plans FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
ALTER TABLE job_plans ENABLE ROW LEVEL SECURITY;
CREATE POLICY plans_tenant ON job_plans USING (company_id = (auth.jwt() ->> 'company_id')::UUID);
CREATE TRIGGER trg_audit_plans AFTER INSERT OR UPDATE OR DELETE ON job_plans FOR EACH ROW EXECUTE FUNCTION log_audit_event();

-- ─── MACHINE ASSIGNMENTS ──────────────────────────────────────────────────────
CREATE TABLE job_machine_assignments (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id      UUID NOT NULL REFERENCES companies(id),
  job_plan_id     UUID NOT NULL REFERENCES job_plans(id) ON DELETE CASCADE,
  job_id          UUID NOT NULL REFERENCES jobs(id),
  machine_id      UUID NOT NULL REFERENCES machines(id),
  stage_id        UUID REFERENCES workflow_stages(id),
  start_time      TIMESTAMPTZ,
  end_time        TIMESTAMPTZ,
  estimated_hours NUMERIC(6,2),
  actual_hours    NUMERIC(6,2),
  operator_id     UUID REFERENCES users(id),
  notes           TEXT,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_by UUID, updated_by UUID,
  is_active  BOOLEAN NOT NULL DEFAULT TRUE
);

CREATE INDEX idx_mach_plan    ON job_machine_assignments(job_plan_id);
CREATE INDEX idx_mach_machine ON job_machine_assignments(machine_id);
CREATE INDEX idx_mach_job     ON job_machine_assignments(job_id);
CREATE TRIGGER trg_mach_upd BEFORE UPDATE ON job_machine_assignments FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
ALTER TABLE job_machine_assignments ENABLE ROW LEVEL SECURITY;
CREATE POLICY mach_tenant ON job_machine_assignments USING (company_id = (auth.jwt() ->> 'company_id')::UUID);

-- ─── PHASE 31: MATERIAL REQUISITIONS (MRN) ───────────────────────────────────
CREATE TABLE material_requisitions (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id      UUID NOT NULL REFERENCES companies(id),
  mrn_number      TEXT NOT NULL,
  job_id          UUID REFERENCES jobs(id),
  requested_by    UUID REFERENCES users(id),
  approved_by     UUID REFERENCES users(id),
  status          TEXT NOT NULL DEFAULT 'pending'
                  CHECK (status IN ('pending','approved','partially_issued','issued','cancelled')),
  required_date   DATE,
  notes           TEXT,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_by UUID, updated_by UUID, deleted_at TIMESTAMPTZ,
  is_active  BOOLEAN NOT NULL DEFAULT TRUE,
  UNIQUE (company_id, mrn_number)
);

CREATE INDEX idx_mrn_company ON material_requisitions(company_id);
CREATE INDEX idx_mrn_job     ON material_requisitions(job_id);
CREATE INDEX idx_mrn_status  ON material_requisitions(company_id, status);
CREATE TRIGGER trg_mrn_upd BEFORE UPDATE ON material_requisitions FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
ALTER TABLE material_requisitions ENABLE ROW LEVEL SECURITY;
CREATE POLICY mrn_tenant ON material_requisitions USING (company_id = (auth.jwt() ->> 'company_id')::UUID);
CREATE TRIGGER trg_audit_mrn AFTER INSERT OR UPDATE OR DELETE ON material_requisitions FOR EACH ROW EXECUTE FUNCTION log_audit_event();

-- ─── MRN LINE ITEMS ───────────────────────────────────────────────────────────
CREATE TABLE material_requisition_items (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id       UUID NOT NULL REFERENCES companies(id),
  requisition_id   UUID NOT NULL REFERENCES material_requisitions(id) ON DELETE CASCADE,
  material_name    TEXT NOT NULL,
  material_type    TEXT,       -- 'board','paper','ink','lamination','foil','other'
  specification    TEXT,
  quantity_required NUMERIC(12,2) NOT NULL DEFAULT 0,
  quantity_issued  NUMERIC(12,2) NOT NULL DEFAULT 0,
  unit_id          UUID REFERENCES units(id),
  notes            TEXT,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_by UUID, updated_by UUID,
  is_active  BOOLEAN NOT NULL DEFAULT TRUE
);

CREATE INDEX idx_mrn_items_req ON material_requisition_items(requisition_id);
CREATE TRIGGER trg_mrn_items_upd BEFORE UPDATE ON material_requisition_items FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
ALTER TABLE material_requisition_items ENABLE ROW LEVEL SECURITY;
CREATE POLICY mrn_items_tenant ON material_requisition_items USING (company_id = (auth.jwt() ->> 'company_id')::UUID);

-- ─── PHASE 32: BOARD INVENTORY ────────────────────────────────────────────────
CREATE TABLE board_inventory (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id       UUID NOT NULL REFERENCES companies(id),
  board_type_id    UUID REFERENCES board_types(id),
  description      TEXT NOT NULL,
  size_l           NUMERIC(10,2),
  size_w           NUMERIC(10,2),
  gsm              NUMERIC(8,2),
  current_stock    NUMERIC(14,2) NOT NULL DEFAULT 0,
  reserved_stock   NUMERIC(14,2) NOT NULL DEFAULT 0,
  reorder_level    NUMERIC(14,2) NOT NULL DEFAULT 0,
  unit_id          UUID REFERENCES units(id),
  unit_cost        NUMERIC(14,4) DEFAULT 0,
  location         TEXT,
  vendor_id        UUID,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_by UUID, updated_by UUID, deleted_at TIMESTAMPTZ,
  is_active  BOOLEAN NOT NULL DEFAULT TRUE
);

CREATE INDEX idx_board_inv_company ON board_inventory(company_id);
CREATE TRIGGER trg_board_inv_upd BEFORE UPDATE ON board_inventory FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
ALTER TABLE board_inventory ENABLE ROW LEVEL SECURITY;
CREATE POLICY board_inv_tenant ON board_inventory USING (company_id = (auth.jwt() ->> 'company_id')::UUID);
CREATE TRIGGER trg_audit_board_inv AFTER INSERT OR UPDATE OR DELETE ON board_inventory FOR EACH ROW EXECUTE FUNCTION log_audit_event();

-- ─── BOARD INVENTORY MOVEMENTS ────────────────────────────────────────────────
CREATE TABLE board_inventory_movements (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id       UUID NOT NULL REFERENCES companies(id),
  board_item_id    UUID NOT NULL REFERENCES board_inventory(id),
  movement_type    TEXT NOT NULL CHECK (movement_type IN ('in','out','adjustment','reserved','released')),
  quantity         NUMERIC(14,2) NOT NULL,
  balance_after    NUMERIC(14,2) NOT NULL,
  reference_type   TEXT,    -- 'purchase_order','mrn','manual'
  reference_id     UUID,
  job_id           UUID REFERENCES jobs(id),
  notes            TEXT,
  moved_by         UUID REFERENCES users(id),
  occurred_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
  -- Immutable — no updated_at, no soft delete
);

CREATE INDEX idx_bim_item    ON board_inventory_movements(board_item_id, occurred_at DESC);
CREATE INDEX idx_bim_company ON board_inventory_movements(company_id, occurred_at DESC);
ALTER TABLE board_inventory_movements ENABLE ROW LEVEL SECURITY;
CREATE POLICY bim_read   ON board_inventory_movements FOR SELECT USING (company_id = (auth.jwt() ->> 'company_id')::UUID);
CREATE POLICY bim_insert ON board_inventory_movements FOR INSERT WITH CHECK (company_id = (auth.jwt() ->> 'company_id')::UUID);

-- ─── PHASE 33: VENDORS ────────────────────────────────────────────────────────
CREATE TABLE vendors (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id      UUID NOT NULL REFERENCES companies(id),
  vendor_code     TEXT NOT NULL,
  name            TEXT NOT NULL,
  contact_person  TEXT,
  email           TEXT,
  phone           TEXT,
  mobile          TEXT,
  address         TEXT,
  ntn             TEXT,
  strn            TEXT,
  payment_terms   INTEGER DEFAULT 30,
  notes           TEXT,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_by UUID, updated_by UUID, deleted_at TIMESTAMPTZ,
  is_active  BOOLEAN NOT NULL DEFAULT TRUE,
  UNIQUE (company_id, vendor_code)
);

CREATE INDEX idx_vendors_company ON vendors(company_id);
CREATE TRIGGER trg_vendors_upd BEFORE UPDATE ON vendors FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
ALTER TABLE vendors ENABLE ROW LEVEL SECURITY;
CREATE POLICY vendors_tenant ON vendors USING (company_id = (auth.jwt() ->> 'company_id')::UUID);
CREATE TRIGGER trg_audit_vendors AFTER INSERT OR UPDATE OR DELETE ON vendors FOR EACH ROW EXECUTE FUNCTION log_audit_event();

-- ─── PURCHASE ORDERS ──────────────────────────────────────────────────────────
CREATE TABLE purchase_orders (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id      UUID NOT NULL REFERENCES companies(id),
  po_number       TEXT NOT NULL,
  vendor_id       UUID NOT NULL REFERENCES vendors(id),
  status          TEXT NOT NULL DEFAULT 'draft'
                  CHECK (status IN ('draft','sent','confirmed','partially_received','received','cancelled')),
  order_date      DATE NOT NULL DEFAULT CURRENT_DATE,
  expected_date   DATE,
  subtotal        NUMERIC(14,2) NOT NULL DEFAULT 0,
  tax_amount      NUMERIC(14,2) NOT NULL DEFAULT 0,
  total_amount    NUMERIC(14,2) NOT NULL DEFAULT 0,
  notes           TEXT,
  terms           TEXT,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_by UUID, updated_by UUID, deleted_at TIMESTAMPTZ,
  is_active  BOOLEAN NOT NULL DEFAULT TRUE,
  UNIQUE (company_id, po_number)
);

CREATE INDEX idx_po_company ON purchase_orders(company_id);
CREATE INDEX idx_po_vendor  ON purchase_orders(vendor_id);
CREATE INDEX idx_po_status  ON purchase_orders(company_id, status);
CREATE TRIGGER trg_po_upd BEFORE UPDATE ON purchase_orders FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
ALTER TABLE purchase_orders ENABLE ROW LEVEL SECURITY;
CREATE POLICY po_tenant ON purchase_orders USING (company_id = (auth.jwt() ->> 'company_id')::UUID);
CREATE TRIGGER trg_audit_po AFTER INSERT OR UPDATE OR DELETE ON purchase_orders FOR EACH ROW EXECUTE FUNCTION log_audit_event();

-- ─── PO LINE ITEMS ────────────────────────────────────────────────────────────
CREATE TABLE purchase_order_items (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id       UUID NOT NULL REFERENCES companies(id),
  po_id            UUID NOT NULL REFERENCES purchase_orders(id) ON DELETE CASCADE,
  line_no          INTEGER NOT NULL DEFAULT 1,
  description      TEXT NOT NULL,
  specification    TEXT,
  quantity         NUMERIC(12,2) NOT NULL DEFAULT 1,
  unit_id          UUID REFERENCES units(id),
  unit_price       NUMERIC(14,4) NOT NULL DEFAULT 0,
  subtotal         NUMERIC(14,2) NOT NULL DEFAULT 0,
  quantity_received NUMERIC(12,2) NOT NULL DEFAULT 0,
  board_item_id    UUID REFERENCES board_inventory(id),
  notes            TEXT,
  sort_order       INTEGER NOT NULL DEFAULT 1,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_by UUID, updated_by UUID,
  is_active  BOOLEAN NOT NULL DEFAULT TRUE
);

CREATE INDEX idx_po_items_po ON purchase_order_items(po_id, sort_order);
CREATE TRIGGER trg_po_items_upd BEFORE UPDATE ON purchase_order_items FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
ALTER TABLE purchase_order_items ENABLE ROW LEVEL SECURITY;
CREATE POLICY po_items_tenant ON purchase_order_items USING (company_id = (auth.jwt() ->> 'company_id')::UUID);

-- ─── SEQUENCES ────────────────────────────────────────────────────────────────
INSERT INTO document_sequences (company_id, document_type, year, prefix, padding, current_value) VALUES
  ('00000000-0000-0000-0000-000000000001', 'MRN', 2026, 'MRN', 5, 0),
  ('00000000-0000-0000-0000-000000000001', 'PO',  2026, 'PO',  5, 0),
  ('00000000-0000-0000-0000-000000000001', 'VND', 2026, 'VND', 4, 0)
ON CONFLICT DO NOTHING;

NOTIFY pgrst, 'reload schema';
