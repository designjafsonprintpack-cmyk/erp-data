-- ═══════════════════════════════════════════════════════════════════════════
-- FINANCE — DASHBOARD SUMMARY TOTALS
-- ═══════════════════════════════════════════════════════════════════════════
-- WHAT WAS BROKEN
--   dashboard/finance/page.tsx summed Total Billed / Collected / Outstanding /
--   Overdue in JavaScript, from the SAME array it handed the invoice list —
--   an array capped by .limit(). So the four headline figures were really
--   "totals of the most recent N invoices", not totals. At the old limit of 50
--   they silently went wrong on invoice 51; the cap is now 200, which only
--   moves the cliff. Monthly Collected had the opposite problem: it fetched
--   every payment row of the last 30 days just to add up one column.
--
-- WHY THIS FIXES IT
--   Postgres does the SUM over the whole table and returns a single row, so
--   the figures are exact at any invoice count and the page stops shipping
--   rows it only wanted to add up. Same shape as get_ar_aging_report (058):
--   SECURITY INVOKER, so RLS still scopes every read to the caller's company —
--   p_company_id narrows, it does not grant.
--
-- HOW TO UNDO
--   DROP FUNCTION get_finance_summary(UUID);
--   ...and revert the page to its JS reduce(). Additive: this creates one
--   function and alters no table, so nothing else depends on it.
--
-- NOTE — the metric definitions below are a FAITHFUL copy of what the page
--   already did, deliberately. That means 'void', 'cancelled' and 'draft'
--   invoices are still counted in Total Billed, exactly as before. Whether a
--   voided invoice should count as billed is a business decision, not a bug
--   fix, so it is NOT changed here. To exclude them later, add to both of the
--   first two SUMs:  FILTER (WHERE i.status NOT IN ('void','cancelled','draft'))
-- ═══════════════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION get_finance_summary(p_company_id UUID)
RETURNS TABLE (
  total_billed      NUMERIC,
  total_received    NUMERIC,
  total_overdue     NUMERIC,
  monthly_collected NUMERIC
)
LANGUAGE sql
STABLE
SECURITY INVOKER
AS $$
  SELECT
    COALESCE((
      SELECT SUM(i.total_amount) FROM invoices i
      WHERE i.company_id = p_company_id AND i.deleted_at IS NULL
    ), 0),
    COALESCE((
      SELECT SUM(i.paid_amount) FROM invoices i
      WHERE i.company_id = p_company_id AND i.deleted_at IS NULL
    ), 0),
    -- Mirrors the old JS test exactly:
    --   status === 'overdue' || (due_date < today && balance_due > 0)
    -- The status check stands alone because an invoice can be flagged overdue
    -- before its due date passes.
    COALESCE((
      SELECT SUM(i.balance_due) FROM invoices i
      WHERE i.company_id = p_company_id AND i.deleted_at IS NULL
        AND (
          i.status = 'overdue'
          OR (i.due_date IS NOT NULL AND i.due_date < CURRENT_DATE AND i.balance_due > 0)
        )
    ), 0),
    -- Last 30 days, matching the page's rolling window (not calendar month).
    COALESCE((
      SELECT SUM(p.amount) FROM payments p
      WHERE p.company_id = p_company_id AND p.deleted_at IS NULL
        AND p.payment_date >= CURRENT_DATE - INTERVAL '30 days'
    ), 0);
$$;

NOTIFY pgrst, 'reload schema';
