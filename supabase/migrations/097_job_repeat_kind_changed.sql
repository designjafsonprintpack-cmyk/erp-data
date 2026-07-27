-- ══════════════════════════════════════════════════════════════════════════════
-- JAFSON PRINT ERP — MIGRATION 097
-- "Repeat with Changes" — a repeat job whose PRINTED CONTENT has changed
--
-- THE GAP
--   A job could only be New (blank form) or Repeat (exact copy — the form lets
--   you change Quantity and Required Date, nothing else). The real third case
--   had nowhere to live: same box, same customer, same die — but the artwork
--   changed. New expiry or date code, a new printed rate/MRP, a redesigned
--   panel. In the trade this is most of the repeat work.
--
--   The existing "Reuse the original artwork" checkbox looked like it covered
--   this, but unticking it only skipped inserting a job_artwork_references row.
--   Nothing else changed: no flag on the job, nothing on the job card, no
--   signal to the plate room. So a changed job was indistinguishable from an
--   exact repeat once it reached the floor.
--
--   That is how the wrong expiry gets printed on a full lot: the operator has
--   run this job many times, treats it as a repeat, and mounts the old plate.
--
-- WHAT THIS ADDS  (all on `jobs`, all nullable/defaulted — nothing breaks)
--   repeat_kind      'exact' | 'changed'. NULL for jobs that aren't repeats.
--   changed_aspects  TEXT[] of what changed, so the job card can name it.
--                    Canonical values written by the app:
--                      design         — artwork/design itself changed
--                      expiry         — expiry or date code
--                      printed_rate   — rate/MRP PRINTED ON THE BOX
--                                       (NOT our selling price — pricing is
--                                        deliberately absent from job cards)
--                      size, board_gsm, colors, die, finishing, other
--   change_note      free text, e.g. "Expiry 03/27 ki jagah 09/27"
--
-- Deliberately no CHECK on the array contents: the list will grow, and a
-- constraint here would mean a migration every time the shop names a new kind
-- of change. The request schema (src/lib/schemas/job.ts) validates it instead.
--
-- BACKFILL
--   Every existing repeat becomes 'exact' — which is what they all were, since
--   there was no way to record anything else. QC reprints (repeat_sequence 99)
--   are 'exact' too: a reprint reruns the SAME artwork because QC failed.
--
-- HOW TO UNDO
--   ALTER TABLE jobs DROP COLUMN repeat_kind, DROP COLUMN changed_aspects,
--                    DROP COLUMN change_note;
-- ══════════════════════════════════════════════════════════════════════════════

ALTER TABLE jobs
  ADD COLUMN IF NOT EXISTS repeat_kind     TEXT,
  ADD COLUMN IF NOT EXISTS changed_aspects TEXT[] NOT NULL DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS change_note     TEXT;

-- Added separately from the column so a re-run doesn't fail on a duplicate
-- constraint name.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'jobs_repeat_kind_check'
  ) THEN
    ALTER TABLE jobs ADD CONSTRAINT jobs_repeat_kind_check
      CHECK (repeat_kind IS NULL OR repeat_kind IN ('exact', 'changed'));
  END IF;
END $$;

COMMENT ON COLUMN jobs.repeat_kind IS
  'exact = straight repeat, artwork reused. changed = repeat whose printed content changed (see changed_aspects). NULL = not a repeat.';
COMMENT ON COLUMN jobs.changed_aspects IS
  'What changed on a repeat_kind=''changed'' job: design, expiry, printed_rate, size, board_gsm, colors, die, finishing, other. printed_rate is the rate printed ON THE BOX, never our selling price.';

-- Every repeat that exists today was an exact copy — nothing else was possible.
UPDATE jobs
   SET repeat_kind = 'exact'
 WHERE is_repeat = TRUE
   AND repeat_kind IS NULL;

-- Find changed repeats fast on the plate/artwork queues.
CREATE INDEX IF NOT EXISTS idx_jobs_repeat_kind
  ON jobs (company_id, repeat_kind)
  WHERE repeat_kind = 'changed';

NOTIFY pgrst, 'reload schema';
