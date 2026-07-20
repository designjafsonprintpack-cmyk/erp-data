-- ══════════════════════════════════════════════════════════════════════════════
-- MIGRATION 071: ARTWORK COMMENTS — Phase 3
-- ══════════════════════════════════════════════════════════════════════════════
-- One table serves both internal (staff) and customer comments, distinguished
-- by author_type — simpler than two parallel tables, and makes a unified
-- "Activity" feed on a version trivial later.
--
-- position_x/position_y (0-100, percentage of image width/height) are
-- nullable: NULL means a general comment, a value means a pinned comment
-- placed by clicking a specific spot on the artwork (the "click on logo ->
-- move logo 2mm left" example from the spec).
--
-- Customer comments are inserted via the service-role client from the
-- public token route (same as job_artworks status updates already are) —
-- RLS below only needs to cover the authenticated-staff path.
-- ══════════════════════════════════════════════════════════════════════════════

CREATE TABLE artwork_comments (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id    UUID NOT NULL REFERENCES companies(id),
  artwork_id    UUID NOT NULL REFERENCES job_artworks(id) ON DELETE CASCADE,
  author_type   TEXT NOT NULL CHECK (author_type IN ('staff', 'customer')),
  author_name   TEXT,                          -- customer comments: no users row to join, name captured at submit time
  author_id     UUID REFERENCES users(id),      -- staff comments only
  comment_text  TEXT NOT NULL,
  position_x    NUMERIC(5,2) CHECK (position_x IS NULL OR (position_x >= 0 AND position_x <= 100)),
  position_y    NUMERIC(5,2) CHECK (position_y IS NULL OR (position_y >= 0 AND position_y <= 100)),
  resolved      BOOLEAN NOT NULL DEFAULT FALSE,
  resolved_at   TIMESTAMPTZ,
  resolved_by   UUID REFERENCES users(id),

  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_by    UUID,
  updated_by    UUID,
  deleted_at    TIMESTAMPTZ,
  is_active     BOOLEAN NOT NULL DEFAULT TRUE
);

CREATE INDEX idx_artwork_comments_artwork ON artwork_comments(artwork_id, created_at);

CREATE TRIGGER trg_artwork_comments_updated_at BEFORE UPDATE ON artwork_comments
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

ALTER TABLE artwork_comments ENABLE ROW LEVEL SECURITY;
CREATE POLICY artwork_comments_tenant ON artwork_comments
  USING (company_id = (auth.jwt() ->> 'company_id')::UUID);

CREATE TRIGGER trg_audit_artwork_comments AFTER INSERT OR UPDATE OR DELETE ON artwork_comments
  FOR EACH ROW EXECUTE FUNCTION log_audit_event();

NOTIFY pgrst, 'reload schema';
