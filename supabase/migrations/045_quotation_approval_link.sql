-- ══════════════════════════════════════════════════════════════════════════════
-- JAFSON PRINT ERP — MIGRATION 045: QUOTATION APPROVAL LINK
--
-- Customer-facing self-service approval, same pattern documented for Artwork:
-- a random token, 7-day expiry, IP-logged response, public page at
-- /approve/[token]. A token is minted when a quotation moves to 'sent' and
-- consumed (single use for the approve/reject action) when the customer
-- responds — the quotation's own `status` remains the source of truth,
-- these columns only carry the link mechanics.
-- ══════════════════════════════════════════════════════════════════════════════

ALTER TABLE quotations
  ADD COLUMN approval_token             TEXT UNIQUE,
  ADD COLUMN approval_token_expires_at  TIMESTAMPTZ,
  ADD COLUMN approval_responded_at      TIMESTAMPTZ,
  ADD COLUMN approval_ip                TEXT;

CREATE INDEX idx_quotations_approval_token
  ON quotations(approval_token)
  WHERE approval_token IS NOT NULL;

NOTIFY pgrst, 'reload schema';
