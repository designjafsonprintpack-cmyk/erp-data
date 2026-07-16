-- ══════════════════════════════════════════════════════════════════════════════
-- JAFSON PRINT ERP — MIGRATION 014: JOB ENGINE CORE
-- Phase 22 — Job Core Schema
-- Phase 23 — Job Workflow Instance Engine
-- ══════════════════════════════════════════════════════════════════════════════

-- ─── JOBS (main table) ────────────────────────────────────────────────────────
CREATE TABLE jobs (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id            UUID NOT NULL REFERENCES companies(id),
  job_number            TEXT NOT NULL,
  sales_order_id        UUID REFERENCES sales_orders(id),
  sales_order_item_id   UUID REFERENCES sales_order_items(id),
  customer_id           UUID NOT NULL REFERENCES customers(id),
  job_title             TEXT NOT NULL,
  description           TEXT,

  -- Product Specs
  size_l                NUMERIC(10,2),
  size_w                NUMERIC(10,2),
  size_h                NUMERIC(10,2),
  sheet_size            TEXT,
  quantity              NUMERIC(12,2) NOT NULL DEFAULT 0,
  unit_id               UUID REFERENCES units(id),
  no_of_colors          INTEGER DEFAULT 4,
  die_number            TEXT,

  -- Board & Material
  board_type_id         UUID REFERENCES board_types(id),
  paper_type_id         UUID REFERENCES paper_types(id),

  -- Finishing
  lamination_type_id    UUID REFERENCES lamination_types(id),
  uv_coating            BOOLEAN NOT NULL DEFAULT FALSE,
  foil_type_id          UUID REFERENCES foil_types(id),
  special_finishing     TEXT,
  pasting               TEXT,

  -- Workflow
  workflow_template_id  UUID REFERENCES workflow_templates(id),
  current_stage_id      UUID,  -- FK to job_stage_progress added later
  status                TEXT NOT NULL DEFAULT 'new'
                        CHECK (status IN ('new','in_progress','on_hold','completed','dispatched','cancelled')),
  priority              TEXT NOT NULL DEFAULT 'normal'
                        CHECK (priority IN ('low','normal','high','urgent')),

  -- Scheduling
  order_date            DATE NOT NULL DEFAULT CURRENT_DATE,
  required_date         DATE,
  completed_date        DATE,

  -- Hold tracking
  is_on_hold            BOOLEAN NOT NULL DEFAULT FALSE,
  hold_reason_id        UUID REFERENCES delay_reasons(id),
  hold_notes            TEXT,
  hold_started_at       TIMESTAMPTZ,

  -- Repeat job linkage
  parent_job_id         UUID REFERENCES jobs(id),
  is_repeat             BOOLEAN NOT NULL DEFAULT FALSE,
  repeat_sequence       INTEGER DEFAULT 1,

  -- Financial snapshot
  quoted_amount         NUMERIC(14,2),
  actual_amount         NUMERIC(14,2),

  -- Remarks (append-only via events)
  internal_remarks      TEXT,

  -- Assignment
  assigned_to           UUID REFERENCES users(id),
  artwork_by            UUID REFERENCES users(id),

  created_at            TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at            TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_by UUID, updated_by UUID, deleted_at TIMESTAMPTZ,
  is_active   BOOLEAN NOT NULL DEFAULT TRUE,

  UNIQUE (company_id, job_number)
);

CREATE INDEX idx_jobs_company        ON jobs(company_id);
CREATE INDEX idx_jobs_customer       ON jobs(customer_id);
CREATE INDEX idx_jobs_so             ON jobs(sales_order_id);
CREATE INDEX idx_jobs_status         ON jobs(company_id, status);
CREATE INDEX idx_jobs_required_date  ON jobs(company_id, required_date);
CREATE INDEX idx_jobs_priority       ON jobs(company_id, priority);
CREATE INDEX idx_jobs_number         ON jobs(company_id, job_number);

CREATE TRIGGER trg_jobs_upd BEFORE UPDATE ON jobs FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
ALTER TABLE jobs ENABLE ROW LEVEL SECURITY;
CREATE POLICY jobs_tenant ON jobs USING (company_id = (auth.jwt() ->> 'company_id')::UUID);
CREATE TRIGGER trg_audit_jobs AFTER INSERT OR UPDATE OR DELETE ON jobs FOR EACH ROW EXECUTE FUNCTION log_audit_event();

-- ─── JOB WORKFLOW INSTANCES ───────────────────────────────────────────────────
-- One row per job — tracks which template is assigned
CREATE TABLE job_workflow_instances (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id            UUID NOT NULL REFERENCES companies(id),
  job_id                UUID NOT NULL REFERENCES jobs(id) ON DELETE CASCADE,
  workflow_template_id  UUID NOT NULL REFERENCES workflow_templates(id),
  created_at            TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at            TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_by UUID, updated_by UUID,
  is_active   BOOLEAN NOT NULL DEFAULT TRUE,
  UNIQUE (company_id, job_id)
);

CREATE INDEX idx_jwi_job ON job_workflow_instances(job_id);
CREATE TRIGGER trg_jwi_upd BEFORE UPDATE ON job_workflow_instances FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
ALTER TABLE job_workflow_instances ENABLE ROW LEVEL SECURITY;
CREATE POLICY jwi_tenant ON job_workflow_instances USING (company_id = (auth.jwt() ->> 'company_id')::UUID);

-- ─── JOB STAGE PROGRESS ───────────────────────────────────────────────────────
-- One row per (job, stage) — tracks completion of each workflow stage
CREATE TABLE job_stage_progress (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id            UUID NOT NULL REFERENCES companies(id),
  job_id                UUID NOT NULL REFERENCES jobs(id) ON DELETE CASCADE,
  workflow_stage_id     UUID NOT NULL REFERENCES workflow_stages(id),
  sequence_order        INTEGER NOT NULL,
  status                TEXT NOT NULL DEFAULT 'pending'
                        CHECK (status IN ('pending','in_progress','completed','skipped')),
  started_at            TIMESTAMPTZ,
  completed_at          TIMESTAMPTZ,
  completed_by          UUID REFERENCES users(id),
  notes                 TEXT,
  created_at            TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at            TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_by UUID, updated_by UUID,
  is_active   BOOLEAN NOT NULL DEFAULT TRUE,
  UNIQUE (company_id, job_id, workflow_stage_id)
);

CREATE INDEX idx_jsp_job   ON job_stage_progress(job_id, sequence_order);
CREATE INDEX idx_jsp_stage ON job_stage_progress(workflow_stage_id);
CREATE TRIGGER trg_jsp_upd BEFORE UPDATE ON job_stage_progress FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
ALTER TABLE job_stage_progress ENABLE ROW LEVEL SECURITY;
CREATE POLICY jsp_tenant ON job_stage_progress USING (company_id = (auth.jwt() ->> 'company_id')::UUID);

-- ─── JOB STAGE EVENTS (append-only timeline) ─────────────────────────────────
-- Phase 25 — immutable event log — NO UPDATE / DELETE
CREATE TABLE job_stage_events (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id        UUID NOT NULL REFERENCES companies(id),
  job_id            UUID NOT NULL REFERENCES jobs(id) ON DELETE CASCADE,
  event_type        TEXT NOT NULL
                    CHECK (event_type IN (
                      'created','status_changed','stage_started','stage_completed',
                      'stage_skipped','hold_started','hold_ended','remark_added',
                      'artwork_uploaded','repeat_created','assigned','priority_changed'
                    )),
  stage_id          UUID REFERENCES job_stage_progress(id),
  old_value         TEXT,
  new_value         TEXT,
  notes             TEXT,
  actor_id          UUID REFERENCES users(id),
  occurred_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_jse_job        ON job_stage_events(job_id, occurred_at DESC);
CREATE INDEX idx_jse_company    ON job_stage_events(company_id, occurred_at DESC);
CREATE INDEX idx_jse_event_type ON job_stage_events(job_id, event_type);

-- IMMUTABLE: only SELECT + INSERT allowed
ALTER TABLE job_stage_events ENABLE ROW LEVEL SECURITY;
CREATE POLICY jse_tenant_read   ON job_stage_events FOR SELECT USING (company_id = (auth.jwt() ->> 'company_id')::UUID);
CREATE POLICY jse_tenant_insert ON job_stage_events FOR INSERT WITH CHECK (company_id = (auth.jwt() ->> 'company_id')::UUID);

-- ─── JOB ARTWORK REFERENCES (Phase 27 — Repeat Job linkage) ──────────────────
CREATE TABLE job_artwork_references (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id      UUID NOT NULL REFERENCES companies(id),
  job_id          UUID NOT NULL REFERENCES jobs(id) ON DELETE CASCADE,
  reference_job_id UUID REFERENCES jobs(id),
  artwork_version  INTEGER NOT NULL DEFAULT 1,
  notes           TEXT,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_by      UUID,
  is_active       BOOLEAN NOT NULL DEFAULT TRUE
);

CREATE INDEX idx_jar_job ON job_artwork_references(job_id);
ALTER TABLE job_artwork_references ENABLE ROW LEVEL SECURITY;
CREATE POLICY jar_tenant ON job_artwork_references USING (company_id = (auth.jwt() ->> 'company_id')::UUID);

-- ─── GLOBAL SEARCH INDEX (Phase 28) ──────────────────────────────────────────
CREATE MATERIALIZED VIEW global_search_index AS
SELECT
  j.id,
  j.company_id,
  'job'::TEXT AS entity_type,
  j.job_number AS code,
  j.job_title AS title,
  j.status,
  j.customer_id,
  c.name AS customer_name,
  j.created_at,
  j.required_date,
  to_tsvector('simple',
    coalesce(j.job_number,'') || ' ' ||
    coalesce(j.job_title,'') || ' ' ||
    coalesce(c.name,'') || ' ' ||
    coalesce(j.die_number,'') || ' ' ||
    coalesce(j.sheet_size,'') || ' ' ||
    coalesce(j.pasting,'')
  ) AS search_vector
FROM jobs j
LEFT JOIN customers c ON c.id = j.customer_id
WHERE j.deleted_at IS NULL AND j.is_active = TRUE

UNION ALL

SELECT
  cu.id, cu.company_id, 'customer'::TEXT,
  cu.customer_code, cu.name, 'active', cu.id, cu.name, cu.created_at, NULL,
  to_tsvector('simple', coalesce(cu.customer_code,'') || ' ' || coalesce(cu.name,'') || ' ' || coalesce(cu.email,'') || ' ' || coalesce(cu.phone,''))
FROM customers cu WHERE cu.deleted_at IS NULL AND cu.is_active = TRUE

UNION ALL

SELECT
  so.id, so.company_id, 'sales_order'::TEXT,
  so.so_number, so.so_number, so.status, so.customer_id, c2.name, so.created_at, so.required_date,
  to_tsvector('simple', coalesce(so.so_number,'') || ' ' || coalesce(c2.name,''))
FROM sales_orders so
LEFT JOIN customers c2 ON c2.id = so.customer_id
WHERE so.deleted_at IS NULL AND so.is_active = TRUE;

CREATE UNIQUE INDEX idx_gsi_id ON global_search_index(id, entity_type);
CREATE INDEX idx_gsi_company ON global_search_index(company_id);
CREATE INDEX idx_gsi_search  ON global_search_index USING GIN(search_vector);

-- Function to refresh search index (call after job changes)
CREATE OR REPLACE FUNCTION refresh_search_index()
RETURNS TRIGGER AS $$
BEGIN
  REFRESH MATERIALIZED VIEW CONCURRENTLY global_search_index;
  RETURN NULL;
END;
$$ LANGUAGE plpgsql;

-- ─── SEQUENCE FOR JOBS ────────────────────────────────────────────────────────
INSERT INTO document_sequences (company_id, document_type, year, prefix, padding, current_value)
VALUES ('00000000-0000-0000-0000-000000000001', 'JOB', 2026, 'JOB', 5, 0)
ON CONFLICT DO NOTHING;

NOTIFY pgrst, 'reload schema';
