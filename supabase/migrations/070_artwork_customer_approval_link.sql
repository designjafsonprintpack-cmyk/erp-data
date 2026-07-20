-- ══════════════════════════════════════════════════════════════════════════════
-- MIGRATION 070: ARTWORK CUSTOMER APPROVAL LINK — Phase 2
-- ══════════════════════════════════════════════════════════════════════════════
-- Same token-link convention already used for quotations (migration 045)
-- and the Customer Portal: a random 32-byte token + expiry column directly
-- on the row, validated server-side with no login required.
--
-- Also tags the existing "Customer Approval" workflow stage (already
-- seeded in every template since migration 010 — Standard Carton Workflow,
-- Premium Rigid Box, Label/Sticker all already have it as stage #2, right
-- after "Artwork") with stage_type = 'customer_approval', mirroring what
-- migration 069 did for the Artwork stage. This is what lets the public
-- approval endpoint find "the customer approval stage" for a job without
-- depending on its exact name.
-- ══════════════════════════════════════════════════════════════════════════════

ALTER TABLE job_artworks
  ADD COLUMN approval_token             TEXT UNIQUE,
  ADD COLUMN approval_token_expires_at  TIMESTAMPTZ,
  ADD COLUMN approval_link_created_at   TIMESTAMPTZ;

CREATE INDEX idx_job_artworks_approval_token
  ON job_artworks(approval_token)
  WHERE approval_token IS NOT NULL;

UPDATE workflow_stages SET stage_type = 'customer_approval' WHERE name ILIKE 'customer approval';

NOTIFY pgrst, 'reload schema';
