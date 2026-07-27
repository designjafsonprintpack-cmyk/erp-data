-- ══════════════════════════════════════════════════════════════════════════════
-- JAFSON PRINT ERP — MIGRATION 101
-- "Jobs ko X ke hisaab se group karo" — one function, any dimension
--
-- WHY
--   Mehboob asked how many jobs are Box vs HL vs Sticker vs Label, and how many
--   each customer has. Both are recorded — box_type_id since 086, customer_id
--   always — and neither has ever been reportable, because every report in this
--   system is a hand-built view answering one fixed question.
--
--   So this is deliberately NOT another fixed report. It takes the grouping
--   column as a parameter, which means the next question ("kitne 4-colour jobs",
--   "kaunsi die sab se zyada chali", "repeat kitna hai") needs no new code.
--
--   Counts, quantity and sheet quantity together: a shop with 20 jobs of 500
--   boxes is not the same shop as one with 2 jobs of 5000, and a job count
--   alone hides that completely.
--
-- NOTE ON BLANKS
--   NULLs group under 'Not specified' rather than being dropped. 194 of the 478
--   legacy jobs have no box type — in the source spreadsheet too — and silently
--   omitting them would make the percentages lie.
--
-- SECURITY INVOKER, so RLS applies (matching 028's fix to the report views).
--
-- HOW TO UNDO
--   DROP FUNCTION get_job_breakdown(UUID, DATE, DATE, TEXT);
-- ══════════════════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION get_job_breakdown(
  p_company_id UUID,
  p_from       DATE,
  p_to         DATE,
  p_dimension  TEXT
) RETURNS TABLE (
  label      TEXT,
  jobs       BIGINT,
  quantity   NUMERIC,
  sheet_qty  NUMERIC
) AS $$
  SELECT
    COALESCE(NULLIF(TRIM(CASE p_dimension
      WHEN 'box_type'  THEN bt.name
      WHEN 'customer'  THEN c.name
      WHEN 'board'     THEN COALESCE(brd.name, pap.name)
      WHEN 'gsm'       THEN j.gsm::TEXT
      WHEN 'board_gsm' THEN CONCAT_WS(' ', COALESCE(brd.name, pap.name), NULLIF(j.gsm::TEXT, ''))
      WHEN 'colors'    THEN j.no_of_colors::TEXT
      WHEN 'uv_coating' THEN j.uv_coating
      WHEN 'lamination' THEN lam.name
      WHEN 'pasting'   THEN j.pasting
      WHEN 'die'       THEN j.die_number
      WHEN 'workflow'  THEN wt.name
      WHEN 'status'    THEN j.status
      WHEN 'repeat'    THEN CASE
                              WHEN j.is_repeat IS NOT TRUE      THEN 'New'
                              WHEN j.repeat_kind = 'changed'    THEN 'Repeat with Changes'
                              ELSE 'Repeat'
                            END
      WHEN 'qty_band'  THEN CASE
                              WHEN COALESCE(j.quantity, 0) <= 0     THEN NULL
                              WHEN j.quantity <   1000              THEN 'Under 1,000'
                              WHEN j.quantity <   5000              THEN '1,000 – 4,999'
                              WHEN j.quantity <  20000              THEN '5,000 – 19,999'
                              WHEN j.quantity <  50000              THEN '20,000 – 49,999'
                              WHEN j.quantity < 100000              THEN '50,000 – 99,999'
                              ELSE '100,000+'
                            END
      WHEN 'month'     THEN TO_CHAR(j.order_date, 'Mon YYYY')
      ELSE NULL
    END), ''), 'Not specified'),
    COUNT(*),
    COALESCE(SUM(j.quantity), 0)::NUMERIC,
    COALESCE(SUM(j.sheet_qty), 0)::NUMERIC
  FROM jobs j
  LEFT JOIN box_types          bt  ON bt.id  = j.box_type_id
  LEFT JOIN customers          c   ON c.id   = j.customer_id
  LEFT JOIN board_types        brd ON brd.id = j.board_type_id
  LEFT JOIN paper_types        pap ON pap.id = j.paper_type_id
  LEFT JOIN lamination_types   lam ON lam.id = j.lamination_type_id
  LEFT JOIN workflow_templates wt  ON wt.id  = j.workflow_template_id
  WHERE j.company_id = p_company_id
    AND j.deleted_at IS NULL
    AND j.order_date >= p_from
    AND j.order_date <= p_to
  GROUP BY 1
  ORDER BY 2 DESC, 1;
$$ LANGUAGE sql STABLE;

NOTIFY pgrst, 'reload schema';
