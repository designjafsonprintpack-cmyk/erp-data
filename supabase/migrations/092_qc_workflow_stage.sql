-- JAFSON PRINT ERP — MIGRATION 092: QC BECOMES A WORKFLOW STAGE
--
-- WHAT WAS BROKEN
-- The QC module existed (templates, inspections, defects, reprints) but QC was
-- not a stage in ANY workflow template. So nothing in the system ever asked for
-- an inspection: a job could run Packing → Dispatch with zero QC recorded and no
-- gate stopped it. QC only happened if someone remembered to open the QC page
-- and create an inspection by hand — the same "nobody surfaces the work" hole
-- that migration 091 closed for every other department.
--
-- WHAT THIS DOES
--   1. Creates a QC department (the seed in migration 002 has eleven
--      departments but no QC, so the stage had nothing to belong to).
--   2. Inserts a "Quality Check" stage into every active template that has a
--      Dispatch stage, positioned immediately before Dispatch, and shifts
--      Dispatch (and anything after it) one place down.
--   3. Tags it stage_type = 'qc' so the application can gate on it — the
--      workflow route now refuses to COMPLETE a QC stage until this job has a
--      passing inspection on record, the same way it already refuses to
--      complete Artwork without an approved version and Board Issue without an
--      issued MRN.
--   4. Adds jobs_costings.deleted_at for consistency with every other parent
--      document (it only had is_active).
--
-- SAFE FOR RUNNING JOBS
-- job_stage_progress carries its OWN copy of sequence_order, written when the
-- job was created. Renumbering the template's stages therefore cannot disturb a
-- job already in flight, and no in-flight job gets a new pending QC row — they
-- finish on the workflow they started with. Only jobs created after this
-- migration carry the QC stage. Same precedent as migration 086.
--
-- HOW TO UNDO
--   UPDATE workflow_stages SET deleted_at = NOW(), is_active = FALSE
--     WHERE stage_type = 'qc';
--   -- then close the gap left behind:
--   -- UPDATE workflow_stages s SET sequence_order = sequence_order - 1
--   --   WHERE s.deleted_at IS NULL AND s.sequence_order > (the qc order);
--   UPDATE departments SET deleted_at = NOW(), is_active = FALSE WHERE code = 'QC';
--   ALTER TABLE job_costings DROP COLUMN IF EXISTS deleted_at;
-- Soft delete only — job_stage_progress.workflow_stage_id is a hard FK.

-- ══════════════════════════════════════════════════════════════════════════
-- 1. QC DEPARTMENT
-- ══════════════════════════════════════════════════════════════════════════
INSERT INTO departments (company_id, name, code)
SELECT c.id, 'Quality Control', 'QC'
FROM companies c
WHERE NOT EXISTS (
  SELECT 1 FROM departments d
  WHERE d.company_id = c.id AND d.code = 'QC' AND d.deleted_at IS NULL
);

-- ══════════════════════════════════════════════════════════════════════════
-- 2. INSERT THE STAGE BEFORE DISPATCH, IN EVERY TEMPLATE THAT HAS ONE
-- ══════════════════════════════════════════════════════════════════════════
DO $$
DECLARE
  t RECORD;
  v_dispatch_order INTEGER;
  v_dept_id UUID;
BEGIN
  FOR t IN
    SELECT DISTINCT wt.id AS template_id, wt.company_id, wt.name
    FROM workflow_templates wt
    JOIN workflow_stages s ON s.workflow_template_id = wt.id
    WHERE wt.deleted_at IS NULL AND wt.is_active
      AND s.deleted_at IS NULL AND s.is_active
      AND lower(s.name) = 'dispatch'
  LOOP
    -- already has a QC stage? leave it alone
    IF EXISTS (
      SELECT 1 FROM workflow_stages s
      WHERE s.workflow_template_id = t.template_id
        AND s.deleted_at IS NULL
        AND (s.stage_type = 'qc' OR lower(s.name) IN ('quality check', 'qc'))
    ) THEN
      CONTINUE;
    END IF;

    SELECT MIN(sequence_order) INTO v_dispatch_order
    FROM workflow_stages
    WHERE workflow_template_id = t.template_id
      AND deleted_at IS NULL AND is_active
      AND lower(name) = 'dispatch';

    SELECT id INTO v_dept_id FROM departments
    WHERE company_id = t.company_id AND code = 'QC' AND deleted_at IS NULL
    LIMIT 1;

    -- make room: Dispatch and anything after it move down one
    UPDATE workflow_stages
    SET sequence_order = sequence_order + 1, updated_at = NOW()
    WHERE workflow_template_id = t.template_id
      AND deleted_at IS NULL
      AND sequence_order >= v_dispatch_order;

    INSERT INTO workflow_stages
      (company_id, workflow_template_id, name, department_id, sequence_order,
       is_optional, stage_type, estimated_hours)
    VALUES
      (t.company_id, t.template_id, 'Quality Check', v_dept_id, v_dispatch_order,
       FALSE, 'qc', 2);

    RAISE NOTICE 'QC stage added to template % at order %', t.name, v_dispatch_order;
  END LOOP;
END $$;

COMMENT ON COLUMN workflow_stages.stage_type IS
  'Which coded behaviour this stage carries: artwork_approval (needs an approved artwork version), board_issue (auto-creates an MRN on start, needs it issued to complete), printing (hard-blocked without plates), qc (needs a passing inspection to complete), plus plain labels for the rest. NULL means no special handling.';

-- ══════════════════════════════════════════════════════════════════════════
-- 3. job_costings SOFT DELETE
-- ══════════════════════════════════════════════════════════════════════════
-- Every other parent document carries deleted_at; this one only had is_active,
-- so it was the one money record that couldn't be soft-deleted the standard way.
ALTER TABLE job_costings ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ;
CREATE INDEX IF NOT EXISTS idx_job_costings_live
  ON job_costings(job_id) WHERE deleted_at IS NULL;

-- ══════════════════════════════════════════════════════════════════════════
-- VERIFY (run separately)
-- ══════════════════════════════════════════════════════════════════════════
--   SELECT t.name AS template, s.sequence_order, s.name AS stage,
--          s.stage_type, d.name AS department
--   FROM workflow_stages s
--   JOIN workflow_templates t ON t.id = s.workflow_template_id
--   LEFT JOIN departments d ON d.id = s.department_id
--   WHERE s.deleted_at IS NULL AND s.is_active
--   ORDER BY t.name, s.sequence_order;
--
-- Quality Check must appear immediately before Dispatch in every template, with
-- department "Quality Control", and no two stages sharing a sequence_order.

NOTIFY pgrst, 'reload schema';
