-- JAFSON PRINT ERP — MIGRATION 091: STAGE → DEPARTMENT MAPPING (Phase 1 of
-- the "job apne aap agli stage par show ho" automation work)
--
-- WHAT WAS BROKEN
-- workflow_stages.department_id has existed since migration 010 but no
-- migration ever set a value, and the seeded templates all insert stages
-- without it. The Department Queue page — the one screen in the system that
-- is genuinely stage-driven (Ready to Start / Blocked / In Progress with
-- Start-Complete-Skip buttons) — filters on exactly that column:
--     /api/v1/production/department-queue  →  .eq('workflow_stages.department_id', departmentId)
-- With every row NULL, that query can never return anything, for any
-- department. Same column powers notifyNewlyUnblockedStages(), so stage
-- notifications were silently no-op'ing too. Net effect: a planned job never
-- surfaced anywhere on its own and had to be re-added by hand in each module.
--
-- WHAT THIS DOES
--   1. Fills department_id on every ACTIVE workflow stage whose name matches
--      the shop's real departments (seeded in migration 002). Only touches
--      rows where department_id IS NULL, so anything already set by hand in
--      Settings → Workflow Engine is left alone.
--   2. Flips the `job_auto_assign` system setting to 'true' so a job created
--      by any path other than the New Job form (API, import, future
--      SO → Job convert) still gets the default template's stages instead of
--      no workflow at all.
--   3. Adds a partial index on department_id — the queue query hits it on
--      every load and it is now a real filter column, not a dead one.
--   4. Backfills jobs.current_stage_id, which until now was written once on
--      the first stage start and never again — so on every job past its
--      second stage it pointed at something long finished. Code from here on
--      keeps it in sync (syncJobCurrentStage); this fixes the existing rows.
--
-- Additive and fully reversible. Does not touch job_stage_progress, so no
-- running job changes state. Company-scoped: the department lookup joins on
-- s.company_id = d.company_id, so a second company gets its own departments.
--
-- HOW TO UNDO
--   UPDATE workflow_stages SET department_id = NULL WHERE deleted_at IS NULL;
--   UPDATE system_settings SET value = 'false' WHERE key = 'job_auto_assign';
--   DROP INDEX IF EXISTS idx_wf_stages_department;
-- (First statement also clears any mapping made by hand afterwards — if that
-- matters, restrict it with AND updated_at < '<the date this migration ran>'.)
-- The current_stage_id backfill is not worth undoing: the values it replaces
-- were stale by definition and nothing reads the column yet.

-- ══════════════════════════════════════════════════════════════════════════
-- 1. STAGE NAME → DEPARTMENT CODE
-- ══════════════════════════════════════════════════════════════════════════
-- Patterns are deliberately disjoint so no stage can match two rows:
--   'artwork%'      → 'Artwork' (old) and 'Artwork & Customer Approval' (086)
--   'die cutting%'  → 'Die Cutting' and 'Die Cutting & Embossing' (HL, 086)
-- Two judgement calls, both changeable in Settings → Workflow Engine:
--   · UV Coating / Varnish → Lamination. There is no separate Coating
--     department; coating sits with the lamination unit in this shop.
--   · Assembly (Premium Rigid Box) → Packing. Hand assembly, done by the
--     packing crew.

WITH stage_dept_map(stage_pattern, dept_code) AS (
  VALUES
    ('artwork%',          'ART'),
    ('customer approval', 'ART'),
    ('planning',          'PLAN'),
    ('board issue',       'STORE'),
    ('printing',          'PRINT'),
    ('lamination',        'LAM'),
    ('uv coating',        'LAM'),
    ('varnish / coating', 'LAM'),
    ('die cutting%',      'DIE'),
    ('hot foil',          'FOIL'),
    ('folder gluing',     'GLUE'),
    ('assembly',          'PACK'),
    ('packing',           'PACK'),
    ('dispatch',          'DISP')
)
UPDATE workflow_stages s
SET department_id = d.id,
    updated_at    = NOW()
FROM stage_dept_map m
JOIN departments d ON d.code = m.dept_code
WHERE s.department_id IS NULL
  AND s.deleted_at IS NULL
  AND s.is_active = TRUE
  AND d.company_id = s.company_id
  AND d.deleted_at IS NULL
  AND s.name ILIKE m.stage_pattern;

CREATE INDEX IF NOT EXISTS idx_wf_stages_department
  ON workflow_stages(department_id) WHERE deleted_at IS NULL;

COMMENT ON COLUMN workflow_stages.department_id IS
  'Which department owns this stage. Drives the Department Queue page and stage notifications — a stage with NULL here is invisible to both. Seeded by migration 091, editable in Settings → Workflow Engine.';

-- ══════════════════════════════════════════════════════════════════════════
-- 2. AUTO-ASSIGN THE DEFAULT WORKFLOW TO EVERY NEW JOB
-- ══════════════════════════════════════════════════════════════════════════
-- Seeded 'false' in migration 021. /api/v1/jobs POST only falls back to the
-- is_default template when this is 'true'; otherwise a job created outside
-- the New Job form has zero stages and can never appear in any queue.

UPDATE system_settings
SET value = 'true', updated_at = NOW()
WHERE key = 'job_auto_assign'
  AND value IS DISTINCT FROM 'true';

INSERT INTO system_settings (company_id, key, value, category, description)
SELECT c.id, 'job_auto_assign', 'true', 'production', 'Auto-assign jobs to default workflow'
FROM companies c
WHERE NOT EXISTS (
  SELECT 1 FROM system_settings ss
  WHERE ss.company_id = c.id AND ss.key = 'job_auto_assign'
);

-- ══════════════════════════════════════════════════════════════════════════
-- 3. BACKFILL jobs.current_stage_id
-- ══════════════════════════════════════════════════════════════════════════
-- Same rule the application now applies after every transition: an
-- in_progress stage wins (lowest sequence_order if several overlap — Die
-- Cutting legitimately runs alongside Printing), otherwise the earliest
-- pending stage, otherwise NULL because the workflow is through.

UPDATE jobs j
SET current_stage_id = live.id
FROM (
  SELECT DISTINCT ON (p.job_id) p.job_id, p.id, p.company_id
  FROM job_stage_progress p
  WHERE p.status IN ('in_progress', 'pending')
    AND p.is_active = TRUE
  ORDER BY p.job_id,
           CASE WHEN p.status = 'in_progress' THEN 0 ELSE 1 END,
           p.sequence_order
) live
WHERE live.job_id = j.id
  AND live.company_id = j.company_id
  AND j.deleted_at IS NULL
  AND j.current_stage_id IS DISTINCT FROM live.id;

UPDATE jobs j
SET current_stage_id = NULL
WHERE j.deleted_at IS NULL
  AND j.current_stage_id IS NOT NULL
  AND NOT EXISTS (
    SELECT 1 FROM job_stage_progress p
    WHERE p.job_id = j.id
      AND p.company_id = j.company_id
      AND p.status IN ('in_progress', 'pending')
      AND p.is_active = TRUE
  );

COMMENT ON COLUMN jobs.current_stage_id IS
  'job_stage_progress row the job is standing on right now — in_progress stage if any, else earliest pending, else NULL. Kept in sync by syncJobCurrentStage() on every start/complete/skip.';

-- ══════════════════════════════════════════════════════════════════════════
-- VERIFY (run separately after this migration — all three should look right)
-- ══════════════════════════════════════════════════════════════════════════
-- Every active stage and the department it now belongs to. Any row with
-- department blank is a custom stage this mapping did not know about — set it
-- by hand in Settings → Workflow Engine or it stays invisible to the queue.
--
--   SELECT t.name AS template, s.sequence_order, s.name AS stage,
--          COALESCE(d.name, '⚠ NO DEPARTMENT') AS department
--   FROM workflow_stages s
--   JOIN workflow_templates t ON t.id = s.workflow_template_id
--   LEFT JOIN departments d ON d.id = s.department_id
--   WHERE s.deleted_at IS NULL AND s.is_active
--   ORDER BY t.name, s.sequence_order;
--
--   SELECT key, value FROM system_settings WHERE key = 'job_auto_assign';
--
-- Every live job and the stage it is standing on:
--
--   SELECT j.job_number, j.status, s.name AS current_stage, d.name AS department
--   FROM jobs j
--   LEFT JOIN job_stage_progress p ON p.id = j.current_stage_id
--   LEFT JOIN workflow_stages s ON s.id = p.workflow_stage_id
--   LEFT JOIN departments d ON d.id = s.department_id
--   WHERE j.deleted_at IS NULL AND j.status <> 'cancelled'
--   ORDER BY j.job_number;

NOTIFY pgrst, 'reload schema';
