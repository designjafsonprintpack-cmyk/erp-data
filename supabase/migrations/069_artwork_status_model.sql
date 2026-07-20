-- ══════════════════════════════════════════════════════════════════════════════
-- MIGRATION 069: ARTWORK STATUS MODEL — Phase 1 of the Artwork/Plates redesign
-- ══════════════════════════════════════════════════════════════════════════════
-- Replaces job_artworks' single is_production_ready boolean with a real
-- status state machine:
--   draft -> internal_review -> waiting_customer_approval ->
--     (changes_requested -> back to draft, or) approved -> archived
--   (rejected is a terminal state reachable from waiting_customer_approval)
--
-- is_production_ready is KEPT (not dropped) for this release, per the
-- documented migration strategy: it's still read by the production gate in
-- jobs/[id]/workflow/route.ts. That route is updated in THIS SAME migration
-- batch (application code, not SQL) to read `status = 'approved'` instead —
-- is_production_ready becomes a mirrored/derived field the API keeps in
-- sync going forward (set true only when status moves to 'approved'), so
-- nothing that still reads the boolean silently breaks, and it can be
-- dropped cleanly in a later migration once confirmed nothing else needs it.
--
-- Also adds workflow_stages.stage_type so the production gate can match on
-- TYPE instead of matching the literal string "Artwork" against
-- workflow_stages.name — today, renaming that one stage silently disables
-- the entire artwork-approval production gate with no error anywhere.
-- ══════════════════════════════════════════════════════════════════════════════

ALTER TABLE job_artworks
  ADD COLUMN status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN (
    'draft', 'internal_review', 'waiting_customer_approval',
    'changes_requested', 'approved', 'rejected', 'archived'
  ));

-- Backfill from the existing boolean so nothing already marked ready loses
-- its state.
UPDATE job_artworks SET status = 'approved' WHERE is_production_ready = TRUE;

CREATE INDEX idx_job_artworks_status ON job_artworks(job_id, status);

ALTER TABLE workflow_stages ADD COLUMN stage_type TEXT;

-- Backfill: any existing stage literally named "Artwork" (case-insensitive)
-- is tagged as the artwork stage type, preserving current gate behavior
-- across every already-created workflow template.
UPDATE workflow_stages SET stage_type = 'artwork' WHERE name ILIKE 'artwork';

COMMENT ON COLUMN workflow_stages.stage_type IS
  'Optional stage category for server-side rules that need to find "the artwork stage" (or similar) without depending on exact stage naming. NULL for stages with no special rule attached. Currently only ''artwork'' is used, by the production gate in jobs/[id]/workflow/route.ts.';

-- Extend the job_stage_events type check (same pattern as migration 042 did
-- for plate_assigned/plate_returned) so artwork status transitions can be
-- recorded on the job timeline alongside everything else.
ALTER TABLE job_stage_events DROP CONSTRAINT job_stage_events_event_type_check;
ALTER TABLE job_stage_events ADD CONSTRAINT job_stage_events_event_type_check
  CHECK (event_type IN (
    'created','status_changed','stage_started','stage_completed',
    'stage_skipped','hold_started','hold_ended','remark_added',
    'artwork_uploaded','repeat_created','assigned','priority_changed',
    'wastage_recorded','plate_assigned','plate_returned',
    'artwork_status_changed'
  ));

NOTIFY pgrst, 'reload schema';
