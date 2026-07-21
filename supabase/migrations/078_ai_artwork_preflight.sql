-- ══════════════════════════════════════════════════════════════════════════════
-- MIGRATION 078: AI ARTWORK PRE-FLIGHT CHECK — Task 48
-- ══════════════════════════════════════════════════════════════════════════════
-- Adds columns to store the result of an on-demand Claude vision check on an
-- uploaded artwork JPG — resolution/quality concerns relative to the job's
-- print size, flagged before the file goes to Planning/Printing. Purely
-- additive, nullable — an artwork row with no check run yet behaves exactly
-- as before (status NULL, no UI change unless the check is actually run).
-- ══════════════════════════════════════════════════════════════════════════════

ALTER TABLE job_artworks
  ADD COLUMN ai_preflight_status    TEXT CHECK (ai_preflight_status IN ('pass','warning','fail')),
  ADD COLUMN ai_preflight_summary   TEXT,
  ADD COLUMN ai_preflight_issues    JSONB,
  ADD COLUMN ai_preflight_checked_at TIMESTAMPTZ;

NOTIFY pgrst, 'reload schema';
