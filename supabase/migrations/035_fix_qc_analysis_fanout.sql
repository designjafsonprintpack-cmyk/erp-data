-- ══════════════════════════════════════════════════════════════════════════════
-- JAFSON PRINT ERP — MIGRATION 035: FIX report_qc_analysis FAN-OUT BUG
--
-- The view LEFT JOINed reprint_requests to qc_inspections on job_id alone (no
-- date or inspection linkage). Two problems:
--
-- 1. Fan-out: if a job had more than one reprint_request, that job's
--    inspection row was duplicated once per matching reprint BEFORE the
--    GROUP BY/aggregation ran — inflating total_inspections, passed, failed,
--    conditional, pass_rate_pct, and total_defects (COUNT(DISTINCT rpr.id)
--    only protected the reprint_requests count itself, not the other
--    aggregates in the same row).
-- 2. Misattribution: a job's reprint could get counted against every month
--    that job happened to have an inspection in, not the month the reprint
--    was actually requested.
--
-- Fix: aggregate qc_inspections and reprint_requests independently (each to
-- one row per company+month) before joining, so neither side can fan out
-- the other.
-- ══════════════════════════════════════════════════════════════════════════════

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

ALTER VIEW report_qc_analysis SET (security_invoker = true);

NOTIFY pgrst, 'reload schema';
