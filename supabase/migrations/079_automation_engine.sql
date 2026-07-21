-- ══════════════════════════════════════════════════════════════════════════════
-- MIGRATION 079: RULE-BASED AUTOMATION ENGINE — Task 41
-- ══════════════════════════════════════════════════════════════════════════════
-- A fully generic "IF anything, THEN anything" rule builder was explicitly
-- avoided here (same reasoning that got Task 53 plugin architecture skipped
-- — an abstract engine with no concrete use case is a maintenance burden,
-- not a feature). Instead: a small fixed set of rule TYPES, each with a
-- narrow config shape, covering the 3 real examples discussed:
--   job_on_hold_duration  — job on hold longer than N days -> notify
--   invoice_overdue       — invoice overdue -> email the customer a reminder
--   new_customer          — new customer created -> notify Sales dept
-- New rule types can be added later (new rule_type value + a case in the
-- evaluator), same extensibility pattern as webhook_endpoints.event_types.
-- ══════════════════════════════════════════════════════════════════════════════

CREATE TABLE automation_rules (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id    UUID NOT NULL REFERENCES companies(id),
  rule_type     TEXT NOT NULL CHECK (rule_type IN ('job_on_hold_duration','invoice_overdue','new_customer')),
  name          TEXT NOT NULL,
  is_active     BOOLEAN NOT NULL DEFAULT TRUE,
  config        JSONB NOT NULL DEFAULT '{}',  -- e.g. {"threshold_days": 2} for job_on_hold_duration
  last_run_at   TIMESTAMPTZ,

  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_by    UUID,
  updated_by    UUID,
  deleted_at    TIMESTAMPTZ,

  UNIQUE (company_id, rule_type)  -- one config per rule type per company, matches how the Settings UI presents this (3 fixed toggles, not a free-form list)
);

CREATE INDEX idx_automation_rules_company ON automation_rules(company_id);

CREATE TRIGGER trg_automation_rules_updated_at BEFORE UPDATE ON automation_rules
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

ALTER TABLE automation_rules ENABLE ROW LEVEL SECURITY;
CREATE POLICY automation_rules_tenant ON automation_rules
  USING (company_id = (auth.jwt() ->> 'company_id')::UUID);

CREATE TRIGGER trg_audit_automation_rules AFTER INSERT OR UPDATE OR DELETE ON automation_rules
  FOR EACH ROW EXECUTE FUNCTION log_audit_event();

-- Log of firings, same spirit as webhook_deliveries — lets Mehboob see the
-- rule actually did something instead of it being invisible background magic.
CREATE TABLE automation_rule_runs (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id    UUID NOT NULL REFERENCES companies(id),
  rule_id       UUID NOT NULL REFERENCES automation_rules(id),
  triggered_for TEXT,              -- e.g. job number / invoice number / customer name, for a readable log
  action_taken  TEXT NOT NULL,     -- short human-readable description of what happened
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_automation_rule_runs_rule ON automation_rule_runs(rule_id, created_at DESC);

ALTER TABLE automation_rule_runs ENABLE ROW LEVEL SECURITY;
CREATE POLICY automation_rule_runs_tenant ON automation_rule_runs
  USING (company_id = (auth.jwt() ->> 'company_id')::UUID);

NOTIFY pgrst, 'reload schema';
