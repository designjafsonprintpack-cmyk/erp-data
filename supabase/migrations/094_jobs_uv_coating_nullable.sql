-- 094_jobs_uv_coating_nullable.sql
--
-- WHAT BROKE
--   Saving a job with UV Coating = "None" fails with
--   `23502 null value in column "uv_coating" violates not-null constraint`.
--
-- WHY
--   014 created uv_coating as BOOLEAN NOT NULL DEFAULT FALSE — correct then,
--   because "no coating" was FALSE, a real value.
--   068 turned it into TEXT and dropped the default, so "no coating" became
--   NULL — but it never dropped NOT NULL. The column's own COMMENT since 068
--   has read "...or NULL for none", describing a state the constraint forbids.
--
--   Nothing caught it because both write paths send a value in the common case,
--   and the one path that sends NULL is the one nobody tested:
--     src/app/api/v1/jobs/route.ts:113   uv_coating: body.uv_coating || null
--   Picking "None" in New Job / Edit Job sends NULL and 500s. It surfaced on the
--   legacy import, where 244 of 478 rows have no coating.
--
-- FIX
--   Drop NOT NULL. NULL is what the application, the schema
--   (src/lib/schemas/job.ts:56 blankToNull) and the column comment have all
--   meant by "none" since 068.
--
-- UNDO
--   UPDATE jobs SET uv_coating = '' WHERE uv_coating IS NULL;
--   ALTER TABLE jobs ALTER COLUMN uv_coating SET NOT NULL;
--   (the UPDATE is required first, or the ALTER fails)

ALTER TABLE jobs ALTER COLUMN uv_coating DROP NOT NULL;

-- The old comment named "Soft UV", which migration 093 established was never a
-- real shop term — S/UV is Spot UV. Coating options are settings-managed now,
-- so the comment stops listing them.
COMMENT ON COLUMN jobs.uv_coating IS
  'Coating name as free text, chosen from coating_types (Settings > Materials > '
  'Coating Types). NULL means no coating. Was BOOLEAN before 068 — TRUE rows '
  'became ''UV''. Stores the name, not an id, so a coating renamed or removed in '
  'Settings leaves old jobs holding a value the dropdown no longer offers; '
  'EditJobClient appends it back so the select cannot render blank and wipe it.';

NOTIFY pgrst, 'reload schema';
