-- ═══════════════════════════════════════════════════════════════════════════
-- INVENTORY — BATCH/LOT TRACKING ON BOARD STOCK
-- ═══════════════════════════════════════════════════════════════════════════
-- Tracks WHICH received batch a piece of board stock came from (vendor,
-- date, cost, lot/batch number) — the traceability question a printing
-- shop actually needs answered when a customer complains about board
-- quality: "which delivery was this from?"
--
-- SCOPE NOTE: lots are created and decremented for the two receipt/issue
-- paths this phase touches directly — PO receiving and manual Stock In/Out
-- on the Board Inventory page. MRN material issuance (032) and job wastage
-- still only move the aggregate board_inventory.current_stock, the same as
-- before this migration — they do not yet decrement a specific lot's
-- quantity_remaining. Wiring every consumption path to FIFO-deduct from
-- lots is a larger follow-up; this phase adds the traceability data
-- structure and the two highest-value entry points without touching the
-- already-working MRN/wastage consumption logic.
-- ═══════════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS board_inventory_lots (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id        UUID NOT NULL REFERENCES companies(id),
  board_item_id     UUID NOT NULL REFERENCES board_inventory(id) ON DELETE CASCADE,
  lot_number        TEXT NOT NULL,
  vendor_id         UUID REFERENCES vendors(id),
  reference_type    TEXT,                          -- 'purchase_order' | 'manual' | 'opening_stock'
  reference_id      UUID,
  received_date     DATE NOT NULL DEFAULT CURRENT_DATE,
  quantity_received NUMERIC(12,2) NOT NULL,
  quantity_remaining NUMERIC(12,2) NOT NULL,
  unit_cost         NUMERIC(12,4),
  notes             TEXT,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_by UUID, updated_by UUID, deleted_at TIMESTAMPTZ,
  is_active  BOOLEAN NOT NULL DEFAULT TRUE,
  CHECK (quantity_remaining >= 0 AND quantity_remaining <= quantity_received)
);

CREATE INDEX IF NOT EXISTS idx_bil_item ON board_inventory_lots(board_item_id, received_date);
CREATE INDEX IF NOT EXISTS idx_bil_open ON board_inventory_lots(board_item_id) WHERE quantity_remaining > 0;
DROP TRIGGER IF EXISTS trg_bil_upd ON board_inventory_lots;
CREATE TRIGGER trg_bil_upd BEFORE UPDATE ON board_inventory_lots
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
ALTER TABLE board_inventory_lots ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS bil_tenant ON board_inventory_lots;
CREATE POLICY bil_tenant ON board_inventory_lots
  USING (company_id = (auth.jwt() ->> 'company_id')::UUID)
  WITH CHECK (company_id = (auth.jwt() ->> 'company_id')::UUID);
DROP TRIGGER IF EXISTS trg_audit_bil ON board_inventory_lots;
CREATE TRIGGER trg_audit_bil AFTER INSERT OR UPDATE OR DELETE ON board_inventory_lots
  FOR EACH ROW EXECUTE FUNCTION log_audit_event();

-- FIFO consumption across lots for a manual Stock Out — oldest received_date
-- first. Row-locks the lots it touches so two concurrent stock-outs can't
-- both deduct from the same lot past its remaining quantity.
CREATE OR REPLACE FUNCTION consume_board_lots_fifo(
  p_company_id  UUID,
  p_board_item_id UUID,
  p_quantity    NUMERIC
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY INVOKER
AS $$
DECLARE
  v_lot RECORD;
  v_remaining_to_consume NUMERIC := p_quantity;
  v_take NUMERIC;
BEGIN
  FOR v_lot IN
    SELECT id, quantity_remaining
    FROM board_inventory_lots
    WHERE company_id = p_company_id AND board_item_id = p_board_item_id
      AND quantity_remaining > 0 AND deleted_at IS NULL
    ORDER BY received_date, created_at
    FOR UPDATE
  LOOP
    EXIT WHEN v_remaining_to_consume <= 0;
    v_take := LEAST(v_lot.quantity_remaining, v_remaining_to_consume);
    UPDATE board_inventory_lots SET quantity_remaining = quantity_remaining - v_take WHERE id = v_lot.id;
    v_remaining_to_consume := v_remaining_to_consume - v_take;
  END LOOP;
  -- If demand exceeds all known lots (e.g. stock predates this feature),
  -- the excess is simply not attributed to any lot — the aggregate
  -- board_inventory.current_stock (updated separately by the caller) is
  -- still the source of truth for total quantity; lots are a traceability
  -- layer on top of it, not a replacement for it.
END;
$$;

NOTIFY pgrst, 'reload schema';
