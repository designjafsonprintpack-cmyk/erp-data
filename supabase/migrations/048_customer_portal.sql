-- ═══════════════════════════════════════════════════════════════════════════
-- PHASE B — CUSTOMER PORTAL
-- ═══════════════════════════════════════════════════════════════════════════
-- Read-only, token-based portal access — same pattern as the quotation
-- approval link (045_quotation_approval_link.sql): no separate customer
-- login/auth system, just a long-lived rotating token a staff member shares
-- with the customer. Public routes are scoped strictly by the token and use
-- the service-role client, never a session.
-- ═══════════════════════════════════════════════════════════════════════════

ALTER TABLE customers
  ADD COLUMN IF NOT EXISTS portal_token TEXT UNIQUE,
  ADD COLUMN IF NOT EXISTS portal_token_expires_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS portal_enabled BOOLEAN NOT NULL DEFAULT FALSE;

CREATE INDEX IF NOT EXISTS idx_customers_portal_token ON customers(portal_token) WHERE portal_token IS NOT NULL;

NOTIFY pgrst, 'reload schema';
