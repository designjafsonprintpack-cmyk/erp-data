-- ══════════════════════════════════════════════════════════════════════════════
-- JAFSON PRINT ERP — MIGRATION 110: BOX TYPE → WORKFLOW TEMPLATE MAPPING
-- ══════════════════════════════════════════════════════════════════════════════
--
-- WHAT WAS WRONG
--   A new job's workflow came from exactly one place: the `job_auto_assign`
--   system setting, which picks the ONE template flagged is_default. So a Hinge
--   Lid job and a sticker job both got "Standard Carton Workflow" — a 10-stage
--   carton route with Board Issue, UV Coating and Folder Gluing on it — unless
--   whoever raised the job remembered to change the dropdown by hand.
--
--   Worse, Repeat and QC Reprint copy the parent's template verbatim
--   (repeat/route.ts:85, qc/reprint/[id]/route.ts:71) with no fallback. Every
--   one of the 478 legacy jobs has workflow_template_id = NULL by design, and
--   those are precisely the jobs a customer reorder repeats — so each repeat
--   came out with no workflow, no stages, and was invisible in every department
--   queue. Nothing errored; the job simply never reached the shop floor.
--
-- WHAT THIS DOES
--   Adds box_types.workflow_template_id and seeds Mehboob's rule:
--
--       Box      → Standard Carton Workflow
--       HL       → HL (Hinge Lid)
--       Label    → Label / Sticker
--       Sticker  → Label / Sticker
--
--   The mapping is DATA, not code — a new box type, or a shop that decides HL
--   should run the rigid-box route, is a row edit, not a deploy. Same precedent
--   as coating types in 093.
--
--   Application side (separate commit, no migration needed) resolves a job's
--   template in this order, and Repeat / QC Reprint now use the same resolver:
--       1. explicitly chosen on the form   (a human's choice always wins)
--       2. the job's box type mapping      (this migration)
--       3. the is_default template         (existing job_auto_assign behaviour)
--       4. NULL                            (genuinely no workflow)
--
--   "Premium Rigid Box" is deliberately left unmapped — no box type routes to
--   it today, so it stays a manual pick.
--
-- WHY IT IS SAFE
--   Additive: one nullable column with a nullable FK. No existing row changes
--   meaning, no query breaks, nothing is rewritten. The 478 legacy jobs keep
--   workflow_template_id = NULL and stay out of every queue — this only affects
--   jobs created from here on.
--
--   NOTE: box_types already relates to `jobs`, but this FK is box_types →
--   workflow_templates, a pair with no existing relationship, so it cannot
--   trigger PostgREST's "more than one relationship was found" embed failure
--   the way 104 did on jobs ↔ job_artworks. Verified: nothing embeds
--   box_types(...) and workflow_templates(...) together today.
--
-- IDEMPOTENT
--   ADD COLUMN IF NOT EXISTS, and the seed only fills rows that are still NULL,
--   so re-running never overwrites a mapping someone has since changed by hand.
--
-- HOW TO UNDO
--   ALTER TABLE box_types DROP COLUMN IF EXISTS workflow_template_id;
--   (Dropping it restores the previous behaviour exactly — the resolver falls
--   through to the is_default template, which is what it did before.)
-- ══════════════════════════════════════════════════════════════════════════════

BEGIN;

-- ─── 1. The column ────────────────────────────────────────────────────────────
ALTER TABLE box_types
  ADD COLUMN IF NOT EXISTS workflow_template_id UUID REFERENCES workflow_templates(id);

COMMENT ON COLUMN box_types.workflow_template_id IS
  'Production workflow a job of this box type gets by default. NULL means fall '
  'back to the is_default template. Settings-managed data, not a code constant.';

CREATE INDEX IF NOT EXISTS idx_box_types_workflow
  ON box_types(workflow_template_id) WHERE workflow_template_id IS NOT NULL;

-- ─── 2. Seed the mapping, per company, by name ────────────────────────────────
-- Matched on the template's name rather than a hardcoded UUID so this works on
-- any company that has the same templates — the same lookup-by-name approach
-- 104 used so it could not repeat 091's null-department bug.
WITH mapping (box_name, template_name) AS (
  VALUES ('Box',     'Standard Carton Workflow'),
         ('HL',      'HL (Hinge Lid)'),
         ('Label',   'Label / Sticker'),
         ('Sticker', 'Label / Sticker')
)
UPDATE box_types bt
SET    workflow_template_id = wt.id,
       updated_at           = NOW()
FROM   mapping m
JOIN   workflow_templates wt
       ON wt.name = m.template_name
      AND wt.deleted_at IS NULL
      AND wt.is_active
WHERE  bt.name = m.box_name
  AND  bt.company_id = wt.company_id
  AND  bt.deleted_at IS NULL
  AND  bt.workflow_template_id IS NULL;   -- never clobber a hand-set mapping

COMMIT;

-- ─── VERIFY (read-only — expect Box/HL/Label/Sticker each with a template) ────
--   SELECT bt.name AS box_type, wt.name AS workflow
--   FROM   box_types bt
--   LEFT   JOIN workflow_templates wt ON wt.id = bt.workflow_template_id
--   WHERE  bt.deleted_at IS NULL
--   ORDER  BY bt.name;

NOTIFY pgrst, 'reload schema';
