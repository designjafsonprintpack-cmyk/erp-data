-- JAFSON PRINT ERP — MIGRATION 010: WORKFLOW ENGINE
CREATE TABLE workflow_templates (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id  UUID NOT NULL REFERENCES companies(id),
  name        TEXT NOT NULL,
  description TEXT,
  is_default  BOOLEAN NOT NULL DEFAULT FALSE,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_by  UUID, updated_by UUID, deleted_at TIMESTAMPTZ,
  is_active   BOOLEAN NOT NULL DEFAULT TRUE
);

CREATE TABLE workflow_stages (
  id                   UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id           UUID NOT NULL REFERENCES companies(id),
  workflow_template_id UUID NOT NULL REFERENCES workflow_templates(id) ON DELETE CASCADE,
  name                 TEXT NOT NULL,
  department_id        UUID REFERENCES departments(id),
  sequence_order       INTEGER NOT NULL DEFAULT 0,
  is_optional          BOOLEAN NOT NULL DEFAULT FALSE,
  estimated_hours      NUMERIC(6,2),
  created_at           TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at           TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_by UUID, updated_by UUID, deleted_at TIMESTAMPTZ,
  is_active   BOOLEAN NOT NULL DEFAULT TRUE
);

CREATE INDEX idx_wf_templates_company ON workflow_templates(company_id);
CREATE INDEX idx_wf_stages_template   ON workflow_stages(workflow_template_id, sequence_order);
CREATE INDEX idx_wf_stages_company    ON workflow_stages(company_id);

CREATE TRIGGER trg_wf_templates_upd BEFORE UPDATE ON workflow_templates FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER trg_wf_stages_upd    BEFORE UPDATE ON workflow_stages    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

ALTER TABLE workflow_templates ENABLE ROW LEVEL SECURITY;
ALTER TABLE workflow_stages    ENABLE ROW LEVEL SECURITY;
CREATE POLICY wf_templates_tenant ON workflow_templates USING (company_id = (auth.jwt() ->> 'company_id')::UUID);
CREATE POLICY wf_stages_tenant    ON workflow_stages    USING (company_id = (auth.jwt() ->> 'company_id')::UUID);
CREATE TRIGGER trg_audit_wf_templates AFTER INSERT OR UPDATE OR DELETE ON workflow_templates FOR EACH ROW EXECUTE FUNCTION log_audit_event();

DO $$
DECLARE v_tpl_id UUID; cid UUID := '00000000-0000-0000-0000-000000000001';
BEGIN
  INSERT INTO workflow_templates (company_id, name, description, is_default)
  VALUES (cid, 'Standard Carton Workflow', 'Default workflow for carton and box production', TRUE) RETURNING id INTO v_tpl_id;
  INSERT INTO workflow_stages (company_id, workflow_template_id, name, sequence_order, is_optional, estimated_hours) VALUES
    (cid, v_tpl_id, 'Artwork', 1, FALSE, 4), (cid, v_tpl_id, 'Customer Approval', 2, FALSE, 24),
    (cid, v_tpl_id, 'Planning', 3, FALSE, 2), (cid, v_tpl_id, 'Board Issue', 4, FALSE, 1),
    (cid, v_tpl_id, 'Printing', 5, FALSE, 8), (cid, v_tpl_id, 'Lamination', 6, TRUE, 4),
    (cid, v_tpl_id, 'UV Coating', 7, TRUE, 2), (cid, v_tpl_id, 'Die Cutting', 8, FALSE, 4),
    (cid, v_tpl_id, 'Hot Foil', 9, TRUE, 3), (cid, v_tpl_id, 'Folder Gluing', 10, TRUE, 4),
    (cid, v_tpl_id, 'Packing', 11, FALSE, 3), (cid, v_tpl_id, 'Dispatch', 12, FALSE, 2);

  INSERT INTO workflow_templates (company_id, name, description)
  VALUES (cid, 'Premium Rigid Box', 'Rigid box production with full finishing') RETURNING id INTO v_tpl_id;
  INSERT INTO workflow_stages (company_id, workflow_template_id, name, sequence_order, is_optional) VALUES
    (cid, v_tpl_id, 'Artwork', 1, FALSE), (cid, v_tpl_id, 'Customer Approval', 2, FALSE),
    (cid, v_tpl_id, 'Planning', 3, FALSE), (cid, v_tpl_id, 'Board Issue', 4, FALSE),
    (cid, v_tpl_id, 'Printing', 5, FALSE), (cid, v_tpl_id, 'Lamination', 6, FALSE),
    (cid, v_tpl_id, 'Hot Foil', 7, FALSE), (cid, v_tpl_id, 'Die Cutting', 8, FALSE),
    (cid, v_tpl_id, 'Assembly', 9, FALSE), (cid, v_tpl_id, 'Packing', 10, FALSE),
    (cid, v_tpl_id, 'Dispatch', 11, FALSE);

  INSERT INTO workflow_templates (company_id, name, description)
  VALUES (cid, 'Label / Sticker', 'Label and sticker production') RETURNING id INTO v_tpl_id;
  INSERT INTO workflow_stages (company_id, workflow_template_id, name, sequence_order, is_optional) VALUES
    (cid, v_tpl_id, 'Artwork', 1, FALSE), (cid, v_tpl_id, 'Customer Approval', 2, FALSE),
    (cid, v_tpl_id, 'Planning', 3, FALSE), (cid, v_tpl_id, 'Printing', 4, FALSE),
    (cid, v_tpl_id, 'Die Cutting', 5, FALSE), (cid, v_tpl_id, 'Packing', 6, FALSE),
    (cid, v_tpl_id, 'Dispatch', 7, FALSE);
END $$;

NOTIFY pgrst, 'reload schema';
