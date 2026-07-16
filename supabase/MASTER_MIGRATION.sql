-- ══════════════════════════════════════════════════════════════════════════════
-- JAFSON PRINT ERP — MASTER MIGRATION (001 → 019)
-- ══════════════════════════════════════════════════════════════════════════════
-- HOW TO RUN:
--   1. Supabase → SQL Editor → New Query
--   2. Paste this ENTIRE file
--   3. Click RUN once
--   If any table already exists, the IF NOT EXISTS clause skips it safely.
-- ══════════════════════════════════════════════════════════════════════════════


-- ════════════════════════════════════════════════════════
-- MIGRATION 001_base_schema.sql
-- ════════════════════════════════════════════════════════
-- ══════════════════════════════════════════════════════════════════════════════
-- JAFSON PRINT ERP — MIGRATION 001: BASE SCHEMA
-- Stage 0 — Foundation
-- Phase 2: Multi-tenant base schema
-- ══════════════════════════════════════════════════════════════════════════════

-- Enable required extensions
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pg_trgm";
CREATE EXTENSION IF NOT EXISTS "unaccent";

-- ─── HELPER: auto-update updated_at ──────────────────────────────────────────
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- ─── COMPANIES ────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS companies (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name            TEXT NOT NULL,
  logo_url        TEXT,
  ntn             TEXT,
  address         TEXT,
  base_currency_id UUID,          -- FK added after currencies table exists
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_by      UUID,
  updated_by      UUID,
  deleted_at      TIMESTAMPTZ,
  is_active       BOOLEAN NOT NULL DEFAULT TRUE
);

DROP TRIGGER IF EXISTS trg_companies_updated_at ON companies;
CREATE TRIGGER trg_companies_updated_at
  BEFORE UPDATE ON companies
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- Seed: Jafson Print Pack
-- IMPORTANT: Verify this UUID in your Supabase project before going live
INSERT INTO companies (id, name, address)
VALUES (
  '00000000-0000-0000-0000-000000000001',
  'Jafson Print Pack',
  'Lahore, Pakistan'
) ON CONFLICT (id) DO NOTHING;

-- ─── BRANCHES ─────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS branches (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id      UUID NOT NULL REFERENCES companies(id),
  name            TEXT NOT NULL,
  address         TEXT,
  is_head_office  BOOLEAN NOT NULL DEFAULT FALSE,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_by      UUID,
  updated_by      UUID,
  deleted_at      TIMESTAMPTZ,
  is_active       BOOLEAN NOT NULL DEFAULT TRUE
);

CREATE INDEX IF NOT EXISTS idx_branches_company_id ON branches(company_id);
DROP TRIGGER IF EXISTS trg_branches_updated_at ON branches;
CREATE TRIGGER trg_branches_updated_at BEFORE UPDATE ON branches FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- Seed: Jafson head office
INSERT INTO branches (company_id, name, is_head_office)
VALUES ('00000000-0000-0000-0000-000000000001', 'Head Office', TRUE) ON CONFLICT DO NOTHING;

-- ─── WAREHOUSES ───────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS warehouses (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id      UUID NOT NULL REFERENCES companies(id),
  branch_id       UUID REFERENCES branches(id),
  name            TEXT NOT NULL,
  location        TEXT,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_by      UUID,
  updated_by      UUID,
  deleted_at      TIMESTAMPTZ,
  is_active       BOOLEAN NOT NULL DEFAULT TRUE
);

CREATE INDEX IF NOT EXISTS idx_warehouses_company_id ON warehouses(company_id);
DROP TRIGGER IF EXISTS trg_warehouses_updated_at ON warehouses;
CREATE TRIGGER trg_warehouses_updated_at BEFORE UPDATE ON warehouses FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- Seed: Main warehouse
INSERT INTO warehouses (company_id, name, location)
SELECT '00000000-0000-0000-0000-000000000001', 'Main Store', 'Lahore Factory'
ON CONFLICT DO NOTHING;

-- ─── ROW LEVEL SECURITY ───────────────────────────────────────────────────────
ALTER TABLE companies ENABLE ROW LEVEL SECURITY;
ALTER TABLE branches ENABLE ROW LEVEL SECURITY;
ALTER TABLE warehouses ENABLE ROW LEVEL SECURITY;

-- Companies: each tenant only sees their own row
DROP POLICY IF EXISTS companies_tenant_isolation ON companies;
CREATE POLICY companies_tenant_isolation ON companies
  USING (id = (auth.jwt() ->> 'company_id')::UUID);

-- Branches: tenant isolation
DROP POLICY IF EXISTS branches_tenant_isolation ON branches;
CREATE POLICY branches_tenant_isolation ON branches
  USING (company_id = (auth.jwt() ->> 'company_id')::UUID);

-- Warehouses: tenant isolation
DROP POLICY IF EXISTS warehouses_tenant_isolation ON warehouses;
CREATE POLICY warehouses_tenant_isolation ON warehouses
  USING (company_id = (auth.jwt() ->> 'company_id')::UUID);

-- Notify PostgREST to reload schema


-- ════════════════════════════════════════════════════════
-- MIGRATION 002_auth_users.sql
-- ════════════════════════════════════════════════════════
-- ══════════════════════════════════════════════════════════════════════════════
-- JAFSON PRINT ERP — MIGRATION 002: AUTH & USER MANAGEMENT
-- Phase 3: Authentication + custom JWT claims
-- ══════════════════════════════════════════════════════════════════════════════

-- ─── DEPARTMENTS (needed before users) ────────────────────────────────────────
CREATE TABLE IF NOT EXISTS departments (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id      UUID NOT NULL REFERENCES companies(id),
  name            TEXT NOT NULL,
  code            TEXT NOT NULL,
  description     TEXT,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_by      UUID,
  updated_by      UUID,
  deleted_at      TIMESTAMPTZ,
  is_active       BOOLEAN NOT NULL DEFAULT TRUE,
  UNIQUE (company_id, code)
);

CREATE INDEX IF NOT EXISTS idx_departments_company_id ON departments(company_id);
DROP TRIGGER IF EXISTS trg_departments_updated_at ON departments;
CREATE TRIGGER trg_departments_updated_at BEFORE UPDATE ON departments FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

ALTER TABLE departments ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS departments_tenant ON departments;
CREATE POLICY departments_tenant ON departments
  USING (company_id = (auth.jwt() ->> 'company_id')::UUID);

-- Seed departments for Jafson
INSERT INTO departments (company_id, name, code) VALUES
  ('00000000-0000-0000-0000-000000000001', 'Management', 'MGMT'),
  ('00000000-0000-0000-0000-000000000001', 'Sales', 'SALES'),
  ('00000000-0000-0000-0000-000000000001', 'Artwork', 'ART'),
  ('00000000-0000-0000-0000-000000000001', 'Planning', 'PLAN'),
  ('00000000-0000-0000-0000-000000000001', 'Store', 'STORE'),
  ('00000000-0000-0000-0000-000000000001', 'Printing', 'PRINT'),
  ('00000000-0000-0000-0000-000000000001', 'Lamination', 'LAM'),
  ('00000000-0000-0000-0000-000000000001', 'Die Cutting', 'DIE'),
  ('00000000-0000-0000-0000-000000000001', 'Hot Foil', 'FOIL'),
  ('00000000-0000-0000-0000-000000000001', 'Folder Gluing', 'GLUE'),
  ('00000000-0000-0000-0000-000000000001', 'Packing', 'PACK'),
  ('00000000-0000-0000-0000-000000000001', 'Dispatch', 'DISP')
ON CONFLICT DO NOTHING;

-- ─── ROLES ────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS roles (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id      UUID NOT NULL REFERENCES companies(id),
  name            TEXT NOT NULL,
  slug            TEXT NOT NULL,
  description     TEXT,
  is_system_role  BOOLEAN NOT NULL DEFAULT FALSE,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_by      UUID,
  updated_by      UUID,
  deleted_at      TIMESTAMPTZ,
  is_active       BOOLEAN NOT NULL DEFAULT TRUE,
  UNIQUE (company_id, slug)
);

CREATE INDEX IF NOT EXISTS idx_roles_company_id ON roles(company_id);
DROP TRIGGER IF EXISTS trg_roles_updated_at ON roles;
CREATE TRIGGER trg_roles_updated_at BEFORE UPDATE ON roles FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

ALTER TABLE roles ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS roles_tenant ON roles;
CREATE POLICY roles_tenant ON roles
  USING (company_id = (auth.jwt() ->> 'company_id')::UUID);

-- Seed system roles
INSERT INTO roles (company_id, name, slug, is_system_role) VALUES
  ('00000000-0000-0000-0000-000000000001', 'Super Admin', 'superadmin', TRUE),
  ('00000000-0000-0000-0000-000000000001', 'Admin', 'admin', TRUE),
  ('00000000-0000-0000-0000-000000000001', 'Owner', 'owner', TRUE),
  ('00000000-0000-0000-0000-000000000001', 'Sales', 'sales', FALSE),
  ('00000000-0000-0000-0000-000000000001', 'Artwork', 'artwork', FALSE),
  ('00000000-0000-0000-0000-000000000001', 'Planning', 'planning', FALSE),
  ('00000000-0000-0000-0000-000000000001', 'Store', 'store', FALSE),
  ('00000000-0000-0000-0000-000000000001', 'Printing Operator', 'printing', FALSE),
  ('00000000-0000-0000-0000-000000000001', 'Dispatch', 'dispatch', FALSE)
ON CONFLICT DO NOTHING;

-- ─── USERS ────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS users (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id          UUID NOT NULL REFERENCES companies(id),
  auth_user_id        UUID UNIQUE REFERENCES auth.users(id) ON DELETE CASCADE,
  full_name           TEXT NOT NULL,
  email               TEXT NOT NULL,
  phone               TEXT,
  department_id       UUID REFERENCES departments(id),
  role                TEXT NOT NULL DEFAULT 'staff', -- stored slug for fast JWT lookup
  profile_photo_url   TEXT,
  is_active           BOOLEAN NOT NULL DEFAULT TRUE,
  last_login_at       TIMESTAMPTZ,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_by          UUID,
  updated_by          UUID,
  deleted_at          TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_users_company_id ON users(company_id);
CREATE INDEX IF NOT EXISTS idx_users_auth_user_id ON users(auth_user_id);
CREATE INDEX IF NOT EXISTS idx_users_email ON users(company_id, email);
DROP TRIGGER IF EXISTS trg_users_updated_at ON users;
CREATE TRIGGER trg_users_updated_at BEFORE UPDATE ON users FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

ALTER TABLE users ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS users_tenant ON users;
CREATE POLICY users_tenant ON users
  USING (company_id = (auth.jwt() ->> 'company_id')::UUID);

-- ─── CUSTOM JWT CLAIMS (runs after user signs in) ─────────────────────────────
CREATE OR REPLACE FUNCTION public.custom_access_token_hook(event JSONB)
RETURNS JSONB AS $$
DECLARE
  claims    JSONB;
  user_rec  RECORD;
BEGIN
  SELECT u.company_id, u.role, u.department_id, u.full_name, u.id AS user_table_id
  INTO user_rec
  FROM public.users u
  WHERE u.auth_user_id = (event ->> 'user_id')::UUID
    AND u.deleted_at IS NULL
    AND u.is_active = TRUE
  LIMIT 1;

  claims := event -> 'claims';

  IF user_rec.company_id IS NOT NULL THEN
    claims := jsonb_set(claims, '{company_id}', to_jsonb(user_rec.company_id::TEXT));
    claims := jsonb_set(claims, '{role}', to_jsonb(user_rec.role));
    claims := jsonb_set(claims, '{department_id}', to_jsonb(user_rec.department_id::TEXT));
    claims := jsonb_set(claims, '{full_name}', to_jsonb(user_rec.full_name));
    claims := jsonb_set(claims, '{user_table_id}', to_jsonb(user_rec.user_table_id::TEXT));
  END IF;

  RETURN jsonb_set(event, '{claims}', claims);
END;
$$ LANGUAGE plpgsql STABLE SECURITY DEFINER;

-- Grant execution to Supabase Auth hook
GRANT EXECUTE ON FUNCTION public.custom_access_token_hook TO supabase_auth_admin;

-- ─── LOGIN HISTORY ────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS login_history (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id    UUID NOT NULL REFERENCES companies(id),
  user_id       UUID REFERENCES users(id),
  logged_in_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  logged_out_at TIMESTAMPTZ,
  ip_address    TEXT,  -- future support
  device_info   TEXT
);

CREATE INDEX IF NOT EXISTS idx_login_history_user_id ON login_history(user_id);
CREATE INDEX IF NOT EXISTS idx_login_history_company_id ON login_history(company_id, logged_in_at DESC);

ALTER TABLE login_history ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS login_history_tenant ON login_history;
CREATE POLICY login_history_tenant ON login_history
  USING (company_id = (auth.jwt() ->> 'company_id')::UUID);



-- ════════════════════════════════════════════════════════
-- MIGRATION 003_audit_notifications.sql
-- ════════════════════════════════════════════════════════
-- ══════════════════════════════════════════════════════════════════════════════
-- JAFSON PRINT ERP — MIGRATION 003: AUDIT LOG, ACTIVITY LOG & NOTIFICATIONS
-- Phase 14 & 15 foundation
-- ══════════════════════════════════════════════════════════════════════════════

-- ─── AUDIT LOG (Partitioned by month, IMMUTABLE) ──────────────────────────────
CREATE TABLE IF NOT EXISTS audit_log (
  id            UUID NOT NULL DEFAULT gen_random_uuid(),
  company_id    UUID NOT NULL,
  table_name    TEXT NOT NULL,
  record_id     UUID,
  action        TEXT NOT NULL CHECK (action IN ('INSERT', 'UPDATE', 'DELETE')),
  old_values    JSONB,
  new_values    JSONB,
  changed_by    UUID,
  changed_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
) PARTITION BY RANGE (changed_at);

-- Create initial monthly partitions
CREATE TABLE IF NOT EXISTS audit_log_2026_01 PARTITION OF audit_log FOR VALUES FROM ('2026-01-01') TO ('2026-02-01');
CREATE TABLE IF NOT EXISTS audit_log_2026_02 PARTITION OF audit_log FOR VALUES FROM ('2026-02-01') TO ('2026-03-01');
CREATE TABLE IF NOT EXISTS audit_log_2026_03 PARTITION OF audit_log FOR VALUES FROM ('2026-03-01') TO ('2026-04-01');
CREATE TABLE IF NOT EXISTS audit_log_2026_04 PARTITION OF audit_log FOR VALUES FROM ('2026-04-01') TO ('2026-05-01');
CREATE TABLE IF NOT EXISTS audit_log_2026_05 PARTITION OF audit_log FOR VALUES FROM ('2026-05-01') TO ('2026-06-01');
CREATE TABLE IF NOT EXISTS audit_log_2026_06 PARTITION OF audit_log FOR VALUES FROM ('2026-06-01') TO ('2026-07-01');
CREATE TABLE IF NOT EXISTS audit_log_2026_07 PARTITION OF audit_log FOR VALUES FROM ('2026-07-01') TO ('2026-08-01');
CREATE TABLE IF NOT EXISTS audit_log_2026_08 PARTITION OF audit_log FOR VALUES FROM ('2026-08-01') TO ('2026-09-01');
CREATE TABLE IF NOT EXISTS audit_log_2026_09 PARTITION OF audit_log FOR VALUES FROM ('2026-09-01') TO ('2026-10-01');
CREATE TABLE IF NOT EXISTS audit_log_2026_10 PARTITION OF audit_log FOR VALUES FROM ('2026-10-01') TO ('2026-11-01');
CREATE TABLE IF NOT EXISTS audit_log_2026_11 PARTITION OF audit_log FOR VALUES FROM ('2026-11-01') TO ('2026-12-01');
CREATE TABLE IF NOT EXISTS audit_log_2026_12 PARTITION OF audit_log FOR VALUES FROM ('2026-12-01') TO ('2027-01-01');
CREATE TABLE IF NOT EXISTS audit_log_2027_01 PARTITION OF audit_log FOR VALUES FROM ('2027-01-01') TO ('2027-02-01');
CREATE TABLE IF NOT EXISTS audit_log_2027_02 PARTITION OF audit_log FOR VALUES FROM ('2027-02-01') TO ('2027-03-01');

CREATE INDEX IF NOT EXISTS idx_audit_log_company ON audit_log(company_id, changed_at DESC);
CREATE INDEX IF NOT EXISTS idx_audit_log_record ON audit_log(table_name, record_id);

ALTER TABLE audit_log ENABLE ROW LEVEL SECURITY;
-- Audit log: read only (no insert/update/delete via app — triggers only)
DROP POLICY IF EXISTS audit_log_tenant_read ON audit_log;
CREATE POLICY audit_log_tenant_read ON audit_log FOR SELECT
  USING (company_id = (auth.jwt() ->> 'company_id')::UUID);

-- ─── GENERIC AUDIT TRIGGER ────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION log_audit_event()
RETURNS TRIGGER AS $$
DECLARE
  company_id_val UUID;
BEGIN
  -- Extract company_id from the row
  BEGIN
    company_id_val := CASE
      WHEN TG_OP = 'DELETE' THEN (row_to_json(OLD) ->> 'company_id')::UUID
      ELSE (row_to_json(NEW) ->> 'company_id')::UUID
    END;
  EXCEPTION WHEN OTHERS THEN
    company_id_val := NULL;
  END;

  IF TG_OP = 'INSERT' THEN
    INSERT INTO audit_log (company_id, table_name, record_id, action, new_values, changed_by)
    VALUES (company_id_val, TG_TABLE_NAME, (row_to_json(NEW) ->> 'id')::UUID, 'INSERT', row_to_json(NEW)::JSONB, auth.uid());
    RETURN NEW;
  ELSIF TG_OP = 'UPDATE' THEN
    INSERT INTO audit_log (company_id, table_name, record_id, action, old_values, new_values, changed_by)
    VALUES (company_id_val, TG_TABLE_NAME, (row_to_json(NEW) ->> 'id')::UUID, 'UPDATE', row_to_json(OLD)::JSONB, row_to_json(NEW)::JSONB, auth.uid());
    RETURN NEW;
  ELSIF TG_OP = 'DELETE' THEN
    INSERT INTO audit_log (company_id, table_name, record_id, action, old_values, changed_by)
    VALUES (company_id_val, TG_TABLE_NAME, (row_to_json(OLD) ->> 'id')::UUID, 'DELETE', row_to_json(OLD)::JSONB, auth.uid());
    RETURN OLD;
  END IF;
  RETURN NULL;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ─── ACTIVITY LOG ─────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS activity_log (
  id              UUID NOT NULL DEFAULT gen_random_uuid(),
  company_id      UUID NOT NULL,
  user_id         UUID,
  module_key      TEXT NOT NULL,
  action_description TEXT NOT NULL,
  entity_type     TEXT,
  entity_id       UUID,
  occurred_at     TIMESTAMPTZ NOT NULL DEFAULT NOW()
) PARTITION BY RANGE (occurred_at);

CREATE TABLE IF NOT EXISTS activity_log_2026_07 PARTITION OF activity_log FOR VALUES FROM ('2026-07-01') TO ('2026-08-01');
CREATE TABLE IF NOT EXISTS activity_log_2026_08 PARTITION OF activity_log FOR VALUES FROM ('2026-08-01') TO ('2026-09-01');
CREATE TABLE IF NOT EXISTS activity_log_2026_09 PARTITION OF activity_log FOR VALUES FROM ('2026-09-01') TO ('2026-10-01');
CREATE TABLE IF NOT EXISTS activity_log_2026_10 PARTITION OF activity_log FOR VALUES FROM ('2026-10-01') TO ('2026-11-01');
CREATE TABLE IF NOT EXISTS activity_log_2026_11 PARTITION OF activity_log FOR VALUES FROM ('2026-11-01') TO ('2026-12-01');
CREATE TABLE IF NOT EXISTS activity_log_2026_12 PARTITION OF activity_log FOR VALUES FROM ('2026-12-01') TO ('2027-01-01');
CREATE TABLE IF NOT EXISTS activity_log_2027_01 PARTITION OF activity_log FOR VALUES FROM ('2027-01-01') TO ('2027-02-01');

CREATE INDEX IF NOT EXISTS idx_activity_log_company ON activity_log(company_id, occurred_at DESC);
CREATE INDEX IF NOT EXISTS idx_activity_log_user ON activity_log(user_id, occurred_at DESC);

ALTER TABLE activity_log ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS activity_log_tenant_read ON activity_log;
CREATE POLICY activity_log_tenant_read ON activity_log FOR SELECT
  USING (company_id = (auth.jwt() ->> 'company_id')::UUID);

-- ─── NOTIFICATIONS ────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS notifications (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id  UUID NOT NULL REFERENCES companies(id),
  user_id     UUID REFERENCES users(id),
  title       TEXT NOT NULL,
  message     TEXT,
  type        TEXT NOT NULL DEFAULT 'info' CHECK (type IN ('info', 'success', 'warning', 'error')),
  is_read     BOOLEAN NOT NULL DEFAULT FALSE,
  link_url    TEXT,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_by  UUID,
  updated_by  UUID,
  deleted_at  TIMESTAMPTZ,
  is_active   BOOLEAN NOT NULL DEFAULT TRUE
);

CREATE INDEX IF NOT EXISTS idx_notifications_user ON notifications(user_id, is_read, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_notifications_company ON notifications(company_id, created_at DESC);
DROP TRIGGER IF EXISTS trg_notifications_updated_at ON notifications;
CREATE TRIGGER trg_notifications_updated_at BEFORE UPDATE ON notifications FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

ALTER TABLE notifications ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS notifications_own ON notifications;
CREATE POLICY notifications_own ON notifications
  USING (
    company_id = (auth.jwt() ->> 'company_id')::UUID
    AND user_id = auth.uid()
  );

-- Enable Realtime for notifications
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime' AND tablename = 'notifications'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE notifications;
  END IF;
END $$;



-- ════════════════════════════════════════════════════════
-- MIGRATION 004_attachments_themes.sql
-- ════════════════════════════════════════════════════════
-- ══════════════════════════════════════════════════════════════════════════════
-- JAFSON PRINT ERP — MIGRATION 004: ATTACHMENTS, THEMES, USER PREFERENCES
-- Phase 5 (Theme Engine) + shared infrastructure
-- ══════════════════════════════════════════════════════════════════════════════

-- ─── ATTACHMENTS (polymorphic — reused across all modules) ───────────────────
CREATE TABLE IF NOT EXISTS attachments (
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

CREATE INDEX IF NOT EXISTS idx_attachments_entity ON attachments(entity_type, entity_id);
CREATE INDEX IF NOT EXISTS idx_attachments_company ON attachments(company_id);
DROP TRIGGER IF EXISTS trg_attachments_updated_at ON attachments;
CREATE TRIGGER trg_attachments_updated_at BEFORE UPDATE ON attachments FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

ALTER TABLE attachments ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS attachments_tenant ON attachments;
CREATE POLICY attachments_tenant ON attachments
  USING (company_id = (auth.jwt() ->> 'company_id')::UUID);

-- ─── THEMES ───────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS themes (
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

DROP TRIGGER IF EXISTS trg_themes_updated_at ON themes;
CREATE TRIGGER trg_themes_updated_at BEFORE UPDATE ON themes FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

ALTER TABLE themes ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS themes_tenant ON themes;
CREATE POLICY themes_tenant ON themes
  USING (company_id = (auth.jwt() ->> 'company_id')::UUID);

-- Seed system themes for Jafson
INSERT INTO themes (company_id, name, slug, is_default) VALUES
  ('00000000-0000-0000-0000-000000000001', 'GitHub Dark', 'github-dark', TRUE),
  ('00000000-0000-0000-0000-000000000001', 'Dark Blue', 'dark-blue', FALSE),
  ('00000000-0000-0000-0000-000000000001', 'Dark Purple', 'dark-purple', FALSE),
  ('00000000-0000-0000-0000-000000000001', 'Dark Green', 'dark-green', FALSE),
  ('00000000-0000-0000-0000-000000000001', 'Light', 'light', FALSE)
ON CONFLICT DO NOTHING;

-- ─── USER PREFERENCES ─────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS user_preferences (
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

CREATE INDEX IF NOT EXISTS idx_user_preferences_user ON user_preferences(user_id);
DROP TRIGGER IF EXISTS trg_user_preferences_updated_at ON user_preferences;
CREATE TRIGGER trg_user_preferences_updated_at BEFORE UPDATE ON user_preferences FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

ALTER TABLE user_preferences ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS user_preferences_own ON user_preferences;
CREATE POLICY user_preferences_own ON user_preferences
  USING (
    company_id = (auth.jwt() ->> 'company_id')::UUID
    AND user_id = auth.uid()
  );



-- ════════════════════════════════════════════════════════
-- MIGRATION 005_permissions.sql
-- ════════════════════════════════════════════════════════
-- ══════════════════════════════════════════════════════════════════════════════
-- JAFSON PRINT ERP — MIGRATION 005: ROLES, PERMISSIONS & PERMISSION MATRIX
-- Phase 6
-- ══════════════════════════════════════════════════════════════════════════════

-- ─── PERMISSIONS TABLE ────────────────────────────────────────────────────────
-- Each row = one (module, action) combination
CREATE TABLE IF NOT EXISTS permissions (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id  UUID NOT NULL REFERENCES companies(id),
  module      TEXT NOT NULL,   -- 'customers', 'jobs', 'store', etc.
  action      TEXT NOT NULL CHECK (action IN ('view','create','edit','delete','approve','reject','print','export','settings')),
  label       TEXT NOT NULL,   -- Human-readable: "View Customers"
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_by  UUID,
  updated_by  UUID,
  deleted_at  TIMESTAMPTZ,
  is_active   BOOLEAN NOT NULL DEFAULT TRUE,
  UNIQUE (company_id, module, action)
);

CREATE INDEX IF NOT EXISTS idx_permissions_company ON permissions(company_id);
DROP TRIGGER IF EXISTS trg_permissions_updated_at ON permissions;
CREATE TRIGGER trg_permissions_updated_at BEFORE UPDATE ON permissions FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

ALTER TABLE permissions ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS permissions_tenant ON permissions;
CREATE POLICY permissions_tenant ON permissions
  USING (company_id = (auth.jwt() ->> 'company_id')::UUID);

-- ─── ROLE PERMISSIONS ─────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS role_permissions (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id    UUID NOT NULL REFERENCES companies(id),
  role_id       UUID NOT NULL REFERENCES roles(id) ON DELETE CASCADE,
  permission_id UUID NOT NULL REFERENCES permissions(id) ON DELETE CASCADE,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_by    UUID,
  updated_by    UUID,
  deleted_at    TIMESTAMPTZ,
  is_active     BOOLEAN NOT NULL DEFAULT TRUE,
  UNIQUE (company_id, role_id, permission_id)
);

CREATE INDEX IF NOT EXISTS idx_role_permissions_role ON role_permissions(role_id);
CREATE INDEX IF NOT EXISTS idx_role_permissions_company ON role_permissions(company_id);
DROP TRIGGER IF EXISTS trg_role_permissions_updated_at ON role_permissions;
CREATE TRIGGER trg_role_permissions_updated_at BEFORE UPDATE ON role_permissions FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

ALTER TABLE role_permissions ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS role_permissions_tenant ON role_permissions;
CREATE POLICY role_permissions_tenant ON role_permissions
  USING (company_id = (auth.jwt() ->> 'company_id')::UUID);

-- ─── USER ROLES ───────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS user_roles (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id  UUID NOT NULL REFERENCES companies(id),
  user_id     UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  role_id     UUID NOT NULL REFERENCES roles(id) ON DELETE CASCADE,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_by  UUID,
  updated_by  UUID,
  deleted_at  TIMESTAMPTZ,
  is_active   BOOLEAN NOT NULL DEFAULT TRUE,
  UNIQUE (company_id, user_id, role_id)
);

CREATE INDEX IF NOT EXISTS idx_user_roles_user ON user_roles(user_id);
CREATE INDEX IF NOT EXISTS idx_user_roles_company ON user_roles(company_id);
DROP TRIGGER IF EXISTS trg_user_roles_updated_at ON user_roles;
CREATE TRIGGER trg_user_roles_updated_at BEFORE UPDATE ON user_roles FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

ALTER TABLE user_roles ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS user_roles_tenant ON user_roles;
CREATE POLICY user_roles_tenant ON user_roles
  USING (company_id = (auth.jwt() ->> 'company_id')::UUID);

-- ─── has_permission() FUNCTION ────────────────────────────────────────────────
-- Used in server-side checks and future RLS policies
CREATE OR REPLACE FUNCTION has_permission(
  p_user_id  UUID,
  p_module   TEXT,
  p_action   TEXT
) RETURNS BOOLEAN AS $$
DECLARE
  v_role TEXT;
BEGIN
  -- Superadmin bypasses all permission checks
  SELECT role INTO v_role FROM public.users WHERE id = p_user_id AND deleted_at IS NULL LIMIT 1;
  IF v_role IN ('superadmin', 'owner') THEN RETURN TRUE; END IF;

  RETURN EXISTS (
    SELECT 1
    FROM user_roles ur
    JOIN role_permissions rp ON rp.role_id = ur.role_id AND rp.deleted_at IS NULL AND rp.is_active
    JOIN permissions p ON p.id = rp.permission_id AND p.deleted_at IS NULL AND p.is_active
    WHERE ur.user_id = p_user_id
      AND ur.deleted_at IS NULL AND ur.is_active
      AND p.module = p_module
      AND p.action = p_action
  );
END;
$$ LANGUAGE plpgsql STABLE SECURITY DEFINER;

-- ─── SEED PERMISSIONS ─────────────────────────────────────────────────────────
-- All module × action combinations for Jafson
DO $$
DECLARE
  cid UUID := '00000000-0000-0000-0000-000000000001';
  modules TEXT[] := ARRAY[
    'dashboard','customers','quotations','sales_orders','jobs',
    'artwork','planning','store','board_inventory','purchase',
    'vendors','printing','lamination','die_cutting','hot_foil',
    'folder_gluing','packing','dispatch','reports','users','settings'
  ];
  actions TEXT[] := ARRAY['view','create','edit','delete','approve','reject','print','export','settings'];
  m TEXT; a TEXT;
BEGIN
  FOREACH m IN ARRAY modules LOOP
    FOREACH a IN ARRAY actions LOOP
      INSERT INTO permissions (company_id, module, action, label)
      VALUES (cid, m, a, initcap(replace(m,'_',' ')) || ' — ' || initcap(a))
      ON CONFLICT (company_id, module, action) DO NOTHING;
    END LOOP;
  END LOOP;
END $$;

-- ─── SEED: Give superadmin role ALL permissions ────────────────────────────────
INSERT INTO role_permissions (company_id, role_id, permission_id)
SELECT
  '00000000-0000-0000-0000-000000000001',
  r.id,
  p.id
FROM roles r
CROSS JOIN permissions p
WHERE r.company_id = '00000000-0000-0000-0000-000000000001'
  AND r.slug = 'superadmin'
  AND p.company_id = '00000000-0000-0000-0000-000000000001'
ON CONFLICT DO NOTHING;

-- ─── SEED: owner role — all permissions ───────────────────────────────────────
INSERT INTO role_permissions (company_id, role_id, permission_id)
SELECT
  '00000000-0000-0000-0000-000000000001',
  r.id,
  p.id
FROM roles r
CROSS JOIN permissions p
WHERE r.company_id = '00000000-0000-0000-0000-000000000001'
  AND r.slug = 'owner'
  AND p.company_id = '00000000-0000-0000-0000-000000000001'
ON CONFLICT DO NOTHING;

-- ─── SEED: sales role ─────────────────────────────────────────────────────────
INSERT INTO role_permissions (company_id, role_id, permission_id)
SELECT '00000000-0000-0000-0000-000000000001', r.id, p.id
FROM roles r, permissions p
WHERE r.company_id = p.company_id
  AND r.company_id = '00000000-0000-0000-0000-000000000001'
  AND r.slug = 'sales'
  AND p.module IN ('dashboard','customers','quotations','sales_orders','jobs','reports')
  AND p.action IN ('view','create','edit','print','export')
ON CONFLICT DO NOTHING;

-- ─── SEED: store role ─────────────────────────────────────────────────────────
INSERT INTO role_permissions (company_id, role_id, permission_id)
SELECT '00000000-0000-0000-0000-000000000001', r.id, p.id
FROM roles r, permissions p
WHERE r.company_id = p.company_id
  AND r.company_id = '00000000-0000-0000-0000-000000000001'
  AND r.slug = 'store'
  AND p.module IN ('dashboard','store','board_inventory','purchase','reports')
  AND p.action IN ('view','create','edit','print')
ON CONFLICT DO NOTHING;

-- ─── SEED: printing role ──────────────────────────────────────────────────────
INSERT INTO role_permissions (company_id, role_id, permission_id)
SELECT '00000000-0000-0000-0000-000000000001', r.id, p.id
FROM roles r, permissions p
WHERE r.company_id = p.company_id
  AND r.company_id = '00000000-0000-0000-0000-000000000001'
  AND r.slug = 'printing'
  AND p.module IN ('dashboard','jobs','printing','lamination','die_cutting','hot_foil','folder_gluing','packing')
  AND p.action IN ('view','create','edit')
ON CONFLICT DO NOTHING;

-- ─── SEED: dispatch role ──────────────────────────────────────────────────────
INSERT INTO role_permissions (company_id, role_id, permission_id)
SELECT '00000000-0000-0000-0000-000000000001', r.id, p.id
FROM roles r, permissions p
WHERE r.company_id = p.company_id
  AND r.company_id = '00000000-0000-0000-0000-000000000001'
  AND r.slug = 'dispatch'
  AND p.module IN ('dashboard','jobs','dispatch','reports')
  AND p.action IN ('view','create','edit','print')
ON CONFLICT DO NOTHING;

-- Audit triggers
DROP TRIGGER IF EXISTS trg_audit_permissions ON permissions;
CREATE TRIGGER trg_audit_permissions AFTER INSERT OR UPDATE OR DELETE ON permissions FOR EACH ROW EXECUTE FUNCTION log_audit_event();
DROP TRIGGER IF EXISTS trg_audit_role_permissions ON role_permissions;
CREATE TRIGGER trg_audit_role_permissions AFTER INSERT OR UPDATE OR DELETE ON role_permissions FOR EACH ROW EXECUTE FUNCTION log_audit_event();



-- ════════════════════════════════════════════════════════
-- MIGRATION 006_machines.sql
-- ════════════════════════════════════════════════════════
-- ══════════════════════════════════════════════════════════════════════════════
-- JAFSON PRINT ERP — MIGRATION 006: MACHINES
-- Phase 8 — Departments already seeded in migration 002
-- ══════════════════════════════════════════════════════════════════════════════

-- ─── MACHINES ─────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS machines (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id          UUID NOT NULL REFERENCES companies(id),
  name                TEXT NOT NULL,
  code                TEXT NOT NULL,
  machine_type        TEXT NOT NULL CHECK (machine_type IN (
                        'printing','diecutting','foldergluing',
                        'lamination','hotfoil','other'
                      )),
  capacity_per_hour   INTEGER,
  status              TEXT NOT NULL DEFAULT 'idle' CHECK (status IN ('running','idle','maintenance','breakdown')),
  current_operator_id UUID REFERENCES users(id),
  notes               TEXT,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_by          UUID,
  updated_by          UUID,
  deleted_at          TIMESTAMPTZ,
  is_active           BOOLEAN NOT NULL DEFAULT TRUE,
  UNIQUE (company_id, code)
);

CREATE INDEX IF NOT EXISTS idx_machines_company ON machines(company_id);
CREATE INDEX IF NOT EXISTS idx_machines_type   ON machines(company_id, machine_type);
DROP TRIGGER IF EXISTS trg_machines_updated_at ON machines;
CREATE TRIGGER trg_machines_updated_at BEFORE UPDATE ON machines FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

ALTER TABLE machines ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS machines_tenant ON machines;
CREATE POLICY machines_tenant ON machines
  USING (company_id = (auth.jwt() ->> 'company_id')::UUID);

-- ─── MACHINE STATUS HISTORY (append-only) ─────────────────────────────────────
CREATE TABLE IF NOT EXISTS machine_status_history (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id  UUID NOT NULL REFERENCES companies(id),
  machine_id  UUID NOT NULL REFERENCES machines(id) ON DELETE CASCADE,
  status      TEXT NOT NULL,
  reason      TEXT,
  changed_by  UUID REFERENCES users(id),
  changed_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_msh_machine ON machine_status_history(machine_id, changed_at DESC);
ALTER TABLE machine_status_history ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS msh_tenant ON machine_status_history;
CREATE POLICY msh_tenant ON machine_status_history
  USING (company_id = (auth.jwt() ->> 'company_id')::UUID);

-- ─── SEED MACHINES FOR JAFSON ─────────────────────────────────────────────────
INSERT INTO machines (company_id, name, code, machine_type, capacity_per_hour) VALUES
  ('00000000-0000-0000-0000-000000000001', 'MP-1 (5 Color)',           'MP-1',  'printing',     3000),
  ('00000000-0000-0000-0000-000000000001', 'MP-2 (5 Color + UV)',      'MP-2',  'printing',     3000),
  ('00000000-0000-0000-0000-000000000001', 'MP-3 (6 Color + Coater)',  'MP-3',  'printing',     2500),
  ('00000000-0000-0000-0000-000000000001', 'Die Cutting Machine 1',    'DC-1',  'diecutting',   5000),
  ('00000000-0000-0000-0000-000000000001', 'Die Cutting Machine 2',    'DC-2',  'diecutting',   5000),
  ('00000000-0000-0000-0000-000000000001', 'Folder Gluing Machine 1',  'FG-1',  'foldergluing', 8000),
  ('00000000-0000-0000-0000-000000000001', 'Folder Gluing Machine 2',  'FG-2',  'foldergluing', 8000),
  ('00000000-0000-0000-0000-000000000001', 'Lamination Machine',       'LAM-1', 'lamination',   4000),
  ('00000000-0000-0000-0000-000000000001', 'Kirma Die Cut + Hot Foil', 'KDC-1', 'hotfoil',      2000)
ON CONFLICT DO NOTHING;

-- Audit trigger
DROP TRIGGER IF EXISTS trg_audit_machines ON machines;
CREATE TRIGGER trg_audit_machines AFTER INSERT OR UPDATE OR DELETE ON machines FOR EACH ROW EXECUTE FUNCTION log_audit_event();



-- ════════════════════════════════════════════════════════
-- MIGRATION 007_material_types.sql
-- ════════════════════════════════════════════════════════
-- ══════════════════════════════════════════════════════════════════════════════
-- JAFSON PRINT ERP — MIGRATION 007: MATERIAL TYPE SETTINGS
-- Phase 9 — Board, Paper, Ink, Glue, Foil, Lamination types
-- ══════════════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS board_types (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id  UUID NOT NULL REFERENCES companies(id),
  name        TEXT NOT NULL,
  flute_type  TEXT,
  gsm         INTEGER,
  default_sheet_size TEXT,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_by  UUID, updated_by UUID, deleted_at TIMESTAMPTZ,
  is_active   BOOLEAN NOT NULL DEFAULT TRUE
);

CREATE TABLE IF NOT EXISTS paper_types (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id  UUID NOT NULL REFERENCES companies(id),
  name        TEXT NOT NULL,
  gsm         INTEGER,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_by  UUID, updated_by UUID, deleted_at TIMESTAMPTZ,
  is_active   BOOLEAN NOT NULL DEFAULT TRUE
);

CREATE TABLE IF NOT EXISTS ink_types (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id  UUID NOT NULL REFERENCES companies(id),
  name        TEXT NOT NULL,
  color_code  TEXT,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_by  UUID, updated_by UUID, deleted_at TIMESTAMPTZ,
  is_active   BOOLEAN NOT NULL DEFAULT TRUE
);

CREATE TABLE IF NOT EXISTS glue_types (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id  UUID NOT NULL REFERENCES companies(id),
  name        TEXT NOT NULL,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_by  UUID, updated_by UUID, deleted_at TIMESTAMPTZ,
  is_active   BOOLEAN NOT NULL DEFAULT TRUE
);

CREATE TABLE IF NOT EXISTS foil_types (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id  UUID NOT NULL REFERENCES companies(id),
  name        TEXT NOT NULL,
  color       TEXT,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_by  UUID, updated_by UUID, deleted_at TIMESTAMPTZ,
  is_active   BOOLEAN NOT NULL DEFAULT TRUE
);

CREATE TABLE IF NOT EXISTS lamination_types (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id  UUID NOT NULL REFERENCES companies(id),
  name        TEXT NOT NULL,
  material    TEXT,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_by  UUID, updated_by UUID, deleted_at TIMESTAMPTZ,
  is_active   BOOLEAN NOT NULL DEFAULT TRUE
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_board_types_company ON board_types(company_id);
CREATE INDEX IF NOT EXISTS idx_paper_types_company ON paper_types(company_id);
CREATE INDEX IF NOT EXISTS idx_ink_types_company   ON ink_types(company_id);
CREATE INDEX IF NOT EXISTS idx_glue_types_company  ON glue_types(company_id);
CREATE INDEX IF NOT EXISTS idx_foil_types_company  ON foil_types(company_id);
CREATE INDEX IF NOT EXISTS idx_lam_types_company   ON lamination_types(company_id);

-- Triggers
DROP TRIGGER IF EXISTS trg_board_types_upd ON board_types;
CREATE TRIGGER trg_board_types_upd    BEFORE UPDATE ON board_types    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
DROP TRIGGER IF EXISTS trg_paper_types_upd ON paper_types;
CREATE TRIGGER trg_paper_types_upd    BEFORE UPDATE ON paper_types    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
DROP TRIGGER IF EXISTS trg_ink_types_upd ON ink_types;
CREATE TRIGGER trg_ink_types_upd      BEFORE UPDATE ON ink_types      FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
DROP TRIGGER IF EXISTS trg_glue_types_upd ON glue_types;
CREATE TRIGGER trg_glue_types_upd     BEFORE UPDATE ON glue_types     FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
DROP TRIGGER IF EXISTS trg_foil_types_upd ON foil_types;
CREATE TRIGGER trg_foil_types_upd     BEFORE UPDATE ON foil_types     FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
DROP TRIGGER IF EXISTS trg_lam_types_upd ON lamination_types;
CREATE TRIGGER trg_lam_types_upd      BEFORE UPDATE ON lamination_types FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- RLS
ALTER TABLE board_types      ENABLE ROW LEVEL SECURITY;
ALTER TABLE paper_types      ENABLE ROW LEVEL SECURITY;
ALTER TABLE ink_types        ENABLE ROW LEVEL SECURITY;
ALTER TABLE glue_types       ENABLE ROW LEVEL SECURITY;
ALTER TABLE foil_types       ENABLE ROW LEVEL SECURITY;
ALTER TABLE lamination_types ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS board_types_tenant ON board_types;
CREATE POLICY board_types_tenant      ON board_types      USING (company_id = (auth.jwt() ->> 'company_id')::UUID);
DROP POLICY IF EXISTS paper_types_tenant ON paper_types;
CREATE POLICY paper_types_tenant      ON paper_types      USING (company_id = (auth.jwt() ->> 'company_id')::UUID);
DROP POLICY IF EXISTS ink_types_tenant ON ink_types;
CREATE POLICY ink_types_tenant        ON ink_types        USING (company_id = (auth.jwt() ->> 'company_id')::UUID);
DROP POLICY IF EXISTS glue_types_tenant ON glue_types;
CREATE POLICY glue_types_tenant       ON glue_types       USING (company_id = (auth.jwt() ->> 'company_id')::UUID);
DROP POLICY IF EXISTS foil_types_tenant ON foil_types;
CREATE POLICY foil_types_tenant       ON foil_types       USING (company_id = (auth.jwt() ->> 'company_id')::UUID);
DROP POLICY IF EXISTS lamination_types_tenant ON lamination_types;
CREATE POLICY lamination_types_tenant ON lamination_types USING (company_id = (auth.jwt() ->> 'company_id')::UUID);

-- Audit triggers
DROP TRIGGER IF EXISTS trg_audit_board_types ON board_types;
CREATE TRIGGER trg_audit_board_types AFTER INSERT OR UPDATE OR DELETE ON board_types FOR EACH ROW EXECUTE FUNCTION log_audit_event();
DROP TRIGGER IF EXISTS trg_audit_ink_types ON ink_types;
CREATE TRIGGER trg_audit_ink_types   AFTER INSERT OR UPDATE OR DELETE ON ink_types   FOR EACH ROW EXECUTE FUNCTION log_audit_event();

-- ─── SEED DATA FOR JAFSON ─────────────────────────────────────────────────────
INSERT INTO board_types (company_id, name, flute_type, gsm) VALUES
  ('00000000-0000-0000-0000-000000000001', 'B Flute',  'B', 150),
  ('00000000-0000-0000-0000-000000000001', 'C Flute',  'C', 150),
  ('00000000-0000-0000-0000-000000000001', 'E Flute',  'E', 120),
  ('00000000-0000-0000-0000-000000000001', 'BC Flute', 'BC', 200),
  ('00000000-0000-0000-0000-000000000001', 'Rigid Board', NULL, 350),
  ('00000000-0000-0000-0000-000000000001', 'Duplex Board', NULL, 300)
ON CONFLICT DO NOTHING;

INSERT INTO paper_types (company_id, name, gsm) VALUES
  ('00000000-0000-0000-0000-000000000001', 'Art Paper',     130),
  ('00000000-0000-0000-0000-000000000001', 'Kraft Paper',   90),
  ('00000000-0000-0000-0000-000000000001', 'Bond Paper',    80),
  ('00000000-0000-0000-0000-000000000001', 'Gloss Coated',  150),
  ('00000000-0000-0000-0000-000000000001', 'Matt Coated',   150)
ON CONFLICT DO NOTHING;

INSERT INTO ink_types (company_id, name, color_code) VALUES
  ('00000000-0000-0000-0000-000000000001', 'Cyan',    '#00FFFF'),
  ('00000000-0000-0000-0000-000000000001', 'Magenta', '#FF00FF'),
  ('00000000-0000-0000-0000-000000000001', 'Yellow',  '#FFFF00'),
  ('00000000-0000-0000-0000-000000000001', 'Black',   '#000000'),
  ('00000000-0000-0000-0000-000000000001', 'White',   '#FFFFFF'),
  ('00000000-0000-0000-0000-000000000001', 'UV Varnish', NULL)
ON CONFLICT DO NOTHING;

INSERT INTO glue_types (company_id, name) VALUES
  ('00000000-0000-0000-0000-000000000001', 'Cold Glue'),
  ('00000000-0000-0000-0000-000000000001', 'Hot Melt Glue'),
  ('00000000-0000-0000-0000-000000000001', 'PVA Glue')
ON CONFLICT DO NOTHING;

INSERT INTO foil_types (company_id, name, color) VALUES
  ('00000000-0000-0000-0000-000000000001', 'Gold Foil',   'Gold'),
  ('00000000-0000-0000-0000-000000000001', 'Silver Foil', 'Silver'),
  ('00000000-0000-0000-0000-000000000001', 'Red Foil',    'Red'),
  ('00000000-0000-0000-0000-000000000001', 'Blue Foil',   'Blue'),
  ('00000000-0000-0000-0000-000000000001', 'Black Foil',  'Black')
ON CONFLICT DO NOTHING;

INSERT INTO lamination_types (company_id, name, material) VALUES
  ('00000000-0000-0000-0000-000000000001', 'Gloss Lamination', 'BOPP'),
  ('00000000-0000-0000-0000-000000000001', 'Matt Lamination',  'BOPP Matt'),
  ('00000000-0000-0000-0000-000000000001', 'Soft Touch',       'Soft Touch Film'),
  ('00000000-0000-0000-0000-000000000001', 'Anti-Scratch',     'AS Film')
ON CONFLICT DO NOTHING;



-- ════════════════════════════════════════════════════════
-- MIGRATION 008_units_currencies_taxes.sql
-- ════════════════════════════════════════════════════════
-- ══════════════════════════════════════════════════════════════════════════════
-- JAFSON PRINT ERP — MIGRATION 008: UNITS, CURRENCIES, TAXES
-- Phase 10
-- ══════════════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS units (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id  UUID NOT NULL REFERENCES companies(id),
  name        TEXT NOT NULL,
  symbol      TEXT NOT NULL,
  unit_type   TEXT NOT NULL CHECK (unit_type IN ('quantity','weight','length','area','volume')),
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_by  UUID, updated_by UUID, deleted_at TIMESTAMPTZ,
  is_active   BOOLEAN NOT NULL DEFAULT TRUE
);

CREATE TABLE IF NOT EXISTS currencies (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id            UUID NOT NULL REFERENCES companies(id),
  code                  TEXT NOT NULL,
  symbol                TEXT NOT NULL,
  name                  TEXT NOT NULL,
  is_base               BOOLEAN NOT NULL DEFAULT FALSE,
  exchange_rate_to_base NUMERIC(18,6) NOT NULL DEFAULT 1,
  created_at            TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at            TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_by  UUID, updated_by UUID, deleted_at TIMESTAMPTZ,
  is_active   BOOLEAN NOT NULL DEFAULT TRUE,
  UNIQUE (company_id, code)
);

CREATE TABLE IF NOT EXISTS taxes (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id  UUID NOT NULL REFERENCES companies(id),
  name        TEXT NOT NULL,
  rate_percent NUMERIC(5,2) NOT NULL,
  is_default  BOOLEAN NOT NULL DEFAULT FALSE,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_by  UUID, updated_by UUID, deleted_at TIMESTAMPTZ,
  is_active   BOOLEAN NOT NULL DEFAULT TRUE
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_units_company      ON units(company_id);
CREATE INDEX IF NOT EXISTS idx_currencies_company ON currencies(company_id);
CREATE INDEX IF NOT EXISTS idx_taxes_company      ON taxes(company_id);

-- Triggers
DROP TRIGGER IF EXISTS trg_units_upd ON units;
CREATE TRIGGER trg_units_upd      BEFORE UPDATE ON units      FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
DROP TRIGGER IF EXISTS trg_currencies_upd ON currencies;
CREATE TRIGGER trg_currencies_upd BEFORE UPDATE ON currencies FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
DROP TRIGGER IF EXISTS trg_taxes_upd ON taxes;
CREATE TRIGGER trg_taxes_upd      BEFORE UPDATE ON taxes      FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- RLS
ALTER TABLE units      ENABLE ROW LEVEL SECURITY;
ALTER TABLE currencies ENABLE ROW LEVEL SECURITY;
ALTER TABLE taxes      ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS units_tenant ON units;
CREATE POLICY units_tenant      ON units      USING (company_id = (auth.jwt() ->> 'company_id')::UUID);
DROP POLICY IF EXISTS currencies_tenant ON currencies;
CREATE POLICY currencies_tenant ON currencies USING (company_id = (auth.jwt() ->> 'company_id')::UUID);
DROP POLICY IF EXISTS taxes_tenant ON taxes;
CREATE POLICY taxes_tenant      ON taxes      USING (company_id = (auth.jwt() ->> 'company_id')::UUID);

-- Add base_currency_id FK now that currencies table exists
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'fk_companies_base_currency') THEN
    ALTER TABLE companies ADD CONSTRAINT fk_companies_base_currency FOREIGN KEY (base_currency_id) REFERENCES currencies(id);
  END IF;
END $$;

-- ─── SEED ─────────────────────────────────────────────────────────────────────
INSERT INTO units (company_id, name, symbol, unit_type) VALUES
  ('00000000-0000-0000-0000-000000000001', 'Pieces',       'Pcs',  'quantity'),
  ('00000000-0000-0000-0000-000000000001', 'Box',          'Box',  'quantity'),
  ('00000000-0000-0000-0000-000000000001', 'Set',          'Set',  'quantity'),
  ('00000000-0000-0000-0000-000000000001', 'Sheet',        'Sht',  'quantity'),
  ('00000000-0000-0000-0000-000000000001', 'Roll',         'Roll', 'quantity'),
  ('00000000-0000-0000-0000-000000000001', 'Kilogram',     'KG',   'weight'),
  ('00000000-0000-0000-0000-000000000001', 'Gram',         'g',    'weight'),
  ('00000000-0000-0000-0000-000000000001', 'Ton',          'Ton',  'weight'),
  ('00000000-0000-0000-0000-000000000001', 'Meter',        'm',    'length'),
  ('00000000-0000-0000-0000-000000000001', 'Millimeter',   'mm',   'length'),
  ('00000000-0000-0000-0000-000000000001', 'Centimeter',   'cm',   'length'),
  ('00000000-0000-0000-0000-000000000001', 'Square Meter', 'm²',   'area'),
  ('00000000-0000-0000-0000-000000000001', 'Liter',        'L',    'volume'),
  ('00000000-0000-0000-0000-000000000001', 'Milliliter',   'ml',   'volume')
ON CONFLICT DO NOTHING;

INSERT INTO currencies (company_id, code, symbol, name, is_base, exchange_rate_to_base) VALUES
  ('00000000-0000-0000-0000-000000000001', 'PKR', '₨', 'Pakistani Rupee', TRUE,  1),
  ('00000000-0000-0000-0000-000000000001', 'USD', '$', 'US Dollar',        FALSE, 278),
  ('00000000-0000-0000-0000-000000000001', 'AED', 'د.إ', 'UAE Dirham',    FALSE, 75)
ON CONFLICT DO NOTHING;

INSERT INTO taxes (company_id, name, rate_percent, is_default) VALUES
  ('00000000-0000-0000-0000-000000000001', 'GST 17%',  17.00, TRUE),
  ('00000000-0000-0000-0000-000000000001', 'GST 0%',    0.00, FALSE),
  ('00000000-0000-0000-0000-000000000001', 'WHT 4.5%',  4.50, FALSE)
ON CONFLICT DO NOTHING;

-- Set PKR as base currency for Jafson
UPDATE companies SET base_currency_id = (
  SELECT id FROM currencies WHERE company_id = '00000000-0000-0000-0000-000000000001' AND code = 'PKR'
) WHERE id = '00000000-0000-0000-0000-000000000001';



-- ════════════════════════════════════════════════════════
-- MIGRATION 009_sequences.sql
-- ════════════════════════════════════════════════════════
-- ══════════════════════════════════════════════════════════════════════════════
-- JAFSON PRINT ERP — MIGRATION 009: NUMBERING / SEQUENCE ENGINE
-- Phase 11 — Atomic, concurrent-safe document number generation
-- ══════════════════════════════════════════════════════════════════════════════

-- ─── DOCUMENT SEQUENCES TABLE ─────────────────────────────────────────────────
-- One row per (company, document_type, year)
-- NEVER read/written directly by app code — only via get_next_sequence_number()
CREATE TABLE IF NOT EXISTS document_sequences (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id      UUID NOT NULL REFERENCES companies(id),
  document_type   TEXT NOT NULL,  -- 'JOB','SO','QT','PO','DISP'
  year            INTEGER NOT NULL,
  prefix_format   TEXT NOT NULL DEFAULT '{PREFIX}-{YEAR}-{SEQ}',
  prefix          TEXT NOT NULL,
  padding         INTEGER NOT NULL DEFAULT 5,
  current_value   INTEGER NOT NULL DEFAULT 0,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (company_id, document_type, year)
);

CREATE INDEX IF NOT EXISTS idx_doc_seq_company ON document_sequences(company_id, document_type);

-- ─── PATCH: Add padding column if missing (safe) ─────────────────────────────
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'document_sequences' AND column_name = 'padding'
  ) THEN
    ALTER TABLE document_sequences ADD COLUMN padding INTEGER NOT NULL DEFAULT 5;
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'document_sequences' AND column_name = 'prefix_format'
  ) THEN
    ALTER TABLE document_sequences ADD COLUMN prefix_format TEXT NOT NULL DEFAULT '{PREFIX}-{YEAR}-{SEQ}';
  END IF;
END $$;

DROP TRIGGER IF EXISTS trg_doc_seq_upd ON document_sequences;
CREATE TRIGGER trg_doc_seq_upd BEFORE UPDATE ON document_sequences FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

ALTER TABLE document_sequences ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS doc_seq_tenant ON document_sequences;
CREATE POLICY doc_seq_tenant ON document_sequences
  USING (company_id = (auth.jwt() ->> 'company_id')::UUID);

-- ─── ATOMIC SEQUENCE FUNCTION ─────────────────────────────────────────────────
-- Uses SELECT FOR UPDATE to guarantee no duplicate numbers under concurrency
-- Returns formatted document number, e.g. JOB-2026-00001
CREATE OR REPLACE FUNCTION get_next_sequence_number(
  p_company_id    UUID,
  p_document_type TEXT
) RETURNS TEXT AS $$
DECLARE
  v_year        INTEGER := EXTRACT(YEAR FROM NOW());
  v_seq_row     document_sequences%ROWTYPE;
  v_next_val    INTEGER;
  v_result      TEXT;
  v_padded      TEXT;
BEGIN
  -- Lock the row for this company/type/year (creates if missing)
  SELECT * INTO v_seq_row
  FROM document_sequences
  WHERE company_id = p_company_id
    AND document_type = p_document_type
    AND year = v_year
  FOR UPDATE;

  IF NOT FOUND THEN
    -- First number of the year — insert seed row
    INSERT INTO document_sequences (company_id, document_type, year, prefix, current_value)
    VALUES (
      p_company_id,
      p_document_type,
      v_year,
      p_document_type,
      0
    )
    ON CONFLICT (company_id, document_type, year) DO NOTHING;

    -- Re-select with lock after insert
    SELECT * INTO v_seq_row
    FROM document_sequences
    WHERE company_id = p_company_id
      AND document_type = p_document_type
      AND year = v_year
    FOR UPDATE;
  END IF;

  -- Increment
  v_next_val := v_seq_row.current_value + 1;

  UPDATE document_sequences
  SET current_value = v_next_val
  WHERE company_id = p_company_id
    AND document_type = p_document_type
    AND year = v_year;

  -- Format: PREFIX-YEAR-00001
  v_padded := lpad(v_next_val::TEXT, v_seq_row.padding, '0');
  v_result := v_seq_row.prefix || '-' || v_year || '-' || v_padded;

  RETURN v_result;
END;
$$ LANGUAGE plpgsql;

-- Grant to authenticated users (called via RPC)
GRANT EXECUTE ON FUNCTION get_next_sequence_number(UUID, TEXT) TO authenticated;

-- ─── SEED: Document types for Jafson ──────────────────────────────────────────
INSERT INTO document_sequences (company_id, document_type, year, prefix, padding, current_value) VALUES
  ('00000000-0000-0000-0000-000000000001', 'JOB',  2026, 'JOB',  5, 0),
  ('00000000-0000-0000-0000-000000000001', 'SO',   2026, 'SO',   5, 0),
  ('00000000-0000-0000-0000-000000000001', 'QT',   2026, 'QT',   5, 0),
  ('00000000-0000-0000-0000-000000000001', 'PO',   2026, 'PO',   5, 0),
  ('00000000-0000-0000-0000-000000000001', 'DISP', 2026, 'DISP', 5, 0)
ON CONFLICT DO NOTHING;



-- ════════════════════════════════════════════════════════
-- MIGRATION 010_workflow_engine.sql
-- ════════════════════════════════════════════════════════
-- JAFSON PRINT ERP — MIGRATION 010: WORKFLOW ENGINE
CREATE TABLE IF NOT EXISTS workflow_templates (
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

CREATE TABLE IF NOT EXISTS workflow_stages (
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

CREATE INDEX IF NOT EXISTS idx_wf_templates_company ON workflow_templates(company_id);
CREATE INDEX IF NOT EXISTS idx_wf_stages_template   ON workflow_stages(workflow_template_id, sequence_order);
CREATE INDEX IF NOT EXISTS idx_wf_stages_company    ON workflow_stages(company_id);

DROP TRIGGER IF EXISTS trg_wf_templates_upd ON workflow_templates;
CREATE TRIGGER trg_wf_templates_upd BEFORE UPDATE ON workflow_templates FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
DROP TRIGGER IF EXISTS trg_wf_stages_upd ON workflow_stages;
CREATE TRIGGER trg_wf_stages_upd    BEFORE UPDATE ON workflow_stages    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

ALTER TABLE workflow_templates ENABLE ROW LEVEL SECURITY;
ALTER TABLE workflow_stages    ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS wf_templates_tenant ON workflow_templates;
CREATE POLICY wf_templates_tenant ON workflow_templates USING (company_id = (auth.jwt() ->> 'company_id')::UUID);
DROP POLICY IF EXISTS wf_stages_tenant ON workflow_stages;
CREATE POLICY wf_stages_tenant    ON workflow_stages    USING (company_id = (auth.jwt() ->> 'company_id')::UUID);
DROP TRIGGER IF EXISTS trg_audit_wf_templates ON workflow_templates;
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



-- ════════════════════════════════════════════════════════
-- MIGRATION 011_job_status_delay.sql
-- ════════════════════════════════════════════════════════
-- JAFSON PRINT ERP — MIGRATION 011: JOB STATUS & DELAY REASONS
CREATE TABLE IF NOT EXISTS job_statuses (
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

CREATE TABLE IF NOT EXISTS delay_reasons (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id  UUID NOT NULL REFERENCES companies(id),
  name        TEXT NOT NULL,
  category    TEXT NOT NULL DEFAULT 'general',
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_by UUID, updated_by UUID, deleted_at TIMESTAMPTZ,
  is_active   BOOLEAN NOT NULL DEFAULT TRUE
);

CREATE INDEX IF NOT EXISTS idx_job_statuses_company  ON job_statuses(company_id, sort_order);
CREATE INDEX IF NOT EXISTS idx_delay_reasons_company ON delay_reasons(company_id);

DROP TRIGGER IF EXISTS trg_job_statuses_upd ON job_statuses;
CREATE TRIGGER trg_job_statuses_upd  BEFORE UPDATE ON job_statuses  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
DROP TRIGGER IF EXISTS trg_delay_reasons_upd ON delay_reasons;
CREATE TRIGGER trg_delay_reasons_upd BEFORE UPDATE ON delay_reasons FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

ALTER TABLE job_statuses  ENABLE ROW LEVEL SECURITY;
ALTER TABLE delay_reasons ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS job_statuses_tenant ON job_statuses;
CREATE POLICY job_statuses_tenant  ON job_statuses  USING (company_id = (auth.jwt() ->> 'company_id')::UUID);
DROP POLICY IF EXISTS delay_reasons_tenant ON delay_reasons;
CREATE POLICY delay_reasons_tenant ON delay_reasons USING (company_id = (auth.jwt() ->> 'company_id')::UUID);

-- Seed job statuses
INSERT INTO job_statuses (company_id, name, slug, color_hex, sort_order, is_system) VALUES
  ('00000000-0000-0000-0000-000000000001', 'New',         'new',         '#2f81f7', 1,  TRUE),
  ('00000000-0000-0000-0000-000000000001', 'In Progress', 'in_progress', '#d29922', 2,  TRUE),
  ('00000000-0000-0000-0000-000000000001', 'On Hold',     'on_hold',     '#f85149', 3,  TRUE),
  ('00000000-0000-0000-0000-000000000001', 'Completed',   'completed',   '#3fb950', 4,  TRUE),
  ('00000000-0000-0000-0000-000000000001', 'Dispatched',  'dispatched',  '#58a6ff', 5,  TRUE),
  ('00000000-0000-0000-0000-000000000001', 'Cancelled',   'cancelled',   '#6e7681', 6,  TRUE)
ON CONFLICT DO NOTHING;

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
  ('00000000-0000-0000-0000-000000000001', 'Other',                     'general')
ON CONFLICT DO NOTHING;



-- ════════════════════════════════════════════════════════
-- MIGRATION 012_crm.sql
-- ════════════════════════════════════════════════════════
-- ══════════════════════════════════════════════════════════════════════════════
-- JAFSON PRINT ERP — MIGRATION 012: CRM (Customers, Contacts, Addresses)
-- Phase 16 & 17
-- ══════════════════════════════════════════════════════════════════════════════

-- ─── CUSTOMERS ────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS customers (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id        UUID NOT NULL REFERENCES companies(id),
  customer_code     TEXT NOT NULL,
  name              TEXT NOT NULL,
  business_type     TEXT DEFAULT 'company' CHECK (business_type IN ('company','individual','government')),
  ntn               TEXT,
  strn              TEXT,
  email             TEXT,
  phone             TEXT,
  mobile            TEXT,
  website           TEXT,
  industry          TEXT,
  credit_limit      NUMERIC(14,2) DEFAULT 0,
  payment_terms     INTEGER DEFAULT 30,      -- days
  currency_id       UUID REFERENCES currencies(id),
  default_tax_id    UUID REFERENCES taxes(id),
  assigned_to       UUID REFERENCES users(id),
  notes             TEXT,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_by        UUID, updated_by UUID, deleted_at TIMESTAMPTZ,
  is_active         BOOLEAN NOT NULL DEFAULT TRUE,
  UNIQUE (company_id, customer_code)
);

CREATE INDEX IF NOT EXISTS idx_customers_company    ON customers(company_id);
CREATE INDEX IF NOT EXISTS idx_customers_name       ON customers USING gin(to_tsvector('simple', name));
CREATE INDEX IF NOT EXISTS idx_customers_code       ON customers(company_id, customer_code);
DROP TRIGGER IF EXISTS trg_customers_upd ON customers;
CREATE TRIGGER trg_customers_upd BEFORE UPDATE ON customers FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
ALTER TABLE customers ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS customers_tenant ON customers;
CREATE POLICY customers_tenant ON customers USING (company_id = (auth.jwt() ->> 'company_id')::UUID);
DROP TRIGGER IF EXISTS trg_audit_customers ON customers;
CREATE TRIGGER trg_audit_customers AFTER INSERT OR UPDATE OR DELETE ON customers FOR EACH ROW EXECUTE FUNCTION log_audit_event();

-- ─── CONTACTS ─────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS customer_contacts (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id    UUID NOT NULL REFERENCES companies(id),
  customer_id   UUID NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
  name          TEXT NOT NULL,
  designation   TEXT,
  email         TEXT,
  phone         TEXT,
  mobile        TEXT,
  is_primary    BOOLEAN NOT NULL DEFAULT FALSE,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_by UUID, updated_by UUID, deleted_at TIMESTAMPTZ,
  is_active  BOOLEAN NOT NULL DEFAULT TRUE
);

CREATE INDEX IF NOT EXISTS idx_contacts_customer ON customer_contacts(customer_id);
DROP TRIGGER IF EXISTS trg_contacts_upd ON customer_contacts;
CREATE TRIGGER trg_contacts_upd BEFORE UPDATE ON customer_contacts FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
ALTER TABLE customer_contacts ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS contacts_tenant ON customer_contacts;
CREATE POLICY contacts_tenant ON customer_contacts USING (company_id = (auth.jwt() ->> 'company_id')::UUID);

-- ─── ADDRESSES ────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS customer_addresses (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id    UUID NOT NULL REFERENCES companies(id),
  customer_id   UUID NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
  label         TEXT NOT NULL DEFAULT 'Main',
  address_type  TEXT NOT NULL DEFAULT 'billing' CHECK (address_type IN ('billing','delivery','both')),
  address_line1 TEXT NOT NULL,
  address_line2 TEXT,
  city          TEXT,
  state         TEXT,
  country       TEXT DEFAULT 'Pakistan',
  is_default    BOOLEAN NOT NULL DEFAULT FALSE,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_by UUID, updated_by UUID, deleted_at TIMESTAMPTZ,
  is_active  BOOLEAN NOT NULL DEFAULT TRUE
);

CREATE INDEX IF NOT EXISTS idx_addresses_customer ON customer_addresses(customer_id);
DROP TRIGGER IF EXISTS trg_addresses_upd ON customer_addresses;
CREATE TRIGGER trg_addresses_upd BEFORE UPDATE ON customer_addresses FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
ALTER TABLE customer_addresses ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS addresses_tenant ON customer_addresses;
CREATE POLICY addresses_tenant ON customer_addresses USING (company_id = (auth.jwt() ->> 'company_id')::UUID);

-- ─── CUSTOMER CODE SEQUENCE ───────────────────────────────────────────────────
INSERT INTO document_sequences (company_id, document_type, year, prefix, padding, current_value)
VALUES ('00000000-0000-0000-0000-000000000001', 'CUST', 2026, 'CUST', 4, 0)
ON CONFLICT DO NOTHING;



-- ════════════════════════════════════════════════════════
-- MIGRATION 013_sales.sql
-- ════════════════════════════════════════════════════════
-- ══════════════════════════════════════════════════════════════════════════════
-- JAFSON PRINT ERP — MIGRATION 013: QUOTATIONS & SALES ORDERS
-- Phase 18–21
-- ══════════════════════════════════════════════════════════════════════════════

-- ─── QUOTATIONS ───────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS quotations (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id        UUID NOT NULL REFERENCES companies(id),
  quotation_number  TEXT NOT NULL,
  customer_id       UUID NOT NULL REFERENCES customers(id),
  customer_contact_id UUID REFERENCES customer_contacts(id),
  status            TEXT NOT NULL DEFAULT 'draft'
                    CHECK (status IN ('draft','sent','approved','rejected','expired','converted')),
  valid_until       DATE,
  currency_id       UUID REFERENCES currencies(id),
  tax_id            UUID REFERENCES taxes(id),
  discount_percent  NUMERIC(5,2) DEFAULT 0,
  notes             TEXT,
  terms_conditions  TEXT,
  subtotal          NUMERIC(14,2) NOT NULL DEFAULT 0,
  tax_amount        NUMERIC(14,2) NOT NULL DEFAULT 0,
  discount_amount   NUMERIC(14,2) NOT NULL DEFAULT 0,
  total_amount      NUMERIC(14,2) NOT NULL DEFAULT 0,
  revision          INTEGER NOT NULL DEFAULT 1,
  parent_quotation_id UUID REFERENCES quotations(id),
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_by UUID, updated_by UUID, deleted_at TIMESTAMPTZ,
  is_active  BOOLEAN NOT NULL DEFAULT TRUE,
  UNIQUE (company_id, quotation_number)
);

CREATE INDEX IF NOT EXISTS idx_quotations_company    ON quotations(company_id);
CREATE INDEX IF NOT EXISTS idx_quotations_customer   ON quotations(customer_id);
CREATE INDEX IF NOT EXISTS idx_quotations_status     ON quotations(company_id, status);
DROP TRIGGER IF EXISTS trg_quotations_upd ON quotations;
CREATE TRIGGER trg_quotations_upd BEFORE UPDATE ON quotations FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
ALTER TABLE quotations ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS quotations_tenant ON quotations;
CREATE POLICY quotations_tenant ON quotations USING (company_id = (auth.jwt() ->> 'company_id')::UUID);
DROP TRIGGER IF EXISTS trg_audit_quotations ON quotations;
CREATE TRIGGER trg_audit_quotations AFTER INSERT OR UPDATE OR DELETE ON quotations FOR EACH ROW EXECUTE FUNCTION log_audit_event();

-- ─── QUOTATION LINE ITEMS ─────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS quotation_items (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id        UUID NOT NULL REFERENCES companies(id),
  quotation_id      UUID NOT NULL REFERENCES quotations(id) ON DELETE CASCADE,
  line_no           INTEGER NOT NULL DEFAULT 1,
  product_desc      TEXT NOT NULL,
  size_l            NUMERIC(10,2),
  size_w            NUMERIC(10,2),
  size_h            NUMERIC(10,2),
  quantity          NUMERIC(12,2) NOT NULL DEFAULT 1,
  unit_id           UUID REFERENCES units(id),
  board_type_id     UUID REFERENCES board_types(id),
  no_of_colors      INTEGER DEFAULT 4,
  lamination_type_id UUID REFERENCES lamination_types(id),
  unit_price        NUMERIC(14,4) NOT NULL DEFAULT 0,
  subtotal          NUMERIC(14,2) NOT NULL DEFAULT 0,
  notes             TEXT,
  sort_order        INTEGER NOT NULL DEFAULT 1,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_by UUID, updated_by UUID, deleted_at TIMESTAMPTZ,
  is_active  BOOLEAN NOT NULL DEFAULT TRUE
);

CREATE INDEX IF NOT EXISTS idx_qt_items_quotation ON quotation_items(quotation_id, sort_order);
DROP TRIGGER IF EXISTS trg_qt_items_upd ON quotation_items;
CREATE TRIGGER trg_qt_items_upd BEFORE UPDATE ON quotation_items FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
ALTER TABLE quotation_items ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS qt_items_tenant ON quotation_items;
CREATE POLICY qt_items_tenant ON quotation_items USING (company_id = (auth.jwt() ->> 'company_id')::UUID);

-- ─── SALES ORDERS ─────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS sales_orders (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id        UUID NOT NULL REFERENCES companies(id),
  so_number         TEXT NOT NULL,
  quotation_id      UUID REFERENCES quotations(id),
  customer_id       UUID NOT NULL REFERENCES customers(id),
  customer_contact_id UUID REFERENCES customer_contacts(id),
  delivery_address_id UUID REFERENCES customer_addresses(id),
  status            TEXT NOT NULL DEFAULT 'confirmed'
                    CHECK (status IN ('confirmed','in_production','completed','dispatched','cancelled')),
  order_date        DATE NOT NULL DEFAULT CURRENT_DATE,
  required_date     DATE,
  currency_id       UUID REFERENCES currencies(id),
  tax_id            UUID REFERENCES taxes(id),
  discount_percent  NUMERIC(5,2) DEFAULT 0,
  special_instructions TEXT,
  subtotal          NUMERIC(14,2) NOT NULL DEFAULT 0,
  tax_amount        NUMERIC(14,2) NOT NULL DEFAULT 0,
  discount_amount   NUMERIC(14,2) NOT NULL DEFAULT 0,
  total_amount      NUMERIC(14,2) NOT NULL DEFAULT 0,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_by UUID, updated_by UUID, deleted_at TIMESTAMPTZ,
  is_active  BOOLEAN NOT NULL DEFAULT TRUE,
  UNIQUE (company_id, so_number)
);

CREATE INDEX IF NOT EXISTS idx_so_company   ON sales_orders(company_id);
CREATE INDEX IF NOT EXISTS idx_so_customer  ON sales_orders(customer_id);
CREATE INDEX IF NOT EXISTS idx_so_status    ON sales_orders(company_id, status);
DROP TRIGGER IF EXISTS trg_so_upd ON sales_orders;
CREATE TRIGGER trg_so_upd BEFORE UPDATE ON sales_orders FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
ALTER TABLE sales_orders ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS so_tenant ON sales_orders;
CREATE POLICY so_tenant ON sales_orders USING (company_id = (auth.jwt() ->> 'company_id')::UUID);
DROP TRIGGER IF EXISTS trg_audit_so ON sales_orders;
CREATE TRIGGER trg_audit_so AFTER INSERT OR UPDATE OR DELETE ON sales_orders FOR EACH ROW EXECUTE FUNCTION log_audit_event();

-- ─── SALES ORDER LINE ITEMS ───────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS sales_order_items (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id        UUID NOT NULL REFERENCES companies(id),
  sales_order_id    UUID NOT NULL REFERENCES sales_orders(id) ON DELETE CASCADE,
  quotation_item_id UUID REFERENCES quotation_items(id),
  line_no           INTEGER NOT NULL DEFAULT 1,
  product_desc      TEXT NOT NULL,
  size_l            NUMERIC(10,2),
  size_w            NUMERIC(10,2),
  size_h            NUMERIC(10,2),
  quantity          NUMERIC(12,2) NOT NULL DEFAULT 1,
  unit_id           UUID REFERENCES units(id),
  board_type_id     UUID REFERENCES board_types(id),
  no_of_colors      INTEGER DEFAULT 4,
  lamination_type_id UUID REFERENCES lamination_types(id),
  unit_price        NUMERIC(14,4) NOT NULL DEFAULT 0,
  subtotal          NUMERIC(14,2) NOT NULL DEFAULT 0,
  notes             TEXT,
  sort_order        INTEGER NOT NULL DEFAULT 1,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_by UUID, updated_by UUID, deleted_at TIMESTAMPTZ,
  is_active  BOOLEAN NOT NULL DEFAULT TRUE
);

CREATE INDEX IF NOT EXISTS idx_so_items_so ON sales_order_items(sales_order_id, sort_order);
DROP TRIGGER IF EXISTS trg_so_items_upd ON sales_order_items;
CREATE TRIGGER trg_so_items_upd BEFORE UPDATE ON sales_order_items FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
ALTER TABLE sales_order_items ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS so_items_tenant ON sales_order_items;
CREATE POLICY so_items_tenant ON sales_order_items USING (company_id = (auth.jwt() ->> 'company_id')::UUID);

-- ─── SEQUENCES FOR QT AND SO ──────────────────────────────────────────────────
INSERT INTO document_sequences (company_id, document_type, year, prefix, padding, current_value) VALUES
  ('00000000-0000-0000-0000-000000000001', 'QT', 2026, 'QT', 5, 0),
  ('00000000-0000-0000-0000-000000000001', 'SO', 2026, 'SO', 5, 0)
ON CONFLICT DO NOTHING;



-- ════════════════════════════════════════════════════════
-- MIGRATION 014_jobs_core.sql
-- ════════════════════════════════════════════════════════
-- ══════════════════════════════════════════════════════════════════════════════
-- JAFSON PRINT ERP — MIGRATION 014: JOB ENGINE CORE
-- Phase 22 — Job Core Schema
-- Phase 23 — Job Workflow Instance Engine
-- ══════════════════════════════════════════════════════════════════════════════

-- ─── JOBS (main table) ────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS jobs (
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

CREATE INDEX IF NOT EXISTS idx_jobs_company        ON jobs(company_id);
CREATE INDEX IF NOT EXISTS idx_jobs_customer       ON jobs(customer_id);
CREATE INDEX IF NOT EXISTS idx_jobs_so             ON jobs(sales_order_id);
CREATE INDEX IF NOT EXISTS idx_jobs_status         ON jobs(company_id, status);
CREATE INDEX IF NOT EXISTS idx_jobs_required_date  ON jobs(company_id, required_date);
CREATE INDEX IF NOT EXISTS idx_jobs_priority       ON jobs(company_id, priority);
CREATE INDEX IF NOT EXISTS idx_jobs_number         ON jobs(company_id, job_number);

DROP TRIGGER IF EXISTS trg_jobs_upd ON jobs;
CREATE TRIGGER trg_jobs_upd BEFORE UPDATE ON jobs FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
ALTER TABLE jobs ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS jobs_tenant ON jobs;
CREATE POLICY jobs_tenant ON jobs USING (company_id = (auth.jwt() ->> 'company_id')::UUID);
DROP TRIGGER IF EXISTS trg_audit_jobs ON jobs;
CREATE TRIGGER trg_audit_jobs AFTER INSERT OR UPDATE OR DELETE ON jobs FOR EACH ROW EXECUTE FUNCTION log_audit_event();

-- ─── JOB WORKFLOW INSTANCES ───────────────────────────────────────────────────
-- One row per job — tracks which template is assigned
CREATE TABLE IF NOT EXISTS job_workflow_instances (
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

CREATE INDEX IF NOT EXISTS idx_jwi_job ON job_workflow_instances(job_id);
DROP TRIGGER IF EXISTS trg_jwi_upd ON job_workflow_instances;
CREATE TRIGGER trg_jwi_upd BEFORE UPDATE ON job_workflow_instances FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
ALTER TABLE job_workflow_instances ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS jwi_tenant ON job_workflow_instances;
CREATE POLICY jwi_tenant ON job_workflow_instances USING (company_id = (auth.jwt() ->> 'company_id')::UUID);

-- ─── JOB STAGE PROGRESS ───────────────────────────────────────────────────────
-- One row per (job, stage) — tracks completion of each workflow stage
CREATE TABLE IF NOT EXISTS job_stage_progress (
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

CREATE INDEX IF NOT EXISTS idx_jsp_job   ON job_stage_progress(job_id, sequence_order);
CREATE INDEX IF NOT EXISTS idx_jsp_stage ON job_stage_progress(workflow_stage_id);
DROP TRIGGER IF EXISTS trg_jsp_upd ON job_stage_progress;
CREATE TRIGGER trg_jsp_upd BEFORE UPDATE ON job_stage_progress FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
ALTER TABLE job_stage_progress ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS jsp_tenant ON job_stage_progress;
CREATE POLICY jsp_tenant ON job_stage_progress USING (company_id = (auth.jwt() ->> 'company_id')::UUID);

-- ─── JOB STAGE EVENTS (append-only timeline) ─────────────────────────────────
-- Phase 25 — immutable event log — NO UPDATE / DELETE
CREATE TABLE IF NOT EXISTS job_stage_events (
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

CREATE INDEX IF NOT EXISTS idx_jse_job        ON job_stage_events(job_id, occurred_at DESC);
CREATE INDEX IF NOT EXISTS idx_jse_company    ON job_stage_events(company_id, occurred_at DESC);
CREATE INDEX IF NOT EXISTS idx_jse_event_type ON job_stage_events(job_id, event_type);

-- IMMUTABLE: only SELECT + INSERT allowed
ALTER TABLE job_stage_events ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS jse_tenant_read ON job_stage_events;
CREATE POLICY jse_tenant_read   ON job_stage_events FOR SELECT USING (company_id = (auth.jwt() ->> 'company_id')::UUID);
DROP POLICY IF EXISTS jse_tenant_insert ON job_stage_events;
CREATE POLICY jse_tenant_insert ON job_stage_events FOR INSERT WITH CHECK (company_id = (auth.jwt() ->> 'company_id')::UUID);

-- ─── JOB ARTWORK REFERENCES (Phase 27 — Repeat Job linkage) ──────────────────
CREATE TABLE IF NOT EXISTS job_artwork_references (
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

CREATE INDEX IF NOT EXISTS idx_jar_job ON job_artwork_references(job_id);
ALTER TABLE job_artwork_references ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS jar_tenant ON job_artwork_references;
CREATE POLICY jar_tenant ON job_artwork_references USING (company_id = (auth.jwt() ->> 'company_id')::UUID);

-- ─── GLOBAL SEARCH INDEX (Phase 28) ──────────────────────────────────────────
DROP MATERIALIZED VIEW IF EXISTS global_search_index CASCADE;
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

CREATE UNIQUE INDEX IF NOT EXISTS idx_gsi_id ON global_search_index(id, entity_type);
CREATE INDEX IF NOT EXISTS idx_gsi_company ON global_search_index(company_id);
CREATE INDEX IF NOT EXISTS idx_gsi_search  ON global_search_index USING GIN(search_vector);

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



-- ════════════════════════════════════════════════════════
-- MIGRATION 015_pre_production.sql
-- ════════════════════════════════════════════════════════
-- ══════════════════════════════════════════════════════════════════════════════
-- JAFSON PRINT ERP — MIGRATION 015: PRE-PRODUCTION
-- Phase 29 — Artwork Module
-- Phase 30 — Production Planning
-- Phase 31 — Store / MRN
-- Phase 32 — Board Inventory
-- Phase 33 — Purchase Orders
-- ══════════════════════════════════════════════════════════════════════════════

-- ─── PHASE 29: JOB ARTWORKS ───────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS job_artworks (
  id                   UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id           UUID NOT NULL REFERENCES companies(id),
  job_id               UUID NOT NULL REFERENCES jobs(id) ON DELETE CASCADE,
  version              INTEGER NOT NULL DEFAULT 1,
  file_name            TEXT NOT NULL,
  file_url             TEXT NOT NULL,
  file_size            BIGINT,
  file_type            TEXT,
  designer_notes       TEXT,
  is_production_ready  BOOLEAN NOT NULL DEFAULT FALSE,
  approved_by          UUID REFERENCES users(id),
  approved_at          TIMESTAMPTZ,
  created_at           TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at           TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_by UUID, updated_by UUID, deleted_at TIMESTAMPTZ,
  is_active  BOOLEAN NOT NULL DEFAULT TRUE,
  UNIQUE (company_id, job_id, version)
);

CREATE INDEX IF NOT EXISTS idx_artworks_job ON job_artworks(job_id, version);
DROP TRIGGER IF EXISTS trg_artworks_upd ON job_artworks;
CREATE TRIGGER trg_artworks_upd BEFORE UPDATE ON job_artworks FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
ALTER TABLE job_artworks ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS artworks_tenant ON job_artworks;
CREATE POLICY artworks_tenant ON job_artworks USING (company_id = (auth.jwt() ->> 'company_id')::UUID);
DROP TRIGGER IF EXISTS trg_audit_artworks ON job_artworks;
CREATE TRIGGER trg_audit_artworks AFTER INSERT OR UPDATE OR DELETE ON job_artworks FOR EACH ROW EXECUTE FUNCTION log_audit_event();

-- ─── PHASE 30: PRODUCTION PLANS ──────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS job_plans (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id      UUID NOT NULL REFERENCES companies(id),
  job_id          UUID NOT NULL REFERENCES jobs(id) ON DELETE CASCADE,
  planned_date    DATE NOT NULL,
  planned_by      UUID REFERENCES users(id),
  notes           TEXT,
  status          TEXT NOT NULL DEFAULT 'scheduled'
                  CHECK (status IN ('scheduled','in_progress','completed','cancelled')),
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_by UUID, updated_by UUID, deleted_at TIMESTAMPTZ,
  is_active  BOOLEAN NOT NULL DEFAULT TRUE
);

CREATE INDEX IF NOT EXISTS idx_plans_job     ON job_plans(job_id);
CREATE INDEX IF NOT EXISTS idx_plans_date    ON job_plans(company_id, planned_date);
CREATE INDEX IF NOT EXISTS idx_plans_status  ON job_plans(company_id, status);
DROP TRIGGER IF EXISTS trg_plans_upd ON job_plans;
CREATE TRIGGER trg_plans_upd BEFORE UPDATE ON job_plans FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
ALTER TABLE job_plans ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS plans_tenant ON job_plans;
CREATE POLICY plans_tenant ON job_plans USING (company_id = (auth.jwt() ->> 'company_id')::UUID);
DROP TRIGGER IF EXISTS trg_audit_plans ON job_plans;
CREATE TRIGGER trg_audit_plans AFTER INSERT OR UPDATE OR DELETE ON job_plans FOR EACH ROW EXECUTE FUNCTION log_audit_event();

-- ─── MACHINE ASSIGNMENTS ──────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS job_machine_assignments (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id      UUID NOT NULL REFERENCES companies(id),
  job_plan_id     UUID NOT NULL REFERENCES job_plans(id) ON DELETE CASCADE,
  job_id          UUID NOT NULL REFERENCES jobs(id),
  machine_id      UUID NOT NULL REFERENCES machines(id),
  stage_id        UUID REFERENCES workflow_stages(id),
  start_time      TIMESTAMPTZ,
  end_time        TIMESTAMPTZ,
  estimated_hours NUMERIC(6,2),
  actual_hours    NUMERIC(6,2),
  operator_id     UUID REFERENCES users(id),
  notes           TEXT,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_by UUID, updated_by UUID,
  is_active  BOOLEAN NOT NULL DEFAULT TRUE
);

CREATE INDEX IF NOT EXISTS idx_mach_plan    ON job_machine_assignments(job_plan_id);
CREATE INDEX IF NOT EXISTS idx_mach_machine ON job_machine_assignments(machine_id);
CREATE INDEX IF NOT EXISTS idx_mach_job     ON job_machine_assignments(job_id);
DROP TRIGGER IF EXISTS trg_mach_upd ON job_machine_assignments;
CREATE TRIGGER trg_mach_upd BEFORE UPDATE ON job_machine_assignments FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
ALTER TABLE job_machine_assignments ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS mach_tenant ON job_machine_assignments;
CREATE POLICY mach_tenant ON job_machine_assignments USING (company_id = (auth.jwt() ->> 'company_id')::UUID);

-- ─── PHASE 31: MATERIAL REQUISITIONS (MRN) ───────────────────────────────────
CREATE TABLE IF NOT EXISTS material_requisitions (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id      UUID NOT NULL REFERENCES companies(id),
  mrn_number      TEXT NOT NULL,
  job_id          UUID REFERENCES jobs(id),
  requested_by    UUID REFERENCES users(id),
  approved_by     UUID REFERENCES users(id),
  status          TEXT NOT NULL DEFAULT 'pending'
                  CHECK (status IN ('pending','approved','partially_issued','issued','cancelled')),
  required_date   DATE,
  notes           TEXT,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_by UUID, updated_by UUID, deleted_at TIMESTAMPTZ,
  is_active  BOOLEAN NOT NULL DEFAULT TRUE,
  UNIQUE (company_id, mrn_number)
);

CREATE INDEX IF NOT EXISTS idx_mrn_company ON material_requisitions(company_id);
CREATE INDEX IF NOT EXISTS idx_mrn_job     ON material_requisitions(job_id);
CREATE INDEX IF NOT EXISTS idx_mrn_status  ON material_requisitions(company_id, status);
DROP TRIGGER IF EXISTS trg_mrn_upd ON material_requisitions;
CREATE TRIGGER trg_mrn_upd BEFORE UPDATE ON material_requisitions FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
ALTER TABLE material_requisitions ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS mrn_tenant ON material_requisitions;
CREATE POLICY mrn_tenant ON material_requisitions USING (company_id = (auth.jwt() ->> 'company_id')::UUID);
DROP TRIGGER IF EXISTS trg_audit_mrn ON material_requisitions;
CREATE TRIGGER trg_audit_mrn AFTER INSERT OR UPDATE OR DELETE ON material_requisitions FOR EACH ROW EXECUTE FUNCTION log_audit_event();

-- ─── MRN LINE ITEMS ───────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS material_requisition_items (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id       UUID NOT NULL REFERENCES companies(id),
  requisition_id   UUID NOT NULL REFERENCES material_requisitions(id) ON DELETE CASCADE,
  material_name    TEXT NOT NULL,
  material_type    TEXT,       -- 'board','paper','ink','lamination','foil','other'
  specification    TEXT,
  quantity_required NUMERIC(12,2) NOT NULL DEFAULT 0,
  quantity_issued  NUMERIC(12,2) NOT NULL DEFAULT 0,
  unit_id          UUID REFERENCES units(id),
  notes            TEXT,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_by UUID, updated_by UUID,
  is_active  BOOLEAN NOT NULL DEFAULT TRUE
);

CREATE INDEX IF NOT EXISTS idx_mrn_items_req ON material_requisition_items(requisition_id);
DROP TRIGGER IF EXISTS trg_mrn_items_upd ON material_requisition_items;
CREATE TRIGGER trg_mrn_items_upd BEFORE UPDATE ON material_requisition_items FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
ALTER TABLE material_requisition_items ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS mrn_items_tenant ON material_requisition_items;
CREATE POLICY mrn_items_tenant ON material_requisition_items USING (company_id = (auth.jwt() ->> 'company_id')::UUID);

-- ─── PHASE 32: BOARD INVENTORY ────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS board_inventory (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id       UUID NOT NULL REFERENCES companies(id),
  board_type_id    UUID REFERENCES board_types(id),
  description      TEXT NOT NULL,
  size_l           NUMERIC(10,2),
  size_w           NUMERIC(10,2),
  gsm              NUMERIC(8,2),
  current_stock    NUMERIC(14,2) NOT NULL DEFAULT 0,
  reserved_stock   NUMERIC(14,2) NOT NULL DEFAULT 0,
  reorder_level    NUMERIC(14,2) NOT NULL DEFAULT 0,
  unit_id          UUID REFERENCES units(id),
  unit_cost        NUMERIC(14,4) DEFAULT 0,
  location         TEXT,
  vendor_id        UUID,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_by UUID, updated_by UUID, deleted_at TIMESTAMPTZ,
  is_active  BOOLEAN NOT NULL DEFAULT TRUE
);

CREATE INDEX IF NOT EXISTS idx_board_inv_company ON board_inventory(company_id);
DROP TRIGGER IF EXISTS trg_board_inv_upd ON board_inventory;
CREATE TRIGGER trg_board_inv_upd BEFORE UPDATE ON board_inventory FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
ALTER TABLE board_inventory ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS board_inv_tenant ON board_inventory;
CREATE POLICY board_inv_tenant ON board_inventory USING (company_id = (auth.jwt() ->> 'company_id')::UUID);
DROP TRIGGER IF EXISTS trg_audit_board_inv ON board_inventory;
CREATE TRIGGER trg_audit_board_inv AFTER INSERT OR UPDATE OR DELETE ON board_inventory FOR EACH ROW EXECUTE FUNCTION log_audit_event();

-- ─── BOARD INVENTORY MOVEMENTS ────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS board_inventory_movements (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id       UUID NOT NULL REFERENCES companies(id),
  board_item_id    UUID NOT NULL REFERENCES board_inventory(id),
  movement_type    TEXT NOT NULL CHECK (movement_type IN ('in','out','adjustment','reserved','released')),
  quantity         NUMERIC(14,2) NOT NULL,
  balance_after    NUMERIC(14,2) NOT NULL,
  reference_type   TEXT,    -- 'purchase_order','mrn','manual'
  reference_id     UUID,
  job_id           UUID REFERENCES jobs(id),
  notes            TEXT,
  moved_by         UUID REFERENCES users(id),
  occurred_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
  -- Immutable — no updated_at, no soft delete
);

CREATE INDEX IF NOT EXISTS idx_bim_item    ON board_inventory_movements(board_item_id, occurred_at DESC);
CREATE INDEX IF NOT EXISTS idx_bim_company ON board_inventory_movements(company_id, occurred_at DESC);
ALTER TABLE board_inventory_movements ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS bim_read ON board_inventory_movements;
CREATE POLICY bim_read   ON board_inventory_movements FOR SELECT USING (company_id = (auth.jwt() ->> 'company_id')::UUID);
DROP POLICY IF EXISTS bim_insert ON board_inventory_movements;
CREATE POLICY bim_insert ON board_inventory_movements FOR INSERT WITH CHECK (company_id = (auth.jwt() ->> 'company_id')::UUID);

-- ─── PHASE 33: VENDORS ────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS vendors (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id      UUID NOT NULL REFERENCES companies(id),
  vendor_code     TEXT NOT NULL,
  name            TEXT NOT NULL,
  contact_person  TEXT,
  email           TEXT,
  phone           TEXT,
  mobile          TEXT,
  address         TEXT,
  ntn             TEXT,
  strn            TEXT,
  payment_terms   INTEGER DEFAULT 30,
  notes           TEXT,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_by UUID, updated_by UUID, deleted_at TIMESTAMPTZ,
  is_active  BOOLEAN NOT NULL DEFAULT TRUE,
  UNIQUE (company_id, vendor_code)
);

CREATE INDEX IF NOT EXISTS idx_vendors_company ON vendors(company_id);
DROP TRIGGER IF EXISTS trg_vendors_upd ON vendors;
CREATE TRIGGER trg_vendors_upd BEFORE UPDATE ON vendors FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
ALTER TABLE vendors ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS vendors_tenant ON vendors;
CREATE POLICY vendors_tenant ON vendors USING (company_id = (auth.jwt() ->> 'company_id')::UUID);
DROP TRIGGER IF EXISTS trg_audit_vendors ON vendors;
CREATE TRIGGER trg_audit_vendors AFTER INSERT OR UPDATE OR DELETE ON vendors FOR EACH ROW EXECUTE FUNCTION log_audit_event();

-- ─── PURCHASE ORDERS ──────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS purchase_orders (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id      UUID NOT NULL REFERENCES companies(id),
  po_number       TEXT NOT NULL,
  vendor_id       UUID NOT NULL REFERENCES vendors(id),
  status          TEXT NOT NULL DEFAULT 'draft'
                  CHECK (status IN ('draft','sent','confirmed','partially_received','received','cancelled')),
  order_date      DATE NOT NULL DEFAULT CURRENT_DATE,
  expected_date   DATE,
  subtotal        NUMERIC(14,2) NOT NULL DEFAULT 0,
  tax_amount      NUMERIC(14,2) NOT NULL DEFAULT 0,
  total_amount    NUMERIC(14,2) NOT NULL DEFAULT 0,
  notes           TEXT,
  terms           TEXT,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_by UUID, updated_by UUID, deleted_at TIMESTAMPTZ,
  is_active  BOOLEAN NOT NULL DEFAULT TRUE,
  UNIQUE (company_id, po_number)
);

CREATE INDEX IF NOT EXISTS idx_po_company ON purchase_orders(company_id);
CREATE INDEX IF NOT EXISTS idx_po_vendor  ON purchase_orders(vendor_id);
CREATE INDEX IF NOT EXISTS idx_po_status  ON purchase_orders(company_id, status);
DROP TRIGGER IF EXISTS trg_po_upd ON purchase_orders;
CREATE TRIGGER trg_po_upd BEFORE UPDATE ON purchase_orders FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
ALTER TABLE purchase_orders ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS po_tenant ON purchase_orders;
CREATE POLICY po_tenant ON purchase_orders USING (company_id = (auth.jwt() ->> 'company_id')::UUID);
DROP TRIGGER IF EXISTS trg_audit_po ON purchase_orders;
CREATE TRIGGER trg_audit_po AFTER INSERT OR UPDATE OR DELETE ON purchase_orders FOR EACH ROW EXECUTE FUNCTION log_audit_event();

-- ─── PO LINE ITEMS ────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS purchase_order_items (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id       UUID NOT NULL REFERENCES companies(id),
  po_id            UUID NOT NULL REFERENCES purchase_orders(id) ON DELETE CASCADE,
  line_no          INTEGER NOT NULL DEFAULT 1,
  description      TEXT NOT NULL,
  specification    TEXT,
  quantity         NUMERIC(12,2) NOT NULL DEFAULT 1,
  unit_id          UUID REFERENCES units(id),
  unit_price       NUMERIC(14,4) NOT NULL DEFAULT 0,
  subtotal         NUMERIC(14,2) NOT NULL DEFAULT 0,
  quantity_received NUMERIC(12,2) NOT NULL DEFAULT 0,
  board_item_id    UUID REFERENCES board_inventory(id),
  notes            TEXT,
  sort_order       INTEGER NOT NULL DEFAULT 1,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_by UUID, updated_by UUID,
  is_active  BOOLEAN NOT NULL DEFAULT TRUE
);

CREATE INDEX IF NOT EXISTS idx_po_items_po ON purchase_order_items(po_id, sort_order);
DROP TRIGGER IF EXISTS trg_po_items_upd ON purchase_order_items;
CREATE TRIGGER trg_po_items_upd BEFORE UPDATE ON purchase_order_items FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
ALTER TABLE purchase_order_items ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS po_items_tenant ON purchase_order_items;
CREATE POLICY po_items_tenant ON purchase_order_items USING (company_id = (auth.jwt() ->> 'company_id')::UUID);

-- ─── SEQUENCES ────────────────────────────────────────────────────────────────
INSERT INTO document_sequences (company_id, document_type, year, prefix, padding, current_value) VALUES
  ('00000000-0000-0000-0000-000000000001', 'MRN', 2026, 'MRN', 5, 0),
  ('00000000-0000-0000-0000-000000000001', 'PO',  2026, 'PO',  5, 0),
  ('00000000-0000-0000-0000-000000000001', 'VND', 2026, 'VND', 4, 0)
ON CONFLICT DO NOTHING;



-- ════════════════════════════════════════════════════════
-- MIGRATION 016_production_floor.sql
-- ════════════════════════════════════════════════════════
-- ══════════════════════════════════════════════════════════════════════════════
-- JAFSON PRINT ERP — MIGRATION 016: PRODUCTION FLOOR
-- Phase 34 — Floor Dashboard
-- Phase 35 — Machine-wise Job Tracking
-- Phase 36 — Production Progress
-- ══════════════════════════════════════════════════════════════════════════════

-- ─── PRODUCTION JOB ASSIGNMENTS ───────────────────────────────────────────────
-- Assigns a job+stage to a specific machine & operator on the floor
CREATE TABLE IF NOT EXISTS production_assignments (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id          UUID NOT NULL REFERENCES companies(id),
  job_id              UUID NOT NULL REFERENCES jobs(id) ON DELETE CASCADE,
  machine_id          UUID NOT NULL REFERENCES machines(id),
  stage_progress_id   UUID REFERENCES job_stage_progress(id),
  operator_id         UUID REFERENCES users(id),
  status              TEXT NOT NULL DEFAULT 'queued'
                      CHECK (status IN ('queued','running','paused','completed','cancelled')),
  scheduled_start     TIMESTAMPTZ,
  actual_start        TIMESTAMPTZ,
  actual_end          TIMESTAMPTZ,
  estimated_minutes   INTEGER,
  actual_minutes      INTEGER,
  notes               TEXT,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_by UUID, updated_by UUID, deleted_at TIMESTAMPTZ,
  is_active   BOOLEAN NOT NULL DEFAULT TRUE
);

CREATE INDEX IF NOT EXISTS idx_pa_job      ON production_assignments(job_id);
CREATE INDEX IF NOT EXISTS idx_pa_machine  ON production_assignments(machine_id, status);
CREATE INDEX IF NOT EXISTS idx_pa_operator ON production_assignments(operator_id);
CREATE INDEX IF NOT EXISTS idx_pa_company  ON production_assignments(company_id, status);
DROP TRIGGER IF EXISTS trg_pa_upd ON production_assignments;
CREATE TRIGGER trg_pa_upd BEFORE UPDATE ON production_assignments
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
ALTER TABLE production_assignments ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS pa_tenant ON production_assignments;
CREATE POLICY pa_tenant ON production_assignments
  USING (company_id = (auth.jwt() ->> 'company_id')::UUID);
DROP TRIGGER IF EXISTS trg_audit_pa ON production_assignments;
CREATE TRIGGER trg_audit_pa AFTER INSERT OR UPDATE OR DELETE ON production_assignments
  FOR EACH ROW EXECUTE FUNCTION log_audit_event();

-- ─── PRODUCTION LOGS (append-only, per assignment) ────────────────────────────
-- Immutable event log per assignment: start, pause, resume, complete, notes
CREATE TABLE IF NOT EXISTS production_logs (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id      UUID NOT NULL REFERENCES companies(id),
  assignment_id   UUID NOT NULL REFERENCES production_assignments(id) ON DELETE CASCADE,
  job_id          UUID NOT NULL REFERENCES jobs(id),
  machine_id      UUID NOT NULL REFERENCES machines(id),
  event_type      TEXT NOT NULL
                  CHECK (event_type IN ('started','paused','resumed','completed','note_added','issue_reported')),
  notes           TEXT,
  quantity_done   NUMERIC(12,2),
  actor_id        UUID REFERENCES users(id),
  occurred_at     TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_pl_assignment ON production_logs(assignment_id, occurred_at DESC);
CREATE INDEX IF NOT EXISTS idx_pl_job        ON production_logs(job_id, occurred_at DESC);
CREATE INDEX IF NOT EXISTS idx_pl_machine    ON production_logs(machine_id, occurred_at DESC);
ALTER TABLE production_logs ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS pl_read ON production_logs;
CREATE POLICY pl_read   ON production_logs FOR SELECT
  USING (company_id = (auth.jwt() ->> 'company_id')::UUID);
DROP POLICY IF EXISTS pl_insert ON production_logs;
CREATE POLICY pl_insert ON production_logs FOR INSERT
  WITH CHECK (company_id = (auth.jwt() ->> 'company_id')::UUID);

-- ─── MACHINE STATUS VIEW ──────────────────────────────────────────────────────
-- Live view of what each machine is doing right now
CREATE OR REPLACE VIEW machine_floor_status AS
SELECT
  m.id           AS machine_id,
  m.name         AS machine_name,
  m.machine_type,
  m.is_active    AS machine_active,
  pa.id          AS assignment_id,
  pa.status      AS assignment_status,
  pa.job_id,
  j.job_number,
  j.job_title,
  j.priority     AS job_priority,
  j.required_date,
  c.name         AS customer_name,
  pa.operator_id,
  u.full_name    AS operator_name,
  pa.actual_start,
  pa.estimated_minutes,
  ws.name        AS stage_name,
  pa.company_id
FROM machines m
LEFT JOIN production_assignments pa
  ON pa.machine_id = m.id
  AND pa.status IN ('queued','running','paused')
  AND pa.deleted_at IS NULL
  AND pa.is_active = TRUE
LEFT JOIN jobs j ON j.id = pa.job_id
LEFT JOIN customers c ON c.id = j.customer_id
LEFT JOIN users u ON u.id = pa.operator_id
LEFT JOIN job_stage_progress jsp ON jsp.id = pa.stage_progress_id
LEFT JOIN workflow_stages ws ON ws.id = jsp.workflow_stage_id
WHERE m.is_active = TRUE;



-- ════════════════════════════════════════════════════════
-- MIGRATION 017_qc.sql
-- ════════════════════════════════════════════════════════
-- ══════════════════════════════════════════════════════════════════════════════
-- JAFSON PRINT ERP — MIGRATION 017: QUALITY CONTROL
-- Phase 37 — QC Checklists
-- Phase 38 — Defect Logging
-- Phase 39 — Re-print Requests
-- Phase 40 — QC Pass/Fail Sign-off
-- ══════════════════════════════════════════════════════════════════════════════

-- ─── QC CHECKLIST TEMPLATES ───────────────────────────────────────────────────
-- Reusable templates stored in settings — e.g. "Carton QC", "Label QC"
CREATE TABLE IF NOT EXISTS qc_templates (
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

CREATE INDEX IF NOT EXISTS idx_qct_company ON qc_templates(company_id);
DROP TRIGGER IF EXISTS trg_qct_upd ON qc_templates;
CREATE TRIGGER trg_qct_upd BEFORE UPDATE ON qc_templates
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
ALTER TABLE qc_templates ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS qct_tenant ON qc_templates;
CREATE POLICY qct_tenant ON qc_templates
  USING (company_id = (auth.jwt() ->> 'company_id')::UUID);
DROP TRIGGER IF EXISTS trg_audit_qct ON qc_templates;
CREATE TRIGGER trg_audit_qct AFTER INSERT OR UPDATE OR DELETE ON qc_templates
  FOR EACH ROW EXECUTE FUNCTION log_audit_event();

-- ─── QC TEMPLATE ITEMS (checklist questions) ──────────────────────────────────
CREATE TABLE IF NOT EXISTS qc_template_items (
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

CREATE INDEX IF NOT EXISTS idx_qcti_template ON qc_template_items(template_id, sort_order);
DROP TRIGGER IF EXISTS trg_qcti_upd ON qc_template_items;
CREATE TRIGGER trg_qcti_upd BEFORE UPDATE ON qc_template_items
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
ALTER TABLE qc_template_items ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS qcti_tenant ON qc_template_items;
CREATE POLICY qcti_tenant ON qc_template_items
  USING (company_id = (auth.jwt() ->> 'company_id')::UUID);

-- ─── JOB QC INSPECTIONS ───────────────────────────────────────────────────────
-- One inspection record per job (can have multiple inspections for re-checks)
CREATE TABLE IF NOT EXISTS qc_inspections (
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

CREATE INDEX IF NOT EXISTS idx_qci_job     ON qc_inspections(job_id, inspection_no);
CREATE INDEX IF NOT EXISTS idx_qci_company ON qc_inspections(company_id, result);
DROP TRIGGER IF EXISTS trg_qci_upd ON qc_inspections;
CREATE TRIGGER trg_qci_upd BEFORE UPDATE ON qc_inspections
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
ALTER TABLE qc_inspections ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS qci_tenant ON qc_inspections;
CREATE POLICY qci_tenant ON qc_inspections
  USING (company_id = (auth.jwt() ->> 'company_id')::UUID);
DROP TRIGGER IF EXISTS trg_audit_qci ON qc_inspections;
CREATE TRIGGER trg_audit_qci AFTER INSERT OR UPDATE OR DELETE ON qc_inspections
  FOR EACH ROW EXECUTE FUNCTION log_audit_event();

-- ─── QC CHECKLIST RESPONSES ───────────────────────────────────────────────────
-- One row per (inspection, checklist item) — the actual answers
CREATE TABLE IF NOT EXISTS qc_checklist_responses (
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

CREATE INDEX IF NOT EXISTS idx_qcr_inspection ON qc_checklist_responses(inspection_id);
DROP TRIGGER IF EXISTS trg_qcr_upd ON qc_checklist_responses;
CREATE TRIGGER trg_qcr_upd BEFORE UPDATE ON qc_checklist_responses
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
ALTER TABLE qc_checklist_responses ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS qcr_tenant ON qc_checklist_responses;
CREATE POLICY qcr_tenant ON qc_checklist_responses
  USING (company_id = (auth.jwt() ->> 'company_id')::UUID);

-- ─── DEFECTS ──────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS qc_defects (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id      UUID NOT NULL REFERENCES companies(id),
  inspection_id   UUID NOT NULL REFERENCES qc_inspections(id) ON DELETE CASCADE,
  job_id          UUID NOT NULL REFERENCES jobs(id),
  defect_type     TEXT NOT NULL,
  -- 'colour_shift','misregister','scumming','hickey','fold_crack','cut_short',
  -- 'lamination_bubble','foil_skip','ink_smear','wrong_size','pasting_fault','other'
  severity        TEXT NOT NULL DEFAULT 'minor'
                  CHECK (severity IN ('minor','major','critical')),
  quantity_affected INTEGER DEFAULT 0,
  description     TEXT,
  photo_url       TEXT,
  reported_by     UUID REFERENCES users(id),
  resolved        BOOLEAN NOT NULL DEFAULT FALSE,
  resolved_notes  TEXT,
  resolved_at     TIMESTAMPTZ,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_by UUID, updated_by UUID, deleted_at TIMESTAMPTZ,
  is_active  BOOLEAN NOT NULL DEFAULT TRUE
);

CREATE INDEX IF NOT EXISTS idx_def_inspection ON qc_defects(inspection_id);
CREATE INDEX IF NOT EXISTS idx_def_job        ON qc_defects(job_id);
CREATE INDEX IF NOT EXISTS idx_def_company    ON qc_defects(company_id, severity);
DROP TRIGGER IF EXISTS trg_def_upd ON qc_defects;
CREATE TRIGGER trg_def_upd BEFORE UPDATE ON qc_defects
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
ALTER TABLE qc_defects ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS def_tenant ON qc_defects;
CREATE POLICY def_tenant ON qc_defects
  USING (company_id = (auth.jwt() ->> 'company_id')::UUID);
DROP TRIGGER IF EXISTS trg_audit_def ON qc_defects;
CREATE TRIGGER trg_audit_def AFTER INSERT OR UPDATE OR DELETE ON qc_defects
  FOR EACH ROW EXECUTE FUNCTION log_audit_event();

-- ─── RE-PRINT REQUESTS ────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS reprint_requests (
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

CREATE INDEX IF NOT EXISTS idx_rpr_job     ON reprint_requests(original_job_id);
CREATE INDEX IF NOT EXISTS idx_rpr_company ON reprint_requests(company_id, status);
DROP TRIGGER IF EXISTS trg_rpr_upd ON reprint_requests;
CREATE TRIGGER trg_rpr_upd BEFORE UPDATE ON reprint_requests
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
ALTER TABLE reprint_requests ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS rpr_tenant ON reprint_requests;
CREATE POLICY rpr_tenant ON reprint_requests
  USING (company_id = (auth.jwt() ->> 'company_id')::UUID);
DROP TRIGGER IF EXISTS trg_audit_rpr ON reprint_requests;
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



-- ════════════════════════════════════════════════════════
-- MIGRATION 018_dispatch.sql
-- ════════════════════════════════════════════════════════
-- ══════════════════════════════════════════════════════════════════════════════
-- JAFSON PRINT ERP — MIGRATION 018: DISPATCH & DELIVERY
-- Phase 41 — Dispatch Orders
-- Phase 42 — Delivery Challan
-- Phase 43 — POD (Proof of Delivery)
-- Phase 44 — Courier / Vehicle Tracking
-- ══════════════════════════════════════════════════════════════════════════════

-- ─── DISPATCH ORDERS ──────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS dispatch_orders (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id          UUID NOT NULL REFERENCES companies(id),
  dispatch_number     TEXT NOT NULL,
  customer_id         UUID NOT NULL REFERENCES customers(id),
  status              TEXT NOT NULL DEFAULT 'pending'
                      CHECK (status IN ('pending','ready','dispatched','delivered','returned','cancelled')),

  -- Delivery details
  delivery_address    TEXT,
  delivery_city       TEXT,
  delivery_contact    TEXT,
  delivery_phone      TEXT,

  -- Dispatch method
  dispatch_method     TEXT DEFAULT 'own_vehicle'
                      CHECK (dispatch_method IN ('own_vehicle','courier','customer_pickup','third_party')),
  vehicle_number      TEXT,
  driver_name         TEXT,
  driver_phone        TEXT,
  courier_name        TEXT,
  tracking_number     TEXT,

  -- Scheduling
  scheduled_date      DATE,
  dispatched_at       TIMESTAMPTZ,
  delivered_at        TIMESTAMPTZ,

  -- Financials
  delivery_charges    NUMERIC(10,2) DEFAULT 0,
  notes               TEXT,

  created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_by UUID, updated_by UUID, deleted_at TIMESTAMPTZ,
  is_active   BOOLEAN NOT NULL DEFAULT TRUE,
  UNIQUE (company_id, dispatch_number)
);

CREATE INDEX IF NOT EXISTS idx_do_company  ON dispatch_orders(company_id);
CREATE INDEX IF NOT EXISTS idx_do_customer ON dispatch_orders(customer_id);
CREATE INDEX IF NOT EXISTS idx_do_status   ON dispatch_orders(company_id, status);
CREATE INDEX IF NOT EXISTS idx_do_date     ON dispatch_orders(company_id, scheduled_date);
DROP TRIGGER IF EXISTS trg_do_upd ON dispatch_orders;
CREATE TRIGGER trg_do_upd BEFORE UPDATE ON dispatch_orders
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
ALTER TABLE dispatch_orders ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS do_tenant ON dispatch_orders;
CREATE POLICY do_tenant ON dispatch_orders
  USING (company_id = (auth.jwt() ->> 'company_id')::UUID);
DROP TRIGGER IF EXISTS trg_audit_do ON dispatch_orders;
CREATE TRIGGER trg_audit_do AFTER INSERT OR UPDATE OR DELETE ON dispatch_orders
  FOR EACH ROW EXECUTE FUNCTION log_audit_event();

-- ─── DISPATCH LINE ITEMS (jobs being dispatched) ──────────────────────────────
CREATE TABLE IF NOT EXISTS dispatch_items (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id      UUID NOT NULL REFERENCES companies(id),
  dispatch_id     UUID NOT NULL REFERENCES dispatch_orders(id) ON DELETE CASCADE,
  job_id          UUID NOT NULL REFERENCES jobs(id),
  quantity_ordered  NUMERIC(12,2) NOT NULL DEFAULT 0,
  quantity_dispatched NUMERIC(12,2) NOT NULL DEFAULT 0,
  carton_count    INTEGER DEFAULT 0,
  weight_kg       NUMERIC(8,2),
  notes           TEXT,
  sort_order      INTEGER NOT NULL DEFAULT 1,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_by UUID, updated_by UUID,
  is_active  BOOLEAN NOT NULL DEFAULT TRUE
);

CREATE INDEX IF NOT EXISTS idx_di_dispatch ON dispatch_items(dispatch_id);
CREATE INDEX IF NOT EXISTS idx_di_job      ON dispatch_items(job_id);
DROP TRIGGER IF EXISTS trg_di_upd ON dispatch_items;
CREATE TRIGGER trg_di_upd BEFORE UPDATE ON dispatch_items
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
ALTER TABLE dispatch_items ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS di_tenant ON dispatch_items;
CREATE POLICY di_tenant ON dispatch_items
  USING (company_id = (auth.jwt() ->> 'company_id')::UUID);

-- ─── PROOF OF DELIVERY ────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS proof_of_delivery (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id      UUID NOT NULL REFERENCES companies(id),
  dispatch_id     UUID NOT NULL REFERENCES dispatch_orders(id) ON DELETE CASCADE,
  received_by     TEXT,           -- name of person who received
  received_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  signature_url   TEXT,           -- Supabase Storage URL
  photo_url       TEXT,           -- optional delivery photo
  condition       TEXT DEFAULT 'good'
                  CHECK (condition IN ('good','damaged','partial')),
  damage_notes    TEXT,
  confirmed_by    UUID REFERENCES users(id),  -- our staff who confirmed
  notes           TEXT,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_by UUID, updated_by UUID,
  is_active  BOOLEAN NOT NULL DEFAULT TRUE,
  UNIQUE (company_id, dispatch_id)
);

CREATE INDEX IF NOT EXISTS idx_pod_dispatch ON proof_of_delivery(dispatch_id);
DROP TRIGGER IF EXISTS trg_pod_upd ON proof_of_delivery;
CREATE TRIGGER trg_pod_upd BEFORE UPDATE ON proof_of_delivery
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
ALTER TABLE proof_of_delivery ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS pod_tenant ON proof_of_delivery;
CREATE POLICY pod_tenant ON proof_of_delivery
  USING (company_id = (auth.jwt() ->> 'company_id')::UUID);
DROP TRIGGER IF EXISTS trg_audit_pod ON proof_of_delivery;
CREATE TRIGGER trg_audit_pod AFTER INSERT OR UPDATE OR DELETE ON proof_of_delivery
  FOR EACH ROW EXECUTE FUNCTION log_audit_event();

-- ─── DISPATCH SEQUENCE ────────────────────────────────────────────────────────
INSERT INTO document_sequences (company_id, document_type, year, prefix, padding, current_value)
VALUES ('00000000-0000-0000-0000-000000000001', 'DISP', 2026, 'DC', 5, 0)
ON CONFLICT DO NOTHING;



-- ════════════════════════════════════════════════════════
-- MIGRATION 019_finance.sql
-- ════════════════════════════════════════════════════════
-- ══════════════════════════════════════════════════════════════════════════════
-- JAFSON PRINT ERP — MIGRATION 019: FINANCE & COSTING
-- Phase 45 — Job Costing Sheet
-- Phase 46 — Actual vs Quoted
-- Phase 47 — Invoice Generation
-- Phase 48 — Payment Tracking
-- ══════════════════════════════════════════════════════════════════════════════

-- ─── JOB COSTING SHEET ────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS job_costings (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id        UUID NOT NULL REFERENCES companies(id),
  job_id            UUID NOT NULL REFERENCES jobs(id) ON DELETE CASCADE,

  -- Board / Paper Material
  board_cost        NUMERIC(14,2) NOT NULL DEFAULT 0,
  board_sheets      NUMERIC(12,2),
  board_rate        NUMERIC(12,4),

  -- Printing
  printing_cost     NUMERIC(14,2) NOT NULL DEFAULT 0,
  printing_plates   INTEGER DEFAULT 0,
  plate_cost        NUMERIC(12,2) DEFAULT 0,
  ink_cost          NUMERIC(12,2) DEFAULT 0,

  -- Finishing costs
  lamination_cost   NUMERIC(12,2) DEFAULT 0,
  foiling_cost      NUMERIC(12,2) DEFAULT 0,
  uv_cost           NUMERIC(12,2) DEFAULT 0,
  die_cutting_cost  NUMERIC(12,2) DEFAULT 0,
  pasting_cost      NUMERIC(12,2) DEFAULT 0,
  other_finishing   NUMERIC(12,2) DEFAULT 0,

  -- Overhead & Labour
  labour_cost       NUMERIC(12,2) DEFAULT 0,
  overhead_pct      NUMERIC(5,2)  DEFAULT 15,  -- % of direct costs
  overhead_amount   NUMERIC(12,2) DEFAULT 0,

  -- Totals
  total_cost        NUMERIC(14,2) NOT NULL DEFAULT 0,
  quoted_amount     NUMERIC(14,2),
  margin_amount     NUMERIC(14,2),
  margin_pct        NUMERIC(6,2),

  -- Notes
  costing_notes     TEXT,
  costed_by         UUID REFERENCES users(id),
  costed_at         TIMESTAMPTZ,

  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_by UUID, updated_by UUID,
  is_active  BOOLEAN NOT NULL DEFAULT TRUE,
  UNIQUE (company_id, job_id)
);

CREATE INDEX IF NOT EXISTS idx_jc_job     ON job_costings(job_id);
CREATE INDEX IF NOT EXISTS idx_jc_company ON job_costings(company_id);
DROP TRIGGER IF EXISTS trg_jc_upd ON job_costings;
CREATE TRIGGER trg_jc_upd BEFORE UPDATE ON job_costings
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
ALTER TABLE job_costings ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS jc_tenant ON job_costings;
CREATE POLICY jc_tenant ON job_costings
  USING (company_id = (auth.jwt() ->> 'company_id')::UUID);
DROP TRIGGER IF EXISTS trg_audit_jc ON job_costings;
CREATE TRIGGER trg_audit_jc AFTER INSERT OR UPDATE OR DELETE ON job_costings
  FOR EACH ROW EXECUTE FUNCTION log_audit_event();

-- ─── COSTING LINE ITEMS (free-form additional cost lines) ────────────────────
CREATE TABLE IF NOT EXISTS job_costing_lines (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id    UUID NOT NULL REFERENCES companies(id),
  costing_id    UUID NOT NULL REFERENCES job_costings(id) ON DELETE CASCADE,
  description   TEXT NOT NULL,
  category      TEXT,
  quantity      NUMERIC(12,2) DEFAULT 1,
  unit_rate     NUMERIC(12,4) DEFAULT 0,
  amount        NUMERIC(14,2) NOT NULL DEFAULT 0,
  sort_order    INTEGER NOT NULL DEFAULT 1,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_by UUID, updated_by UUID,
  is_active  BOOLEAN NOT NULL DEFAULT TRUE
);

CREATE INDEX IF NOT EXISTS idx_jcl_costing ON job_costing_lines(costing_id, sort_order);
DROP TRIGGER IF EXISTS trg_jcl_upd ON job_costing_lines;
CREATE TRIGGER trg_jcl_upd BEFORE UPDATE ON job_costing_lines
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
ALTER TABLE job_costing_lines ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS jcl_tenant ON job_costing_lines;
CREATE POLICY jcl_tenant ON job_costing_lines
  USING (company_id = (auth.jwt() ->> 'company_id')::UUID);

-- ─── INVOICES ─────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS invoices (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id        UUID NOT NULL REFERENCES companies(id),
  invoice_number    TEXT NOT NULL,
  customer_id       UUID NOT NULL REFERENCES customers(id),
  dispatch_id       UUID REFERENCES dispatch_orders(id),
  status            TEXT NOT NULL DEFAULT 'draft'
                    CHECK (status IN ('draft','sent','partial','paid','overdue','cancelled','void')),

  -- Dates
  invoice_date      DATE NOT NULL DEFAULT CURRENT_DATE,
  due_date          DATE,
  sent_at           TIMESTAMPTZ,

  -- Amounts
  subtotal          NUMERIC(14,2) NOT NULL DEFAULT 0,
  discount_pct      NUMERIC(5,2) DEFAULT 0,
  discount_amount   NUMERIC(14,2) DEFAULT 0,
  tax_pct           NUMERIC(5,2) DEFAULT 0,
  tax_amount        NUMERIC(14,2) DEFAULT 0,
  total_amount      NUMERIC(14,2) NOT NULL DEFAULT 0,
  paid_amount       NUMERIC(14,2) NOT NULL DEFAULT 0,
  balance_due       NUMERIC(14,2) NOT NULL DEFAULT 0,

  -- Content
  notes             TEXT,
  terms             TEXT,
  payment_terms     INTEGER DEFAULT 30,

  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_by UUID, updated_by UUID, deleted_at TIMESTAMPTZ,
  is_active  BOOLEAN NOT NULL DEFAULT TRUE,
  UNIQUE (company_id, invoice_number)
);

CREATE INDEX IF NOT EXISTS idx_inv_company  ON invoices(company_id);
CREATE INDEX IF NOT EXISTS idx_inv_customer ON invoices(customer_id);
CREATE INDEX IF NOT EXISTS idx_inv_status   ON invoices(company_id, status);
CREATE INDEX IF NOT EXISTS idx_inv_due      ON invoices(company_id, due_date);
DROP TRIGGER IF EXISTS trg_inv_upd ON invoices;
CREATE TRIGGER trg_inv_upd BEFORE UPDATE ON invoices
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
ALTER TABLE invoices ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS inv_tenant ON invoices;
CREATE POLICY inv_tenant ON invoices
  USING (company_id = (auth.jwt() ->> 'company_id')::UUID);
DROP TRIGGER IF EXISTS trg_audit_inv ON invoices;
CREATE TRIGGER trg_audit_inv AFTER INSERT OR UPDATE OR DELETE ON invoices
  FOR EACH ROW EXECUTE FUNCTION log_audit_event();

-- ─── INVOICE LINE ITEMS ───────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS invoice_items (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id      UUID NOT NULL REFERENCES companies(id),
  invoice_id      UUID NOT NULL REFERENCES invoices(id) ON DELETE CASCADE,
  job_id          UUID REFERENCES jobs(id),
  description     TEXT NOT NULL,
  quantity        NUMERIC(12,2) NOT NULL DEFAULT 1,
  unit_price      NUMERIC(14,4) NOT NULL DEFAULT 0,
  subtotal        NUMERIC(14,2) NOT NULL DEFAULT 0,
  sort_order      INTEGER NOT NULL DEFAULT 1,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_by UUID, updated_by UUID,
  is_active  BOOLEAN NOT NULL DEFAULT TRUE
);

CREATE INDEX IF NOT EXISTS idx_ii_invoice ON invoice_items(invoice_id, sort_order);
CREATE INDEX IF NOT EXISTS idx_ii_job     ON invoice_items(job_id);
DROP TRIGGER IF EXISTS trg_ii_upd ON invoice_items;
CREATE TRIGGER trg_ii_upd BEFORE UPDATE ON invoice_items
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
ALTER TABLE invoice_items ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS ii_tenant ON invoice_items;
CREATE POLICY ii_tenant ON invoice_items
  USING (company_id = (auth.jwt() ->> 'company_id')::UUID);

-- ─── PAYMENTS ─────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS payments (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id      UUID NOT NULL REFERENCES companies(id),
  invoice_id      UUID NOT NULL REFERENCES invoices(id),
  customer_id     UUID NOT NULL REFERENCES customers(id),
  amount          NUMERIC(14,2) NOT NULL,
  payment_date    DATE NOT NULL DEFAULT CURRENT_DATE,
  payment_method  TEXT NOT NULL DEFAULT 'bank_transfer'
                  CHECK (payment_method IN ('cash','cheque','bank_transfer','online','other')),
  reference       TEXT,        -- cheque number / TID / bank ref
  bank_name       TEXT,
  notes           TEXT,
  received_by     UUID REFERENCES users(id),
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_by UUID, updated_by UUID, deleted_at TIMESTAMPTZ,
  is_active  BOOLEAN NOT NULL DEFAULT TRUE
);

CREATE INDEX IF NOT EXISTS idx_pay_invoice  ON payments(invoice_id);
CREATE INDEX IF NOT EXISTS idx_pay_customer ON payments(customer_id);
CREATE INDEX IF NOT EXISTS idx_pay_company  ON payments(company_id, payment_date DESC);
DROP TRIGGER IF EXISTS trg_pay_upd ON payments;
CREATE TRIGGER trg_pay_upd BEFORE UPDATE ON payments
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
ALTER TABLE payments ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS pay_tenant ON payments;
CREATE POLICY pay_tenant ON payments
  USING (company_id = (auth.jwt() ->> 'company_id')::UUID);
DROP TRIGGER IF EXISTS trg_audit_pay ON payments;
CREATE TRIGGER trg_audit_pay AFTER INSERT OR UPDATE OR DELETE ON payments
  FOR EACH ROW EXECUTE FUNCTION log_audit_event();

-- ─── AUTO-RECOMPUTE INVOICE BALANCE after payment ─────────────────────────────
CREATE OR REPLACE FUNCTION recompute_invoice_balance()
RETURNS TRIGGER AS $$
DECLARE
  v_paid   NUMERIC(14,2);
  v_total  NUMERIC(14,2);
  v_status TEXT;
BEGIN
  SELECT COALESCE(SUM(amount),0) INTO v_paid
  FROM payments
  WHERE invoice_id = COALESCE(NEW.invoice_id, OLD.invoice_id)
    AND (deleted_at IS NULL) AND is_active = TRUE;

  SELECT total_amount INTO v_total
  FROM invoices WHERE id = COALESCE(NEW.invoice_id, OLD.invoice_id);

  v_status := CASE
    WHEN v_paid <= 0         THEN 'sent'
    WHEN v_paid >= v_total   THEN 'paid'
    ELSE 'partial'
  END;

  UPDATE invoices SET
    paid_amount = v_paid,
    balance_due = GREATEST(v_total - v_paid, 0),
    status      = v_status
  WHERE id = COALESCE(NEW.invoice_id, OLD.invoice_id)
    AND status NOT IN ('draft','cancelled','void');

  RETURN COALESCE(NEW, OLD);
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_payment_balance ON payments;
CREATE TRIGGER trg_payment_balance
  AFTER INSERT OR UPDATE OR DELETE ON payments
  FOR EACH ROW EXECUTE FUNCTION recompute_invoice_balance();

-- ─── SEQUENCE FOR INVOICES ────────────────────────────────────────────────────
INSERT INTO document_sequences (company_id, document_type, year, prefix, padding, current_value)
VALUES ('00000000-0000-0000-0000-000000000001', 'INV', 2026, 'INV', 5, 0)
ON CONFLICT DO NOTHING;


-- Reload PostgREST schema cache
NOTIFY pgrst, 'reload schema';