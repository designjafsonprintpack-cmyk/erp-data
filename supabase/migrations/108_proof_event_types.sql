-- ═══════════════════════════════════════════════════════════════════════════
-- ALLOW THE PRESS-PROOF EVENT TYPES ON job_stage_events
-- ═══════════════════════════════════════════════════════════════════════════
-- WHAT WAS BROKEN
--   Migration 104 added press proofing and the code writes two new job events:
--     src/app/api/v1/jobs/[id]/proofs/route.ts  →  'proof_created'
--                                               →  'proof_decided'
--   ...but 104 never widened job_stage_events_event_type_check, whose value
--   list was last restated by 102. Both inserts violate the CHECK.
--
--   It fails SILENTLY. recordJobEvent() in
--   src/modules/jobs/services/jobEventService.ts does not read the insert's
--   error, so the request still returns 200 — the proof run is created, the
--   verdict is saved, and only the audit trail quietly loses them. Job History
--   would never show that a press proof was pulled or approved.
--
--   Caught by walking one job end to end through the real API routes against
--   the live database on 2026-07-29, then probing the constraint directly:
--     new row for relation "job_stage_events" violates check constraint
--     "job_stage_events_event_type_check"
--
--   Everything else the code emits was checked in the same pass and is already
--   allowed: created, status_changed, stage_started, stage_completed,
--   stage_skipped, hold_started, hold_ended, remark_added, artwork_uploaded,
--   repeat_created, assigned, priority_changed, wastage_recorded,
--   plate_assigned, plate_returned, artwork_status_changed, ink_recorded.
--   ('ping.test' belongs to webhook_deliveries, not this table.)
--
-- HOW TO UNDO
--   Re-apply the value list from 102 — i.e. this same statement without the
--   last two entries. Any proof rows already written would then have to be
--   deleted first or the constraint will not validate.
--
-- MIGRATION RISK
--   Widening a CHECK only. No column, no table, no RLS, no data change. Every
--   row that satisfies the old constraint satisfies this one, so the validation
--   scan cannot fail. job_stage_events is small (27 rows for a single job) and
--   the scan takes an ACCESS EXCLUSIVE lock only for its duration.
--   Not a table rewrite.
--
--   Postgres has no ADD CONSTRAINT IF NOT EXISTS, so this follows the same
--   DROP-then-ADD shape 028, 042, 069 and 102 all used, and restates the whole
--   list — that is the established pattern here, not an oversight.
-- ═══════════════════════════════════════════════════════════════════════════

ALTER TABLE job_stage_events DROP CONSTRAINT IF EXISTS job_stage_events_event_type_check;
ALTER TABLE job_stage_events ADD CONSTRAINT job_stage_events_event_type_check
  CHECK (event_type IN (
    'created','status_changed','stage_started','stage_completed',
    'stage_skipped','hold_started','hold_ended','remark_added',
    'artwork_uploaded','repeat_created','assigned','priority_changed',
    'wastage_recorded','plate_assigned','plate_returned',
    'artwork_status_changed','ink_recorded',
    'proof_created','proof_decided'
  ));

NOTIFY pgrst, 'reload schema';
