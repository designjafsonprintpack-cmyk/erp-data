-- ══════════════════════════════════════════════════════════════════════════════
-- JAFSON PRINT ERP — MIGRATION 111: "CARTON WITH LAMINATION / FOIL" TEMPLATE
-- ══════════════════════════════════════════════════════════════════════════════
--
-- WHY
--   Standard Carton Workflow is missing Lamination (seq 6) and Hot Foil (seq 9).
--   Both were soft-deleted by hand on 2026-07-26 at 16:09, a minute apart. The
--   probable reason is visible in the rows themselves: BOTH still carry
--   department_id = NULL. 091 filled in every stage's department and these two
--   were left out, so they belonged to nobody, appeared in no department queue,
--   and looked broken — so somebody removed them.
--
--   Mehboob's call (2026-07-29): lamination/foil jobs are rare — two to four —
--   so Standard Carton stays exactly as it is, clean and 10 stages, and those
--   few jobs get their own template instead. That is what this adds.
--
-- WHAT THIS DOES
--   Creates ONE new template, "Carton with Lamination / Foil": the standard
--   carton route with Lamination and Hot Foil put back in their proper places,
--   both with a real department this time (the Lamination and Hot Foil
--   departments have existed since 010 and nothing has ever used them).
--
--     1  Artwork & Customer Approval   artwork_approval  Artwork
--     2  Planning                                        Planning
--     3  Board Issue                   board_issue       Store
--     4  Printing                      printing          Printing
--     5  Lamination                    (optional)        Lamination      ← back
--     6  UV Coating                    (optional)        Lamination
--     7  Die Cutting                                     Die Cutting
--     8  Hot Foil                      (optional)        Hot Foil        ← back
--     9  Folder Gluing                 (optional)        Folder Gluing
--    10  Packing                                         Packing
--    11  Quality Check                 qc                Quality Control
--    12  Dispatch                                        Dispatch
--
--   Lamination and Hot Foil are is_optional = TRUE so a job that laminates but
--   does not foil can skip one without leaving the template. Stage types and
--   departments are copied from the equivalents on Standard Carton so every gate
--   that matches on stage_type — artwork approval, the board-issue MRN, the
--   plates hard-block on printing, the QC pass gate — behaves identically here.
--   UV Coating keeps Standard Carton's own department (Lamination), not a new
--   one; that is how the shop already has it.
--
--   NOT made default, and NOT mapped to any box type in 110 — "Box" still
--   resolves to Standard Carton. A lamination/foil job is picked by hand from
--   the Production Workflow dropdown, which is the right shape for something
--   that happens two to four times.
--
--   No workflow_stage_dependencies rows: checkStageGate() falls back to
--   sequential for unconfigured stages, which is exactly what this route wants.
--
-- WHY IT IS SAFE
--   Purely additive. Standard Carton Workflow is not read, not written and not
--   referenced. No existing job, stage-progress row or workflow instance is
--   touched — a template only matters to jobs created after it is chosen.
--
-- IDEMPOTENT
--   Keyed on the template name per company; re-running inserts nothing. Stages
--   are inserted only for names not already present on this template.
--
-- HOW TO UNDO
--   DELETE FROM workflow_stages WHERE workflow_template_id IN
--     (SELECT id FROM workflow_templates WHERE name = 'Carton with Lamination / Foil');
--   DELETE FROM workflow_templates WHERE name = 'Carton with Lamination / Foil';
--   (Safe as a hard delete only while no job has used it. Once one has, soft-
--   delete the template instead — and soft-delete its stages too, which the UI
--   does NOT do on its own; that omission is exactly what 107 had to clean up.)
-- ══════════════════════════════════════════════════════════════════════════════

BEGIN;

-- ─── 1. The template ──────────────────────────────────────────────────────────
-- Created for every company that already runs a Standard Carton Workflow, so a
-- second company added later gets it from the same migration.
INSERT INTO workflow_templates (company_id, name, description, is_default, is_active)
SELECT DISTINCT wt.company_id,
       'Carton with Lamination / Foil',
       'Carton route including Lamination and Hot Foil. For the few jobs that need them — Standard Carton Workflow covers the rest.',
       FALSE,
       TRUE
FROM   workflow_templates wt
WHERE  wt.name = 'Standard Carton Workflow'
  AND  wt.deleted_at IS NULL
  AND  NOT EXISTS (
         SELECT 1 FROM workflow_templates x
         WHERE  x.company_id = wt.company_id
           AND  x.name = 'Carton with Lamination / Foil'
           AND  x.deleted_at IS NULL
       );

-- ─── 2. Its stages ────────────────────────────────────────────────────────────
-- Departments are resolved BY NAME, never hardcoded — the same approach 104
-- used so it could not repeat 091's null-department bug, which is the very bug
-- that got Lamination and Hot Foil deleted in the first place. A department that
-- does not exist yields NULL rather than failing the insert, so the verify query
-- at the bottom checks for that explicitly.
WITH tpl AS (
  SELECT id, company_id FROM workflow_templates
  WHERE name = 'Carton with Lamination / Foil' AND deleted_at IS NULL
),
stage (seq, stage_name, stage_type, dept_name, optional, est_hours) AS (
  VALUES ( 1, 'Artwork & Customer Approval', 'artwork_approval', 'Artwork',         FALSE,  4::NUMERIC),
         ( 2, 'Planning',                    NULL,               'Planning',        FALSE,  2),
         ( 3, 'Board Issue',                 'board_issue',      'Store',           FALSE,  1),
         ( 4, 'Printing',                    'printing',         'Printing',        FALSE,  8),
         ( 5, 'Lamination',                  NULL,               'Lamination',      TRUE,   4),
         ( 6, 'UV Coating',                  NULL,               'Lamination',      TRUE,   2),
         ( 7, 'Die Cutting',                 NULL,               'Die Cutting',     FALSE,  4),
         ( 8, 'Hot Foil',                    NULL,               'Hot Foil',        TRUE,   3),
         ( 9, 'Folder Gluing',               NULL,               'Folder Gluing',   TRUE,   4),
         (10, 'Packing',                     NULL,               'Packing',         FALSE,  3),
         (11, 'Quality Check',               'qc',               'Quality Control', FALSE,  2),
         (12, 'Dispatch',                    NULL,               'Dispatch',        FALSE,  2)
)
INSERT INTO workflow_stages
  (company_id, workflow_template_id, name, department_id, sequence_order,
   is_optional, estimated_hours, stage_type, is_active)
SELECT t.company_id,
       t.id,
       s.stage_name,
       d.id,
       s.seq,
       s.optional,
       s.est_hours,
       s.stage_type,
       TRUE
FROM   tpl t
CROSS  JOIN stage s
LEFT   JOIN departments d
       ON d.company_id = t.company_id
      AND d.name = s.dept_name
      AND d.deleted_at IS NULL
WHERE  NOT EXISTS (
         SELECT 1 FROM workflow_stages ws
         WHERE  ws.workflow_template_id = t.id
           AND  ws.name = s.stage_name
           AND  ws.deleted_at IS NULL
       );

COMMIT;

-- ─── VERIFY (read-only — expect 12 stages, and NO row saying "NO DEPARTMENT") ─
--   SELECT ws.sequence_order, ws.name, ws.stage_type,
--          coalesce(d.name, '*** NO DEPARTMENT ***') AS department, ws.is_optional
--   FROM   workflow_stages ws
--   JOIN   workflow_templates wt ON wt.id = ws.workflow_template_id
--   LEFT   JOIN departments d ON d.id = ws.department_id
--   WHERE  wt.name = 'Carton with Lamination / Foil' AND ws.deleted_at IS NULL
--   ORDER  BY ws.sequence_order;

NOTIFY pgrst, 'reload schema';
