-- ═══════════════════════════════════════════════════════════════════════════
-- DROP THE OLD ONE-VERSION-PER-JOB CONSTRAINT — 124's missing half
-- ═══════════════════════════════════════════════════════════════════════════
-- WHAT BROKE
--   Mehboob uploaded a second design ("Inner") to a job that already had one
--   and got:
--
--     duplicate key value violates unique constraint
--     "job_artworks_company_id_job_id_version_key"
--
--   124 gave `job_artworks` a `design_no` and a new unique index on
--   (job_id, design_no, version), so design 2 version 1 is legal by that rule.
--   But **migration 015's original `UNIQUE (company_id, job_id, version)` was
--   still there**, and it does not know what a design is: it allows exactly one
--   row per version per JOB. Design 1 v1 already existed, so design 2 v1 was
--   refused.
--
--   The two rules contradict each other and the older, stricter one wins. 124
--   made a job able to hold two designs everywhere except the one place that
--   counts.
--
-- WHY 124's TEST DID NOT CATCH IT
--   The pglite test rebuilt `job_artworks` from scratch to exercise the
--   migration, and the rebuilt table carried only the columns 124 touches —
--   not 015's table constraint. It asserted the NEW index thoroughly and never
--   knew the OLD one existed. **Rebuilding a table for a migration test only
--   proves the migration; it cannot prove anything about constraints the real
--   table has and the copy does not.** Read the original CREATE TABLE, not just
--   `information_schema.columns`.
--
-- WHAT THIS DOES
--   Drops that one constraint. Nothing replaces it, because 124's
--   `job_artworks_job_design_version_uniq` already covers the same ground more
--   precisely:
--
--     old:  UNIQUE (company_id, job_id, version)             -- all rows
--     new:  UNIQUE (job_id, design_no, version) WHERE deleted_at IS NULL
--
--   `job_id` is a UUID primary key on `jobs`, so it already implies the
--   company; `company_id` in the key added nothing. The deliberate differences
--   are that the new rule counts versions per DESIGN, and that it ignores
--   soft-deleted rows so a deleted v2 does not block re-uploading v2 — both
--   asserted against real Postgres.
--
-- MIGRATION RISK
--   **This only REMOVES a restriction.** No row changes, nothing is rewritten,
--   no query breaks: anything legal before is still legal. The one behaviour
--   that widens is the intended one — a job may now hold the same version
--   number under different designs.
--   Live currently holds 1 artwork row (probed), so there is nothing to
--   re-validate.
--
-- NOTHING ELSE DEPENDS ON IT — checked, not assumed
--   `jobs.proof_artwork_id` (104) references `job_artworks(id)`, the PRIMARY
--   KEY, not this constraint; 104's header only cites it as the reason an
--   artwork row is immutable. The FK is unaffected. The only code that assigns
--   a version number is POST /api/v1/artwork, and since 124 it counts within a
--   design, so it cannot produce a collision under the new index either.
--
-- HOW TO UNDO
--   Only possible while no job actually uses two designs — the constraint
--   cannot be re-created once design 2 v1 exists beside design 1 v1:
--     ALTER TABLE job_artworks
--       ADD CONSTRAINT job_artworks_company_id_job_id_version_key
--       UNIQUE (company_id, job_id, version);
--   If it fails, that is the constraint correctly reporting that the data has
--   moved on. Undoing 124 as a whole is the real rollback.
-- ═══════════════════════════════════════════════════════════════════════════

DO $$
DECLARE
  con_name TEXT;
BEGIN
  -- Found by SHAPE, not by the auto-generated name. Postgres derives
  -- "job_artworks_company_id_job_id_version_key" from the column list, but a
  -- database restored or rebuilt by other means can carry the same constraint
  -- under a different name — and then a name-only DROP would silently no-op
  -- and this migration would report success while the bug stayed.
  SELECT c.conname INTO con_name
  FROM pg_constraint c
  WHERE c.conrelid = 'job_artworks'::regclass
    AND c.contype = 'u'
    AND (
      SELECT array_agg(a.attname::TEXT ORDER BY a.attname)
      FROM unnest(c.conkey) AS k(attnum)
      JOIN pg_attribute a ON a.attrelid = c.conrelid AND a.attnum = k.attnum
    ) = ARRAY['company_id','job_id','version']
  LIMIT 1;

  IF con_name IS NOT NULL THEN
    EXECUTE format('ALTER TABLE job_artworks DROP CONSTRAINT %I', con_name);
    RAISE NOTICE 'Dropped old artwork version constraint: %', con_name;
  ELSE
    RAISE NOTICE 'No (company_id, job_id, version) unique constraint found — already dropped.';
  END IF;
END $$;

-- 124's index must exist, or dropping the old constraint would leave versions
-- ungoverned entirely. Created here too (guarded) so this migration is safe
-- even if 124 was partly applied — CLAUDE.md records that a migration which
-- "was run" may only be partly run.
CREATE UNIQUE INDEX IF NOT EXISTS job_artworks_job_design_version_uniq
  ON job_artworks (job_id, design_no, version)
  WHERE deleted_at IS NULL;

NOTIFY pgrst, 'reload schema';
