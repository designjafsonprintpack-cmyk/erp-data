-- ═══════════════════════════════════════════════════════════════════════════
-- MACHINE CYCLE-TIME ANALYTICS (Task 45 — data foundation for scheduling)
-- ═══════════════════════════════════════════════════════════════════════════
-- Read-only aggregation over the existing production_assignments table — no
-- new columns, no new tables. actual_minutes has been captured on every
-- completed assignment since migration 016; this just surfaces the average/
-- min/max per machine + workflow stage so a "standard time" reference can be
-- derived from real historical performance instead of a manually-maintained
-- table that immediately goes stale. Same SECURITY INVOKER + STABLE pattern
-- as get_qc_defect_trends (migration 057).
-- ═══════════════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION get_machine_cycle_times(
  p_company_id UUID,
  p_days       INTEGER DEFAULT 90
)
RETURNS TABLE (
  machine_id   UUID,
  machine_name TEXT,
  stage_name   TEXT,
  sample_count BIGINT,
  avg_minutes  NUMERIC,
  min_minutes  INTEGER,
  max_minutes  INTEGER
)
LANGUAGE sql
STABLE
SECURITY INVOKER
AS $$
  SELECT
    pa.machine_id,
    m.name AS machine_name,
    ws.name AS stage_name,
    COUNT(*) AS sample_count,
    ROUND(AVG(pa.actual_minutes), 1) AS avg_minutes,
    MIN(pa.actual_minutes) AS min_minutes,
    MAX(pa.actual_minutes) AS max_minutes
  FROM production_assignments pa
  JOIN machines m ON m.id = pa.machine_id
  LEFT JOIN job_stage_progress jsp ON jsp.id = pa.stage_progress_id
  LEFT JOIN workflow_stages ws ON ws.id = jsp.workflow_stage_id
  WHERE pa.company_id = p_company_id
    AND pa.status = 'completed'
    AND pa.actual_minutes IS NOT NULL
    AND pa.deleted_at IS NULL
    AND pa.actual_end >= NOW() - (p_days || ' days')::INTERVAL
  GROUP BY pa.machine_id, m.name, ws.name
  ORDER BY m.name, ws.name;
$$;

NOTIFY pgrst, 'reload schema';
