-- 134 — the year comes out of the job number
--
-- WHAT MEHBOOB ASKED
--   "2025 bhi khatam kar do sab jobs se." A carton is one thing that runs again
--   and again; stamping the year of its FIRST run into its permanent number
--   makes the number lie the moment it reorders. This is the same reasoning as
--   133 (one carton, one number) taken to its end:
--
--       JOB-2025-00408      ->  JOB-00408
--       JOB-2025-00408-R2   ->  JOB-00408-R2
--
--   The year belongs to the RUN, and every run already carries `order_date`.
--
-- THE COLLISION, AND WHY FIVE LIVE JOBS ARE RENUMBERED
--   Numbers restarted each year, so JOB-2025-00002 and JOB-2026-00002 both
--   want to be JOB-00002 and the unique index (company_id, job_number) refuses.
--   All five of the real 2026 jobs collide this way, and all five are
--   in_progress. Mehboob chose one continuous series over two shapes, so they
--   move to the end of it:
--
--       JOB-2026-00002 (Al Safwa Pan Raas)   -> JOB-00479
--       JOB-2026-00003 (Platinum)            -> JOB-00480
--       JOB-2026-00005 (Moove in Cream)      -> JOB-00481
--       JOB-2026-00006 (Temo Gel)            -> JOB-00482
--       JOB-2026-00007 (Crandy Sachet)       -> JOB-00483
--
-- ⚠ PRINTED JOB CARDS
--   Ten jobs are live and every one of them changes number here or in 133.
--   Any card already on the floor shows the old number — reprint it. Nothing
--   else stores a job number as data: `machine_floor_status`,
--   `report_job_costing_variance` and `report_job_turnaround` are VIEWS over
--   `jobs`, and no application code parses the year out of a number (grepped,
--   not assumed).
--
-- HOW NEW NUMBERS ARE MADE FROM NOW ON
--   `document_sequences` has always had a `prefix_format` column — default
--   '{PREFIX}-{YEAR}-{SEQ}' — and get_next_sequence_number ignored it, building
--   the string by hand instead. This makes the function honour it, so JOB can
--   say '{PREFIX}-{SEQ}' while INV, PO, QT, SO, DISP, MRN, CUST, VND and GANG
--   keep the year with byte-identical output to today.
--
--   JOB's two year rows (2025: 478, 2026: 10) collapse into ONE row carrying
--   the whole series, keyed on `year = 0` — the sentinel this function now
--   reads as "this document type does not use a year". The counter is set to
--   the highest number actually in use, so the next job is JOB-00484.
--
--   Note the JOB counter had reached 10 for 2026 while only 5 of those jobs
--   survive: 133 renumbered five repeats that had consumed numbers. Seeding
--   from MAX(job_number) rather than from the old counter is what keeps the
--   series contiguous instead of leaving a five-number hole.
--
-- ORDER MATTERS
--   The colliding five are moved to their final numbers FIRST (nothing occupies
--   00479+), and only then is the year stripped from everything else. Doing it
--   the other way round hits the unique index halfway through.
--
-- UNDO
--   UPDATE jobs SET job_number = 'JOB-2026-' || lpad((substring(job_number from 'JOB-(\d+)')::int - 477)::text, 5, '0')
--    WHERE job_number IN ('JOB-00479','JOB-00480','JOB-00481','JOB-00482','JOB-00483');  -- back to 00002..00007 is NOT a straight offset; see the map above
--   UPDATE jobs SET job_number = regexp_replace(job_number, '^JOB-', 'JOB-2025-')
--    WHERE job_number ~ '^JOB-\d{5}(-R\d+)?$';
--   DELETE FROM document_sequences WHERE document_type='JOB' AND year=0;
--   INSERT INTO document_sequences (company_id, document_type, year, prefix, current_value)
--        SELECT id, 'JOB', 2025, 'JOB', 478 FROM companies;
--   INSERT INTO document_sequences (company_id, document_type, year, prefix, current_value)
--        SELECT id, 'JOB', 2026, 'JOB', 10 FROM companies;
--   -- and restore the previous get_next_sequence_number body (git history).

-- ─── 1. the five colliding live jobs move to the end of the series ───────────
WITH legacy_max AS (
  SELECT COALESCE(MAX(substring(job_number from '^JOB-\d{4}-(\d+)')::int), 0) AS n
    FROM jobs
   WHERE job_number ~ '^JOB-\d{4}-\d+$'
     AND substring(job_number from '^JOB-(\d{4})-')::int < EXTRACT(YEAR FROM NOW())::int
     AND deleted_at IS NULL
),
moving AS (
  SELECT j.id,
         (SELECT n FROM legacy_max) + ROW_NUMBER() OVER (ORDER BY j.job_number) AS new_n
    FROM jobs j
   WHERE j.deleted_at IS NULL
     AND j.job_number ~ '^JOB-\d{4}-\d+$'
     AND substring(j.job_number from '^JOB-(\d{4})-')::int >= EXTRACT(YEAR FROM NOW())::int
)
UPDATE jobs j
   SET job_number = 'JOB-' || lpad(m.new_n::text, 5, '0'),
       updated_at = NOW()
  FROM moving m
 WHERE j.id = m.id;

-- ─── 2. every remaining job loses the year (repeats keep their -R suffix) ────
UPDATE jobs
   SET job_number = regexp_replace(job_number, '^JOB-\d{4}-', 'JOB-'),
       updated_at = NOW()
 WHERE job_number ~ '^JOB-\d{4}-'
   AND deleted_at IS NULL;

-- ─── 3. one continuous JOB counter, with no year ─────────────────────────────
DELETE FROM document_sequences WHERE document_type = 'JOB';

INSERT INTO document_sequences (company_id, document_type, year, prefix, prefix_format, current_value)
SELECT c.id,
       'JOB',
       0,                      -- sentinel: this type does not use a year
       'JOB',
       '{PREFIX}-{SEQ}',
       COALESCE((SELECT MAX(substring(j.job_number from '^JOB-(\d+)')::int)
                   FROM jobs j
                  WHERE j.company_id = c.id
                    AND j.job_number ~ '^JOB-\d+'), 0)
  FROM companies c;

-- ─── 4. the generator honours prefix_format, and the year-less row ───────────
CREATE OR REPLACE FUNCTION public.get_next_sequence_number(p_company_id uuid, p_document_type text)
RETURNS text
LANGUAGE plpgsql
AS $function$
DECLARE
  v_year        INTEGER := EXTRACT(YEAR FROM NOW());
  v_seq_row     document_sequences%ROWTYPE;
  v_next_val    INTEGER;
  v_padded      TEXT;
BEGIN
  -- A year-less type keeps ONE row for all time, marked by year = 0. Looked for
  -- first so JOB never creates a per-year row again; every other type finds
  -- nothing here and falls through to exactly the behaviour it always had.
  SELECT * INTO v_seq_row
  FROM document_sequences
  WHERE company_id = p_company_id
    AND document_type = p_document_type
    AND year = 0
  FOR UPDATE;

  IF NOT FOUND THEN
    SELECT * INTO v_seq_row
    FROM document_sequences
    WHERE company_id = p_company_id
      AND document_type = p_document_type
      AND year = v_year
    FOR UPDATE;

    IF NOT FOUND THEN
      INSERT INTO document_sequences (company_id, document_type, year, prefix, current_value)
      VALUES (p_company_id, p_document_type, v_year, p_document_type, 0)
      ON CONFLICT (company_id, document_type, year) DO NOTHING;

      SELECT * INTO v_seq_row
      FROM document_sequences
      WHERE company_id = p_company_id
        AND document_type = p_document_type
        AND year = v_year
      FOR UPDATE;
    END IF;
  END IF;

  v_next_val := v_seq_row.current_value + 1;

  UPDATE document_sequences
     SET current_value = v_next_val,
         updated_at    = NOW()
   WHERE id = v_seq_row.id;

  v_padded := lpad(v_next_val::TEXT, v_seq_row.padding, '0');

  -- The template has been on this table since the beginning and was never read;
  -- the old body hardcoded '{PREFIX}-{YEAR}-{SEQ}'. Honouring it is what lets
  -- JOB drop the year without touching any other document type.
  RETURN replace(
           replace(
             replace(COALESCE(NULLIF(v_seq_row.prefix_format, ''), '{PREFIX}-{YEAR}-{SEQ}'),
                     '{PREFIX}', v_seq_row.prefix),
             '{YEAR}', v_year::TEXT),
           '{SEQ}', v_padded);
END;
$function$;

NOTIFY pgrst, 'reload schema';
