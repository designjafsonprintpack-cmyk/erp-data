-- ══════════════════════════════════════════════════════════════════════════════
-- MIGRATION 083: WORKFLOW DEPENDENCY ENGINE (Feature 4, Batch A)
-- ══════════════════════════════════════════════════════════════════════════════
-- Adds a real dependency graph alongside the existing hard-sequential gate,
-- instead of replacing it. /api/v1/jobs/[id]/workflow now checks, per stage:
--   1. Does this stage have explicit rows here? If yes, satisfy those.
--   2. If no explicit rows exist, fall back to the ORIGINAL rule (every
--      earlier sequence_order stage must be completed/skipped) — unchanged
--      behavior for every stage nobody has configured an overlap for.
--
-- This is what makes it additive: a template with zero rows here behaves
-- exactly as it did before this migration. Only the two real overlap cases
-- Mehboob asked for get explicit rows:
--   - Die Cutting can start once Printing STARTS (not waits for it to finish)
--   - Pasting (Folder Gluing / Assembly, depending on template) can start
--     once Die Cutting STARTS
--
-- dependency_type:
--   'stage_complete' — depends_on stage must be completed OR skipped
--   'stage_started'  — depends_on stage must be in_progress, completed, OR
--                       skipped (skipped counts because a skipped stage was
--                       never going to block anything downstream anyway)
--
-- Seeding is name-based and company-scoped (a self-join within the same
-- workflow_template), not hardcoded to specific IDs or the original seed
-- company — so it correctly covers every company's templates, including any
-- created or duplicated after the original seed in migration 010.
-- ══════════════════════════════════════════════════════════════════════════════

-- Tag the Printing stage the same way migrations 069/070 tagged Artwork and
-- Customer Approval — lets the plates/board checks (added in the next
-- migration/route change) find "the printing stage" without depending on
-- its exact display name.
UPDATE workflow_stages SET stage_type = 'printing'
WHERE name ILIKE 'printing' AND stage_type IS NULL;

CREATE TABLE workflow_stage_dependencies (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id            UUID NOT NULL REFERENCES companies(id),
  workflow_stage_id     UUID NOT NULL REFERENCES workflow_stages(id) ON DELETE CASCADE,
  depends_on_stage_id   UUID NOT NULL REFERENCES workflow_stages(id) ON DELETE CASCADE,
  dependency_type       TEXT NOT NULL DEFAULT 'stage_complete'
                        CHECK (dependency_type IN ('stage_complete', 'stage_started')),
  created_at            TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at            TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_by UUID, updated_by UUID, deleted_at TIMESTAMPTZ,
  is_active             BOOLEAN NOT NULL DEFAULT TRUE,
  UNIQUE (company_id, workflow_stage_id, depends_on_stage_id),
  CHECK (workflow_stage_id != depends_on_stage_id)
);

CREATE INDEX idx_wsd_company ON workflow_stage_dependencies(company_id);
CREATE INDEX idx_wsd_stage   ON workflow_stage_dependencies(workflow_stage_id);
CREATE INDEX idx_wsd_depends ON workflow_stage_dependencies(depends_on_stage_id);

CREATE TRIGGER trg_wsd_upd BEFORE UPDATE ON workflow_stage_dependencies
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
ALTER TABLE workflow_stage_dependencies ENABLE ROW LEVEL SECURITY;
CREATE POLICY wsd_tenant ON workflow_stage_dependencies
  USING (company_id = (auth.jwt() ->> 'company_id')::UUID);
CREATE TRIGGER trg_audit_wsd AFTER INSERT OR UPDATE OR DELETE ON workflow_stage_dependencies
  FOR EACH ROW EXECUTE FUNCTION log_audit_event();

-- Die Cutting depends on Printing having STARTED (not finished) — the real
-- overlap: die cutting can begin on the first printed bundles while
-- printing continues on the rest of the run.
INSERT INTO workflow_stage_dependencies (company_id, workflow_stage_id, depends_on_stage_id, dependency_type)
SELECT dc.company_id, dc.id, p.id, 'stage_started'
FROM workflow_stages dc
JOIN workflow_stages p
  ON p.workflow_template_id = dc.workflow_template_id
 AND p.company_id = dc.company_id
 AND p.name ILIKE 'printing'
 AND p.deleted_at IS NULL AND p.is_active = TRUE
WHERE dc.name ILIKE 'die cutting'
  AND dc.deleted_at IS NULL AND dc.is_active = TRUE
ON CONFLICT (company_id, workflow_stage_id, depends_on_stage_id) DO NOTHING;

-- Pasting (named "Folder Gluing" in Standard Carton Workflow, "Assembly" in
-- Premium Rigid Box — Label/Sticker has no pasting-equivalent stage at all,
-- so it simply gets no row here) depends on Die Cutting having STARTED.
INSERT INTO workflow_stage_dependencies (company_id, workflow_stage_id, depends_on_stage_id, dependency_type)
SELECT nx.company_id, nx.id, dc.id, 'stage_started'
FROM workflow_stages nx
JOIN workflow_stages dc
  ON dc.workflow_template_id = nx.workflow_template_id
 AND dc.company_id = nx.company_id
 AND dc.name ILIKE 'die cutting'
 AND dc.deleted_at IS NULL AND dc.is_active = TRUE
WHERE (nx.name ILIKE 'folder gluing' OR nx.name ILIKE 'pasting' OR nx.name ILIKE 'assembly')
  AND nx.deleted_at IS NULL AND nx.is_active = TRUE
ON CONFLICT (company_id, workflow_stage_id, depends_on_stage_id) DO NOTHING;

-- Tracks whether the "3 hours before scheduled production" reminder has
-- already fired for this assignment, so the reminder cron (runs every 15
-- minutes) doesn't re-notify the same assignment on every pass.
ALTER TABLE production_assignments ADD COLUMN reminder_sent_at TIMESTAMPTZ;

NOTIFY pgrst, 'reload schema';
