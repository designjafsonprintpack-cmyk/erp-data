-- ─── REPORT: JOB COSTING VARIANCE (Task 18) ───────────────────────────────────
-- One row per costed job: quoted vs actual cost vs margin, so Mehboob can see
-- which jobs overran their estimate and which customers/job-types are most
-- profitable. Read-only view over the existing job_costings + jobs tables —
-- no new columns, no change to the costing calculation itself.

CREATE OR REPLACE VIEW report_job_costing_variance AS
SELECT
  jc.id                                            AS costing_id,
  jc.company_id,
  jc.job_id,
  j.job_number,
  j.job_title,
  j.customer_id,
  c.name                                           AS customer_name,
  j.order_date,
  j.quantity,
  jc.quoted_amount,
  jc.total_cost,
  jc.margin_amount,
  jc.margin_pct,
  (jc.quoted_amount - jc.total_cost)               AS variance_amount,
  CASE
    WHEN jc.quoted_amount IS NULL OR jc.quoted_amount = 0 THEN NULL
    ELSE ROUND((((jc.quoted_amount - jc.total_cost) / jc.quoted_amount) * 100)::numeric, 2)
  END                                               AS variance_pct,
  CASE
    WHEN jc.quoted_amount IS NULL THEN 'not_quoted'
    WHEN jc.total_cost > jc.quoted_amount THEN 'over_budget'
    WHEN jc.total_cost < jc.quoted_amount THEN 'under_budget'
    ELSE 'on_budget'
  END                                               AS budget_status,
  jc.costed_at,
  jc.costed_by
FROM job_costings jc
JOIN jobs j       ON j.id = jc.job_id
LEFT JOIN customers c ON c.id = j.customer_id
WHERE jc.is_active = TRUE
  AND j.deleted_at IS NULL;

NOTIFY pgrst, 'reload schema';
