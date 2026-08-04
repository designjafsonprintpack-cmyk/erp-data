-- 132 — get_job_family(): every run of the same job, as one list
--
-- WHY
--   Mehboob: "job hamesha aik hi rehna chahiye, repeat kernay per bhi …
--   lekin history bhi ho, pata bhi chale ke job kab chala kitna chala."
--
--   He is describing the distinction the schema does not name: a CARTON is one
--   thing, and each order of it is a RUN. Today `jobs` models the run, so a
--   reorder of JOB-00408 shows up as an unrelated JOB-2026-00010 and the
--   two read as duplicates.
--
--   Merging them into one row is not the answer and he said why himself — the
--   history has to survive. A job row carries its OWN run: quantity, sheet_qty,
--   status, stages, MRN, board issue, plates, costing, dispatch, invoice.
--   Reusing the row would erase the 2025 run to describe the 2026 one. Same
--   reasoning as the ledger rule in the ERP standards: keep the entries, derive
--   the summary.
--
--   So the identity already exists in the data — `jobs.parent_job_id` links
--   every repeat to the job it came from. What was missing is a way to ask for
--   the WHOLE family in one go. That is all this function is.
--
-- WHAT IT RETURNS
--   Every job in the family the given job belongs to, oldest run first,
--   with `run_no` (1 = the original) and `is_root`. Walks UP to the original
--   first, then DOWN through every descendant, so it gives the same answer
--   whichever member you ask about — asking from the repeat must not show a
--   family of one.
--
--   Press proofs (`job_kind <> 'production'`) are excluded: a proof hangs off
--   the same `parent_job_id` but it is 100 sheets for colour approval, not a
--   run of the order. Counting it as one would make "kitna chala" wrong.
--
-- SECURITY
--   SECURITY INVOKER (the default — stated here because it matters): the
--   function runs as the caller, so RLS on `jobs` still applies and one company
--   can never read another's family. `p_company_id` is passed in as well and
--   filtered on, matching how every route in this app resolves company_id
--   server-side from the JWT rather than trusting a client.
--
-- PERFORMANCE
--   Two recursive walks over `jobs` by primary key and by `parent_job_id`.
--   A family is a handful of rows. An index on parent_job_id is added below —
--   without it the downward walk is a seq scan of all 488 jobs per level.
--
-- Additive. Creates one function and one index, nothing is altered or dropped.
--
-- UNDO
--   DROP FUNCTION IF EXISTS get_job_family(uuid, uuid);
--   DROP INDEX IF EXISTS idx_jobs_parent_job_id;

CREATE INDEX IF NOT EXISTS idx_jobs_parent_job_id
  ON jobs (parent_job_id)
  WHERE parent_job_id IS NOT NULL AND deleted_at IS NULL;

CREATE OR REPLACE FUNCTION get_job_family(p_company_id uuid, p_job_id uuid)
RETURNS TABLE (
  id              uuid,
  job_number      text,
  job_title       text,
  status          text,
  quantity        numeric,
  sheet_qty       integer,
  ups             integer,
  order_date      date,
  required_date   date,
  completed_date  date,
  is_repeat       boolean,
  repeat_kind     text,
  parent_job_id   uuid,
  run_no          bigint,
  is_root         boolean
)
LANGUAGE sql
STABLE
AS $$
  -- 1. climb to the original
  WITH RECURSIVE up AS (
    SELECT j.id, j.parent_job_id
      FROM jobs j
     WHERE j.id = p_job_id
       AND j.company_id = p_company_id
       AND j.deleted_at IS NULL
    UNION ALL
    SELECT p.id, p.parent_job_id
      FROM jobs p
      JOIN up ON up.parent_job_id = p.id
     WHERE p.company_id = p_company_id
       AND p.deleted_at IS NULL
  ),
  root AS (
    SELECT up.id FROM up WHERE up.parent_job_id IS NULL LIMIT 1
  ),
  -- 2. walk back down through every repeat of it
  down AS (
    SELECT j.* FROM jobs j JOIN root ON root.id = j.id
    UNION ALL
    SELECT c.*
      FROM jobs c
      JOIN down ON c.parent_job_id = down.id
     WHERE c.company_id = p_company_id
       AND c.deleted_at IS NULL
  )
  SELECT d.id,
         d.job_number,
         d.job_title,
         d.status,
         d.quantity,
         d.sheet_qty,
         d.ups,
         d.order_date,
         d.required_date,
         d.completed_date,
         d.is_repeat,
         d.repeat_kind,
         d.parent_job_id,
         ROW_NUMBER() OVER (ORDER BY d.order_date NULLS LAST, d.created_at, d.id) AS run_no,
         (d.parent_job_id IS NULL)                                                AS is_root
    FROM down d
   WHERE COALESCE(d.job_kind, 'production') = 'production'
   ORDER BY d.order_date NULLS LAST, d.created_at, d.id;
$$;

COMMENT ON FUNCTION get_job_family(uuid, uuid) IS
  'Every production run of the job family the given job belongs to, oldest first. Walks up to the original then down through all repeats, so any member returns the same family. Press proofs excluded — a proof is not a run.';

NOTIFY pgrst, 'reload schema';
