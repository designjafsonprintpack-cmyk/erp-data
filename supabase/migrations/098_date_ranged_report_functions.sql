-- ══════════════════════════════════════════════════════════════════════════════
-- JAFSON PRINT ERP — MIGRATION 098
-- Date-ranged report functions — so Reports & Analytics can answer any period
--
-- THE GAP
--   The Reports page was hardcoded to the last 30 days (page.tsx: `const days
--   = 30`) with no picker, so "March 2026" or "last year" could not be asked
--   for at all. Adding a picker is not enough on its own, because three of the
--   report sources physically cannot be filtered by date:
--
--     report_customer_sales      aggregates ALL TIME per customer — no date
--                                column exists to filter on.
--     report_machine_utilization same: one all-time row per machine.
--     report_wastage_summary     grouped to whole months, so "this week" or
--                                any part-month range is impossible.
--     get_dashboard_kpis(...)    takes p_days, so it can only ever look
--                                BACKWARDS FROM TODAY — never at a past window.
--
--   Filtering those in the app would silently return the same numbers whatever
--   range was picked, which is worse than not offering the picker.
--
-- WHAT THIS ADDS
--   Four functions taking an explicit (p_from, p_to) window. Same output shape
--   as the view each one replaces, so the UI code stays the same.
--
--   The existing views are deliberately LEFT IN PLACE and untouched —
--   /api/v1/reports still selects from them, and they are what the scheduled
--   report jobs read. This migration only adds a way to ask for a period.
--
--   All four are SECURITY INVOKER (the default), matching the
--   `ALTER VIEW ... SET (security_invoker = true)` fix migration 028 applied to
--   the report views: they must run with the caller's RLS, never bypass it.
--
-- HOW TO UNDO
--   DROP FUNCTION get_customer_sales_range(UUID, DATE, DATE);
--   DROP FUNCTION get_machine_utilization_range(UUID, DATE, DATE);
--   DROP FUNCTION get_wastage_breakdown(UUID, DATE, DATE);
--   DROP FUNCTION get_dashboard_kpis_range(UUID, DATE, DATE);
-- ══════════════════════════════════════════════════════════════════════════════

-- ─── CUSTOMER SALES, FOR A PERIOD ─────────────────────────────────────────────
-- Mirrors report_customer_sales, including its two-CTE shape: jobs and
-- invoices are aggregated separately before being joined, so a customer with
-- several of each cannot fan out and inflate the SUMs.
CREATE OR REPLACE FUNCTION get_customer_sales_range(
  p_company_id UUID,
  p_from       DATE,
  p_to         DATE
) RETURNS TABLE (
  customer_id       UUID,
  customer_name     TEXT,
  customer_code     TEXT,
  industry          TEXT,
  total_jobs        BIGINT,
  completed_jobs    BIGINT,
  dispatched_jobs   BIGINT,
  cancelled_jobs    BIGINT,
  total_quoted      NUMERIC,
  total_invoiced    NUMERIC,
  total_paid        NUMERIC,
  total_outstanding NUMERIC,
  invoice_count     BIGINT
) AS $$
  WITH jobs_agg AS (
    SELECT
      j.customer_id AS cid,
      COUNT(*)                                        AS total_jobs,
      COUNT(*) FILTER (WHERE j.status = 'completed')  AS completed_jobs,
      COUNT(*) FILTER (WHERE j.status = 'dispatched') AS dispatched_jobs,
      COUNT(*) FILTER (WHERE j.status = 'cancelled')  AS cancelled_jobs,
      COALESCE(SUM(j.quoted_amount), 0)               AS total_quoted
    FROM jobs j
    WHERE j.company_id = p_company_id
      AND j.deleted_at IS NULL
      AND j.created_at >= p_from
      AND j.created_at < (p_to + 1)
    GROUP BY j.customer_id
  ),
  invoices_agg AS (
    SELECT
      inv.customer_id AS cid,
      COALESCE(SUM(inv.total_amount), 0) AS total_invoiced,
      COALESCE(SUM(inv.paid_amount), 0)  AS total_paid,
      COALESCE(SUM(inv.balance_due), 0)  AS total_outstanding,
      COUNT(*)                           AS invoice_count
    FROM invoices inv
    WHERE inv.company_id = p_company_id
      AND inv.deleted_at IS NULL
      AND inv.invoice_date >= p_from
      AND inv.invoice_date <= p_to
    GROUP BY inv.customer_id
  )
  SELECT
    c.id, c.name, c.customer_code, c.industry,
    COALESCE(ja.total_jobs, 0),
    COALESCE(ja.completed_jobs, 0),
    COALESCE(ja.dispatched_jobs, 0),
    COALESCE(ja.cancelled_jobs, 0),
    COALESCE(ja.total_quoted, 0),
    COALESCE(ia.total_invoiced, 0),
    COALESCE(ia.total_paid, 0),
    COALESCE(ia.total_outstanding, 0),
    COALESCE(ia.invoice_count, 0)
  FROM customers c
  LEFT JOIN jobs_agg ja     ON ja.cid = c.id
  LEFT JOIN invoices_agg ia ON ia.cid = c.id
  WHERE c.company_id = p_company_id
    AND c.deleted_at IS NULL
    AND c.is_active = TRUE
    -- A customer with no activity in the window is noise on a period report.
    AND (ja.cid IS NOT NULL OR ia.cid IS NOT NULL)
  ORDER BY COALESCE(ja.total_jobs, 0) DESC;
$$ LANGUAGE sql STABLE;

-- ─── MACHINE UTILIZATION, FOR A PERIOD ────────────────────────────────────────
CREATE OR REPLACE FUNCTION get_machine_utilization_range(
  p_company_id UUID,
  p_from       DATE,
  p_to         DATE
) RETURNS TABLE (
  machine_id             UUID,
  machine_name           TEXT,
  machine_type           TEXT,
  total_assignments      BIGINT,
  completed              BIGINT,
  currently_running      BIGINT,
  queued                 BIGINT,
  total_actual_minutes   NUMERIC,
  total_estimated_minutes NUMERIC,
  avg_job_minutes        NUMERIC
) AS $$
  SELECT
    m.id, m.name, m.machine_type,
    COUNT(pa.id),
    COUNT(pa.id) FILTER (WHERE pa.status = 'completed'),
    COUNT(pa.id) FILTER (WHERE pa.status = 'running'),
    COUNT(pa.id) FILTER (WHERE pa.status = 'queued'),
    COALESCE(SUM(pa.actual_minutes) FILTER (WHERE pa.status = 'completed'), 0),
    COALESCE(SUM(pa.estimated_minutes), 0),
    COALESCE(AVG(pa.actual_minutes) FILTER (WHERE pa.status = 'completed'), 0)
  FROM machines m
  LEFT JOIN production_assignments pa
    ON pa.machine_id = m.id
   AND pa.deleted_at IS NULL
   AND pa.created_at >= p_from
   AND pa.created_at < (p_to + 1)
  WHERE m.company_id = p_company_id
    AND m.deleted_at IS NULL
    AND m.is_active = TRUE
  GROUP BY m.id, m.name, m.machine_type
  ORDER BY COUNT(pa.id) DESC;
$$ LANGUAGE sql STABLE;

-- ─── WASTAGE BREAKDOWN, FOR A PERIOD ──────────────────────────────────────────
-- report_wastage_summary is grouped to whole months. This drops the month and
-- groups by what actually drives the number on the floor: why it happened and
-- which machine it happened on. Both are what a print shop acts on — makeready
-- waste on one press is a setup problem, running waste is a different one.
CREATE OR REPLACE FUNCTION get_wastage_breakdown(
  p_company_id UUID,
  p_from       DATE,
  p_to         DATE
) RETURNS TABLE (
  reason_category TEXT,
  reason_name     TEXT,
  machine_name    TEXT,
  wastage_events  BIGINT,
  total_quantity  NUMERIC,
  jobs_affected   BIGINT
) AS $$
  SELECT
    wr.category,
    wr.name,
    COALESCE(m.name, 'No machine'),
    COUNT(*),
    COALESCE(SUM(jw.quantity), 0),
    COUNT(DISTINCT jw.job_id)
  FROM job_wastage jw
  JOIN wastage_reasons wr ON wr.id = jw.wastage_reason_id
  LEFT JOIN machines m    ON m.id = jw.machine_id
  WHERE jw.company_id = p_company_id
    AND jw.deleted_at IS NULL
    AND jw.occurred_at >= p_from
    AND jw.occurred_at < (p_to + 1)
  GROUP BY wr.category, wr.name, COALESCE(m.name, 'No machine')
  ORDER BY COALESCE(SUM(jw.quantity), 0) DESC;
$$ LANGUAGE sql STABLE;

-- ─── DASHBOARD KPIs, FOR A PERIOD ─────────────────────────────────────────────
-- Same JSON shape as get_dashboard_kpis so the UI reads it identically, but
-- windowed instead of "last N days from today". The three genuinely live
-- figures — in_progress, on_hold, machines_running — stay AS OF NOW on purpose:
-- "how many jobs were in progress during March" is not a question anyone asks,
-- and answering it from current status would be wrong anyway.
CREATE OR REPLACE FUNCTION get_dashboard_kpis_range(
  p_company_id UUID,
  p_from       DATE,
  p_to         DATE
) RETURNS JSON AS $$
  SELECT json_build_object(
    'from', p_from,
    'to',   p_to,
    'jobs', json_build_object(
      'total',       (SELECT COUNT(*) FROM jobs WHERE company_id = p_company_id AND deleted_at IS NULL AND created_at >= p_from AND created_at < (p_to + 1)),
      'completed',   (SELECT COUNT(*) FROM jobs WHERE company_id = p_company_id AND deleted_at IS NULL AND status = 'completed' AND created_at >= p_from AND created_at < (p_to + 1)),
      'in_progress', (SELECT COUNT(*) FROM jobs WHERE company_id = p_company_id AND deleted_at IS NULL AND status = 'in_progress'),
      'on_hold',     (SELECT COUNT(*) FROM jobs WHERE company_id = p_company_id AND deleted_at IS NULL AND status = 'on_hold'),
      'overdue',     (SELECT COUNT(*) FROM jobs WHERE company_id = p_company_id AND deleted_at IS NULL AND status NOT IN ('completed','dispatched','cancelled') AND required_date IS NOT NULL AND required_date < CURRENT_DATE)
    ),
    'revenue', json_build_object(
      'invoiced',    COALESCE((SELECT SUM(total_amount) FROM invoices WHERE company_id = p_company_id AND deleted_at IS NULL AND invoice_date >= p_from AND invoice_date <= p_to), 0),
      'collected',   COALESCE((SELECT SUM(paid_amount)  FROM invoices WHERE company_id = p_company_id AND deleted_at IS NULL AND invoice_date >= p_from AND invoice_date <= p_to), 0),
      'outstanding', COALESCE((SELECT SUM(balance_due)  FROM invoices WHERE company_id = p_company_id AND deleted_at IS NULL AND balance_due > 0), 0),
      'overdue',     COALESCE((SELECT SUM(balance_due)  FROM invoices WHERE company_id = p_company_id AND deleted_at IS NULL AND balance_due > 0 AND due_date < CURRENT_DATE), 0)
    ),
    'production', json_build_object(
      'machines_running', (SELECT COUNT(*) FROM production_assignments WHERE company_id = p_company_id AND status = 'running' AND deleted_at IS NULL),
      'dispatched_today', (SELECT COUNT(*) FROM dispatch_orders WHERE company_id = p_company_id AND DATE(dispatched_at) = CURRENT_DATE),
      'qc_pass_rate',     COALESCE((SELECT ROUND(100.0 * COUNT(*) FILTER (WHERE result = 'pass') / NULLIF(COUNT(*),0), 1) FROM qc_inspections WHERE company_id = p_company_id AND created_at >= p_from AND created_at < (p_to + 1)), 0)
    ),
    'wastage', json_build_object(
      'total_quantity', COALESCE((SELECT SUM(quantity) FROM job_wastage WHERE company_id = p_company_id AND deleted_at IS NULL AND occurred_at >= p_from AND occurred_at < (p_to + 1)), 0),
      'events',         (SELECT COUNT(*) FROM job_wastage WHERE company_id = p_company_id AND deleted_at IS NULL AND occurred_at >= p_from AND occurred_at < (p_to + 1))
    ),
    'on_time', json_build_object(
      'delivered',   (SELECT COUNT(*) FROM jobs WHERE company_id = p_company_id AND deleted_at IS NULL AND completed_date IS NOT NULL AND required_date IS NOT NULL AND completed_date >= p_from AND completed_date <= p_to),
      'on_time',     (SELECT COUNT(*) FROM jobs WHERE company_id = p_company_id AND deleted_at IS NULL AND completed_date IS NOT NULL AND required_date IS NOT NULL AND completed_date <= required_date AND completed_date >= p_from AND completed_date <= p_to)
    ),
    'top_customers', (
      SELECT json_agg(row_to_json(t)) FROM (
        SELECT c.name, COUNT(j.id) AS job_count, COALESCE(SUM(j.quoted_amount),0) AS value
        FROM customers c
        JOIN jobs j ON j.customer_id = c.id AND j.deleted_at IS NULL
                   AND j.created_at >= p_from AND j.created_at < (p_to + 1)
        WHERE c.company_id = p_company_id
        GROUP BY c.id, c.name ORDER BY COUNT(j.id) DESC LIMIT 5
      ) t
    )
  );
$$ LANGUAGE sql STABLE;

NOTIFY pgrst, 'reload schema';
