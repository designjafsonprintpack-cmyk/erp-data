-- ══════════════════════════════════════════════════════════════════════════════
-- JAFSON PRINT ERP — MIGRATION 017: QUALITY CONTROL
-- Phase 37 — QC Checklists
-- Phase 38 — Defect Logging
-- Phase 39 — Re-print Requests
-- Phase 40 — QC Pass/Fail Sign-off
-- ══════════════════════════════════════════════════════════════════════════════

-- ─── QC CHECKLIST TEMPLATES ───────────────────────────────────────────────────
-- Reusable templates stored in settings — e.g. "Carton QC", "Label QC"
CREATE TABLE qc_templates (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id   UUID NOT NULL REFERENCES companies(id),
  name         TEXT NOT NULL,
  description  TEXT,
  applies_to   TEXT DEFAULT 'all',  -- 'all','carton','label','rigid_box'
  is_default   BOOLEAN NOT NULL DEFAULT FALSE,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_by UUID, updated_by UUID, deleted_at TIMESTAMPTZ,
  is_active  BOOLEAN NOT NULL DEFAULT TRUE
);

CREATE INDEX idx_qct_company ON qc_templates(company_id);
CREATE TRIGGER trg_qct_upd BEFORE UPDATE ON qc_templates
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
ALTER TABLE qc_templates ENABLE ROW LEVEL SECURITY;
CREATE POLICY qct_tenant ON qc_templates
  USING (company_id = (auth.jwt() ->> 'company_id')::UUID);
CREATE TRIGGER trg_audit_qct AFTER INSERT OR UPDATE OR DELETE ON qc_templates
  FOR EACH ROW EXECUTE FUNCTION log_audit_event();

-- ─── QC TEMPLATE ITEMS (checklist questions) ──────────────────────────────────
CREATE TABLE qc_template_items (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id    UUID NOT NULL REFERENCES companies(id),
  template_id   UUID NOT NULL REFERENCES qc_templates(id) ON DELETE CASCADE,
  question      TEXT NOT NULL,
  category      TEXT,          -- 'print_quality','size','finishing','packing','other'
  is_critical   BOOLEAN NOT NULL DEFAULT FALSE,  -- critical = must pass or job fails
  sort_order    INTEGER NOT NULL DEFAULT 1,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_by UUID, updated_by UUID,
  is_active  BOOLEAN NOT NULL DEFAULT TRUE
);

CREATE INDEX idx_qcti_template ON qc_template_items(template_id, sort_order);
CREATE TRIGGER trg_qcti_upd BEFORE UPDATE ON qc_template_items
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
ALTER TABLE qc_template_items ENABLE ROW LEVEL SECURITY;
CREATE POLICY qcti_tenant ON qc_template_items
  USING (company_id = (auth.jwt() ->> 'company_id')::UUID);

-- ─── JOB QC INSPECTIONS ───────────────────────────────────────────────────────
-- One inspection record per job (can have multiple inspections for re-checks)
CREATE TABLE qc_inspections (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id       UUID NOT NULL REFERENCES companies(id),
  job_id           UUID NOT NULL REFERENCES jobs(id) ON DELETE CASCADE,
  template_id      UUID REFERENCES qc_templates(id),
  inspection_no    INTEGER NOT NULL DEFAULT 1,  -- 1st, 2nd (re-check), 3rd...
  inspector_id     UUID REFERENCES users(id),
  result           TEXT CHECK (result IN ('pass','fail','conditional_pass')) ,
  sample_size      INTEGER,
  defect_count     INTEGER DEFAULT 0,
  notes            TEXT,
  inspected_at     TIMESTAMPTZ,
  signed_off_by    UUID REFERENCES users(id),
  signed_off_at    TIMESTAMPTZ,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_by UUID, updated_by UUID, deleted_at TIMESTAMPTZ,
  is_active  BOOLEAN NOT NULL DEFAULT TRUE
);

CREATE INDEX idx_qci_job     ON qc_inspections(job_id, inspection_no);
CREATE INDEX idx_qci_company ON qc_inspections(company_id, result);
CREATE TRIGGER trg_qci_upd BEFORE UPDATE ON qc_inspections
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
ALTER TABLE qc_inspections ENABLE ROW LEVEL SECURITY;
CREATE POLICY qci_tenant ON qc_inspections
  USING (company_id = (auth.jwt() ->> 'company_id')::UUID);
CREATE TRIGGER trg_audit_qci AFTER INSERT OR UPDATE OR DELETE ON qc_inspections
  FOR EACH ROW EXECUTE FUNCTION log_audit_event();

-- ─── QC CHECKLIST RESPONSES ───────────────────────────────────────────────────
-- One row per (inspection, checklist item) — the actual answers
CREATE TABLE qc_checklist_responses (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id      UUID NOT NULL REFERENCES companies(id),
  inspection_id   UUID NOT NULL REFERENCES qc_inspections(id) ON DELETE CASCADE,
  template_item_id UUID REFERENCES qc_template_items(id),
  question        TEXT NOT NULL,  -- denormalized for history
  is_critical     BOOLEAN NOT NULL DEFAULT FALSE,
  response        TEXT CHECK (response IN ('pass','fail','na')),
  notes           TEXT,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_by UUID, updated_by UUID,
  is_active  BOOLEAN NOT NULL DEFAULT TRUE
);

CREATE INDEX idx_qcr_inspection ON qc_checklist_responses(inspection_id);
CREATE TRIGGER trg_qcr_upd BEFORE UPDATE ON qc_checklist_responses
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
ALTER TABLE qc_checklist_responses ENABLE ROW LEVEL SECURITY;
CREATE POLICY qcr_tenant ON qc_checklist_responses
  USING (company_id = (auth.jwt() ->> 'company_id')::UUID);

-- ─── DEFECTS ──────────────────────────────────────────────────────────────────
CREATE TABLE qc_defects (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id      UUID NOT NULL REFERENCES companies(id),
  inspection_id   UUID REFERENCES qc_inspections(id) ON DELETE CASCADE,
  job_id          UUID NOT NULL REFERENCES jobs(id),
  defect_type     TEXT NOT NULL,
  -- 'colour_shift','misregister','scumming','hickey','fold_crack','cut_short',
  -- 'lamination_bubble','foil_skip','ink_smear','wrong_size','pasting_fault','other'
  severity        TEXT NOT NULL DEFAULT 'minor'
                  CHECK (severity IN ('minor','major','critical')),
  quantity_affected INTEGER DEFAULT 0,
  description     TEXT,
  photo_url       TEXT,
  photo_urls      TEXT[] NOT NULL DEFAULT '{}',
  reported_by     UUID REFERENCES users(id),
  resolved        BOOLEAN NOT NULL DEFAULT FALSE,
  resolved_notes  TEXT,
  resolved_at     TIMESTAMPTZ,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_by UUID, updated_by UUID, deleted_at TIMESTAMPTZ,
  is_active  BOOLEAN NOT NULL DEFAULT TRUE
);

CREATE INDEX idx_def_inspection ON qc_defects(inspection_id);
CREATE INDEX idx_def_job        ON qc_defects(job_id);
CREATE INDEX idx_def_company    ON qc_defects(company_id, severity);
CREATE TRIGGER trg_def_upd BEFORE UPDATE ON qc_defects
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
ALTER TABLE qc_defects ENABLE ROW LEVEL SECURITY;
CREATE POLICY def_tenant ON qc_defects
  USING (company_id = (auth.jwt() ->> 'company_id')::UUID);
CREATE TRIGGER trg_audit_def AFTER INSERT OR UPDATE OR DELETE ON qc_defects
  FOR EACH ROW EXECUTE FUNCTION log_audit_event();

-- ─── RE-PRINT REQUESTS ────────────────────────────────────────────────────────
CREATE TABLE reprint_requests (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id      UUID NOT NULL REFERENCES companies(id),
  original_job_id UUID NOT NULL REFERENCES jobs(id),
  reprint_job_id  UUID REFERENCES jobs(id),   -- filled when new job created
  inspection_id   UUID REFERENCES qc_inspections(id),
  reason          TEXT NOT NULL,
  quantity        NUMERIC(12,2) NOT NULL,
  status          TEXT NOT NULL DEFAULT 'pending'
                  CHECK (status IN ('pending','approved','rejected','in_progress','completed')),
  priority        TEXT NOT NULL DEFAULT 'normal'
                  CHECK (priority IN ('low','normal','high','urgent')),
  requested_by    UUID REFERENCES users(id),
  approved_by     UUID REFERENCES users(id),
  approved_at     TIMESTAMPTZ,
  notes           TEXT,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_by UUID, updated_by UUID, deleted_at TIMESTAMPTZ,
  is_active  BOOLEAN NOT NULL DEFAULT TRUE
);

CREATE INDEX idx_rpr_job     ON reprint_requests(original_job_id);
CREATE INDEX idx_rpr_company ON reprint_requests(company_id, status);
CREATE TRIGGER trg_rpr_upd BEFORE UPDATE ON reprint_requests
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
ALTER TABLE reprint_requests ENABLE ROW LEVEL SECURITY;
CREATE POLICY rpr_tenant ON reprint_requests
  USING (company_id = (auth.jwt() ->> 'company_id')::UUID);
CREATE TRIGGER trg_audit_rpr AFTER INSERT OR UPDATE OR DELETE ON reprint_requests
  FOR EACH ROW EXECUTE FUNCTION log_audit_event();

-- ─── SEED: DEFAULT QC TEMPLATE ────────────────────────────────────────────────
-- Jafson default carton QC template
INSERT INTO qc_templates (id, company_id, name, description, applies_to, is_default)
VALUES (
  '11111111-0000-0000-0000-000000000001',
  '00000000-0000-0000-0000-000000000001',
  'Standard Carton QC',
  'Standard quality checklist for printed cartons and boxes',
  'carton',
  TRUE
) ON CONFLICT DO NOTHING;

-- Checklist items
INSERT INTO qc_template_items (company_id, template_id, question, category, is_critical, sort_order) VALUES
  ('00000000-0000-0000-0000-000000000001','11111111-0000-0000-0000-000000000001','Print colour matches approved sample?','print_quality',TRUE,1),
  ('00000000-0000-0000-0000-000000000001','11111111-0000-0000-0000-000000000001','No colour shift or misregistration?','print_quality',TRUE,2),
  ('00000000-0000-0000-0000-000000000001','11111111-0000-0000-0000-000000000001','No scumming, hickeys, or ink smear?','print_quality',FALSE,3),
  ('00000000-0000-0000-0000-000000000001','11111111-0000-0000-0000-000000000001','Barcode / text legible and complete?','print_quality',TRUE,4),
  ('00000000-0000-0000-0000-000000000001','11111111-0000-0000-0000-000000000001','Die-cut size within tolerance (±1mm)?','size',TRUE,5),
  ('00000000-0000-0000-0000-000000000001','11111111-0000-0000-0000-000000000001','Crease lines clean — no crack on fold?','size',FALSE,6),
  ('00000000-0000-0000-0000-000000000001','11111111-0000-0000-0000-000000000001','Lamination even — no bubbles or peeling?','finishing',TRUE,7),
  ('00000000-0000-0000-0000-000000000001','11111111-0000-0000-0000-000000000001','Foil stamping complete — no skip or blur?','finishing',FALSE,8),
  ('00000000-0000-0000-0000-000000000001','11111111-0000-0000-0000-000000000001','UV coating uniform — no bare spots?','finishing',FALSE,9),
  ('00000000-0000-0000-0000-000000000001','11111111-0000-0000-0000-000000000001','Pasting / gluing strong and aligned?','finishing',TRUE,10),
  ('00000000-0000-0000-0000-000000000001','11111111-0000-0000-0000-000000000001','Correct quantity bundled and counted?','packing',TRUE,11),
  ('00000000-0000-0000-0000-000000000001','11111111-0000-0000-0000-000000000001','Packing clean — no damage or contamination?','packing',FALSE,12)
ON CONFLICT DO NOTHING;

NOTIFY pgrst, 'reload schema';
