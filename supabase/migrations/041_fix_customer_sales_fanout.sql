-- ══════════════════════════════════════════════════════════════════════════════
-- JAFSON PRINT ERP — MIGRATION 041: FIX report_customer_sales FAN-OUT BUG
--
-- The view LEFT JOINed both jobs AND invoices to the same customers row in
-- one query. That's two independent one-to-many relationships joined to the
-- same parent — for a customer with, say, 3 jobs and 2 invoices, the join
-- produces 3 × 2 = 6 rows before the GROUP BY runs.
--
-- COUNT(DISTINCT j.id) / COUNT(DISTINCT inv.id) were protected from this by
-- DISTINCT, but SUM(j.quoted_amount), SUM(inv.total_amount),
-- SUM(inv.paid_amount), and SUM(inv.balance_due) were NOT — each job's
-- quoted_amount got summed once per invoice row it was paired with (and vice
-- versa), so Total Quoted / Total Invoiced / Total Paid / Total Outstanding
-- were all inflated for any customer with more than one job AND more than
-- one invoice — a very common case.
--
-- Fix: aggregate jobs and invoices independently (each to one row per
-- customer) before joining, so neither side can fan out the other — same
-- pattern used to fix report_qc_analysis in migration 035.
-- ══════════════════════════════════════════════════════════════════════════════

CREATE OR REPLACE VIEW report_customer_sales AS
WITH jobs_agg AS (
  SELECT
    j.customer_id,
    COUNT(*)                                              AS total_jobs,
    COUNT(*) FILTER (WHERE j.status = 'completed')        AS completed_jobs,
    COUNT(*) FILTER (WHERE j.status = 'dispatched')        AS dispatched_jobs,
    COUNT(*) FILTER (WHERE j.status = 'cancelled')          AS cancelled_jobs,
    COALESCE(SUM(j.quoted_amount), 0)                     AS total_quoted,
    MAX(j.created_at)                                     AS last_job_date,
    MIN(j.created_at)                                     AS first_job_date
  FROM jobs j
  WHERE j.deleted_at IS NULL
  GROUP BY j.customer_id
),
invoices_agg AS (
  SELECT
    inv.customer_id,
    COALESCE(SUM(inv.total_amount), 0)  AS total_invoiced,
    COALESCE(SUM(inv.paid_amount), 0)   AS total_paid,
    COALESCE(SUM(inv.balance_due), 0)   AS total_outstanding,
    COUNT(*)                            AS invoice_count
  FROM invoices inv
  WHERE inv.deleted_at IS NULL
  GROUP BY inv.customer_id
)
SELECT
  c.id                                              AS customer_id,
  c.company_id,
  c.name                                            AS customer_name,
  c.customer_code,
  c.industry,
  COALESCE(ja.total_jobs, 0)                        AS total_jobs,
  COALESCE(ja.completed_jobs, 0)                    AS completed_jobs,
  COALESCE(ja.dispatched_jobs, 0)                   AS dispatched_jobs,
  COALESCE(ja.cancelled_jobs, 0)                    AS cancelled_jobs,
  COALESCE(ja.total_quoted, 0)                      AS total_quoted,
  COALESCE(ia.total_invoiced, 0)                    AS total_invoiced,
  COALESCE(ia.total_paid, 0)                        AS total_paid,
  COALESCE(ia.total_outstanding, 0)                 AS total_outstanding,
  COALESCE(ia.invoice_count, 0)                     AS invoice_count,
  ja.last_job_date,
  ja.first_job_date
FROM customers c
LEFT JOIN jobs_agg ja     ON ja.customer_id = c.id
LEFT JOIN invoices_agg ia ON ia.customer_id = c.id
WHERE c.deleted_at IS NULL AND c.is_active = TRUE;

ALTER VIEW report_customer_sales SET (security_invoker = true);

NOTIFY pgrst, 'reload schema';
