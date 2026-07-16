-- ══════════════════════════════════════════════════════════════════════════════
-- JAFSON PRINT ERP — MIGRATION 004: ATTACHMENTS, THEMES, USER PREFERENCES
-- Phase 5 (Theme Engine) + shared infrastructure
-- ══════════════════════════════════════════════════════════════════════════════

-- ─── ATTACHMENTS (polymorphic — reused across all modules) ───────────────────
CREATE TABLE attachments (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id      UUID NOT NULL REFERENCES companies(id),
  entity_type     TEXT NOT NULL,   -- 'job', 'customer', 'quotation', etc.
  entity_id       UUID NOT NULL,
  file_name       TEXT NOT NULL,
  file_path       TEXT NOT NULL,   -- Supabase Storage path
  file_size       BIGINT,          -- bytes
  mime_type       TEXT,
  version         INTEGER NOT NULL DEFAULT 1,
  uploaded_by     UUID REFERENCES users(id),
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_by      UUID,
  updated_by      UUID,
  deleted_at      TIMESTAMPTZ,
  is_active       BOOLEAN NOT NULL DEFAULT TRUE
);

CREATE INDEX idx_attachments_entity ON attachments(entity_type, entity_id);
CREATE INDEX idx_attachments_company ON attachments(company_id);
CREATE TRIGGER trg_attachments_updated_at BEFORE UPDATE ON attachments FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

ALTER TABLE attachments ENABLE ROW LEVEL SECURITY;
CREATE POLICY attachments_tenant ON attachments
  USING (company_id = (auth.jwt() ->> 'company_id')::UUID);

-- ─── THEMES ───────────────────────────────────────────────────────────────────
CREATE TABLE themes (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id      UUID NOT NULL REFERENCES companies(id),
  name            TEXT NOT NULL,
  slug            TEXT NOT NULL,
  is_default      BOOLEAN NOT NULL DEFAULT FALSE,
  css_variables   JSONB NOT NULL DEFAULT '{}',
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_by      UUID,
  updated_by      UUID,
  deleted_at      TIMESTAMPTZ,
  is_active       BOOLEAN NOT NULL DEFAULT TRUE,
  UNIQUE (company_id, slug)
);

CREATE TRIGGER trg_themes_updated_at BEFORE UPDATE ON themes FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

ALTER TABLE themes ENABLE ROW LEVEL SECURITY;
CREATE POLICY themes_tenant ON themes
  USING (company_id = (auth.jwt() ->> 'company_id')::UUID);

-- Seed system themes for Jafson
INSERT INTO themes (company_id, name, slug, is_default) VALUES
  ('00000000-0000-0000-0000-000000000001', 'GitHub Dark', 'github-dark', TRUE),
  ('00000000-0000-0000-0000-000000000001', 'Dark Blue', 'dark-blue', FALSE),
  ('00000000-0000-0000-0000-000000000001', 'Dark Purple', 'dark-purple', FALSE),
  ('00000000-0000-0000-0000-000000000001', 'Dark Green', 'dark-green', FALSE),
  ('00000000-0000-0000-0000-000000000001', 'Light', 'light', FALSE);

-- ─── USER PREFERENCES ─────────────────────────────────────────────────────────
CREATE TABLE user_preferences (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id          UUID NOT NULL REFERENCES companies(id),
  user_id             UUID NOT NULL REFERENCES users(id),
  theme_slug          TEXT NOT NULL DEFAULT 'github-dark',
  sidebar_collapsed   BOOLEAN NOT NULL DEFAULT FALSE,
  dashboard_layout    JSONB DEFAULT '{}',
  notification_prefs  JSONB DEFAULT '{}',
  created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_by          UUID,
  updated_by          UUID,
  deleted_at          TIMESTAMPTZ,
  is_active           BOOLEAN NOT NULL DEFAULT TRUE,
  UNIQUE (company_id, user_id)
);

CREATE INDEX idx_user_preferences_user ON user_preferences(user_id);
CREATE TRIGGER trg_user_preferences_updated_at BEFORE UPDATE ON user_preferences FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

ALTER TABLE user_preferences ENABLE ROW LEVEL SECURITY;
CREATE POLICY user_preferences_own ON user_preferences
  USING (
    company_id = (auth.jwt() ->> 'company_id')::UUID
    AND user_id = auth.uid()
  );

NOTIFY pgrst, 'reload schema';
