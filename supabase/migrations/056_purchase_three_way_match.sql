-- ═══════════════════════════════════════════════════════════════════════════
-- PURCHASE — 3-WAY MATCH (PO ↔ GOODS RECEIVED ↔ VENDOR BILL)
-- ═══════════════════════════════════════════════════════════════════════════
-- This schema never had a "vendor bill" concept — purchase_order_items
-- already tracks ordered qty (quantity) vs received qty (quantity_received,
-- filled in by the existing 'receive' action), which covers 2 of the 3
-- legs. The missing third leg is what the vendor actually billed for —
-- added here as vendor_bills/vendor_bill_items, deliberately modeled after
-- the existing invoices/invoice_items shape for consistency.
-- ═══════════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS vendor_bills (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id      UUID NOT NULL REFERENCES companies(id),
  po_id           UUID NOT NULL REFERENCES purchase_orders(id),
  vendor_id       UUID NOT NULL REFERENCES vendors(id),
  bill_number     TEXT NOT NULL,                    -- the vendor's own invoice/bill number, not ours
  bill_date       DATE NOT NULL DEFAULT CURRENT_DATE,
  due_date        DATE,
  total_amount    NUMERIC(14,2) NOT NULL DEFAULT 0,
  status          TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','matched','discrepancy','paid')),
  notes           TEXT,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_by UUID, updated_by UUID, deleted_at TIMESTAMPTZ,
  is_active  BOOLEAN NOT NULL DEFAULT TRUE
);

CREATE TABLE IF NOT EXISTS vendor_bill_items (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id      UUID NOT NULL REFERENCES companies(id),
  bill_id         UUID NOT NULL REFERENCES vendor_bills(id) ON DELETE CASCADE,
  po_item_id      UUID REFERENCES purchase_order_items(id),
  description     TEXT NOT NULL,
  quantity_billed NUMERIC(12,2) NOT NULL DEFAULT 0,
  unit_price      NUMERIC(14,4) NOT NULL DEFAULT 0,
  subtotal        NUMERIC(14,2) NOT NULL DEFAULT 0,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_by UUID, updated_by UUID, deleted_at TIMESTAMPTZ,
  is_active  BOOLEAN NOT NULL DEFAULT TRUE
);

CREATE INDEX IF NOT EXISTS idx_vb_po      ON vendor_bills(po_id);
CREATE INDEX IF NOT EXISTS idx_vb_vendor  ON vendor_bills(vendor_id);
CREATE INDEX IF NOT EXISTS idx_vbi_bill   ON vendor_bill_items(bill_id);
CREATE INDEX IF NOT EXISTS idx_vbi_poitem ON vendor_bill_items(po_item_id);

DROP TRIGGER IF EXISTS trg_vb_upd ON vendor_bills;
CREATE TRIGGER trg_vb_upd BEFORE UPDATE ON vendor_bills
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
DROP TRIGGER IF EXISTS trg_vbi_upd ON vendor_bill_items;
CREATE TRIGGER trg_vbi_upd BEFORE UPDATE ON vendor_bill_items
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

ALTER TABLE vendor_bills ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS vb_tenant ON vendor_bills;
CREATE POLICY vb_tenant ON vendor_bills
  USING (company_id = (auth.jwt() ->> 'company_id')::UUID)
  WITH CHECK (company_id = (auth.jwt() ->> 'company_id')::UUID);
ALTER TABLE vendor_bill_items ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS vbi_tenant ON vendor_bill_items;
CREATE POLICY vbi_tenant ON vendor_bill_items
  USING (company_id = (auth.jwt() ->> 'company_id')::UUID)
  WITH CHECK (company_id = (auth.jwt() ->> 'company_id')::UUID);

DROP TRIGGER IF EXISTS trg_audit_vb ON vendor_bills;
CREATE TRIGGER trg_audit_vb AFTER INSERT OR UPDATE OR DELETE ON vendor_bills
  FOR EACH ROW EXECUTE FUNCTION log_audit_event();

-- ─── 3-WAY MATCH ──────────────────────────────────────────────────────────
-- Per PO line: ordered (PO) vs received (GRN, already tracked on
-- purchase_order_items.quantity_received) vs billed (sum across all vendor
-- bill items linked to that PO line). match_status flags the specific kind
-- of discrepancy rather than a single pass/fail, since "vendor billed more
-- than delivered" and "vendor billed less than ordered" need different
-- follow-up action.
CREATE OR REPLACE FUNCTION get_po_three_way_match(p_company_id UUID, p_po_id UUID)
RETURNS TABLE (
  po_item_id      UUID,
  description     TEXT,
  ordered_qty     NUMERIC,
  received_qty    NUMERIC,
  billed_qty      NUMERIC,
  ordered_price   NUMERIC,
  billed_price    NUMERIC,
  match_status    TEXT
)
LANGUAGE sql
STABLE
SECURITY INVOKER
AS $$
  SELECT
    poi.id,
    poi.description,
    poi.quantity,
    poi.quantity_received,
    COALESCE(billed.qty, 0),
    poi.unit_price,
    billed.avg_price,
    CASE
      WHEN COALESCE(billed.qty, 0) = 0 THEN 'not_billed'
      WHEN COALESCE(billed.qty, 0) > poi.quantity_received THEN 'billed_exceeds_received'
      WHEN billed.avg_price IS NOT NULL AND ABS(billed.avg_price - poi.unit_price) > (poi.unit_price * 0.02) THEN 'price_mismatch'
      WHEN COALESCE(billed.qty, 0) < poi.quantity_received THEN 'partially_billed'
      ELSE 'matched'
    END
  FROM purchase_order_items poi
  LEFT JOIN LATERAL (
    SELECT SUM(vbi.quantity_billed) AS qty, AVG(vbi.unit_price) AS avg_price
    FROM vendor_bill_items vbi
    JOIN vendor_bills vb ON vb.id = vbi.bill_id
    WHERE vbi.po_item_id = poi.id AND vb.deleted_at IS NULL
  ) billed ON TRUE
  WHERE poi.company_id = p_company_id
    AND poi.po_id = p_po_id
    AND poi.is_active = TRUE;
$$;

NOTIFY pgrst, 'reload schema';
