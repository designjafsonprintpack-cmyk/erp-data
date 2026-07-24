-- ══════════════════════════════════════════════════════════════════════════════
-- MIGRATION 082: ARTWORK CLIENT APPROVAL — APPROVER IDENTITY
-- ══════════════════════════════════════════════════════════════════════════════
-- Client Approval Enhancement: capture who actually made the approve/reject/
-- request-changes decision on the public approval link, for audit history.
--
-- approved_at (migration 015) is kept as-is and untouched — it stays
-- specific to the 'approved' outcome only, matching what existing UI/API
-- code already expects from it. decided_at is new and is set on ANY
-- decision (approve/reject/request_changes), so "when was this artwork
-- decided on" is answerable regardless of outcome, without changing the
-- meaning of the existing column.
--
-- One job_artworks row = one artwork version = at most one customer
-- decision (the public route already blocks re-deciding an
-- already-approved/rejected version with a 409), so these columns living
-- directly on job_artworks is a complete per-version audit trail — no
-- separate history table needed.
-- ══════════════════════════════════════════════════════════════════════════════

ALTER TABLE job_artworks
  ADD COLUMN approver_name  TEXT,
  ADD COLUMN approver_email TEXT,
  ADD COLUMN decided_at     TIMESTAMPTZ;

NOTIFY pgrst, 'reload schema';
