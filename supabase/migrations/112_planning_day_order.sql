-- ══════════════════════════════════════════════════════════════════════════════
-- JAFSON PRINT ERP — MIGRATION 112: RUNNING ORDER WITHIN A PLANNED DAY
-- ══════════════════════════════════════════════════════════════════════════════
--
-- WHY
--   Planning has to shuffle jobs — a customer turns urgent, board does not
--   arrive, a press goes down — and there was nowhere to record the result.
--
--   job_plans (015) has no ordering column at all. dashboard/planning/page.tsx
--   ordered only by planned_date, with no tiebreaker, so the running order of
--   the jobs INSIDE one day was whatever Postgres happened to return and could
--   differ between two renders of the same data. The shop floor had it worse:
--   loadStageQueue() sorts by the stage's own sequence_order, so the jobs in a
--   stage queue had no defined order either — the operator could not tell which
--   job was meant to run first, because nobody had ever been able to say.
--
-- WHAT THIS DOES
--   Adds ONE column, job_plans.day_order, holding the job's position within its
--   planned_date: 1, 2, 3… The canonical read order becomes
--
--       planned_date, day_order, id
--
--   The trailing id is not decoration. Rows sharing a sort value have no
--   guaranteed order in Postgres, which is exactly how the paging bug behind
--   §6 of CLAUDE.md was found — two plans left on the same day_order would
--   otherwise swap places between renders again.
--
--   Existing plans are backfilled 1..n per (company_id, planned_date), ordered
--   by created_at then id. That is the order the timeline effectively shows
--   today, so applying this migration changes nothing visible until somebody
--   actually reorders something.
--
--   Cancelled and soft-deleted plans are numbered too, on purpose: they keep a
--   stable position if a cancellation is ever reversed, and numbering only the
--   live ones would need a second pass every time a plan's status changed.
--
-- WHY IT IS SAFE
--   Purely additive. One new column with a DEFAULT, one new index. No existing
--   column is altered, no row is deleted, no constraint is added. Nothing reads
--   day_order until the code that ships alongside this migration is deployed —
--   and until then the old planned_date ordering keeps working unchanged.
--
--   NOT NULL is safe here because the column carries DEFAULT 0, so the ALTER
--   fills every existing row before the backfill re-numbers them. (Note for
--   later: this is the opposite of the 068/094 trap — that was an
--   ALTER COLUMN … TYPE which LEFT a stale NOT NULL behind. This adds one
--   deliberately, on a column that always has a value.)
--
-- IDEMPOTENT
--   The column and index are guarded with IF NOT EXISTS. The backfill only
--   touches rows still sitting at day_order = 0, so a second run re-numbers
--   nothing that has already been ordered — and cannot undo a manual shuffle.
--
-- HOW TO UNDO
--   DROP INDEX IF EXISTS idx_plans_day_order;
--   ALTER TABLE job_plans DROP COLUMN IF EXISTS day_order;
--   (Safe as a hard drop — no other table references it and nothing outside the
--   planning module reads it. Any recorded shuffle is lost, which is the whole
--   of what is lost.)
-- ══════════════════════════════════════════════════════════════════════════════

BEGIN;

-- ─── 1. The column ────────────────────────────────────────────────────────────
ALTER TABLE job_plans
  ADD COLUMN IF NOT EXISTS day_order INTEGER NOT NULL DEFAULT 0;

COMMENT ON COLUMN job_plans.day_order IS
  'Running order within planned_date: 1, 2, 3… Set by Planning (up/down on the '
  'timeline, or max+1 when a plan is created or moved to another date). Always '
  'read as planned_date, day_order, id — the id tiebreaker is required because '
  'two plans can legitimately share a day_order between writes. 0 means '
  '"never ordered"; migration 112 backfilled every row that existed, so 0 only '
  'appears on a row inserted by something that forgot to set it.';

-- ─── 2. The index ─────────────────────────────────────────────────────────────
-- Matches the canonical ORDER BY, and the existing idx_plans_date
-- (company_id, planned_date) stays — this one supersedes it for ordered reads
-- but the old one is still the cheaper answer for a plain date-range filter.
CREATE INDEX IF NOT EXISTS idx_plans_day_order
  ON job_plans(company_id, planned_date, day_order);

-- ─── 3. Backfill ──────────────────────────────────────────────────────────────
-- Only rows still at 0, so re-running never disturbs a real shuffle.
WITH numbered AS (
  SELECT id,
         ROW_NUMBER() OVER (
           PARTITION BY company_id, planned_date
           ORDER BY created_at, id
         ) AS rn
  FROM   job_plans
  WHERE  day_order = 0
)
UPDATE job_plans p
SET    day_order = n.rn
FROM   numbered n
WHERE  p.id = n.id;

COMMIT;

-- ─── VERIFY (read-only) ───────────────────────────────────────────────────────
-- Expect: one row per date, seq_ok = TRUE everywhere. seq_ok being FALSE means
-- a date has a gap, a duplicate, or a row still sitting at 0.
--   SELECT planned_date,
--          COUNT(*)                                    AS plans,
--          MIN(day_order)                              AS lo,
--          MAX(day_order)                              AS hi,
--          COUNT(DISTINCT day_order) = COUNT(*)
--            AND MIN(day_order) = 1
--            AND MAX(day_order) = COUNT(*)             AS seq_ok
--   FROM   job_plans
--   GROUP  BY company_id, planned_date
--   ORDER  BY planned_date;

NOTIFY pgrst, 'reload schema';
