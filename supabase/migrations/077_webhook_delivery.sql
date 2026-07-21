-- ══════════════════════════════════════════════════════════════════════════════
-- MIGRATION 077: WEBHOOK DELIVERY — Task 21
-- ══════════════════════════════════════════════════════════════════════════════
-- Lets Mehboob (or a customer's own system, via Zapier/Make/custom code)
-- register a URL that gets an HTTPS POST whenever a subscribed business
-- event happens. Two tables: webhook_endpoints (what to call, which events,
-- a signing secret) and webhook_deliveries (every attempt, for a visible
-- delivery log / debugging — same spirit as the existing audit_log table
-- but scoped to outbound calls instead of DB writes).
--
-- Scope for this pass: two real trigger points wired in app code (not in
-- this migration) — dispatch delivered (POD confirmed) and invoice payment
-- recorded. Event vocabulary is a plain text column, not a DB enum, so
-- Mehboob can ask for more event types later without a migration.
-- ══════════════════════════════════════════════════════════════════════════════

CREATE TABLE webhook_endpoints (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id    UUID NOT NULL REFERENCES companies(id),
  name          TEXT NOT NULL,
  url           TEXT NOT NULL,
  secret        TEXT NOT NULL,              -- HMAC-SHA256 signing key, shown once on creation
  event_types   TEXT[] NOT NULL DEFAULT '{}', -- e.g. {'dispatch.delivered','invoice.payment_recorded'}
  is_active     BOOLEAN NOT NULL DEFAULT TRUE,

  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_by    UUID,
  updated_by    UUID,
  deleted_at    TIMESTAMPTZ,
  is_active_row BOOLEAN NOT NULL DEFAULT TRUE  -- placeholder never used, see note below
);

-- NOTE: is_active already carries the endpoint's own on/off toggle (a real
-- business field the UI needs), so the universal 8-column pattern's own
-- is_active would collide with it. Drop the placeholder and use deleted_at
-- alone for the soft-delete half of the pattern instead.
ALTER TABLE webhook_endpoints DROP COLUMN is_active_row;

CREATE INDEX idx_webhook_endpoints_company ON webhook_endpoints(company_id);

CREATE TRIGGER trg_webhook_endpoints_updated_at BEFORE UPDATE ON webhook_endpoints
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

ALTER TABLE webhook_endpoints ENABLE ROW LEVEL SECURITY;
CREATE POLICY webhook_endpoints_tenant ON webhook_endpoints
  USING (company_id = (auth.jwt() ->> 'company_id')::UUID);

CREATE TRIGGER trg_audit_webhook_endpoints AFTER INSERT OR UPDATE OR DELETE ON webhook_endpoints
  FOR EACH ROW EXECUTE FUNCTION log_audit_event();

CREATE TABLE webhook_deliveries (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id    UUID NOT NULL REFERENCES companies(id),
  endpoint_id   UUID NOT NULL REFERENCES webhook_endpoints(id),
  event_type    TEXT NOT NULL,
  payload       JSONB NOT NULL,
  status        TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','success','failed')),
  response_code INTEGER,
  error_message TEXT,
  attempt_count INTEGER NOT NULL DEFAULT 0,
  attempted_at  TIMESTAMPTZ,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_webhook_deliveries_endpoint ON webhook_deliveries(endpoint_id, created_at DESC);

ALTER TABLE webhook_deliveries ENABLE ROW LEVEL SECURITY;
CREATE POLICY webhook_deliveries_tenant ON webhook_deliveries
  USING (company_id = (auth.jwt() ->> 'company_id')::UUID);

NOTIFY pgrst, 'reload schema';
