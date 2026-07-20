-- ═══════════════════════════════════════════════════════════════════════════
-- QC — DEFECT TREND ANALYTICS
-- ═══════════════════════════════════════════════════════════════════════════
-- Read-only aggregation over the existing qc_defects table — no new columns,
-- no new tables. Three cuts of the same data: by defect type, by severity,
-- and a weekly count for the trend line. All scoped to a date range so the
-- UI can offer "last 30/90 days" without re-querying everything.
-- ═══════════════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION get_qc_defect_trends(
  p_company_id UUID,
  p_date_from  DATE,
  p_date_to    DATE
)
RETURNS TABLE (
  by_type     JSONB,
  by_severity JSONB,
  by_week     JSONB,
  by_customer JSONB,
  total_defects  BIGINT,
  total_qty_affected NUMERIC
)
LANGUAGE sql
STABLE
SECURITY INVOKER
AS $$
  WITH base AS (
    SELECT d.*, j.customer_id, c.name AS customer_name
    FROM qc_defects d
    JOIN jobs j ON j.id = d.job_id
    LEFT JOIN customers c ON c.id = j.customer_id
    WHERE d.company_id = p_company_id
      AND d.deleted_at IS NULL
      AND d.created_at::date BETWEEN p_date_from AND p_date_to
  ),
  by_type AS (
    SELECT jsonb_agg(jsonb_build_object('defect_type', defect_type, 'count', cnt, 'qty_affected', qty) ORDER BY cnt DESC) AS j
    FROM (SELECT defect_type, COUNT(*) AS cnt, SUM(quantity_affected) AS qty FROM base GROUP BY defect_type) t
  ),
  by_severity AS (
    SELECT jsonb_agg(jsonb_build_object('severity', severity, 'count', cnt) ORDER BY
      CASE severity WHEN 'critical' THEN 1 WHEN 'major' THEN 2 ELSE 3 END) AS j
    FROM (SELECT severity, COUNT(*) AS cnt FROM base GROUP BY severity) t
  ),
  by_week AS (
    SELECT jsonb_agg(jsonb_build_object('week_start', week_start, 'count', cnt) ORDER BY week_start) AS j
    FROM (SELECT date_trunc('week', created_at)::date AS week_start, COUNT(*) AS cnt FROM base GROUP BY 1) t
  ),
  by_customer AS (
    SELECT jsonb_agg(jsonb_build_object('customer_name', COALESCE(customer_name, 'Unknown'), 'count', cnt) ORDER BY cnt DESC) AS j
    FROM (SELECT customer_name, COUNT(*) AS cnt FROM base GROUP BY customer_name ORDER BY COUNT(*) DESC LIMIT 10) t
  )
  SELECT
    COALESCE((SELECT j FROM by_type), '[]'::jsonb),
    COALESCE((SELECT j FROM by_severity), '[]'::jsonb),
    COALESCE((SELECT j FROM by_week), '[]'::jsonb),
    COALESCE((SELECT j FROM by_customer), '[]'::jsonb),
    (SELECT COUNT(*) FROM base),
    (SELECT COALESCE(SUM(quantity_affected), 0) FROM base);
$$;

NOTIFY pgrst, 'reload schema';
