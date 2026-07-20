-- ═══════════════════════════════════════════════════════════════════════════
-- FINANCE — ACCOUNTS RECEIVABLE AGING REPORT
-- ═══════════════════════════════════════════════════════════════════════════
-- Buckets every unpaid/partially-paid invoice by how overdue it is,
-- grouped by customer. Read-only aggregation over the existing invoices
-- table (balance_due, due_date already tracked) — no new columns.
-- ═══════════════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION get_ar_aging_report(p_company_id UUID)
RETURNS TABLE (
  customer_id     UUID,
  customer_name   TEXT,
  current_amt     NUMERIC,   -- not yet due
  days_1_30       NUMERIC,
  days_31_60      NUMERIC,
  days_61_90      NUMERIC,
  days_over_90    NUMERIC,
  total_due       NUMERIC,
  oldest_invoice_date DATE
)
LANGUAGE sql
STABLE
SECURITY INVOKER
AS $$
  WITH open_invoices AS (
    SELECT
      i.customer_id,
      i.balance_due,
      i.due_date,
      i.invoice_date,
      COALESCE(CURRENT_DATE - i.due_date, 0) AS days_overdue
    FROM invoices i
    WHERE i.company_id = p_company_id
      AND i.deleted_at IS NULL
      AND i.status NOT IN ('draft', 'void', 'cancelled')
      AND i.balance_due > 0
  )
  SELECT
    c.id,
    c.name,
    COALESCE(SUM(oi.balance_due) FILTER (WHERE oi.days_overdue <= 0), 0),
    COALESCE(SUM(oi.balance_due) FILTER (WHERE oi.days_overdue BETWEEN 1 AND 30), 0),
    COALESCE(SUM(oi.balance_due) FILTER (WHERE oi.days_overdue BETWEEN 31 AND 60), 0),
    COALESCE(SUM(oi.balance_due) FILTER (WHERE oi.days_overdue BETWEEN 61 AND 90), 0),
    COALESCE(SUM(oi.balance_due) FILTER (WHERE oi.days_overdue > 90), 0),
    COALESCE(SUM(oi.balance_due), 0),
    MIN(oi.invoice_date)
  FROM open_invoices oi
  JOIN customers c ON c.id = oi.customer_id
  GROUP BY c.id, c.name
  HAVING COALESCE(SUM(oi.balance_due), 0) > 0
  ORDER BY COALESCE(SUM(oi.balance_due), 0) DESC;
$$;

-- ─── ACCOUNTS PAYABLE — SIMPLER VIEW ─────────────────────────────────────────
-- vendor_bills (056) doesn't track payment status/balance per bill the way
-- invoices does for AR, so this uses the supplier ledger's running balance
-- per vendor instead — total owed, not bucketed by invoice age. A true
-- per-bill AP aging would need a paid_amount/balance_due column added to
-- vendor_bills first; noted as a follow-up rather than guessed at here.
CREATE OR REPLACE FUNCTION get_ap_summary(p_company_id UUID)
RETURNS TABLE (
  vendor_id    UUID,
  vendor_name  TEXT,
  balance_owed NUMERIC
)
LANGUAGE sql
STABLE
SECURITY INVOKER
AS $$
  WITH latest AS (
    SELECT DISTINCT ON (vendor_id) vendor_id, balance_after
    FROM supplier_ledger_entries
    WHERE company_id = p_company_id AND deleted_at IS NULL
    ORDER BY vendor_id, entry_date DESC, created_at DESC
  )
  SELECT v.id, v.name, l.balance_after
  FROM latest l
  JOIN vendors v ON v.id = l.vendor_id
  WHERE l.balance_after > 0
  ORDER BY l.balance_after DESC;
$$;

NOTIFY pgrst, 'reload schema';
