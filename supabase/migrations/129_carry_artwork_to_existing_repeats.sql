-- 129 — the repeats that were promised their parent's artwork and never got it
--
-- WHAT BROKE
--   The Repeat dialog's checkbox reads "Link artwork from original job (same
--   artwork, no new artwork needed)" and defaults to ON. It only ever wrote a
--   row into `job_artwork_references` — a note pointing at the parent. Nothing
--   reads that table.
--
--   The workflow's artwork gate reads `job_artworks` for THE JOB BEING
--   COMPLETED, so an exact repeat with the box ticked had zero artwork rows and
--   could never get past its first stage:
--
--       Cannot complete "Artwork & Customer Approval"
--       — no approved artwork version exists for this job yet.
--
--   The files then got uploaded onto the COMPLETED parent jobs instead, where
--   there is no workflow at all (all 478 legacy jobs have 0 stage rows) — so
--   the artwork auto-start silently did nothing there either. Both symptoms,
--   one cause. The route is fixed in the same change as this migration; this
--   repairs the three jobs already standing at that wall.
--
-- WHICH ROWS ARE COPIED
--   The latest APPROVED version of every design on the parent (migration 124 —
--   a lid and a base are two designs and the gate wants both). Version resets
--   to 1: this is the repeat's own revision history, and where it came from is
--   recorded in `designer_notes`. `approved_at` / `approved_by` are the
--   PARENT's — the customer signed that design off then, and stamping today
--   would invent an approval that never happened.
--
-- THE FILE IS SHARED, NOT COPIED
--   Two rows point at one storage object. That is already safe: the retention
--   sweep (src/lib/utils/artworkRetention.ts) builds its keep-set from every
--   LIVE row's file_url and lets "keep" beat "expired", so deleting the
--   parent's artwork cannot take the repeat's file with it.
--
-- SCOPED BY NAME, AND IDEMPOTENT
--   Restricted to the three known jobs rather than "every repeat missing
--   artwork", which would be right today and wrong forever after — a repeat
--   whose artwork was deliberately deleted would silently get it back. The
--   NOT EXISTS guard means a re-run inserts nothing.
--
-- JOB-2026-00004 is deliberately NOT here: its parent (JOB-2025-00451) has no
-- approved artwork to carry, so there is nothing to copy.
--
-- UNDO
--   DELETE FROM job_artworks
--    WHERE designer_notes LIKE 'Carried over from JOB-2025-%'
--      AND job_id IN (SELECT id FROM jobs
--                      WHERE job_number IN ('JOB-2026-00008','JOB-2026-00009','JOB-2026-00010'));
--   UPDATE job_stage_progress SET status='pending', started_at=NULL
--    WHERE id IN (SELECT p.id FROM job_stage_progress p
--                   JOIN jobs j ON j.id=p.job_id
--                   JOIN workflow_stages ws ON ws.id=p.workflow_stage_id
--                  WHERE j.job_number IN ('JOB-2026-00008','JOB-2026-00009')
--                    AND ws.stage_type='artwork_approval');
--   UPDATE jobs SET status='new' WHERE job_number IN ('JOB-2026-00008','JOB-2026-00009');
--   DELETE FROM job_stage_events WHERE notes = 'Migration 129 — artwork carried over from the original job';

-- ─── 1. copy the parent's latest approved version of every design ────────────
WITH target AS (
  SELECT id, job_number, parent_job_id, company_id
    FROM jobs
   WHERE job_number IN ('JOB-2026-00008', 'JOB-2026-00009', 'JOB-2026-00010')
     AND deleted_at IS NULL
     AND parent_job_id IS NOT NULL
),
src AS (
  SELECT DISTINCT ON (t.id, a.design_no)
         t.id AS new_job_id, t.company_id, t.parent_job_id,
         a.design_no, a.design_label, a.version,
         a.file_name, a.file_url, a.file_size, a.file_type,
         a.approved_at, a.approved_by
    FROM target t
    JOIN job_artworks a
      ON a.job_id = t.parent_job_id
     AND a.deleted_at IS NULL
     AND a.status = 'approved'
   ORDER BY t.id, a.design_no, a.version DESC
)
INSERT INTO job_artworks (
  company_id, job_id, design_no, design_label, version,
  file_name, file_url, file_size, file_type, designer_notes,
  status, is_production_ready, approved_at, approved_by
)
SELECT s.company_id, s.new_job_id, s.design_no, s.design_label, 1,
       s.file_name, s.file_url, s.file_size, s.file_type,
       'Carried over from ' || p.job_number || ' (design ' || s.design_no || ' v' || s.version || ')',
       'approved', TRUE, COALESCE(s.approved_at, NOW()), s.approved_by
  FROM src s
  JOIN jobs p ON p.id = s.parent_job_id
 WHERE NOT EXISTS (
   SELECT 1 FROM job_artworks x
    WHERE x.job_id = s.new_job_id
      AND x.design_no = s.design_no
      AND x.deleted_at IS NULL
 );

-- ─── 2. start the artwork stage, exactly as an upload now does ───────────────
-- Only a stage still `pending`, and only where nothing earlier is unfinished —
-- the same two conditions autoStartArtworkStage() applies. JOB-2026-00010's
-- stage is already in_progress and is left alone.
WITH started AS (
  UPDATE job_stage_progress p
     SET status = 'in_progress', started_at = NOW()
    FROM jobs j, workflow_stages ws
   WHERE p.job_id = j.id
     AND ws.id = p.workflow_stage_id
     AND j.job_number IN ('JOB-2026-00008', 'JOB-2026-00009', 'JOB-2026-00010')
     AND ws.stage_type IN ('artwork', 'artwork_approval')
     AND p.status = 'pending'
     AND NOT EXISTS (
       SELECT 1 FROM job_stage_progress e
        WHERE e.job_id = p.job_id
          AND e.sequence_order < p.sequence_order
          AND e.status NOT IN ('completed', 'skipped')
     )
     AND EXISTS (
       SELECT 1 FROM job_artworks a
        WHERE a.job_id = j.id AND a.deleted_at IS NULL AND a.status = 'approved'
     )
  RETURNING p.id AS stage_id, p.job_id, j.company_id
)
INSERT INTO job_stage_events (company_id, job_id, event_type, stage_id, new_value, notes)
SELECT company_id, job_id, 'stage_started', stage_id, 'Artwork',
       'Migration 129 — artwork carried over from the original job'
  FROM started;

-- ─── 3. the same bookkeeping the route does after a first stage start ────────
UPDATE jobs
   SET status = 'in_progress'
 WHERE job_number IN ('JOB-2026-00008', 'JOB-2026-00009', 'JOB-2026-00010')
   AND status = 'new';

UPDATE jobs j
   SET current_stage_id = (
     SELECT p.id FROM job_stage_progress p
      WHERE p.job_id = j.id AND p.is_active = TRUE
        AND p.status IN ('in_progress', 'pending')
      ORDER BY (p.status = 'in_progress') DESC, p.sequence_order
      LIMIT 1
   )
 WHERE j.job_number IN ('JOB-2026-00008', 'JOB-2026-00009', 'JOB-2026-00010');

NOTIFY pgrst, 'reload schema';
