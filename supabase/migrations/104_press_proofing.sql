-- ═══════════════════════════════════════════════════════════════════════════
-- PRESS PROOFING (WET PROOF)
-- ═══════════════════════════════════════════════════════════════════════════
-- WHAT WAS MISSING
--   The shop prints 100–500 sheets on the press purely to show the customer
--   the real colour. If the customer says yes, the main run is cleared; if not,
--   changes are made and another proof is pulled. The ERP had no idea any of
--   this happened: "proof" existed only as Proof of Delivery on dispatch, and
--   the board, ink, plates and press time a proof run burns were invisible to
--   costing and to every material report.
--
-- WHY IT IS MODELLED THIS WAY
--   Mehboob's own description: "yeh job ki tarah hi hai, bas iska tag proofing
--   hota hai." So a proof run IS a job — not a child record hanging off one.
--   That is also the cheapest correct model: because the row lives in `jobs`,
--   board issue, MRNs, plates, machine assignment, wastage, ink usage and
--   costing all work on it with ZERO new code. Only the tag is new.
--   This follows the pattern `parent_job_id` / `is_repeat` / `repeat_kind`
--   already set for repeat jobs (097) rather than inventing a second one.
--
-- NUMBERING
--   A proof run is numbered off its parent — JOB-0123-P1, JOB-0123-P2 — so it
--   reads as "proof 1 of JOB-0123" at a glance and, deliberately, does NOT
--   consume the JOB counter. Same reasoning as the JOB-OLD legacy series (093):
--   a separate series keeps the live sequence meaning what it always meant.
--
-- HOW TO UNDO
--   DELETE FROM workflow_stages WHERE workflow_template_id IN
--     (SELECT id FROM workflow_templates WHERE name = 'Proofing Run');
--   DELETE FROM workflow_templates WHERE name = 'Proofing Run';
--   ALTER TABLE jobs DROP COLUMN job_kind, DROP COLUMN proof_round,
--     DROP COLUMN proof_result, DROP COLUMN proof_notes,
--     DROP COLUMN proof_decided_at, DROP COLUMN proof_decided_by;
--   Additive: every existing job defaults to job_kind='production' and is
--   untouched in every other respect.
--
-- MIGRATION RISK
--   Backward compatible — deployed code never reads these columns, so the
--     migration can be run before or after the deploy without a 500.
--   Locking — ADD COLUMN with a constant DEFAULT does not rewrite the table
--     on PG 11+. The CHECK constraints and the FK do take a brief ACCESS
--     EXCLUSIVE lock to validate existing rows, and the indexes are built
--     non-CONCURRENTLY; at ~478 jobs all of that is instant. Revisit if
--     `jobs` ever reaches six figures.
--   No backfill — the DEFAULT covers every existing row.
--   No new table, so no new RLS policies. jobs already carries its tenant
--     policy and trg_audit_jobs, so proof rounds and customer verdicts land
--     in the audit log for free.
--   KNOWN CONSEQUENCE — jobs.parent_job_id is REFERENCES jobs(id) with no
--     ON DELETE clause (014). A job that has proof runs therefore cannot be
--     hard-deleted until those proof runs are deleted first. That is already
--     true today for repeat jobs; proofing just makes it common. Job delete
--     is superadmin-only, so the error surfaces to the right person.
--   src/types/database.types.ts goes stale until regenerated. Harmless here
--     because Supabase calls are cast `(supabase as any)` codebase-wide.
-- ═══════════════════════════════════════════════════════════════════════════

-- ─── 1. THE TAG ──────────────────────────────────────────────────────────────
ALTER TABLE jobs
  ADD COLUMN IF NOT EXISTS job_kind         TEXT NOT NULL DEFAULT 'production',
  ADD COLUMN IF NOT EXISTS proof_round      INTEGER,
  ADD COLUMN IF NOT EXISTS proof_result     TEXT,
  ADD COLUMN IF NOT EXISTS proof_notes      TEXT,
  ADD COLUMN IF NOT EXISTS proof_decided_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS proof_decided_by UUID REFERENCES users(id),
  -- WHICH artwork version actually went on the press for this round.
  -- Without it, "the customer approved proof 2" cannot be tied back to a
  -- specific file six months later, which is the one question a colour
  -- dispute always turns on. job_artworks is already immutably versioned
  -- (UNIQUE (company_id, job_id, version)), so this points at a fixed row.
  -- SET NULL rather than NO ACTION: a job is HARD-deleted here, which
  -- cascade-deletes its job_artworks — a proof row must not block that.
  ADD COLUMN IF NOT EXISTS proof_artwork_id UUID REFERENCES job_artworks(id) ON DELETE SET NULL;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'jobs_job_kind_check') THEN
    ALTER TABLE jobs ADD CONSTRAINT jobs_job_kind_check
      CHECK (job_kind IN ('production', 'proofing'));
  END IF;

  -- proof_result is NULL on a production job and set on a proofing one.
  -- 'pending' = printed, sitting with the customer; 'changes_required' = the
  -- customer wants it changed, so another round will follow.
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'jobs_proof_result_check') THEN
    ALTER TABLE jobs ADD CONSTRAINT jobs_proof_result_check
      CHECK (proof_result IS NULL OR proof_result IN ('pending', 'approved', 'changes_required'));
  END IF;
END $$;

COMMENT ON COLUMN jobs.job_kind IS
  'production (default) or proofing. A proofing row is a real job — board, plates, press time all flow through it — tagged so it stays out of production lists and counts.';
COMMENT ON COLUMN jobs.proof_round IS
  'Which press proof this is for the parent job: 1, 2, 3... NULL on production jobs.';

-- UNITS — "quantity" is ambiguous in this trade, so state it once, here.
-- A press proof is ordered in SHEETS ("100, 200 ya 500 sheets"), not boxes.
-- So on a proofing job sheet_qty carries the proof run size and quantity
-- stays 0 — the same convention the legacy import (093) used for jobs whose
-- box count was unknown. The locked rule Sheet Qty = ceil(Box Qty / Ups)
-- runs the other way and does NOT apply to a proof: nobody derives a proof
-- run from a box count, the press minder just asks for N sheets.
COMMENT ON COLUMN jobs.sheet_qty IS
  'Sheets. On a proofing job (job_kind = proofing) this is the proof run size and quantity stays 0; on a production job it is ceil(quantity / ups).';

-- Every proofing lookup is "the proof runs of this job", so index that shape.
CREATE INDEX IF NOT EXISTS idx_jobs_proof_parent
  ON jobs (parent_job_id, proof_round)
  WHERE job_kind = 'proofing' AND deleted_at IS NULL;

-- The production lists and every job count filter on this.
CREATE INDEX IF NOT EXISTS idx_jobs_kind
  ON jobs (company_id, job_kind)
  WHERE deleted_at IS NULL;

-- ─── 2. THE PROOFING WORKFLOW ────────────────────────────────────────────────
-- A proof run does NOT go through die cutting, gluing, packing, QC or dispatch
-- — it is board out of store, onto the press, and into the customer's hands.
-- So it gets its own two-stage template rather than the parent's full one.
--
-- department_id is populated here on purpose. Migration 091 exists solely
-- because stages were created with it left NULL back in 010, which silently
-- emptied Department Queue and stage notifications for everyone. Not repeating
-- that: the departments are looked up by name rather than hardcoded as UUIDs.
DO $$
DECLARE
  v_company   UUID := '00000000-0000-0000-0000-000000000001';
  v_tpl       UUID;
  v_store     UUID;
  v_printing  UUID;
BEGIN
  SELECT id INTO v_store    FROM departments WHERE company_id = v_company AND name = 'Store'    AND deleted_at IS NULL LIMIT 1;
  SELECT id INTO v_printing FROM departments WHERE company_id = v_company AND name = 'Printing' AND deleted_at IS NULL LIMIT 1;

  SELECT id INTO v_tpl FROM workflow_templates
   WHERE company_id = v_company AND name = 'Proofing Run' AND deleted_at IS NULL LIMIT 1;

  IF v_tpl IS NULL THEN
    INSERT INTO workflow_templates (company_id, name, description, is_default)
    VALUES (v_company, 'Proofing Run',
            'Press proof: board issue then printing only. Used by proofing jobs (JOB-xxxx-Pn).',
            FALSE)
    RETURNING id INTO v_tpl;

    INSERT INTO workflow_stages
      (company_id, workflow_template_id, name, stage_type, department_id, sequence_order, is_optional, estimated_hours)
    VALUES
      (v_company, v_tpl, 'Board Issue', 'board_issue', v_store,    1, FALSE, 1),
      (v_company, v_tpl, 'Printing',    'printing',    v_printing, 2, FALSE, 2);
  END IF;
END $$;

NOTIFY pgrst, 'reload schema';
