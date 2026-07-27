-- ══════════════════════════════════════════════════════════════════════════════
-- JAFSON PRINT ERP — MIGRATION 099
-- Where the money actually leaks: machine downtime, board consumption,
-- planned-vs-issued GSM, and what reprints cost
--
-- WHY
--   All four of these have had their data captured for a long time and none of
--   it has ever been reportable:
--     machine_downtime_log        (050) — never read by anything
--     material_requisition_items  (015) — board issued per job, only ever shown
--                                        one job at a time
--     jobs.gsm vs the issued GSM  (087) — the variance is visible on a single
--                                        Job Card; nobody could see the pattern
--     reprint_requests            (017) — counted in QC, never costed
--
--   Each is a period question ("is mahine kitna waste hua"), so each is a
--   function taking an explicit window, same pattern as migration 098.
--
--   All SECURITY INVOKER, so RLS still applies — matching 028's fix to the
--   report views.
--
-- HOW TO UNDO
--   DROP FUNCTION get_downtime_breakdown(UUID, DATE, DATE);
--   DROP FUNCTION get_board_consumption(UUID, DATE, DATE);
--   DROP FUNCTION get_gsm_variance(UUID, DATE, DATE);
--   DROP FUNCTION get_reprint_cost(UUID, DATE, DATE);
-- ══════════════════════════════════════════════════════════════════════════════

-- ─── MACHINE DOWNTIME, BY MACHINE × CATEGORY ──────────────────────────────────
-- The categories are the point. `material_shortage` and `no_operator` are not
-- machine faults at all — they say the press was fine and we failed to feed it.
-- Splitting those out from `breakdown` is what makes the number actionable.
CREATE OR REPLACE FUNCTION get_downtime_breakdown(
  p_company_id UUID,
  p_from       DATE,
  p_to         DATE
) RETURNS TABLE (
  machine_name   TEXT,
  category       TEXT,
  events         BIGINT,
  total_minutes  NUMERIC,
  avg_minutes    NUMERIC,
  still_down     BIGINT
) AS $$
  SELECT
    m.name,
    d.category,
    COUNT(*),
    -- duration_minutes is only filled in when the entry is CLOSED. An open
    -- breakdown would otherwise count as zero, which reads as "no problem"
    -- for the one machine that has been down longest. Run it forward to now.
    COALESCE(SUM(COALESCE(
      d.duration_minutes,
      EXTRACT(EPOCH FROM (NOW() - d.started_at)) / 60
    )), 0)::NUMERIC,
    COALESCE(AVG(COALESCE(
      d.duration_minutes,
      EXTRACT(EPOCH FROM (NOW() - d.started_at)) / 60
    )), 0)::NUMERIC,
    COUNT(*) FILTER (WHERE d.ended_at IS NULL)
  FROM machine_downtime_log d
  JOIN machines m ON m.id = d.machine_id
  WHERE d.company_id = p_company_id
    AND d.deleted_at IS NULL
    AND d.started_at >= p_from
    AND d.started_at < (p_to + 1)
  GROUP BY m.name, d.category
  ORDER BY 4 DESC;
$$ LANGUAGE sql STABLE;

-- ─── BOARD CONSUMPTION, BY BOARD TYPE × GSM ───────────────────────────────────
-- Sourced from what the store ACTUALLY issued (material_requisition_items),
-- not from what was planned — the same source jobIssuedGsm.ts uses, so this
-- report and the Job Card can never disagree.
--
-- NOTE: material_requisition_items has no deleted_at (line-item tables in this
-- schema don't — see CLAUDE.md §3), so it is filtered on is_active and on the
-- parent requisition's deleted_at instead.
CREATE OR REPLACE FUNCTION get_board_consumption(
  p_company_id UUID,
  p_from       DATE,
  p_to         DATE
) RETURNS TABLE (
  board_name     TEXT,
  gsm            NUMERIC,
  sheets_issued  NUMERIC,
  jobs_count     BIGINT,
  issue_count    BIGINT,
  est_value      NUMERIC
) AS $$
  SELECT
    COALESCE(bt.name, bi.description, 'Unknown board'),
    bi.gsm::NUMERIC,
    COALESCE(SUM(mri.quantity_issued), 0)::NUMERIC,
    COUNT(DISTINCT mr.job_id),
    COUNT(*),
    COALESCE(SUM(mri.quantity_issued * COALESCE(bi.unit_cost, 0)), 0)::NUMERIC
  FROM material_requisition_items mri
  JOIN material_requisitions mr ON mr.id = mri.requisition_id
  LEFT JOIN board_inventory bi  ON bi.id = mri.board_item_id
  LEFT JOIN board_types bt      ON bt.id = bi.board_type_id
  WHERE mr.company_id = p_company_id
    AND mr.deleted_at IS NULL
    AND mri.is_active
    AND mri.quantity_issued > 0
    AND mr.created_at >= p_from
    AND mr.created_at < (p_to + 1)
  GROUP BY COALESCE(bt.name, bi.description, 'Unknown board'), bi.gsm
  ORDER BY 3 DESC;
$$ LANGUAGE sql STABLE;

-- ─── PLANNED vs ISSUED GSM ────────────────────────────────────────────────────
-- One row per job where the weight that ran differs from the weight that was
-- planned (and therefore quoted and approved). This is the audit trail
-- described in CLAUDE.md §4: planned is never overwritten by actual, and the
-- gap between them is the record of purchasing substituting a cheaper board.
-- Only jobs with an actual difference are returned — a matching job is not news.
CREATE OR REPLACE FUNCTION get_gsm_variance(
  p_company_id UUID,
  p_from       DATE,
  p_to         DATE
) RETURNS TABLE (
  job_id         UUID,
  job_number     TEXT,
  job_title      TEXT,
  customer_name  TEXT,
  order_date     DATE,
  planned_gsm    NUMERIC,
  issued_gsm     NUMERIC,
  sheets_issued  NUMERIC,
  gsm_diff       NUMERIC
) AS $$
  SELECT
    j.id, j.job_number, j.job_title, c.name, j.order_date,
    j.gsm::NUMERIC,
    bi.gsm::NUMERIC,
    COALESCE(SUM(mri.quantity_issued), 0)::NUMERIC,
    (bi.gsm - j.gsm)::NUMERIC
  FROM jobs j
  JOIN material_requisitions mr      ON mr.job_id = j.id AND mr.deleted_at IS NULL
  JOIN material_requisition_items mri ON mri.requisition_id = mr.id AND mri.is_active
  JOIN board_inventory bi            ON bi.id = mri.board_item_id
  LEFT JOIN customers c              ON c.id = j.customer_id
  WHERE j.company_id = p_company_id
    AND j.deleted_at IS NULL
    AND j.gsm IS NOT NULL
    AND bi.gsm IS NOT NULL
    AND bi.gsm <> j.gsm
    AND mri.quantity_issued > 0
    AND j.order_date >= p_from
    AND j.order_date <= p_to
  GROUP BY j.id, j.job_number, j.job_title, c.name, j.order_date, j.gsm, bi.gsm
  ORDER BY ABS(bi.gsm - j.gsm) DESC, j.order_date DESC;
$$ LANGUAGE sql STABLE;

-- ─── WHAT REPRINTS COST ───────────────────────────────────────────────────────
-- A reprint is work done twice and billed once. QC already counts them; this
-- attaches the money. The cost comes from the REPRINT job's costing, not the
-- original's — the original was going to be made anyway.
--
-- reprint_job_id is NULL until the reprint is actually raised, so those rows
-- return a NULL cost rather than being dropped: a pending reprint is still a
-- committed loss and should stay visible.
CREATE OR REPLACE FUNCTION get_reprint_cost(
  p_company_id UUID,
  p_from       DATE,
  p_to         DATE
) RETURNS TABLE (
  reprint_id           UUID,
  original_job_id      UUID,
  original_job_number  TEXT,
  original_job_title   TEXT,
  customer_name        TEXT,
  reprint_job_number   TEXT,
  reason               TEXT,
  status               TEXT,
  quantity             NUMERIC,
  reprint_cost         NUMERIC,
  requested_at         TIMESTAMPTZ
) AS $$
  SELECT
    rr.id, oj.id, oj.job_number, oj.job_title, c.name,
    rj.job_number,
    rr.reason, rr.status, rr.quantity::NUMERIC,
    jc.total_cost,
    rr.created_at
  FROM reprint_requests rr
  JOIN jobs oj          ON oj.id = rr.original_job_id
  LEFT JOIN jobs rj     ON rj.id = rr.reprint_job_id
  LEFT JOIN customers c ON c.id = oj.customer_id
  -- Costings are soft-deletable since 092, so a removed costing must not
  -- resurface here as a real cost.
  LEFT JOIN job_costings jc ON jc.job_id = rr.reprint_job_id AND jc.deleted_at IS NULL
  WHERE rr.company_id = p_company_id
    AND rr.deleted_at IS NULL
    AND rr.created_at >= p_from
    AND rr.created_at < (p_to + 1)
  ORDER BY rr.created_at DESC;
$$ LANGUAGE sql STABLE;

NOTIFY pgrst, 'reload schema';
