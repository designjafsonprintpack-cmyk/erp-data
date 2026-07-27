-- ══════════════════════════════════════════════════════════════════════════════
-- JAFSON PRINT ERP — MIGRATION 102
-- Ink consumption per job, and A/B/C shifts
--
-- WHY
--   The last two things Reports could not answer, both because the data was
--   never captured rather than never reported:
--
--   INK — `ink_types` has been a master table since 007 and nothing has ever
--   recorded a gram of usage against a job. job_costings.ink_cost is a single
--   number somebody types in at costing time; it is an estimate, not a
--   measurement, and it can't be broken down by colour, job or press.
--
--   SHIFT — the shop runs A, B and C. The database had no concept of a shift at
--   all, so "which shift wastes the most" was unanswerable.
--
-- DESIGN NOTES
--   job_ink_usage deliberately mirrors job_wastage (028) field for field:
--   same optional stage_progress_id and machine_id, same recorded_by /
--   occurred_at, same soft delete. The operator already records wastage from
--   Job Detail, so ink is recorded in the same place the same way — a second,
--   different-shaped flow for the same person on the same screen is how
--   capture stops happening.
--
--   Quantity is kg. Ink is bought and issued by weight in this trade, so
--   grams-vs-kg guessing is removed by naming the column for its unit.
--
--   `shift` is an explicit column, NOT derived from occurred_at. Shift timings
--   change, get swapped and run over; a timestamp rule would silently
--   re-attribute months of history the day someone moves the boundary.
--   Nullable everywhere — existing rows have no shift and must not be
--   invented.
--
-- HOW TO UNDO
--   DROP FUNCTION get_ink_consumption(UUID, DATE, DATE);
--   DROP FUNCTION get_shift_performance(UUID, DATE, DATE);
--   DROP TABLE job_ink_usage;
--   ALTER TABLE job_wastage DROP COLUMN shift;
--   ALTER TABLE production_assignments DROP COLUMN shift;
--   (and restore the previous job_stage_events_event_type_check — the list
--    before this migration is in 069)
-- ══════════════════════════════════════════════════════════════════════════════

-- ─── 1. INK USAGE ─────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS job_ink_usage (
  id                 UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id         UUID NOT NULL REFERENCES companies(id),
  job_id             UUID NOT NULL REFERENCES jobs(id) ON DELETE CASCADE,
  stage_progress_id  UUID REFERENCES job_stage_progress(id),
  machine_id         UUID REFERENCES machines(id),
  ink_type_id        UUID NOT NULL REFERENCES ink_types(id),
  quantity_kg        NUMERIC(12,3) NOT NULL CHECK (quantity_kg > 0),
  shift              TEXT CHECK (shift IN ('A','B','C')),
  notes              TEXT,
  recorded_by        UUID REFERENCES users(id),
  occurred_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_at         TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at         TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_by UUID, updated_by UUID, deleted_at TIMESTAMPTZ,
  is_active  BOOLEAN NOT NULL DEFAULT TRUE
);

CREATE INDEX IF NOT EXISTS idx_job_ink_job     ON job_ink_usage(job_id, occurred_at DESC);
CREATE INDEX IF NOT EXISTS idx_job_ink_company ON job_ink_usage(company_id, occurred_at DESC);
CREATE INDEX IF NOT EXISTS idx_job_ink_machine ON job_ink_usage(machine_id);

DROP TRIGGER IF EXISTS trg_job_ink_upd ON job_ink_usage;
CREATE TRIGGER trg_job_ink_upd BEFORE UPDATE ON job_ink_usage
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

ALTER TABLE job_ink_usage ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS job_ink_usage_tenant ON job_ink_usage;
CREATE POLICY job_ink_usage_tenant ON job_ink_usage
  USING (company_id = (auth.jwt() ->> 'company_id')::UUID)
  WITH CHECK (company_id = (auth.jwt() ->> 'company_id')::UUID);

DROP TRIGGER IF EXISTS trg_audit_job_ink_usage ON job_ink_usage;
CREATE TRIGGER trg_audit_job_ink_usage AFTER INSERT OR UPDATE OR DELETE ON job_ink_usage
  FOR EACH ROW EXECUTE FUNCTION log_audit_event();

-- ─── 2. SHIFT ON THE THINGS THAT HAPPEN ON A SHIFT ────────────────────────────
ALTER TABLE job_wastage
  ADD COLUMN IF NOT EXISTS shift TEXT;
ALTER TABLE production_assignments
  ADD COLUMN IF NOT EXISTS shift TEXT;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'job_wastage_shift_check') THEN
    ALTER TABLE job_wastage ADD CONSTRAINT job_wastage_shift_check
      CHECK (shift IS NULL OR shift IN ('A','B','C'));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'production_assignments_shift_check') THEN
    ALTER TABLE production_assignments ADD CONSTRAINT production_assignments_shift_check
      CHECK (shift IS NULL OR shift IN ('A','B','C'));
  END IF;
END $$;

-- ─── 3. LET INK SHOW UP IN THE JOB TIMELINE ───────────────────────────────────
-- Same rewrite 028 and 069 did — the full list has to be restated, so this
-- carries every value 069 allowed plus the new one.
ALTER TABLE job_stage_events DROP CONSTRAINT IF EXISTS job_stage_events_event_type_check;
ALTER TABLE job_stage_events ADD CONSTRAINT job_stage_events_event_type_check
  CHECK (event_type IN (
    'created','status_changed','stage_started','stage_completed',
    'stage_skipped','hold_started','hold_ended','remark_added',
    'artwork_uploaded','repeat_created','assigned','priority_changed',
    'wastage_recorded','plate_assigned','plate_returned',
    'artwork_status_changed','ink_recorded'
  ));

-- ─── 4. INK CONSUMPTION REPORT ────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION get_ink_consumption(
  p_company_id UUID,
  p_from       DATE,
  p_to         DATE
) RETURNS TABLE (
  ink_name      TEXT,
  color_code    TEXT,
  machine_name  TEXT,
  entries       BIGINT,
  total_kg      NUMERIC,
  jobs_affected BIGINT
) AS $$
  SELECT
    it.name,
    it.color_code,
    COALESCE(m.name, 'No machine'),
    COUNT(*),
    COALESCE(SUM(iu.quantity_kg), 0)::NUMERIC,
    COUNT(DISTINCT iu.job_id)
  FROM job_ink_usage iu
  JOIN ink_types it    ON it.id = iu.ink_type_id
  LEFT JOIN machines m ON m.id = iu.machine_id
  WHERE iu.company_id = p_company_id
    AND iu.deleted_at IS NULL
    AND iu.occurred_at >= p_from
    AND iu.occurred_at < (p_to + 1)
  GROUP BY it.name, it.color_code, COALESCE(m.name, 'No machine')
  ORDER BY 5 DESC;
$$ LANGUAGE sql STABLE;

-- ─── 5. SHIFT PERFORMANCE REPORT ──────────────────────────────────────────────
-- Three independent aggregates joined on the shift letter rather than one big
-- join: a shift with 40 assignments and 5 wastage entries would otherwise fan
-- out and multiply both numbers.
CREATE OR REPLACE FUNCTION get_shift_performance(
  p_company_id UUID,
  p_from       DATE,
  p_to         DATE
) RETURNS TABLE (
  shift            TEXT,
  assignments      BIGINT,
  completed        BIGINT,
  run_minutes      NUMERIC,
  jobs_worked      BIGINT,
  wastage_events   BIGINT,
  wastage_quantity NUMERIC,
  ink_kg           NUMERIC
) AS $$
  WITH s AS (SELECT unnest(ARRAY['A','B','C']) AS sh),
  asg AS (
    SELECT pa.shift AS sh,
           COUNT(*) AS assignments,
           COUNT(*) FILTER (WHERE pa.status = 'completed') AS completed,
           COALESCE(SUM(pa.actual_minutes), 0) AS run_minutes,
           COUNT(DISTINCT pa.job_id) AS jobs_worked
    FROM production_assignments pa
    WHERE pa.company_id = p_company_id AND pa.deleted_at IS NULL
      AND pa.shift IS NOT NULL
      AND pa.created_at >= p_from AND pa.created_at < (p_to + 1)
    GROUP BY pa.shift
  ),
  wst AS (
    SELECT jw.shift AS sh, COUNT(*) AS events, COALESCE(SUM(jw.quantity), 0) AS qty
    FROM job_wastage jw
    WHERE jw.company_id = p_company_id AND jw.deleted_at IS NULL
      AND jw.shift IS NOT NULL
      AND jw.occurred_at >= p_from AND jw.occurred_at < (p_to + 1)
    GROUP BY jw.shift
  ),
  ink AS (
    SELECT iu.shift AS sh, COALESCE(SUM(iu.quantity_kg), 0) AS kg
    FROM job_ink_usage iu
    WHERE iu.company_id = p_company_id AND iu.deleted_at IS NULL
      AND iu.shift IS NOT NULL
      AND iu.occurred_at >= p_from AND iu.occurred_at < (p_to + 1)
    GROUP BY iu.shift
  )
  SELECT
    s.sh,
    COALESCE(asg.assignments, 0),
    COALESCE(asg.completed, 0),
    COALESCE(asg.run_minutes, 0)::NUMERIC,
    COALESCE(asg.jobs_worked, 0),
    COALESCE(wst.events, 0),
    COALESCE(wst.qty, 0)::NUMERIC,
    COALESCE(ink.kg, 0)::NUMERIC
  FROM s
  LEFT JOIN asg ON asg.sh = s.sh
  LEFT JOIN wst ON wst.sh = s.sh
  LEFT JOIN ink ON ink.sh = s.sh
  ORDER BY s.sh;
$$ LANGUAGE sql STABLE;

NOTIFY pgrst, 'reload schema';
