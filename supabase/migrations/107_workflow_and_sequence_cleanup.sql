-- ═══════════════════════════════════════════════════════════════════════════
-- WORKFLOW + DOCUMENT-SEQUENCE CLEANUP
-- ═══════════════════════════════════════════════════════════════════════════
-- WHAT WAS BROKEN
--   Audited against the live database on 2026-07-29. Four separate messes, all
--   leftovers rather than design faults:
--
--   1. "Standard Box Workflow" — a template with ZERO stages, created
--      2026-07-22, used by 0 jobs. It is a same-meaning duplicate of the real
--      default, "Standard Carton Workflow" (10 stages). Anyone who picked it on
--      New Job would get a job with no workflow at all: no queue, no stage
--      gating, no department notification. It cannot be fixed by filling it in
--      — that would just be a second copy of the default.
--
--   2. Sixteen LIVE stage rows under two SOFT-DELETED templates. The old
--      "Premium Rigid Box" (10 stages) and old "Label / Sticker" (6) were
--      soft-deleted on 2026-07-25 and replaced by new templates of the same
--      name, but only the parent rows were marked deleted — the children were
--      left behind. Both old templates are used by 0 jobs, and
--      job_stage_progress / job_workflow_instances are both empty, so nothing
--      in flight depends on them.
--
--   3. Five DUPLICATE lowercase document_sequences rows — `job`, `so`, `po`,
--      `quotation`, `dispatch` — beside the uppercase `JOB`, `SO`, `PO`, `QT`,
--      `DISP` rows the app actually calls. Worse than cosmetic: the lowercase
--      rows carry DIFFERENT prefixes (`job` → `JO`, `dispatch` → `DS`), so any
--      caller that ever passed a lowercase document type would silently mint
--      `JO-2026-00001` instead of `JOB-2026-00001`. All five sit at
--      current_value = 0, so nothing has ever used them.
--
--   4. `JOB` sits at current_value = 1 without a single JOB- job existing. It
--      was consumed by an audit that called get_next_sequence_number() just to
--      see whether the function existed — that function INCREMENTS. Left alone,
--      the shop's first real job would be JOB-2026-00002.
--      (The 478 legacy jobs are the separate JOB-OLD- series and are unaffected.)
--
-- WHAT THIS DELIBERATELY DOES NOT DO
--   "Standard Carton Workflow" is missing Lamination (seq 6) and Hot Foil
--   (seq 9). Those two stages were NOT lost — they were soft-deleted by hand on
--   2026-07-26 at 16:09, one minute apart, which is a person working in
--   Settings, not a bug. CLAUDE.md §4 still lists both in the standard carton
--   flow, so one of the two is out of date. This migration does not restore
--   them: silently undoing a deliberate action is worse than the mismatch.
--   Mehboob — if that deletion was a mistake, say so and it is a two-line fix.
--
--   Nothing here is hard-deleted except the five unused sequence rows, which
--   have no children and no foreign keys pointing at them.
--
-- HOW TO UNDO
--   UPDATE workflow_templates SET deleted_at = NULL, is_active = TRUE
--    WHERE company_id = '00000000-0000-0000-0000-000000000001'
--      AND name = 'Standard Box Workflow';
--   UPDATE workflow_stages SET deleted_at = NULL, is_active = TRUE
--    WHERE deleted_at = (pick the timestamp this migration wrote);
--   -- the five sequence rows: re-insert with current_value = 0, or just let
--   -- 009's seeding recreate them.
--   UPDATE document_sequences SET current_value = 1
--    WHERE company_id = '00000000-0000-0000-0000-000000000001'
--      AND document_type = 'JOB' AND year = 2026;
--
-- MIGRATION RISK
--   No schema change at all — this is data repair only. No ALTER, no new table,
--   so no RLS policy and no PostgREST type change. Every statement is scoped by
--   company_id and guarded so re-running is a no-op. Nothing locks: the largest
--   table touched has 55 rows.
--   Verified before writing: 0 jobs reference any template being touched,
--   job_stage_progress = 0 rows, job_workflow_instances = 0 rows.
-- ═══════════════════════════════════════════════════════════════════════════

DO $$
DECLARE
  cid    UUID := '00000000-0000-0000-0000-000000000001';
  n_tpl  INTEGER;
  n_stg  INTEGER;
  n_dep  INTEGER;
  n_seq  INTEGER;
  n_job  INTEGER;
BEGIN
  -- ─── 1. RETIRE THE EMPTY DUPLICATE TEMPLATE ───────────────────────────────
  -- Guarded on "has no stages" and "has no jobs" so this can never take out a
  -- template someone has since filled in and started using.
  UPDATE workflow_templates t
     SET deleted_at = NOW(), is_active = FALSE, updated_at = NOW()
   WHERE t.company_id = cid
     AND t.name = 'Standard Box Workflow'
     AND t.deleted_at IS NULL
     AND NOT EXISTS (
       SELECT 1 FROM workflow_stages s
        WHERE s.workflow_template_id = t.id AND s.deleted_at IS NULL
     )
     AND NOT EXISTS (
       SELECT 1 FROM jobs j
        WHERE j.workflow_template_id = t.id AND j.deleted_at IS NULL
     );
  GET DIAGNOSTICS n_tpl = ROW_COUNT;

  -- ─── 2. THE ORPHANED STAGE ROWS ───────────────────────────────────────────
  -- Any live stage whose parent template is soft-deleted. Written as a rule,
  -- not as a list of 16 ids, so it also cleans up the next time a template is
  -- deleted from the UI without its children.
  UPDATE workflow_stages s
     SET deleted_at = NOW(), is_active = FALSE, updated_at = NOW()
   WHERE s.company_id = cid
     AND s.deleted_at IS NULL
     AND EXISTS (
       SELECT 1 FROM workflow_templates t
        WHERE t.id = s.workflow_template_id AND t.deleted_at IS NOT NULL
     );
  GET DIAGNOSTICS n_stg = ROW_COUNT;

  -- Dependency rows pointing at a stage that no longer exists would make
  -- checkStageGate() wait forever on something unreachable.
  UPDATE workflow_stage_dependencies d
     SET deleted_at = NOW(), is_active = FALSE, updated_at = NOW()
   WHERE d.company_id = cid
     AND d.deleted_at IS NULL
     AND EXISTS (
       SELECT 1 FROM workflow_stages s
        WHERE s.id IN (d.workflow_stage_id, d.depends_on_stage_id)
          AND s.deleted_at IS NOT NULL
     );
  GET DIAGNOSTICS n_dep = ROW_COUNT;

  -- ─── 3. THE DUPLICATE LOWERCASE SEQUENCE ROWS ─────────────────────────────
  -- Hard delete, not soft: document_sequences has no deleted_at, nothing
  -- references it by id, and a "soft-deleted" counter row would still be found
  -- by get_next_sequence_number(). Guarded on current_value = 0 so a row that
  -- has actually issued a document is never removed.
  --
  -- The pairing is spelled out rather than derived with UPPER(): two of the
  -- five don't uppercase to their real counterpart ('dispatch' → 'DISP',
  -- 'quotation' → 'QT'), and a test caught UPPER() quietly leaving 'dispatch'
  -- behind. Each row is only removed if its real uppercase partner exists.
  DELETE FROM document_sequences d
   USING (VALUES
     ('job', 'JOB'), ('so', 'SO'), ('po', 'PO'),
     ('quotation', 'QT'), ('dispatch', 'DISP')
   ) AS pair(dup, real_type)
   WHERE d.company_id = cid
     AND d.document_type = pair.dup
     AND d.current_value = 0
     AND EXISTS (
       SELECT 1 FROM document_sequences u
        WHERE u.company_id = cid AND u.document_type = pair.real_type
     );
  GET DIAGNOSTICS n_seq = ROW_COUNT;

  -- ─── 4. GIVE BACK THE JOB NUMBER THE AUDIT ATE ────────────────────────────
  -- Only when no JOB- document has actually been issued. The JOB-OLD- legacy
  -- series is a different document_type and is not consulted here.
  UPDATE document_sequences
     SET current_value = 0, updated_at = NOW()
   WHERE company_id = cid
     AND document_type = 'JOB'
     AND current_value = 1
     AND NOT EXISTS (
       SELECT 1 FROM jobs j
        WHERE j.company_id = cid AND j.job_number LIKE 'JOB-2026-%'
     );
  GET DIAGNOSTICS n_job = ROW_COUNT;

  RAISE NOTICE '107: templates retired=%, orphan stages closed=%, dependencies closed=%, duplicate sequences removed=%, JOB counter reset=%',
    n_tpl, n_stg, n_dep, n_seq, n_job;
END $$;

NOTIFY pgrst, 'reload schema';
