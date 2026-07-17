-- ══════════════════════════════════════════════════════════════════════════════
-- JAFSON PRINT ERP — MIGRATION 020: REPORTS & ANALYTICS
-- Phase 49 — Production Reports
-- Phase 50 — Customer & Sales Reports
-- Phase 51 — Financial Dashboard
-- Phase 52 — Analytics Overview
-- ══════════════════════════════════════════════════════════════════════════════

-- ─── REPORT: JOB TURNAROUND SUMMARY ──────────────────────────────────────────
-- Returns per-job timing data for production reports
CREATE OR REPLACE VIEW report_job_turnaround AS
SELECT
  j.id,
  j.company_id,
  j.job_number,
  j.job_title,
  j.status,
  j.priority,
  j.quantity,
  j.order_date,
  j.required_date,
  j.completed_date,
  c.name                                           AS customer_name,
  c.customer_code,
  wt.name                                          AS workflow_name,
  -- Turnaround days (order to completion)
  CASE
    WHEN j.completed_date IS NOT NULL
    THEN (j.completed_date - j.order_date)
  END                                              AS turnaround_days,
  -- Days late (positive = late, negative = early)
  CASE
    WHEN j.completed_date IS NOT NULL AND j.required_date IS NOT NULL
    THEN (j.completed_date - j.required_date)
  END                                              AS days_variance,
  -- On-time flag
  CASE
    WHEN j.completed_date IS NOT NULL AND j.required_date IS NOT NULL
    THEN j.completed_date <= j.required_date
    ELSE NULL
  END                                              AS delivered_on_time,
  -- Stage counts
  (SELECT COUNT(*) FROM job_stage_progress jsp WHERE jsp.job_id = j.id AND jsp.status = 'completed') AS stages_completed,
  (SELECT COUNT(*) FROM job_stage_progress jsp WHERE jsp.job_id = j.id) AS stages_total,
  -- QC result
  (SELECT result FROM qc_inspections qi WHERE qi.job_id = j.id AND qi.signed_off_at IS NOT NULL ORDER BY qi.inspection_no DESC LIMIT 1) AS qc_result,
  -- Dispatch info
  (SELECT do2.dispatched_at FROM dispatch_orders do2 JOIN dispatch_items di ON di.dispatch_id = do2.id WHERE di.job_id = j.id ORDER BY do2.dispatched_at LIMIT 1) AS dispatched_at,
  j.created_at,
  j.updated_at
FROM jobs j
LEFT JOIN customers c ON c.id = j.customer_id
LEFT JOIN workflow_templates wt ON wt.id = j.workflow_template_id
WHERE j.deleted_at IS NULL AND j.is_active = TRUE;

-- ─── REPORT: CUSTOMER SALES SUMMARY ──────────────────────────────────────────
CREATE OR REPLACE VIEW report_customer_sales AS
SELECT
  c.id                                             AS customer_id,
  c.company_id,
  c.name                                           AS customer_name,
  c.customer_code,
  c.industry,
  COUNT(DISTINCT j.id)                             AS total_jobs,
  COUNT(DISTINCT j.id) FILTER (WHERE j.status = 'completed')   AS completed_jobs,
  COUNT(DISTINCT j.id) FILTER (WHERE j.status = 'dispatched')  AS dispatched_jobs,
  COUNT(DISTINCT j.id) FILTER (WHERE j.status = 'cancelled')   AS cancelled_jobs,
  COALESCE(SUM(j.quoted_amount), 0)                AS total_quoted,
  COALESCE(SUM(inv.total_amount), 0)               AS total_invoiced,
  COALESCE(SUM(inv.paid_amount), 0)                AS total_paid,
  COALESCE(SUM(inv.balance_due), 0)                AS total_outstanding,
  COUNT(DISTINCT inv.id)                           AS invoice_count,
  MAX(j.created_at)                                AS last_job_date,
  MIN(j.created_at)                                AS first_job_date
FROM customers c
LEFT JOIN jobs j        ON j.customer_id = c.id AND j.deleted_at IS NULL
LEFT JOIN invoices inv  ON inv.customer_id = c.id AND inv.deleted_at IS NULL
WHERE c.deleted_at IS NULL AND c.is_active = TRUE
GROUP BY c.id, c.company_id, c.name, c.customer_code, c.industry;

-- ─── REPORT: MONTHLY PRODUCTION SUMMARY ──────────────────────────────────────
CREATE OR REPLACE VIEW report_monthly_production AS
SELECT
  j.company_id,
  DATE_TRUNC('month', j.created_at)               AS month,
  TO_CHAR(j.created_at, 'Mon YYYY')               AS month_label,
  COUNT(*)                                         AS jobs_created,
  COUNT(*) FILTER (WHERE j.status = 'completed')  AS jobs_completed,
  COUNT(*) FILTER (WHERE j.status = 'dispatched') AS jobs_dispatched,
  COUNT(*) FILTER (WHERE j.status = 'cancelled')  AS jobs_cancelled,
  COUNT(*) FILTER (WHERE j.status = 'on_hold')    AS jobs_on_hold,
  COALESCE(SUM(j.quantity), 0)                    AS total_quantity,
  COALESCE(SUM(j.quoted_amount), 0)               AS total_quoted_value,
  -- Avg turnaround for completed jobs
  AVG(CASE WHEN j.completed_date IS NOT NULL THEN (j.completed_date - j.order_date) END) AS avg_turnaround_days,
  -- On-time delivery rate
  ROUND(
    100.0 * COUNT(*) FILTER (
      WHERE j.completed_date IS NOT NULL
        AND j.required_date IS NOT NULL
        AND j.completed_date <= j.required_date
    ) / NULLIF(COUNT(*) FILTER (WHERE j.completed_date IS NOT NULL AND j.required_date IS NOT NULL), 0),
    1
  )                                                AS on_time_pct
FROM jobs j
WHERE j.deleted_at IS NULL
GROUP BY j.company_id, DATE_TRUNC('month', j.created_at), TO_CHAR(j.created_at, 'Mon YYYY')
ORDER BY month DESC;

-- ─── REPORT: FINANCIAL SUMMARY ────────────────────────────────────────────────
CREATE OR REPLACE VIEW report_financial_summary AS
SELECT
  inv.company_id,
  DATE_TRUNC('month', inv.invoice_date)            AS month,
  TO_CHAR(inv.invoice_date, 'Mon YYYY')            AS month_label,
  COUNT(*)                                         AS invoice_count,
  COALESCE(SUM(inv.total_amount), 0)               AS total_invoiced,
  COALESCE(SUM(inv.paid_amount), 0)                AS total_collected,
  COALESCE(SUM(inv.balance_due), 0)                AS total_outstanding,
  COUNT(*) FILTER (WHERE inv.status = 'paid')      AS fully_paid,
  COUNT(*) FILTER (WHERE inv.status = 'partial')   AS partially_paid,
  COUNT(*) FILTER (WHERE inv.status = 'overdue'
    OR (inv.due_date < CURRENT_DATE AND inv.balance_due > 0)) AS overdue_count,
  COALESCE(SUM(inv.balance_due) FILTER (
    WHERE inv.due_date < CURRENT_DATE AND inv.balance_due > 0
  ), 0)                                            AS overdue_amount
FROM invoices inv
WHERE inv.deleted_at IS NULL
GROUP BY inv.company_id, DATE_TRUNC('month', inv.invoice_date), TO_CHAR(inv.invoice_date, 'Mon YYYY')
ORDER BY month DESC;

-- ─── REPORT: MACHINE UTILIZATION ─────────────────────────────────────────────
CREATE OR REPLACE VIEW report_machine_utilization AS
SELECT
  m.id                                             AS machine_id,
  m.company_id,
  m.name                                           AS machine_name,
  m.machine_type,
  COUNT(pa.id)                                     AS total_assignments,
  COUNT(pa.id) FILTER (WHERE pa.status = 'completed')  AS completed,
  COUNT(pa.id) FILTER (WHERE pa.status = 'running')    AS currently_running,
  COUNT(pa.id) FILTER (WHERE pa.status = 'queued')     AS queued,
  COALESCE(SUM(pa.actual_minutes) FILTER (WHERE pa.status = 'completed'), 0) AS total_actual_minutes,
  COALESCE(SUM(pa.estimated_minutes), 0)           AS total_estimated_minutes,
  COALESCE(AVG(pa.actual_minutes) FILTER (WHERE pa.status = 'completed'), 0) AS avg_job_minutes
FROM machines m
LEFT JOIN production_assignments pa ON pa.machine_id = m.id AND pa.deleted_at IS NULL
WHERE m.is_active = TRUE
GROUP BY m.id, m.company_id, m.name, m.machine_type;

-- ─── REPORT: QC DEFECT ANALYSIS ──────────────────────────────────────────────
-- Aggregates qc_inspections and reprint_requests independently (each to one
-- row per company+month) before joining, so a job with multiple reprints
-- can't fan out and inflate the inspection/defect counts, and a reprint is
-- always attributed to the month it was actually requested.
CREATE OR REPLACE VIEW report_qc_analysis AS
WITH inspections_agg AS (
  SELECT
    qi.company_id,
    DATE_TRUNC('month', qi.created_at)              AS month,
    TO_CHAR(qi.created_at, 'Mon YYYY')              AS month_label,
    COUNT(*)                                         AS total_inspections,
    COUNT(*) FILTER (WHERE qi.result = 'pass')       AS passed,
    COUNT(*) FILTER (WHERE qi.result = 'fail')       AS failed,
    COUNT(*) FILTER (WHERE qi.result = 'conditional_pass') AS conditional,
    ROUND(
      100.0 * COUNT(*) FILTER (WHERE qi.result = 'pass')
      / NULLIF(COUNT(*) FILTER (WHERE qi.result IS NOT NULL), 0), 1
    )                                                AS pass_rate_pct,
    COALESCE(SUM(qi.defect_count), 0)               AS total_defects
  FROM qc_inspections qi
  WHERE qi.deleted_at IS NULL
  GROUP BY qi.company_id, DATE_TRUNC('month', qi.created_at), TO_CHAR(qi.created_at, 'Mon YYYY')
),
reprints_agg AS (
  SELECT
    rpr.company_id,
    DATE_TRUNC('month', rpr.created_at) AS month,
    COUNT(*)                            AS reprint_requests
  FROM reprint_requests rpr
  WHERE rpr.deleted_at IS NULL
  GROUP BY rpr.company_id, DATE_TRUNC('month', rpr.created_at)
)
SELECT
  ia.company_id,
  ia.month,
  ia.month_label,
  ia.total_inspections,
  ia.passed,
  ia.failed,
  ia.conditional,
  ia.pass_rate_pct,
  ia.total_defects,
  COALESCE(ra.reprint_requests, 0) AS reprint_requests
FROM inspections_agg ia
LEFT JOIN reprints_agg ra ON ra.company_id = ia.company_id AND ra.month = ia.month
ORDER BY ia.month DESC;

-- ─── ANALYTICS FUNCTION: DASHBOARD KPIs ──────────────────────────────────────
CREATE OR REPLACE FUNCTION get_dashboard_kpis(p_company_id UUID, p_days INTEGER DEFAULT 30)
RETURNS JSON AS $$
DECLARE
  result JSON;
  since_date DATE := CURRENT_DATE - p_days;
BEGIN
  SELECT json_build_object(
    'period_days', p_days,
    'jobs', json_build_object(
      'total',       (SELECT COUNT(*) FROM jobs WHERE company_id = p_company_id AND deleted_at IS NULL AND created_at >= since_date),
      'completed',   (SELECT COUNT(*) FROM jobs WHERE company_id = p_company_id AND status = 'completed' AND created_at >= since_date),
      'in_progress', (SELECT COUNT(*) FROM jobs WHERE company_id = p_company_id AND status = 'in_progress'),
      'on_hold',     (SELECT COUNT(*) FROM jobs WHERE company_id = p_company_id AND status = 'on_hold'),
      'overdue',     (SELECT COUNT(*) FROM jobs WHERE company_id = p_company_id AND status NOT IN ('completed','dispatched','cancelled') AND required_date < CURRENT_DATE AND required_date IS NOT NULL)
    ),
    'revenue', json_build_object(
      'invoiced',    COALESCE((SELECT SUM(total_amount) FROM invoices WHERE company_id = p_company_id AND deleted_at IS NULL AND invoice_date >= since_date), 0),
      'collected',   COALESCE((SELECT SUM(paid_amount) FROM invoices WHERE company_id = p_company_id AND deleted_at IS NULL AND invoice_date >= since_date), 0),
      'outstanding', COALESCE((SELECT SUM(balance_due) FROM invoices WHERE company_id = p_company_id AND deleted_at IS NULL AND balance_due > 0), 0),
      'overdue',     COALESCE((SELECT SUM(balance_due) FROM invoices WHERE company_id = p_company_id AND deleted_at IS NULL AND balance_due > 0 AND due_date < CURRENT_DATE), 0)
    ),
    'production', json_build_object(
      'machines_running', (SELECT COUNT(*) FROM production_assignments WHERE company_id = p_company_id AND status = 'running' AND deleted_at IS NULL),
      'dispatched_today', (SELECT COUNT(*) FROM dispatch_orders WHERE company_id = p_company_id AND DATE(dispatched_at) = CURRENT_DATE),
      'qc_pass_rate',     COALESCE((SELECT ROUND(100.0 * COUNT(*) FILTER (WHERE result = 'pass') / NULLIF(COUNT(*),0), 1) FROM qc_inspections WHERE company_id = p_company_id AND created_at >= since_date), 0)
    ),
    'top_customers', (
      SELECT json_agg(row_to_json(t)) FROM (
        SELECT c.name, COUNT(j.id) AS job_count, COALESCE(SUM(j.quoted_amount),0) AS value
        FROM customers c
        JOIN jobs j ON j.customer_id = c.id AND j.company_id = p_company_id AND j.created_at >= since_date
        WHERE c.company_id = p_company_id
        GROUP BY c.id, c.name ORDER BY job_count DESC LIMIT 5
      ) t
    )
  ) INTO result;
  RETURN result;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

NOTIFY pgrst, 'reload schema';
