-- ═══════════════════════════════════════════════════════════════════════════
-- A JOB CAN CARRY MORE THAN ONE DESIGN
-- ═══════════════════════════════════════════════════════════════════════════
-- WHAT THIS IS
--   Mehboob: "jobs main kabi kabi 2 artwork b hoty hain" — and, asked whether
--   those are two versions of one design or two separate designs, he answered
--   **two separate designs**. An HL (Hinge Lid) box has a lid and a base; a
--   sheet can gang two different designs; a carton can ship with an insert.
--   Neither is a revision of the other and neither is "older".
--
-- WHAT WAS BROKEN
--   `job_artworks` modelled a job's artwork as ONE version chain. Every upload
--   took `max(version) + 1`, so the second design became "v2" of the first.
--   Three real consequences:
--
--   1. **The second design was invisible.** Jobs list, Kanban, Production
--      Floor, Planning and the printed Job Card all show "the latest version" —
--      so design 2 replaced design 1 on screen and design 1 could not be seen
--      anywhere except the Job Detail artwork tab.
--   2. **The artwork gate passed on a single approval.** The workflow route
--      asked for ANY row with status='approved' before letting Artwork
--      complete. With two designs, approving one opened the gate for both —
--      the shop could print a design the customer had never signed off.
--   3. The customer approval link is per artwork row, so a customer approving
--      "v2" had in fact only ever seen one of the two designs.
--
-- WHAT THIS DOES
--   Adds `design_no` (which design on the job) and `design_label` (what the
--   shop calls it — "Lid", "Base", "Insert"). Version becomes a chain WITHIN a
--   design: (job_id, design_no, version).
--
--   `design_no` defaults to 1, so **every existing row is design 1** and every
--   current job keeps behaving exactly as it does today. Nothing needs
--   backfilling beyond the default.
--
-- WHY A NUMBER AND NOT JUST A LABEL
--   The label is optional and free text — the shop will leave it blank half the
--   time, and "lid" / "Lid " / "LID" would fragment a job's designs into three.
--   `design_no` is what the code groups, orders and gates on; the label is
--   only ever shown to a human.
--
-- THE UNIQUE INDEX
--   Partial, `WHERE deleted_at IS NULL`, because a soft-deleted v2 must not
--   block re-uploading v2. Verified against live BEFORE adding: `job_artworks`
--   holds 2 rows on 2 different jobs, so there is nothing to conflict with.
--   Added as an index rather than a table constraint so it can be created
--   CONCURRENTLY later if the table ever grows.
--
-- MIGRATION RISK
--   Additive and idempotent. Two nullable-or-defaulted columns and two indexes;
--   no data is rewritten, no column is dropped, nothing locks for any
--   meaningful time on a 2-row table. Existing queries that never mention
--   `design_no` keep working and keep seeing every row.
--
-- HOW TO UNDO
--   DROP INDEX IF EXISTS job_artworks_job_design_version_uniq;
--   DROP INDEX IF EXISTS job_artworks_job_design_idx;
--   ALTER TABLE job_artworks DROP COLUMN IF EXISTS design_label;
--   ALTER TABLE job_artworks DROP COLUMN IF EXISTS design_no;
--   (Safe: nothing outside this feature reads either column, and every row is
--   design 1 until someone uploads a second design.)
-- ═══════════════════════════════════════════════════════════════════════════

ALTER TABLE job_artworks
  ADD COLUMN IF NOT EXISTS design_no    INTEGER NOT NULL DEFAULT 1,
  ADD COLUMN IF NOT EXISTS design_label TEXT;

COMMENT ON COLUMN job_artworks.design_no IS
  'Which DESIGN on the job this artwork belongs to — 1, 2, 3… Two designs on '
  'one job are separate artworks (an HL lid and base, a carton and its insert), '
  'not revisions of each other. `version` counts revisions WITHIN one design, '
  'so (job_id, design_no, version) is the real identity of an artwork file. '
  'Defaults to 1: every job has at least one design.';

COMMENT ON COLUMN job_artworks.design_label IS
  'Optional human name for the design — "Lid", "Base", "Insert". Display only. '
  'Never group or gate on this: it is free text and will be blank half the '
  'time. Group on design_no.';

-- One row per (job, design, version) among live rows.
CREATE UNIQUE INDEX IF NOT EXISTS job_artworks_job_design_version_uniq
  ON job_artworks (job_id, design_no, version)
  WHERE deleted_at IS NULL;

-- Covers "every design on this job" and "latest version of this design", which
-- is what the thumbnails route and the artwork gate both ask for.
CREATE INDEX IF NOT EXISTS job_artworks_job_design_idx
  ON job_artworks (job_id, design_no, version DESC)
  WHERE deleted_at IS NULL;

-- A design number below 1 would sort ahead of design 1 and break every
-- "first design" read. Guarded rather than assumed.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'job_artworks_design_no_positive'
  ) THEN
    ALTER TABLE job_artworks
      ADD CONSTRAINT job_artworks_design_no_positive CHECK (design_no >= 1);
  END IF;
END $$;

NOTIFY pgrst, 'reload schema';

-- ═══════════════════════════════════════════════════════════════════════════
-- WHAT THE CODE DOES WITH THIS (same commit, no further migration)
-- ═══════════════════════════════════════════════════════════════════════════
--   · POST /api/v1/artwork takes an optional `design_no`. Given one, the upload
--     becomes the next VERSION of that design. Omitted, it becomes a NEW
--     DESIGN (max design_no + 1) — so "no design specified" reads as "another
--     design", and a job's first upload is design 1 either way.
--   · The artwork gate now requires EVERY design to have an approved version,
--     not just one row somewhere on the job. This is the change that stops a
--     job printing with an unapproved design.
--   · /api/v1/jobs/thumbnails returns an ARRAY per job — the latest version of
--     each design — instead of a single row.
-- ═══════════════════════════════════════════════════════════════════════════
