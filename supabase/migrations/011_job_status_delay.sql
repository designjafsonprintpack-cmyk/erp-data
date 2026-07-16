-- JAFSON PRINT ERP — MIGRATION 011: JOB STATUS & DELAY REASONS
CREATE TABLE job_statuses (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id  UUID NOT NULL REFERENCES companies(id),
  name        TEXT NOT NULL,
  slug        TEXT NOT NULL,
  color_hex   TEXT NOT NULL DEFAULT '#6e7681',
  sort_order  INTEGER NOT NULL DEFAULT 0,
  is_system   BOOLEAN NOT NULL DEFAULT FALSE,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_by UUID, updated_by UUID, deleted_at TIMESTAMPTZ,
  is_active   BOOLEAN NOT NULL DEFAULT TRUE,
  UNIQUE (company_id, slug)
);

CREATE TABLE delay_reasons (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id  UUID NOT NULL REFERENCES companies(id),
  name        TEXT NOT NULL,
  category    TEXT NOT NULL DEFAULT 'general',
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_by UUID, updated_by UUID, deleted_at TIMESTAMPTZ,
  is_active   BOOLEAN NOT NULL DEFAULT TRUE
);

CREATE INDEX idx_job_statuses_company  ON job_statuses(company_id, sort_order);
CREATE INDEX idx_delay_reasons_company ON delay_reasons(company_id);

CREATE TRIGGER trg_job_statuses_upd  BEFORE UPDATE ON job_statuses  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER trg_delay_reasons_upd BEFORE UPDATE ON delay_reasons FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

ALTER TABLE job_statuses  ENABLE ROW LEVEL SECURITY;
ALTER TABLE delay_reasons ENABLE ROW LEVEL SECURITY;
CREATE POLICY job_statuses_tenant  ON job_statuses  USING (company_id = (auth.jwt() ->> 'company_id')::UUID);
CREATE POLICY delay_reasons_tenant ON delay_reasons USING (company_id = (auth.jwt() ->> 'company_id')::UUID);

-- Seed job statuses
INSERT INTO job_statuses (company_id, name, slug, color_hex, sort_order, is_system) VALUES
  ('00000000-0000-0000-0000-000000000001', 'New',         'new',         '#2f81f7', 1,  TRUE),
  ('00000000-0000-0000-0000-000000000001', 'In Progress', 'in_progress', '#d29922', 2,  TRUE),
  ('00000000-0000-0000-0000-000000000001', 'On Hold',     'on_hold',     '#f85149', 3,  TRUE),
  ('00000000-0000-0000-0000-000000000001', 'Completed',   'completed',   '#3fb950', 4,  TRUE),
  ('00000000-0000-0000-0000-000000000001', 'Dispatched',  'dispatched',  '#58a6ff', 5,  TRUE),
  ('00000000-0000-0000-0000-000000000001', 'Cancelled',   'cancelled',   '#6e7681', 6,  TRUE);

-- Seed delay reasons
INSERT INTO delay_reasons (company_id, name, category) VALUES
  ('00000000-0000-0000-0000-000000000001', 'Board Not Available',       'material'),
  ('00000000-0000-0000-0000-000000000001', 'Material Short',            'material'),
  ('00000000-0000-0000-0000-000000000001', 'Machine Breakdown',         'machine'),
  ('00000000-0000-0000-0000-000000000001', 'Machine Maintenance',       'machine'),
  ('00000000-0000-0000-0000-000000000001', 'Operator Not Available',    'manpower'),
  ('00000000-0000-0000-0000-000000000001', 'Artwork Pending',           'artwork'),
  ('00000000-0000-0000-0000-000000000001', 'Customer Approval Pending', 'customer'),
  ('00000000-0000-0000-0000-000000000001', 'Priority Job Preemption',   'production'),
  ('00000000-0000-0000-0000-000000000001', 'Electricity Failure',       'facility'),
  ('00000000-0000-0000-0000-000000000001', 'Other',                     'general');

NOTIFY pgrst, 'reload schema';
