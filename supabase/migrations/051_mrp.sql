-- ═══════════════════════════════════════════════════════════════════════════
-- MRP — MATERIAL REQUIREMENT PLANNING
-- ═══════════════════════════════════════════════════════════════════════════
-- Board demand is aggregated by board_type_id (the material catalog entry —
-- jobs.board_type_id), not by a specific board_inventory lot, since a job
-- doesn't commit to one physical stock lot until material is actually
-- issued via an MRN. Stock and incoming-PO quantities are then summed
-- across every board_inventory row that shares that board_type_id, since
-- a board type can have multiple lots/sizes in stock at once.
--
-- This is read-only reporting (a function, not a table) — there is nothing
-- to migrate for existing data, and the numbers are always computed fresh
-- from jobs/board_inventory/purchase_order_items rather than cached, so
-- they can never drift out of sync with the underlying data the way a
-- materialized snapshot could.
-- ═══════════════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION get_mrp_summary(p_company_id UUID)
RETURNS TABLE (
  board_type_id   UUID,
  board_type_name TEXT,
  gsm             INTEGER,
  demand_sheets   NUMERIC,
  stock_sheets    NUMERIC,
  incoming_sheets NUMERIC,
  shortfall_sheets NUMERIC,
  reorder_level   NUMERIC,
  open_job_count  INTEGER
)
LANGUAGE sql
STABLE
SECURITY INVOKER
AS $$
  WITH demand AS (
    -- Open jobs (not yet completed/dispatched/cancelled) with a known board
    -- type and a computed sheet quantity. sheet_qty is the same field the
    -- job costing engine and printing floor already use — no separate
    -- "material required" figure exists per job, this reuses it.
    SELECT
      j.board_type_id,
      SUM(COALESCE(j.sheet_qty, 0)) AS demand_sheets,
      COUNT(*)::INTEGER AS open_job_count
    FROM jobs j
    WHERE j.company_id = p_company_id
      AND j.deleted_at IS NULL
      AND j.board_type_id IS NOT NULL
      AND j.status NOT IN ('completed', 'dispatched', 'cancelled')
    GROUP BY j.board_type_id
  ),
  stock AS (
    SELECT
      bi.board_type_id,
      SUM(bi.current_stock - bi.reserved_stock) AS stock_sheets,
      MAX(bi.reorder_level) AS reorder_level
    FROM board_inventory bi
    WHERE bi.company_id = p_company_id
      AND bi.deleted_at IS NULL
      AND bi.is_active = TRUE
      AND bi.board_type_id IS NOT NULL
    GROUP BY bi.board_type_id
  ),
  incoming AS (
    -- Board already on order but not yet received — counted so MRP doesn't
    -- suggest re-ordering material that's already inbound.
    SELECT
      bi.board_type_id,
      SUM(poi.quantity - poi.quantity_received) AS incoming_sheets
    FROM purchase_order_items poi
    JOIN purchase_orders po ON po.id = poi.po_id
    JOIN board_inventory bi ON bi.id = poi.board_item_id
    WHERE poi.company_id = p_company_id
      AND po.status NOT IN ('received', 'cancelled')
      AND poi.quantity > poi.quantity_received
      AND bi.board_type_id IS NOT NULL
    GROUP BY bi.board_type_id
  )
  SELECT
    bt.id,
    bt.name,
    bt.gsm,
    COALESCE(d.demand_sheets, 0),
    COALESCE(s.stock_sheets, 0),
    COALESCE(i.incoming_sheets, 0),
    GREATEST(0, COALESCE(d.demand_sheets, 0) - COALESCE(s.stock_sheets, 0) - COALESCE(i.incoming_sheets, 0)),
    COALESCE(s.reorder_level, 0),
    COALESCE(d.open_job_count, 0)
  FROM board_types bt
  LEFT JOIN demand   d ON d.board_type_id = bt.id
  LEFT JOIN stock    s ON s.board_type_id = bt.id
  LEFT JOIN incoming i ON i.board_type_id = bt.id
  WHERE bt.company_id = p_company_id
    AND bt.deleted_at IS NULL
    -- Only surface types with either open demand or existing stock —
    -- an unused board type with neither is noise, not a planning signal.
    AND (COALESCE(d.demand_sheets, 0) > 0 OR COALESCE(s.stock_sheets, 0) > 0)
  ORDER BY GREATEST(0, COALESCE(d.demand_sheets, 0) - COALESCE(s.stock_sheets, 0) - COALESCE(i.incoming_sheets, 0)) DESC;
$$;

NOTIFY pgrst, 'reload schema';
