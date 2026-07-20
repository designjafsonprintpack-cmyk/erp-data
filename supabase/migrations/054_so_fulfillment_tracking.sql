-- ═══════════════════════════════════════════════════════════════════════════
-- SALES ORDERS — PARTIAL SHIPMENT / INVOICE TRACKING
-- ═══════════════════════════════════════════════════════════════════════════
-- Dispatched and invoiced quantities are derived, not stored — jobs already
-- link back to sales_order_items (jobs.sales_order_item_id), dispatch_items
-- and invoice_items already link to jobs. This just aggregates what already
-- exists rather than adding new columns that could drift out of sync with
-- the underlying dispatch/invoice records.
-- ═══════════════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION get_so_fulfillment(p_company_id UUID, p_sales_order_id UUID)
RETURNS TABLE (
  sales_order_item_id UUID,
  ordered_qty         NUMERIC,
  dispatched_qty      NUMERIC,
  invoiced_qty        NUMERIC
)
LANGUAGE sql
STABLE
SECURITY INVOKER
AS $$
  SELECT
    soi.id,
    soi.quantity,
    COALESCE((
      SELECT SUM(di.quantity_dispatched)
      FROM dispatch_items di
      JOIN dispatch_orders do_ ON do_.id = di.dispatch_id
      JOIN jobs j ON j.id = di.job_id
      WHERE j.sales_order_item_id = soi.id
        AND do_.status IN ('dispatched', 'delivered')
    ), 0) AS dispatched_qty,
    COALESCE((
      SELECT SUM(ii.quantity)
      FROM invoice_items ii
      JOIN invoices inv ON inv.id = ii.invoice_id
      JOIN jobs j ON j.id = ii.job_id
      WHERE j.sales_order_item_id = soi.id
        AND inv.status NOT IN ('draft', 'void', 'cancelled')
    ), 0) AS invoiced_qty
  FROM sales_order_items soi
  WHERE soi.company_id = p_company_id
    AND soi.sales_order_id = p_sales_order_id
    AND soi.is_active = TRUE;
$$;

NOTIFY pgrst, 'reload schema';
