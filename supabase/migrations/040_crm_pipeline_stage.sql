-- ══════════════════════════════════════════════════════════════════════════════
-- JAFSON PRINT ERP — MIGRATION 040: CRM LEAD/PROSPECT PIPELINE
-- Every contact became a full "customer" immediately — there was no lead or
-- prospect stage before that, which is a standard CRM feature.
--
-- Default is 'customer' so existing rows and the existing "New Customer" flow
-- are completely unaffected — this only adds the option to start someone off
-- as a lead or prospect instead.
-- ══════════════════════════════════════════════════════════════════════════════

ALTER TABLE customers ADD COLUMN pipeline_stage TEXT NOT NULL DEFAULT 'customer'
  CHECK (pipeline_stage IN ('lead', 'prospect', 'customer'));

CREATE INDEX idx_customers_pipeline_stage ON customers(company_id, pipeline_stage);

NOTIFY pgrst, 'reload schema';
