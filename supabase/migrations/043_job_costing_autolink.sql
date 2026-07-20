-- ══════════════════════════════════════════════════════════════════════════════
-- JAFSON PRINT ERP — MIGRATION 043: JOB COSTING AUTO-LINK
--
-- job_costings was a fully manual sheet — nothing wrote to it except the
-- Finance costing form. This adds an atomic accrual function that other
-- modules call whenever an ACTUAL cost is incurred against a job:
--   • Store issues material against an MRN linked to a job (board/paper/ink/
--     lamination/foil consumption at board_inventory.unit_cost)
--   • A new plate is made for a job (plates.cost)
--   • A stored plate is reused for a (repeat) job (no cost, but still counts
--     toward printing_plates so the sheet reflects how many plates ran)
--
-- The function is additive/idempotent-safe: it upserts a job_costings row on
-- first call, adds the delta to the right bucket, then recomputes
-- overhead_amount / total_cost / margin fresh from the current bucket values
-- (never from a stale total_cost), so repeated calls can't double-count.
-- Values it writes remain fully editable afterwards from the manual Finance
-- costing form — that form's Save still overwrites with whatever's on screen,
-- which is pre-filled from this same row.
-- ══════════════════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION apply_job_actual_cost(
  p_company_id    UUID,
  p_job_id        UUID,
  p_bucket        TEXT,               -- 'board','printing','plate','ink','lamination','foiling','uv','die_cutting','pasting','other'
  p_amount        NUMERIC DEFAULT 0,  -- cost delta to add to that bucket
  p_sheets_delta  NUMERIC DEFAULT NULL,
  p_plates_delta  INTEGER DEFAULT NULL
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY INVOKER
AS $$
BEGIN
  IF p_bucket NOT IN ('board','printing','plate','ink','lamination','foiling','uv','die_cutting','pasting','other') THEN
    RAISE EXCEPTION 'apply_job_actual_cost: unknown bucket %', p_bucket;
  END IF;

  INSERT INTO job_costings (company_id, job_id)
  VALUES (p_company_id, p_job_id)
  ON CONFLICT (company_id, job_id) DO NOTHING;

  UPDATE job_costings SET
    board_cost       = board_cost + CASE WHEN p_bucket = 'board'    THEN p_amount ELSE 0 END,
    board_sheets     = COALESCE(board_sheets, 0) + COALESCE(p_sheets_delta, 0),
    printing_cost    = printing_cost + CASE WHEN p_bucket = 'printing' THEN p_amount ELSE 0 END,
    printing_plates  = COALESCE(printing_plates, 0) + COALESCE(p_plates_delta, 0),
    plate_cost       = COALESCE(plate_cost, 0) + CASE WHEN p_bucket = 'plate'      THEN p_amount ELSE 0 END,
    ink_cost         = COALESCE(ink_cost, 0)  + CASE WHEN p_bucket = 'ink'         THEN p_amount ELSE 0 END,
    lamination_cost  = COALESCE(lamination_cost, 0) + CASE WHEN p_bucket = 'lamination' THEN p_amount ELSE 0 END,
    foiling_cost     = COALESCE(foiling_cost, 0)    + CASE WHEN p_bucket = 'foiling'    THEN p_amount ELSE 0 END,
    uv_cost          = COALESCE(uv_cost, 0)         + CASE WHEN p_bucket = 'uv'         THEN p_amount ELSE 0 END,
    die_cutting_cost = COALESCE(die_cutting_cost, 0) + CASE WHEN p_bucket = 'die_cutting' THEN p_amount ELSE 0 END,
    pasting_cost     = COALESCE(pasting_cost, 0)    + CASE WHEN p_bucket = 'pasting'    THEN p_amount ELSE 0 END,
    other_finishing  = COALESCE(other_finishing, 0) + CASE WHEN p_bucket = 'other'      THEN p_amount ELSE 0 END,
    updated_at       = NOW()
  WHERE company_id = p_company_id AND job_id = p_job_id;

  -- Recompute overhead fresh from current direct-cost buckets (not additive).
  UPDATE job_costings jc SET
    overhead_amount = ROUND((
      jc.board_cost + jc.printing_cost + COALESCE(jc.plate_cost,0) + COALESCE(jc.ink_cost,0) +
      COALESCE(jc.lamination_cost,0) + COALESCE(jc.foiling_cost,0) + COALESCE(jc.uv_cost,0) +
      COALESCE(jc.die_cutting_cost,0) + COALESCE(jc.pasting_cost,0) + COALESCE(jc.other_finishing,0) +
      COALESCE(jc.labour_cost,0)
    ) * COALESCE(jc.overhead_pct, 0) / 100, 2)
  WHERE jc.company_id = p_company_id AND jc.job_id = p_job_id;

  -- Recompute total_cost + margin fresh from current buckets + overhead.
  UPDATE job_costings jc SET
    total_cost = jc.board_cost + jc.printing_cost + COALESCE(jc.plate_cost,0) + COALESCE(jc.ink_cost,0) +
      COALESCE(jc.lamination_cost,0) + COALESCE(jc.foiling_cost,0) + COALESCE(jc.uv_cost,0) +
      COALESCE(jc.die_cutting_cost,0) + COALESCE(jc.pasting_cost,0) + COALESCE(jc.other_finishing,0) +
      COALESCE(jc.labour_cost,0) + COALESCE(jc.overhead_amount,0),
    margin_amount = CASE WHEN jc.quoted_amount IS NOT NULL THEN
      jc.quoted_amount - (jc.board_cost + jc.printing_cost + COALESCE(jc.plate_cost,0) + COALESCE(jc.ink_cost,0) +
        COALESCE(jc.lamination_cost,0) + COALESCE(jc.foiling_cost,0) + COALESCE(jc.uv_cost,0) +
        COALESCE(jc.die_cutting_cost,0) + COALESCE(jc.pasting_cost,0) + COALESCE(jc.other_finishing,0) +
        COALESCE(jc.labour_cost,0) + COALESCE(jc.overhead_amount,0))
      ELSE NULL END,
    margin_pct = CASE WHEN jc.quoted_amount IS NOT NULL AND jc.quoted_amount <> 0 THEN
      ROUND((jc.quoted_amount - (jc.board_cost + jc.printing_cost + COALESCE(jc.plate_cost,0) + COALESCE(jc.ink_cost,0) +
        COALESCE(jc.lamination_cost,0) + COALESCE(jc.foiling_cost,0) + COALESCE(jc.uv_cost,0) +
        COALESCE(jc.die_cutting_cost,0) + COALESCE(jc.pasting_cost,0) + COALESCE(jc.other_finishing,0) +
        COALESCE(jc.labour_cost,0) + COALESCE(jc.overhead_amount,0))) / jc.quoted_amount * 100, 2)
      ELSE NULL END
  WHERE jc.company_id = p_company_id AND jc.job_id = p_job_id;
END;
$$;

NOTIFY pgrst, 'reload schema';
