-- 127 — "UV Coating" stage renamed to "Coating"
--
-- WHAT THIS IS
--   Mehboob: "uv coating ko Coating ker do her jagha". The Job Card, Job
--   Detail, the New/Edit Job forms, Reports and Finance were all relabelled in
--   code in the same commit. This closes the last place the old wording lives:
--   the WORKFLOW STAGE name, which is stored as data and shows up on the
--   Workflow tab, My Queue, the department queues, stage notifications and the
--   printed Job Card's stage badges.
--
-- WHY IT IS SAFE
--   Nothing in the codebase matches this stage by its literal name:
--     · src/lib/utils/productionStages.ts routes a stage to a shop-floor page
--       by NAME PREFIX, and its lamination entry already lists BOTH
--       'uv coating' and 'coating' — so a renamed stage still lands on the
--       same page. (Checked before writing this, not assumed.)
--     · workflow_stage_dependencies, job_stage_progress, checkStageGate() and
--       syncJobCurrentStage() all key on workflow_stages.id.
--     · jobGang.ts matches a gang's sibling stages by name ACROSS templates —
--       which is exactly why this renames every template in one statement
--       rather than one template at a time. Renaming one and not the other
--       would stop a shared Coating stage moving the whole run.
--
-- WHAT IT TOUCHES (probed read-only on live 2026-08-04 — 2 rows)
--     Standard Carton Workflow        seq 7   "UV Coating"  -> "Coating"
--     Carton with Lamination / Foil   seq 6   "UV Coating"  -> "Coating"
--   HL (Hinge Lid)'s "Varnish / Coating" is deliberately LEFT ALONE: it is not
--   the same name, and collapsing it to "Coating" would lose the "Varnish"
--   the HL route actually means.
--
-- Data only. No column, index, constraint or function changes.
--
-- UNDO
--   UPDATE workflow_stages SET name = 'UV Coating'
--    WHERE name = 'Coating' AND deleted_at IS NULL;
--   (Then revert the code labels in the same commit.)
--
-- NOTE FOR THE NEXT PERSON
--   Migrations 010 and 111 SEED a stage literally named 'UV Coating'. They have
--   both already run and are not re-runnable as-is, but if either is ever
--   replayed on a fresh database, run this migration again after it.

UPDATE workflow_stages
   SET name       = 'Coating',
       updated_at = NOW()
 WHERE name       = 'UV Coating'
   AND deleted_at IS NULL;

NOTIFY pgrst, 'reload schema';
