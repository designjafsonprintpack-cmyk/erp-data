-- ══════════════════════════════════════════════════════════════════════════════
-- JAFSON PRINT ERP — MASTER MIGRATION (001 → 079, complete)
-- ══════════════════════════════════════════════════════════════════════════════
-- Combines every migration from 001 through 079 into one file, in the exact
-- order they were written, for a ONE-TIME run against a brand-new, empty
-- Supabase project (e.g. setting this ERP up for a different company).
--
-- HOW TO RUN:
--   1. Supabase → SQL Editor → New Query
--   2. Paste this ENTIRE file
--   3. Click RUN once
--
-- IMPORTANT — read before running:
--   • This is for a FRESH/EMPTY database only. It is NOT safe to re-run on a
--     database that already has some of these migrations applied — several
--     statements (ALTER TABLE ADD COLUMN, CREATE POLICY, CREATE TRIGGER)
--     are NOT idempotent and will error out on a second run.
--   • Migration number 024 does not exist and never did — verified against
--     every individual migration file, the project changelog, and the
--     original 001-019 master file bundled in this repo; none of them
--     reference it. The sequence genuinely jumps from 023 to 025. Nothing
--     was recreated or guessed for it — inventing SQL for a migration with
--     no known content would risk creating schema that doesn't match the
--     rest of the app, so this gap is left as-is intentionally.
--   • Analysis performed before building this file: confirmed all 78 real
--     migration files (001-023, 025-079) are present, no duplicate
--     migration numbers, and no table is CREATE TABLE'd twice across any
--     two of these 78 files (the one exception — monthly partition tables
--     like audit_log_2026_01 — are legitimately distinct, one per month).
--   • Required Supabase Storage buckets, cron schedules (pg_cron / Vercel
--     Cron), and environment variables (RESEND_FROM_EMAIL, WhatsApp
--     tokens, OPENAI_API_KEY, CRON_SECRET, etc.) are NOT created by SQL
--     and must still be set up separately.
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
CREATE TABLE companies (
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
);

-- ─── BRANCHES ─────────────────────────────────────────────────────────────────
CREATE TABLE branches (
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

CREATE INDEX idx_branches_company_id ON branches(company_id);
CREATE TRIGGER trg_branches_updated_at BEFORE UPDATE ON branches FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- Seed: Jafson head office
INSERT INTO branches (company_id, name, is_head_office)
VALUES ('00000000-0000-0000-0000-000000000001', 'Head Office', TRUE);

-- ─── WAREHOUSES ───────────────────────────────────────────────────────────────
CREATE TABLE warehouses (
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

CREATE INDEX idx_warehouses_company_id ON warehouses(company_id);
CREATE TRIGGER trg_warehouses_updated_at BEFORE UPDATE ON warehouses FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- Seed: Main warehouse
INSERT INTO warehouses (company_id, name, location)
SELECT '00000000-0000-0000-0000-000000000001', 'Main Store', 'Lahore Factory';

-- ─── ROW LEVEL SECURITY ───────────────────────────────────────────────────────
ALTER TABLE companies ENABLE ROW LEVEL SECURITY;
ALTER TABLE branches ENABLE ROW LEVEL SECURITY;
ALTER TABLE warehouses ENABLE ROW LEVEL SECURITY;

-- Companies: each tenant only sees their own row
CREATE POLICY companies_tenant_isolation ON companies
  USING (id = (auth.jwt() ->> 'company_id')::UUID);

-- Branches: tenant isolation
CREATE POLICY branches_tenant_isolation ON branches
  USING (company_id = (auth.jwt() ->> 'company_id')::UUID);

-- Warehouses: tenant isolation
CREATE POLICY warehouses_tenant_isolation ON warehouses
  USING (company_id = (auth.jwt() ->> 'company_id')::UUID);

-- Notify PostgREST to reload schema
NOTIFY pgrst, 'reload schema';


-- ════════════════════════════════════════════════════════
-- MIGRATION 002_auth_users.sql
-- ════════════════════════════════════════════════════════
-- ══════════════════════════════════════════════════════════════════════════════
-- JAFSON PRINT ERP — MIGRATION 002: AUTH & USER MANAGEMENT
-- Phase 3: Authentication + custom JWT claims
-- ══════════════════════════════════════════════════════════════════════════════

-- ─── DEPARTMENTS (needed before users) ────────────────────────────────────────
CREATE TABLE departments (
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

CREATE INDEX idx_departments_company_id ON departments(company_id);
CREATE TRIGGER trg_departments_updated_at BEFORE UPDATE ON departments FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

ALTER TABLE departments ENABLE ROW LEVEL SECURITY;
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
  ('00000000-0000-0000-0000-000000000001', 'Dispatch', 'DISP');

-- ─── ROLES ────────────────────────────────────────────────────────────────────
CREATE TABLE roles (
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

CREATE INDEX idx_roles_company_id ON roles(company_id);
CREATE TRIGGER trg_roles_updated_at BEFORE UPDATE ON roles FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

ALTER TABLE roles ENABLE ROW LEVEL SECURITY;
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
  ('00000000-0000-0000-0000-000000000001', 'Dispatch', 'dispatch', FALSE);

-- ─── USERS ────────────────────────────────────────────────────────────────────
CREATE TABLE users (
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

CREATE INDEX idx_users_company_id ON users(company_id);
CREATE INDEX idx_users_auth_user_id ON users(auth_user_id);
CREATE INDEX idx_users_email ON users(company_id, email);
CREATE TRIGGER trg_users_updated_at BEFORE UPDATE ON users FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

ALTER TABLE users ENABLE ROW LEVEL SECURITY;
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

  claims := COALESCE(event -> 'claims', '{}'::jsonb);

  IF user_rec.company_id IS NOT NULL THEN
    -- NOTE: previously this used chained jsonb_set() calls. jsonb_set() is a
    -- STRICT function — if ANY argument is NULL (e.g. department_id is NULL,
    -- which is normal for a user with no department assigned), the ENTIRE
    -- call returns NULL, which then poisons every subsequent jsonb_set() in
    -- the chain and makes this whole function return NULL — causing login to
    -- fail for that user with "output claims do not conform to the expected
    -- schema". jsonb_build_object + the || merge operator handle NULL field
    -- values correctly (encoding them as JSON null) instead of erroring.
    --
    -- NOTE 2: the claim is named 'app_role', NOT 'role'. The top-level 'role'
    -- claim in a Supabase JWT is RESERVED — PostgREST uses it to select which
    -- Postgres database role to connect as (e.g. 'authenticated'). Setting it
    -- to an application role like 'superadmin' makes PostgREST try to
    -- `SET ROLE superadmin`, which fails with "role superadmin does not
    -- exist" because no such Postgres role exists — breaking every query for
    -- that user.
    claims := claims || jsonb_build_object(
      'company_id',    user_rec.company_id::TEXT,
      'app_role',      user_rec.role,
      'department_id', user_rec.department_id::TEXT,
      'full_name',     user_rec.full_name,
      'user_table_id', user_rec.user_table_id::TEXT
    );
  END IF;

  RETURN jsonb_set(event, '{claims}', claims);
END;
$$ LANGUAGE plpgsql STABLE SECURITY DEFINER;

-- Grant execution to Supabase Auth hook
GRANT EXECUTE ON FUNCTION public.custom_access_token_hook TO supabase_auth_admin;

-- ─── LOGIN HISTORY ────────────────────────────────────────────────────────────
CREATE TABLE login_history (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id    UUID NOT NULL REFERENCES companies(id),
  user_id       UUID REFERENCES users(id),
  logged_in_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  logged_out_at TIMESTAMPTZ,
  ip_address    TEXT,  -- future support
  device_info   TEXT
);

CREATE INDEX idx_login_history_user_id ON login_history(user_id);
CREATE INDEX idx_login_history_company_id ON login_history(company_id, logged_in_at DESC);

ALTER TABLE login_history ENABLE ROW LEVEL SECURITY;
CREATE POLICY login_history_tenant ON login_history
  USING (company_id = (auth.jwt() ->> 'company_id')::UUID);

NOTIFY pgrst, 'reload schema';


-- ════════════════════════════════════════════════════════
-- MIGRATION 003_audit_notifications.sql
-- ════════════════════════════════════════════════════════
-- ══════════════════════════════════════════════════════════════════════════════
-- JAFSON PRINT ERP — MIGRATION 003: AUDIT LOG, ACTIVITY LOG & NOTIFICATIONS
-- Phase 14 & 15 foundation
-- ══════════════════════════════════════════════════════════════════════════════

-- ─── AUDIT LOG (Partitioned by month, IMMUTABLE) ──────────────────────────────
CREATE TABLE audit_log (
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
CREATE TABLE audit_log_2026_01 PARTITION OF audit_log FOR VALUES FROM ('2026-01-01') TO ('2026-02-01');
CREATE TABLE audit_log_2026_02 PARTITION OF audit_log FOR VALUES FROM ('2026-02-01') TO ('2026-03-01');
CREATE TABLE audit_log_2026_03 PARTITION OF audit_log FOR VALUES FROM ('2026-03-01') TO ('2026-04-01');
CREATE TABLE audit_log_2026_04 PARTITION OF audit_log FOR VALUES FROM ('2026-04-01') TO ('2026-05-01');
CREATE TABLE audit_log_2026_05 PARTITION OF audit_log FOR VALUES FROM ('2026-05-01') TO ('2026-06-01');
CREATE TABLE audit_log_2026_06 PARTITION OF audit_log FOR VALUES FROM ('2026-06-01') TO ('2026-07-01');
CREATE TABLE audit_log_2026_07 PARTITION OF audit_log FOR VALUES FROM ('2026-07-01') TO ('2026-08-01');
CREATE TABLE audit_log_2026_08 PARTITION OF audit_log FOR VALUES FROM ('2026-08-01') TO ('2026-09-01');
CREATE TABLE audit_log_2026_09 PARTITION OF audit_log FOR VALUES FROM ('2026-09-01') TO ('2026-10-01');
CREATE TABLE audit_log_2026_10 PARTITION OF audit_log FOR VALUES FROM ('2026-10-01') TO ('2026-11-01');
CREATE TABLE audit_log_2026_11 PARTITION OF audit_log FOR VALUES FROM ('2026-11-01') TO ('2026-12-01');
CREATE TABLE audit_log_2026_12 PARTITION OF audit_log FOR VALUES FROM ('2026-12-01') TO ('2027-01-01');
CREATE TABLE audit_log_2027_01 PARTITION OF audit_log FOR VALUES FROM ('2027-01-01') TO ('2027-02-01');
CREATE TABLE audit_log_2027_02 PARTITION OF audit_log FOR VALUES FROM ('2027-02-01') TO ('2027-03-01');

CREATE INDEX idx_audit_log_company ON audit_log(company_id, changed_at DESC);
CREATE INDEX idx_audit_log_record ON audit_log(table_name, record_id);

ALTER TABLE audit_log ENABLE ROW LEVEL SECURITY;
-- Audit log: read only (no insert/update/delete via app — triggers only)
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
CREATE TABLE activity_log (
  id              UUID NOT NULL DEFAULT gen_random_uuid(),
  company_id      UUID NOT NULL,
  user_id         UUID,
  module_key      TEXT NOT NULL,
  action_description TEXT NOT NULL,
  entity_type     TEXT,
  entity_id       UUID,
  occurred_at     TIMESTAMPTZ NOT NULL DEFAULT NOW()
) PARTITION BY RANGE (occurred_at);

CREATE TABLE activity_log_2026_07 PARTITION OF activity_log FOR VALUES FROM ('2026-07-01') TO ('2026-08-01');
CREATE TABLE activity_log_2026_08 PARTITION OF activity_log FOR VALUES FROM ('2026-08-01') TO ('2026-09-01');
CREATE TABLE activity_log_2026_09 PARTITION OF activity_log FOR VALUES FROM ('2026-09-01') TO ('2026-10-01');
CREATE TABLE activity_log_2026_10 PARTITION OF activity_log FOR VALUES FROM ('2026-10-01') TO ('2026-11-01');
CREATE TABLE activity_log_2026_11 PARTITION OF activity_log FOR VALUES FROM ('2026-11-01') TO ('2026-12-01');
CREATE TABLE activity_log_2026_12 PARTITION OF activity_log FOR VALUES FROM ('2026-12-01') TO ('2027-01-01');
CREATE TABLE activity_log_2027_01 PARTITION OF activity_log FOR VALUES FROM ('2027-01-01') TO ('2027-02-01');

CREATE INDEX idx_activity_log_company ON activity_log(company_id, occurred_at DESC);
CREATE INDEX idx_activity_log_user ON activity_log(user_id, occurred_at DESC);

ALTER TABLE activity_log ENABLE ROW LEVEL SECURITY;
CREATE POLICY activity_log_tenant_read ON activity_log FOR SELECT
  USING (company_id = (auth.jwt() ->> 'company_id')::UUID);

-- ─── NOTIFICATIONS ────────────────────────────────────────────────────────────
CREATE TABLE notifications (
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

CREATE INDEX idx_notifications_user ON notifications(user_id, is_read, created_at DESC);
CREATE INDEX idx_notifications_company ON notifications(company_id, created_at DESC);
CREATE TRIGGER trg_notifications_updated_at BEFORE UPDATE ON notifications FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

ALTER TABLE notifications ENABLE ROW LEVEL SECURITY;
CREATE POLICY notifications_own ON notifications
  USING (
    company_id = (auth.jwt() ->> 'company_id')::UUID
    AND user_id = (auth.jwt() ->> 'user_table_id')::UUID
  );

-- Enable Realtime for notifications
ALTER PUBLICATION supabase_realtime ADD TABLE notifications;

NOTIFY pgrst, 'reload schema';


-- ════════════════════════════════════════════════════════
-- MIGRATION 004_attachments_themes.sql
-- ════════════════════════════════════════════════════════
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


-- ════════════════════════════════════════════════════════
-- MIGRATION 005_permissions.sql
-- ════════════════════════════════════════════════════════
-- ══════════════════════════════════════════════════════════════════════════════
-- JAFSON PRINT ERP — MIGRATION 005: ROLES, PERMISSIONS & PERMISSION MATRIX
-- Phase 6
-- ══════════════════════════════════════════════════════════════════════════════

-- ─── PERMISSIONS TABLE ────────────────────────────────────────────────────────
-- Each row = one (module, action) combination
CREATE TABLE permissions (
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

CREATE INDEX idx_permissions_company ON permissions(company_id);
CREATE TRIGGER trg_permissions_updated_at BEFORE UPDATE ON permissions FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

ALTER TABLE permissions ENABLE ROW LEVEL SECURITY;
CREATE POLICY permissions_tenant ON permissions
  USING (company_id = (auth.jwt() ->> 'company_id')::UUID);

-- ─── ROLE PERMISSIONS ─────────────────────────────────────────────────────────
CREATE TABLE role_permissions (
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

CREATE INDEX idx_role_permissions_role ON role_permissions(role_id);
CREATE INDEX idx_role_permissions_company ON role_permissions(company_id);
CREATE TRIGGER trg_role_permissions_updated_at BEFORE UPDATE ON role_permissions FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

ALTER TABLE role_permissions ENABLE ROW LEVEL SECURITY;
CREATE POLICY role_permissions_tenant ON role_permissions
  USING (company_id = (auth.jwt() ->> 'company_id')::UUID);

-- ─── USER ROLES ───────────────────────────────────────────────────────────────
CREATE TABLE user_roles (
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

CREATE INDEX idx_user_roles_user ON user_roles(user_id);
CREATE INDEX idx_user_roles_company ON user_roles(company_id);
CREATE TRIGGER trg_user_roles_updated_at BEFORE UPDATE ON user_roles FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

ALTER TABLE user_roles ENABLE ROW LEVEL SECURITY;
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
    'folder_gluing','packing','dispatch','reports','users','settings',
    'finance','qc','workflow','machines','production','admin'
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
CREATE TRIGGER trg_audit_permissions AFTER INSERT OR UPDATE OR DELETE ON permissions FOR EACH ROW EXECUTE FUNCTION log_audit_event();
CREATE TRIGGER trg_audit_role_permissions AFTER INSERT OR UPDATE OR DELETE ON role_permissions FOR EACH ROW EXECUTE FUNCTION log_audit_event();

NOTIFY pgrst, 'reload schema';


-- ════════════════════════════════════════════════════════
-- MIGRATION 006_machines.sql
-- ════════════════════════════════════════════════════════
-- ══════════════════════════════════════════════════════════════════════════════
-- JAFSON PRINT ERP — MIGRATION 006: MACHINES
-- Phase 8 — Departments already seeded in migration 002
-- ══════════════════════════════════════════════════════════════════════════════

-- ─── MACHINES ─────────────────────────────────────────────────────────────────
CREATE TABLE machines (
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

CREATE INDEX idx_machines_company ON machines(company_id);
CREATE INDEX idx_machines_type   ON machines(company_id, machine_type);
CREATE TRIGGER trg_machines_updated_at BEFORE UPDATE ON machines FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

ALTER TABLE machines ENABLE ROW LEVEL SECURITY;
CREATE POLICY machines_tenant ON machines
  USING (company_id = (auth.jwt() ->> 'company_id')::UUID);

-- ─── MACHINE STATUS HISTORY (append-only) ─────────────────────────────────────
CREATE TABLE machine_status_history (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id  UUID NOT NULL REFERENCES companies(id),
  machine_id  UUID NOT NULL REFERENCES machines(id) ON DELETE CASCADE,
  status      TEXT NOT NULL,
  reason      TEXT,
  changed_by  UUID REFERENCES users(id),
  changed_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_msh_machine ON machine_status_history(machine_id, changed_at DESC);
ALTER TABLE machine_status_history ENABLE ROW LEVEL SECURITY;
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
  ('00000000-0000-0000-0000-000000000001', 'Kirma Die Cut + Hot Foil', 'KDC-1', 'hotfoil',      2000);

-- Audit trigger
CREATE TRIGGER trg_audit_machines AFTER INSERT OR UPDATE OR DELETE ON machines FOR EACH ROW EXECUTE FUNCTION log_audit_event();

NOTIFY pgrst, 'reload schema';


-- ════════════════════════════════════════════════════════
-- MIGRATION 007_material_types.sql
-- ════════════════════════════════════════════════════════
-- ══════════════════════════════════════════════════════════════════════════════
-- JAFSON PRINT ERP — MIGRATION 007: MATERIAL TYPE SETTINGS
-- Phase 9 — Board, Paper, Ink, Glue, Foil, Lamination types
-- ══════════════════════════════════════════════════════════════════════════════

CREATE TABLE board_types (
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

CREATE TABLE paper_types (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id  UUID NOT NULL REFERENCES companies(id),
  name        TEXT NOT NULL,
  gsm         INTEGER,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_by  UUID, updated_by UUID, deleted_at TIMESTAMPTZ,
  is_active   BOOLEAN NOT NULL DEFAULT TRUE
);

CREATE TABLE ink_types (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id  UUID NOT NULL REFERENCES companies(id),
  name        TEXT NOT NULL,
  color_code  TEXT,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_by  UUID, updated_by UUID, deleted_at TIMESTAMPTZ,
  is_active   BOOLEAN NOT NULL DEFAULT TRUE
);

CREATE TABLE glue_types (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id  UUID NOT NULL REFERENCES companies(id),
  name        TEXT NOT NULL,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_by  UUID, updated_by UUID, deleted_at TIMESTAMPTZ,
  is_active   BOOLEAN NOT NULL DEFAULT TRUE
);

CREATE TABLE foil_types (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id  UUID NOT NULL REFERENCES companies(id),
  name        TEXT NOT NULL,
  color       TEXT,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_by  UUID, updated_by UUID, deleted_at TIMESTAMPTZ,
  is_active   BOOLEAN NOT NULL DEFAULT TRUE
);

CREATE TABLE lamination_types (
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
CREATE INDEX idx_board_types_company ON board_types(company_id);
CREATE INDEX idx_paper_types_company ON paper_types(company_id);
CREATE INDEX idx_ink_types_company   ON ink_types(company_id);
CREATE INDEX idx_glue_types_company  ON glue_types(company_id);
CREATE INDEX idx_foil_types_company  ON foil_types(company_id);
CREATE INDEX idx_lam_types_company   ON lamination_types(company_id);

-- Triggers
CREATE TRIGGER trg_board_types_upd    BEFORE UPDATE ON board_types    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER trg_paper_types_upd    BEFORE UPDATE ON paper_types    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER trg_ink_types_upd      BEFORE UPDATE ON ink_types      FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER trg_glue_types_upd     BEFORE UPDATE ON glue_types     FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER trg_foil_types_upd     BEFORE UPDATE ON foil_types     FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER trg_lam_types_upd      BEFORE UPDATE ON lamination_types FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- RLS
ALTER TABLE board_types      ENABLE ROW LEVEL SECURITY;
ALTER TABLE paper_types      ENABLE ROW LEVEL SECURITY;
ALTER TABLE ink_types        ENABLE ROW LEVEL SECURITY;
ALTER TABLE glue_types       ENABLE ROW LEVEL SECURITY;
ALTER TABLE foil_types       ENABLE ROW LEVEL SECURITY;
ALTER TABLE lamination_types ENABLE ROW LEVEL SECURITY;

CREATE POLICY board_types_tenant      ON board_types      USING (company_id = (auth.jwt() ->> 'company_id')::UUID);
CREATE POLICY paper_types_tenant      ON paper_types      USING (company_id = (auth.jwt() ->> 'company_id')::UUID);
CREATE POLICY ink_types_tenant        ON ink_types        USING (company_id = (auth.jwt() ->> 'company_id')::UUID);
CREATE POLICY glue_types_tenant       ON glue_types       USING (company_id = (auth.jwt() ->> 'company_id')::UUID);
CREATE POLICY foil_types_tenant       ON foil_types       USING (company_id = (auth.jwt() ->> 'company_id')::UUID);
CREATE POLICY lamination_types_tenant ON lamination_types USING (company_id = (auth.jwt() ->> 'company_id')::UUID);

-- Audit triggers
CREATE TRIGGER trg_audit_board_types AFTER INSERT OR UPDATE OR DELETE ON board_types FOR EACH ROW EXECUTE FUNCTION log_audit_event();
CREATE TRIGGER trg_audit_ink_types   AFTER INSERT OR UPDATE OR DELETE ON ink_types   FOR EACH ROW EXECUTE FUNCTION log_audit_event();

-- ─── SEED DATA FOR JAFSON ─────────────────────────────────────────────────────
INSERT INTO board_types (company_id, name, flute_type, gsm) VALUES
  ('00000000-0000-0000-0000-000000000001', 'B Flute',  'B', 150),
  ('00000000-0000-0000-0000-000000000001', 'C Flute',  'C', 150),
  ('00000000-0000-0000-0000-000000000001', 'E Flute',  'E', 120),
  ('00000000-0000-0000-0000-000000000001', 'BC Flute', 'BC', 200),
  ('00000000-0000-0000-0000-000000000001', 'Rigid Board', NULL, 350),
  ('00000000-0000-0000-0000-000000000001', 'Duplex Board', NULL, 300);

INSERT INTO paper_types (company_id, name, gsm) VALUES
  ('00000000-0000-0000-0000-000000000001', 'Art Paper',     130),
  ('00000000-0000-0000-0000-000000000001', 'Kraft Paper',   90),
  ('00000000-0000-0000-0000-000000000001', 'Bond Paper',    80),
  ('00000000-0000-0000-0000-000000000001', 'Gloss Coated',  150),
  ('00000000-0000-0000-0000-000000000001', 'Matt Coated',   150);

INSERT INTO ink_types (company_id, name, color_code) VALUES
  ('00000000-0000-0000-0000-000000000001', 'Cyan',    '#00FFFF'),
  ('00000000-0000-0000-0000-000000000001', 'Magenta', '#FF00FF'),
  ('00000000-0000-0000-0000-000000000001', 'Yellow',  '#FFFF00'),
  ('00000000-0000-0000-0000-000000000001', 'Black',   '#000000'),
  ('00000000-0000-0000-0000-000000000001', 'White',   '#FFFFFF'),
  ('00000000-0000-0000-0000-000000000001', 'UV Varnish', NULL);

INSERT INTO glue_types (company_id, name) VALUES
  ('00000000-0000-0000-0000-000000000001', 'Cold Glue'),
  ('00000000-0000-0000-0000-000000000001', 'Hot Melt Glue'),
  ('00000000-0000-0000-0000-000000000001', 'PVA Glue');

INSERT INTO foil_types (company_id, name, color) VALUES
  ('00000000-0000-0000-0000-000000000001', 'Gold Foil',   'Gold'),
  ('00000000-0000-0000-0000-000000000001', 'Silver Foil', 'Silver'),
  ('00000000-0000-0000-0000-000000000001', 'Red Foil',    'Red'),
  ('00000000-0000-0000-0000-000000000001', 'Blue Foil',   'Blue'),
  ('00000000-0000-0000-0000-000000000001', 'Black Foil',  'Black');

INSERT INTO lamination_types (company_id, name, material) VALUES
  ('00000000-0000-0000-0000-000000000001', 'Gloss Lamination', 'BOPP'),
  ('00000000-0000-0000-0000-000000000001', 'Matt Lamination',  'BOPP Matt'),
  ('00000000-0000-0000-0000-000000000001', 'Soft Touch',       'Soft Touch Film'),
  ('00000000-0000-0000-0000-000000000001', 'Anti-Scratch',     'AS Film');

NOTIFY pgrst, 'reload schema';


-- ════════════════════════════════════════════════════════
-- MIGRATION 008_units_currencies_taxes.sql
-- ════════════════════════════════════════════════════════
-- ══════════════════════════════════════════════════════════════════════════════
-- JAFSON PRINT ERP — MIGRATION 008: UNITS, CURRENCIES, TAXES
-- Phase 10
-- ══════════════════════════════════════════════════════════════════════════════

CREATE TABLE units (
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

CREATE TABLE currencies (
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

CREATE TABLE taxes (
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
CREATE INDEX idx_units_company      ON units(company_id);
CREATE INDEX idx_currencies_company ON currencies(company_id);
CREATE INDEX idx_taxes_company      ON taxes(company_id);

-- Triggers
CREATE TRIGGER trg_units_upd      BEFORE UPDATE ON units      FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER trg_currencies_upd BEFORE UPDATE ON currencies FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
CREATE TRIGGER trg_taxes_upd      BEFORE UPDATE ON taxes      FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- RLS
ALTER TABLE units      ENABLE ROW LEVEL SECURITY;
ALTER TABLE currencies ENABLE ROW LEVEL SECURITY;
ALTER TABLE taxes      ENABLE ROW LEVEL SECURITY;

CREATE POLICY units_tenant      ON units      USING (company_id = (auth.jwt() ->> 'company_id')::UUID);
CREATE POLICY currencies_tenant ON currencies USING (company_id = (auth.jwt() ->> 'company_id')::UUID);
CREATE POLICY taxes_tenant      ON taxes      USING (company_id = (auth.jwt() ->> 'company_id')::UUID);

-- Add base_currency_id FK now that currencies table exists
ALTER TABLE companies ADD CONSTRAINT fk_companies_base_currency FOREIGN KEY (base_currency_id) REFERENCES currencies(id);

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
  ('00000000-0000-0000-0000-000000000001', 'Milliliter',   'ml',   'volume');

INSERT INTO currencies (company_id, code, symbol, name, is_base, exchange_rate_to_base) VALUES
  ('00000000-0000-0000-0000-000000000001', 'PKR', '₨', 'Pakistani Rupee', TRUE,  1),
  ('00000000-0000-0000-0000-000000000001', 'USD', '$', 'US Dollar',        FALSE, 278),
  ('00000000-0000-0000-0000-000000000001', 'AED', 'د.إ', 'UAE Dirham',    FALSE, 75);

INSERT INTO taxes (company_id, name, rate_percent, is_default) VALUES
  ('00000000-0000-0000-0000-000000000001', 'GST 17%',  17.00, TRUE),
  ('00000000-0000-0000-0000-000000000001', 'GST 0%',    0.00, FALSE),
  ('00000000-0000-0000-0000-000000000001', 'WHT 4.5%',  4.50, FALSE);

-- Set PKR as base currency for Jafson
UPDATE companies SET base_currency_id = (
  SELECT id FROM currencies WHERE company_id = '00000000-0000-0000-0000-000000000001' AND code = 'PKR'
) WHERE id = '00000000-0000-0000-0000-000000000001';

NOTIFY pgrst, 'reload schema';


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
CREATE TABLE document_sequences (
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

CREATE INDEX idx_doc_seq_company ON document_sequences(company_id, document_type);
CREATE TRIGGER trg_doc_seq_upd BEFORE UPDATE ON document_sequences FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

ALTER TABLE document_sequences ENABLE ROW LEVEL SECURITY;
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

NOTIFY pgrst, 'reload schema';


-- ════════════════════════════════════════════════════════
-- MIGRATION 010_workflow_engine.sql
-- ════════════════════════════════════════════════════════
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


-- ════════════════════════════════════════════════════════
-- MIGRATION 011_job_status_delay.sql
-- ════════════════════════════════════════════════════════
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


-- ════════════════════════════════════════════════════════
-- MIGRATION 012_crm.sql
-- ════════════════════════════════════════════════════════
-- ══════════════════════════════════════════════════════════════════════════════
-- JAFSON PRINT ERP — MIGRATION 012: CRM (Customers, Contacts, Addresses)
-- Phase 16 & 17
-- ══════════════════════════════════════════════════════════════════════════════

-- ─── CUSTOMERS ────────────────────────────────────────────────────────────────
CREATE TABLE customers (
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

CREATE INDEX idx_customers_company    ON customers(company_id);
CREATE INDEX idx_customers_name       ON customers USING gin(to_tsvector('simple', name));
CREATE INDEX idx_customers_code       ON customers(company_id, customer_code);
CREATE TRIGGER trg_customers_upd BEFORE UPDATE ON customers FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
ALTER TABLE customers ENABLE ROW LEVEL SECURITY;
CREATE POLICY customers_tenant ON customers USING (company_id = (auth.jwt() ->> 'company_id')::UUID);
CREATE TRIGGER trg_audit_customers AFTER INSERT OR UPDATE OR DELETE ON customers FOR EACH ROW EXECUTE FUNCTION log_audit_event();

-- ─── CONTACTS ─────────────────────────────────────────────────────────────────
CREATE TABLE customer_contacts (
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

CREATE INDEX idx_contacts_customer ON customer_contacts(customer_id);
CREATE TRIGGER trg_contacts_upd BEFORE UPDATE ON customer_contacts FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
ALTER TABLE customer_contacts ENABLE ROW LEVEL SECURITY;
CREATE POLICY contacts_tenant ON customer_contacts USING (company_id = (auth.jwt() ->> 'company_id')::UUID);

-- ─── ADDRESSES ────────────────────────────────────────────────────────────────
CREATE TABLE customer_addresses (
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

CREATE INDEX idx_addresses_customer ON customer_addresses(customer_id);
CREATE TRIGGER trg_addresses_upd BEFORE UPDATE ON customer_addresses FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
ALTER TABLE customer_addresses ENABLE ROW LEVEL SECURITY;
CREATE POLICY addresses_tenant ON customer_addresses USING (company_id = (auth.jwt() ->> 'company_id')::UUID);

-- ─── CUSTOMER CODE SEQUENCE ───────────────────────────────────────────────────
INSERT INTO document_sequences (company_id, document_type, year, prefix, padding, current_value)
VALUES ('00000000-0000-0000-0000-000000000001', 'CUST', 2026, 'CUST', 4, 0)
ON CONFLICT DO NOTHING;

NOTIFY pgrst, 'reload schema';


-- ════════════════════════════════════════════════════════
-- MIGRATION 013_sales.sql
-- ════════════════════════════════════════════════════════
-- ══════════════════════════════════════════════════════════════════════════════
-- JAFSON PRINT ERP — MIGRATION 013: QUOTATIONS & SALES ORDERS
-- Phase 18–21
-- ══════════════════════════════════════════════════════════════════════════════

-- ─── QUOTATIONS ───────────────────────────────────────────────────────────────
CREATE TABLE quotations (
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

CREATE INDEX idx_quotations_company    ON quotations(company_id);
CREATE INDEX idx_quotations_customer   ON quotations(customer_id);
CREATE INDEX idx_quotations_status     ON quotations(company_id, status);
CREATE TRIGGER trg_quotations_upd BEFORE UPDATE ON quotations FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
ALTER TABLE quotations ENABLE ROW LEVEL SECURITY;
CREATE POLICY quotations_tenant ON quotations USING (company_id = (auth.jwt() ->> 'company_id')::UUID);
CREATE TRIGGER trg_audit_quotations AFTER INSERT OR UPDATE OR DELETE ON quotations FOR EACH ROW EXECUTE FUNCTION log_audit_event();

-- ─── QUOTATION LINE ITEMS ─────────────────────────────────────────────────────
CREATE TABLE quotation_items (
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

CREATE INDEX idx_qt_items_quotation ON quotation_items(quotation_id, sort_order);
CREATE TRIGGER trg_qt_items_upd BEFORE UPDATE ON quotation_items FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
ALTER TABLE quotation_items ENABLE ROW LEVEL SECURITY;
CREATE POLICY qt_items_tenant ON quotation_items USING (company_id = (auth.jwt() ->> 'company_id')::UUID);

-- ─── SALES ORDERS ─────────────────────────────────────────────────────────────
CREATE TABLE sales_orders (
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

CREATE INDEX idx_so_company   ON sales_orders(company_id);
CREATE INDEX idx_so_customer  ON sales_orders(customer_id);
CREATE INDEX idx_so_status    ON sales_orders(company_id, status);
CREATE TRIGGER trg_so_upd BEFORE UPDATE ON sales_orders FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
ALTER TABLE sales_orders ENABLE ROW LEVEL SECURITY;
CREATE POLICY so_tenant ON sales_orders USING (company_id = (auth.jwt() ->> 'company_id')::UUID);
CREATE TRIGGER trg_audit_so AFTER INSERT OR UPDATE OR DELETE ON sales_orders FOR EACH ROW EXECUTE FUNCTION log_audit_event();

-- ─── SALES ORDER LINE ITEMS ───────────────────────────────────────────────────
CREATE TABLE sales_order_items (
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

CREATE INDEX idx_so_items_so ON sales_order_items(sales_order_id, sort_order);
CREATE TRIGGER trg_so_items_upd BEFORE UPDATE ON sales_order_items FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
ALTER TABLE sales_order_items ENABLE ROW LEVEL SECURITY;
CREATE POLICY so_items_tenant ON sales_order_items USING (company_id = (auth.jwt() ->> 'company_id')::UUID);

-- ─── SEQUENCES FOR QT AND SO ──────────────────────────────────────────────────
INSERT INTO document_sequences (company_id, document_type, year, prefix, padding, current_value) VALUES
  ('00000000-0000-0000-0000-000000000001', 'QT', 2026, 'QT', 5, 0),
  ('00000000-0000-0000-0000-000000000001', 'SO', 2026, 'SO', 5, 0)
ON CONFLICT DO NOTHING;

NOTIFY pgrst, 'reload schema';


-- ════════════════════════════════════════════════════════
-- MIGRATION 014_jobs_core.sql
-- ════════════════════════════════════════════════════════
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
CREATE TABLE job_artworks (
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

CREATE INDEX idx_artworks_job ON job_artworks(job_id, version);
CREATE TRIGGER trg_artworks_upd BEFORE UPDATE ON job_artworks FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
ALTER TABLE job_artworks ENABLE ROW LEVEL SECURITY;
CREATE POLICY artworks_tenant ON job_artworks USING (company_id = (auth.jwt() ->> 'company_id')::UUID);
CREATE TRIGGER trg_audit_artworks AFTER INSERT OR UPDATE OR DELETE ON job_artworks FOR EACH ROW EXECUTE FUNCTION log_audit_event();

-- ─── PHASE 30: PRODUCTION PLANS ──────────────────────────────────────────────
CREATE TABLE job_plans (
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

CREATE INDEX idx_plans_job     ON job_plans(job_id);
CREATE INDEX idx_plans_date    ON job_plans(company_id, planned_date);
CREATE INDEX idx_plans_status  ON job_plans(company_id, status);
CREATE TRIGGER trg_plans_upd BEFORE UPDATE ON job_plans FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
ALTER TABLE job_plans ENABLE ROW LEVEL SECURITY;
CREATE POLICY plans_tenant ON job_plans USING (company_id = (auth.jwt() ->> 'company_id')::UUID);
CREATE TRIGGER trg_audit_plans AFTER INSERT OR UPDATE OR DELETE ON job_plans FOR EACH ROW EXECUTE FUNCTION log_audit_event();

-- ─── MACHINE ASSIGNMENTS ──────────────────────────────────────────────────────
CREATE TABLE job_machine_assignments (
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

CREATE INDEX idx_mach_plan    ON job_machine_assignments(job_plan_id);
CREATE INDEX idx_mach_machine ON job_machine_assignments(machine_id);
CREATE INDEX idx_mach_job     ON job_machine_assignments(job_id);
CREATE TRIGGER trg_mach_upd BEFORE UPDATE ON job_machine_assignments FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
ALTER TABLE job_machine_assignments ENABLE ROW LEVEL SECURITY;
CREATE POLICY mach_tenant ON job_machine_assignments USING (company_id = (auth.jwt() ->> 'company_id')::UUID);

-- ─── PHASE 31: MATERIAL REQUISITIONS (MRN) ───────────────────────────────────
CREATE TABLE material_requisitions (
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

CREATE INDEX idx_mrn_company ON material_requisitions(company_id);
CREATE INDEX idx_mrn_job     ON material_requisitions(job_id);
CREATE INDEX idx_mrn_status  ON material_requisitions(company_id, status);
CREATE TRIGGER trg_mrn_upd BEFORE UPDATE ON material_requisitions FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
ALTER TABLE material_requisitions ENABLE ROW LEVEL SECURITY;
CREATE POLICY mrn_tenant ON material_requisitions USING (company_id = (auth.jwt() ->> 'company_id')::UUID);
CREATE TRIGGER trg_audit_mrn AFTER INSERT OR UPDATE OR DELETE ON material_requisitions FOR EACH ROW EXECUTE FUNCTION log_audit_event();

-- ─── MRN LINE ITEMS ───────────────────────────────────────────────────────────
CREATE TABLE material_requisition_items (
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

CREATE INDEX idx_mrn_items_req ON material_requisition_items(requisition_id);
CREATE TRIGGER trg_mrn_items_upd BEFORE UPDATE ON material_requisition_items FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
ALTER TABLE material_requisition_items ENABLE ROW LEVEL SECURITY;
CREATE POLICY mrn_items_tenant ON material_requisition_items USING (company_id = (auth.jwt() ->> 'company_id')::UUID);

-- ─── PHASE 32: BOARD INVENTORY ────────────────────────────────────────────────
CREATE TABLE board_inventory (
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

CREATE INDEX idx_board_inv_company ON board_inventory(company_id);
CREATE TRIGGER trg_board_inv_upd BEFORE UPDATE ON board_inventory FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
ALTER TABLE board_inventory ENABLE ROW LEVEL SECURITY;
CREATE POLICY board_inv_tenant ON board_inventory USING (company_id = (auth.jwt() ->> 'company_id')::UUID);
CREATE TRIGGER trg_audit_board_inv AFTER INSERT OR UPDATE OR DELETE ON board_inventory FOR EACH ROW EXECUTE FUNCTION log_audit_event();

-- ─── BOARD INVENTORY MOVEMENTS ────────────────────────────────────────────────
CREATE TABLE board_inventory_movements (
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

CREATE INDEX idx_bim_item    ON board_inventory_movements(board_item_id, occurred_at DESC);
CREATE INDEX idx_bim_company ON board_inventory_movements(company_id, occurred_at DESC);
ALTER TABLE board_inventory_movements ENABLE ROW LEVEL SECURITY;
CREATE POLICY bim_read   ON board_inventory_movements FOR SELECT USING (company_id = (auth.jwt() ->> 'company_id')::UUID);
CREATE POLICY bim_insert ON board_inventory_movements FOR INSERT WITH CHECK (company_id = (auth.jwt() ->> 'company_id')::UUID);

-- ─── PHASE 33: VENDORS ────────────────────────────────────────────────────────
CREATE TABLE vendors (
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

-- board_inventory.vendor_id references vendors(id) — added here as an ALTER
-- rather than inline above, since vendors is defined after board_inventory
-- in this file and an inline forward-reference would fail on a fresh install.
ALTER TABLE board_inventory ADD CONSTRAINT board_inventory_vendor_id_fkey
  FOREIGN KEY (vendor_id) REFERENCES vendors(id);

CREATE INDEX idx_vendors_company ON vendors(company_id);
CREATE TRIGGER trg_vendors_upd BEFORE UPDATE ON vendors FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
ALTER TABLE vendors ENABLE ROW LEVEL SECURITY;
CREATE POLICY vendors_tenant ON vendors USING (company_id = (auth.jwt() ->> 'company_id')::UUID);
CREATE TRIGGER trg_audit_vendors AFTER INSERT OR UPDATE OR DELETE ON vendors FOR EACH ROW EXECUTE FUNCTION log_audit_event();

-- ─── PURCHASE ORDERS ──────────────────────────────────────────────────────────
CREATE TABLE purchase_orders (
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

CREATE INDEX idx_po_company ON purchase_orders(company_id);
CREATE INDEX idx_po_vendor  ON purchase_orders(vendor_id);
CREATE INDEX idx_po_status  ON purchase_orders(company_id, status);
CREATE TRIGGER trg_po_upd BEFORE UPDATE ON purchase_orders FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
ALTER TABLE purchase_orders ENABLE ROW LEVEL SECURITY;
CREATE POLICY po_tenant ON purchase_orders USING (company_id = (auth.jwt() ->> 'company_id')::UUID);
CREATE TRIGGER trg_audit_po AFTER INSERT OR UPDATE OR DELETE ON purchase_orders FOR EACH ROW EXECUTE FUNCTION log_audit_event();

-- ─── PO LINE ITEMS ────────────────────────────────────────────────────────────
CREATE TABLE purchase_order_items (
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

CREATE INDEX idx_po_items_po ON purchase_order_items(po_id, sort_order);
CREATE TRIGGER trg_po_items_upd BEFORE UPDATE ON purchase_order_items FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
ALTER TABLE purchase_order_items ENABLE ROW LEVEL SECURITY;
CREATE POLICY po_items_tenant ON purchase_order_items USING (company_id = (auth.jwt() ->> 'company_id')::UUID);

-- ─── SEQUENCES ────────────────────────────────────────────────────────────────
INSERT INTO document_sequences (company_id, document_type, year, prefix, padding, current_value) VALUES
  ('00000000-0000-0000-0000-000000000001', 'MRN', 2026, 'MRN', 5, 0),
  ('00000000-0000-0000-0000-000000000001', 'PO',  2026, 'PO',  5, 0),
  ('00000000-0000-0000-0000-000000000001', 'VND', 2026, 'VND', 4, 0)
ON CONFLICT DO NOTHING;

NOTIFY pgrst, 'reload schema';


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
CREATE TABLE production_assignments (
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

CREATE INDEX idx_pa_job      ON production_assignments(job_id);
CREATE INDEX idx_pa_machine  ON production_assignments(machine_id, status);
CREATE INDEX idx_pa_operator ON production_assignments(operator_id);
CREATE INDEX idx_pa_company  ON production_assignments(company_id, status);
CREATE TRIGGER trg_pa_upd BEFORE UPDATE ON production_assignments
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
ALTER TABLE production_assignments ENABLE ROW LEVEL SECURITY;
CREATE POLICY pa_tenant ON production_assignments
  USING (company_id = (auth.jwt() ->> 'company_id')::UUID);
CREATE TRIGGER trg_audit_pa AFTER INSERT OR UPDATE OR DELETE ON production_assignments
  FOR EACH ROW EXECUTE FUNCTION log_audit_event();

-- ─── PRODUCTION LOGS (append-only, per assignment) ────────────────────────────
-- Immutable event log per assignment: start, pause, resume, complete, notes
CREATE TABLE production_logs (
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

CREATE INDEX idx_pl_assignment ON production_logs(assignment_id, occurred_at DESC);
CREATE INDEX idx_pl_job        ON production_logs(job_id, occurred_at DESC);
CREATE INDEX idx_pl_machine    ON production_logs(machine_id, occurred_at DESC);
ALTER TABLE production_logs ENABLE ROW LEVEL SECURITY;
CREATE POLICY pl_read   ON production_logs FOR SELECT
  USING (company_id = (auth.jwt() ->> 'company_id')::UUID);
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

NOTIFY pgrst, 'reload schema';


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
CREATE TABLE dispatch_orders (
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

CREATE INDEX idx_do_company  ON dispatch_orders(company_id);
CREATE INDEX idx_do_customer ON dispatch_orders(customer_id);
CREATE INDEX idx_do_status   ON dispatch_orders(company_id, status);
CREATE INDEX idx_do_date     ON dispatch_orders(company_id, scheduled_date);
CREATE TRIGGER trg_do_upd BEFORE UPDATE ON dispatch_orders
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
ALTER TABLE dispatch_orders ENABLE ROW LEVEL SECURITY;
CREATE POLICY do_tenant ON dispatch_orders
  USING (company_id = (auth.jwt() ->> 'company_id')::UUID);
CREATE TRIGGER trg_audit_do AFTER INSERT OR UPDATE OR DELETE ON dispatch_orders
  FOR EACH ROW EXECUTE FUNCTION log_audit_event();

-- ─── DISPATCH LINE ITEMS (jobs being dispatched) ──────────────────────────────
CREATE TABLE dispatch_items (
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

CREATE INDEX idx_di_dispatch ON dispatch_items(dispatch_id);
CREATE INDEX idx_di_job      ON dispatch_items(job_id);
CREATE TRIGGER trg_di_upd BEFORE UPDATE ON dispatch_items
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
ALTER TABLE dispatch_items ENABLE ROW LEVEL SECURITY;
CREATE POLICY di_tenant ON dispatch_items
  USING (company_id = (auth.jwt() ->> 'company_id')::UUID);

-- ─── PROOF OF DELIVERY ────────────────────────────────────────────────────────
CREATE TABLE proof_of_delivery (
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

CREATE INDEX idx_pod_dispatch ON proof_of_delivery(dispatch_id);
CREATE TRIGGER trg_pod_upd BEFORE UPDATE ON proof_of_delivery
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
ALTER TABLE proof_of_delivery ENABLE ROW LEVEL SECURITY;
CREATE POLICY pod_tenant ON proof_of_delivery
  USING (company_id = (auth.jwt() ->> 'company_id')::UUID);
CREATE TRIGGER trg_audit_pod AFTER INSERT OR UPDATE OR DELETE ON proof_of_delivery
  FOR EACH ROW EXECUTE FUNCTION log_audit_event();

-- ─── DISPATCH SEQUENCE ────────────────────────────────────────────────────────
INSERT INTO document_sequences (company_id, document_type, year, prefix, padding, current_value)
VALUES ('00000000-0000-0000-0000-000000000001', 'DISP', 2026, 'DC', 5, 0)
ON CONFLICT DO NOTHING;

NOTIFY pgrst, 'reload schema';


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

NOTIFY pgrst, 'reload schema';


-- ════════════════════════════════════════════════════════
-- MIGRATION 020_reports.sql
-- ════════════════════════════════════════════════════════
-- ══════════════════════════════════════════════════════════════════════════════
-- JAFSON PRINT ERP — MIGRATION 020: REPORTS & ANALYTICS
-- Phase 49 — Production Reports
-- Phase 50 — Customer & Sales Reports
-- Phase 51 — Financial Dashboard
-- Phase 52 — Analytics Overview
-- ══════════════════════════════════════════════════════════════════════════════

-- ─── REPORT: JOB TURNAROUND SUMMARY ──────────────────────────────────────────
-- Returns per-job timing data for production reports
CREATE OR REPLACE VIEW report_job_turnaround AS
SELECT
  j.id,
  j.company_id,
  j.job_number,
  j.job_title,
  j.status,
  j.priority,
  j.quantity,
  j.order_date,
  j.required_date,
  j.completed_date,
  c.name                                           AS customer_name,
  c.customer_code,
  wt.name                                          AS workflow_name,
  -- Turnaround days (order to completion)
  CASE
    WHEN j.completed_date IS NOT NULL
    THEN (j.completed_date - j.order_date)
  END                                              AS turnaround_days,
  -- Days late (positive = late, negative = early)
  CASE
    WHEN j.completed_date IS NOT NULL AND j.required_date IS NOT NULL
    THEN (j.completed_date - j.required_date)
  END                                              AS days_variance,
  -- On-time flag
  CASE
    WHEN j.completed_date IS NOT NULL AND j.required_date IS NOT NULL
    THEN j.completed_date <= j.required_date
    ELSE NULL
  END                                              AS delivered_on_time,
  -- Stage counts
  (SELECT COUNT(*) FROM job_stage_progress jsp WHERE jsp.job_id = j.id AND jsp.status = 'completed') AS stages_completed,
  (SELECT COUNT(*) FROM job_stage_progress jsp WHERE jsp.job_id = j.id) AS stages_total,
  -- QC result
  (SELECT result FROM qc_inspections qi WHERE qi.job_id = j.id AND qi.signed_off_at IS NOT NULL ORDER BY qi.inspection_no DESC LIMIT 1) AS qc_result,
  -- Dispatch info
  (SELECT do2.dispatched_at FROM dispatch_orders do2 JOIN dispatch_items di ON di.dispatch_id = do2.id WHERE di.job_id = j.id ORDER BY do2.dispatched_at LIMIT 1) AS dispatched_at,
  j.created_at,
  j.updated_at
FROM jobs j
LEFT JOIN customers c ON c.id = j.customer_id
LEFT JOIN workflow_templates wt ON wt.id = j.workflow_template_id
WHERE j.deleted_at IS NULL AND j.is_active = TRUE;

-- ─── REPORT: CUSTOMER SALES SUMMARY ──────────────────────────────────────────
-- Aggregates jobs and invoices independently (each to one row per customer)
-- before joining, so a customer with multiple jobs AND multiple invoices
-- can't fan out and inflate the SUM() totals.
CREATE OR REPLACE VIEW report_customer_sales AS
WITH jobs_agg AS (
  SELECT
    j.customer_id,
    COUNT(*)                                              AS total_jobs,
    COUNT(*) FILTER (WHERE j.status = 'completed')        AS completed_jobs,
    COUNT(*) FILTER (WHERE j.status = 'dispatched')        AS dispatched_jobs,
    COUNT(*) FILTER (WHERE j.status = 'cancelled')          AS cancelled_jobs,
    COALESCE(SUM(j.quoted_amount), 0)                     AS total_quoted,
    MAX(j.created_at)                                     AS last_job_date,
    MIN(j.created_at)                                     AS first_job_date
  FROM jobs j
  WHERE j.deleted_at IS NULL
  GROUP BY j.customer_id
),
invoices_agg AS (
  SELECT
    inv.customer_id,
    COALESCE(SUM(inv.total_amount), 0)  AS total_invoiced,
    COALESCE(SUM(inv.paid_amount), 0)   AS total_paid,
    COALESCE(SUM(inv.balance_due), 0)   AS total_outstanding,
    COUNT(*)                            AS invoice_count
  FROM invoices inv
  WHERE inv.deleted_at IS NULL
  GROUP BY inv.customer_id
)
SELECT
  c.id                                              AS customer_id,
  c.company_id,
  c.name                                            AS customer_name,
  c.customer_code,
  c.industry,
  COALESCE(ja.total_jobs, 0)                        AS total_jobs,
  COALESCE(ja.completed_jobs, 0)                    AS completed_jobs,
  COALESCE(ja.dispatched_jobs, 0)                   AS dispatched_jobs,
  COALESCE(ja.cancelled_jobs, 0)                    AS cancelled_jobs,
  COALESCE(ja.total_quoted, 0)                      AS total_quoted,
  COALESCE(ia.total_invoiced, 0)                    AS total_invoiced,
  COALESCE(ia.total_paid, 0)                        AS total_paid,
  COALESCE(ia.total_outstanding, 0)                 AS total_outstanding,
  COALESCE(ia.invoice_count, 0)                     AS invoice_count,
  ja.last_job_date,
  ja.first_job_date
FROM customers c
LEFT JOIN jobs_agg ja     ON ja.customer_id = c.id
LEFT JOIN invoices_agg ia ON ia.customer_id = c.id
WHERE c.deleted_at IS NULL AND c.is_active = TRUE;

-- ─── REPORT: MONTHLY PRODUCTION SUMMARY ──────────────────────────────────────
CREATE OR REPLACE VIEW report_monthly_production AS
SELECT
  j.company_id,
  DATE_TRUNC('month', j.created_at)               AS month,
  TO_CHAR(j.created_at, 'Mon YYYY')               AS month_label,
  COUNT(*)                                         AS jobs_created,
  COUNT(*) FILTER (WHERE j.status = 'completed')  AS jobs_completed,
  COUNT(*) FILTER (WHERE j.status = 'dispatched') AS jobs_dispatched,
  COUNT(*) FILTER (WHERE j.status = 'cancelled')  AS jobs_cancelled,
  COUNT(*) FILTER (WHERE j.status = 'on_hold')    AS jobs_on_hold,
  COALESCE(SUM(j.quantity), 0)                    AS total_quantity,
  COALESCE(SUM(j.quoted_amount), 0)               AS total_quoted_value,
  -- Avg turnaround for completed jobs
  AVG(CASE WHEN j.completed_date IS NOT NULL THEN (j.completed_date - j.order_date) END) AS avg_turnaround_days,
  -- On-time delivery rate
  ROUND(
    100.0 * COUNT(*) FILTER (
      WHERE j.completed_date IS NOT NULL
        AND j.required_date IS NOT NULL
        AND j.completed_date <= j.required_date
    ) / NULLIF(COUNT(*) FILTER (WHERE j.completed_date IS NOT NULL AND j.required_date IS NOT NULL), 0),
    1
  )                                                AS on_time_pct
FROM jobs j
WHERE j.deleted_at IS NULL
GROUP BY j.company_id, DATE_TRUNC('month', j.created_at), TO_CHAR(j.created_at, 'Mon YYYY')
ORDER BY month DESC;

-- ─── REPORT: FINANCIAL SUMMARY ────────────────────────────────────────────────
CREATE OR REPLACE VIEW report_financial_summary AS
SELECT
  inv.company_id,
  DATE_TRUNC('month', inv.invoice_date)            AS month,
  TO_CHAR(inv.invoice_date, 'Mon YYYY')            AS month_label,
  COUNT(*)                                         AS invoice_count,
  COALESCE(SUM(inv.total_amount), 0)               AS total_invoiced,
  COALESCE(SUM(inv.paid_amount), 0)                AS total_collected,
  COALESCE(SUM(inv.balance_due), 0)                AS total_outstanding,
  COUNT(*) FILTER (WHERE inv.status = 'paid')      AS fully_paid,
  COUNT(*) FILTER (WHERE inv.status = 'partial')   AS partially_paid,
  COUNT(*) FILTER (WHERE inv.status = 'overdue'
    OR (inv.due_date < CURRENT_DATE AND inv.balance_due > 0)) AS overdue_count,
  COALESCE(SUM(inv.balance_due) FILTER (
    WHERE inv.due_date < CURRENT_DATE AND inv.balance_due > 0
  ), 0)                                            AS overdue_amount
FROM invoices inv
WHERE inv.deleted_at IS NULL
GROUP BY inv.company_id, DATE_TRUNC('month', inv.invoice_date), TO_CHAR(inv.invoice_date, 'Mon YYYY')
ORDER BY month DESC;

-- ─── REPORT: MACHINE UTILIZATION ─────────────────────────────────────────────
CREATE OR REPLACE VIEW report_machine_utilization AS
SELECT
  m.id                                             AS machine_id,
  m.company_id,
  m.name                                           AS machine_name,
  m.machine_type,
  COUNT(pa.id)                                     AS total_assignments,
  COUNT(pa.id) FILTER (WHERE pa.status = 'completed')  AS completed,
  COUNT(pa.id) FILTER (WHERE pa.status = 'running')    AS currently_running,
  COUNT(pa.id) FILTER (WHERE pa.status = 'queued')     AS queued,
  COALESCE(SUM(pa.actual_minutes) FILTER (WHERE pa.status = 'completed'), 0) AS total_actual_minutes,
  COALESCE(SUM(pa.estimated_minutes), 0)           AS total_estimated_minutes,
  COALESCE(AVG(pa.actual_minutes) FILTER (WHERE pa.status = 'completed'), 0) AS avg_job_minutes
FROM machines m
LEFT JOIN production_assignments pa ON pa.machine_id = m.id AND pa.deleted_at IS NULL
WHERE m.is_active = TRUE
GROUP BY m.id, m.company_id, m.name, m.machine_type;

-- ─── REPORT: QC DEFECT ANALYSIS ──────────────────────────────────────────────
-- Aggregates qc_inspections and reprint_requests independently (each to one
-- row per company+month) before joining, so a job with multiple reprints
-- can't fan out and inflate the inspection/defect counts, and a reprint is
-- always attributed to the month it was actually requested.
CREATE OR REPLACE VIEW report_qc_analysis AS
WITH inspections_agg AS (
  SELECT
    qi.company_id,
    DATE_TRUNC('month', qi.created_at)              AS month,
    TO_CHAR(qi.created_at, 'Mon YYYY')              AS month_label,
    COUNT(*)                                         AS total_inspections,
    COUNT(*) FILTER (WHERE qi.result = 'pass')       AS passed,
    COUNT(*) FILTER (WHERE qi.result = 'fail')       AS failed,
    COUNT(*) FILTER (WHERE qi.result = 'conditional_pass') AS conditional,
    ROUND(
      100.0 * COUNT(*) FILTER (WHERE qi.result = 'pass')
      / NULLIF(COUNT(*) FILTER (WHERE qi.result IS NOT NULL), 0), 1
    )                                                AS pass_rate_pct,
    COALESCE(SUM(qi.defect_count), 0)               AS total_defects
  FROM qc_inspections qi
  WHERE qi.deleted_at IS NULL
  GROUP BY qi.company_id, DATE_TRUNC('month', qi.created_at), TO_CHAR(qi.created_at, 'Mon YYYY')
),
reprints_agg AS (
  SELECT
    rpr.company_id,
    DATE_TRUNC('month', rpr.created_at) AS month,
    COUNT(*)                            AS reprint_requests
  FROM reprint_requests rpr
  WHERE rpr.deleted_at IS NULL
  GROUP BY rpr.company_id, DATE_TRUNC('month', rpr.created_at)
)
SELECT
  ia.company_id,
  ia.month,
  ia.month_label,
  ia.total_inspections,
  ia.passed,
  ia.failed,
  ia.conditional,
  ia.pass_rate_pct,
  ia.total_defects,
  COALESCE(ra.reprint_requests, 0) AS reprint_requests
FROM inspections_agg ia
LEFT JOIN reprints_agg ra ON ra.company_id = ia.company_id AND ra.month = ia.month
ORDER BY ia.month DESC;

-- ─── ANALYTICS FUNCTION: DASHBOARD KPIs ──────────────────────────────────────
CREATE OR REPLACE FUNCTION get_dashboard_kpis(p_company_id UUID, p_days INTEGER DEFAULT 30)
RETURNS JSON AS $$
DECLARE
  result JSON;
  since_date DATE := CURRENT_DATE - p_days;
BEGIN
  SELECT json_build_object(
    'period_days', p_days,
    'jobs', json_build_object(
      'total',       (SELECT COUNT(*) FROM jobs WHERE company_id = p_company_id AND deleted_at IS NULL AND created_at >= since_date),
      'completed',   (SELECT COUNT(*) FROM jobs WHERE company_id = p_company_id AND status = 'completed' AND created_at >= since_date),
      'in_progress', (SELECT COUNT(*) FROM jobs WHERE company_id = p_company_id AND status = 'in_progress'),
      'on_hold',     (SELECT COUNT(*) FROM jobs WHERE company_id = p_company_id AND status = 'on_hold'),
      'overdue',     (SELECT COUNT(*) FROM jobs WHERE company_id = p_company_id AND status NOT IN ('completed','dispatched','cancelled') AND required_date < CURRENT_DATE AND required_date IS NOT NULL)
    ),
    'revenue', json_build_object(
      'invoiced',    COALESCE((SELECT SUM(total_amount) FROM invoices WHERE company_id = p_company_id AND deleted_at IS NULL AND invoice_date >= since_date), 0),
      'collected',   COALESCE((SELECT SUM(paid_amount) FROM invoices WHERE company_id = p_company_id AND deleted_at IS NULL AND invoice_date >= since_date), 0),
      'outstanding', COALESCE((SELECT SUM(balance_due) FROM invoices WHERE company_id = p_company_id AND deleted_at IS NULL AND balance_due > 0), 0),
      'overdue',     COALESCE((SELECT SUM(balance_due) FROM invoices WHERE company_id = p_company_id AND deleted_at IS NULL AND balance_due > 0 AND due_date < CURRENT_DATE), 0)
    ),
    'production', json_build_object(
      'machines_running', (SELECT COUNT(*) FROM production_assignments WHERE company_id = p_company_id AND status = 'running' AND deleted_at IS NULL),
      'dispatched_today', (SELECT COUNT(*) FROM dispatch_orders WHERE company_id = p_company_id AND DATE(dispatched_at) = CURRENT_DATE),
      'qc_pass_rate',     COALESCE((SELECT ROUND(100.0 * COUNT(*) FILTER (WHERE result = 'pass') / NULLIF(COUNT(*),0), 1) FROM qc_inspections WHERE company_id = p_company_id AND created_at >= since_date), 0)
    ),
    'top_customers', (
      SELECT json_agg(row_to_json(t)) FROM (
        SELECT c.name, COUNT(j.id) AS job_count, COALESCE(SUM(j.quoted_amount),0) AS value
        FROM customers c
        JOIN jobs j ON j.customer_id = c.id AND j.company_id = p_company_id AND j.created_at >= since_date
        WHERE c.company_id = p_company_id
        GROUP BY c.id, c.name ORDER BY job_count DESC LIMIT 5
      ) t
    )
  ) INTO result;
  RETURN result;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

NOTIFY pgrst, 'reload schema';


-- ════════════════════════════════════════════════════════
-- MIGRATION 021_admin.sql
-- ════════════════════════════════════════════════════════
-- ══════════════════════════════════════════════════════════════════════════════
-- JAFSON PRINT ERP — MIGRATION 021: ADMIN & MULTI-TENANT
-- Phase 53 — User Management
-- Phase 54 — Branch-wise Access Control
-- Phase 55 — Multi-company Setup
-- Phase 56 — System Settings & Audit
-- ══════════════════════════════════════════════════════════════════════════════

-- ─── USER BRANCH ACCESS (Phase 54) ───────────────────────────────────────────
-- Controls which branches a user can access within their company
CREATE TABLE IF NOT EXISTS user_branch_access (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id  UUID NOT NULL REFERENCES companies(id),
  user_id     UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  branch_id   UUID NOT NULL REFERENCES branches(id) ON DELETE CASCADE,
  can_view    BOOLEAN NOT NULL DEFAULT TRUE,
  can_create  BOOLEAN NOT NULL DEFAULT FALSE,
  can_edit    BOOLEAN NOT NULL DEFAULT FALSE,
  granted_by  UUID REFERENCES users(id),
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  is_active   BOOLEAN NOT NULL DEFAULT TRUE,
  UNIQUE (company_id, user_id, branch_id)
);

CREATE INDEX IF NOT EXISTS idx_uba_user   ON user_branch_access(user_id);
CREATE INDEX IF NOT EXISTS idx_uba_branch ON user_branch_access(branch_id);
DROP TRIGGER IF EXISTS trg_uba_upd ON user_branch_access;
CREATE TRIGGER trg_uba_upd BEFORE UPDATE ON user_branch_access
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
ALTER TABLE user_branch_access ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS uba_tenant ON user_branch_access;
CREATE POLICY uba_tenant ON user_branch_access
  USING (company_id = (auth.jwt() ->> 'company_id')::UUID);

-- ─── SYSTEM SETTINGS (Phase 56) ──────────────────────────────────────────────
-- Key-value store for company-level settings
CREATE TABLE IF NOT EXISTS system_settings (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id  UUID NOT NULL REFERENCES companies(id),
  key         TEXT NOT NULL,
  value       TEXT,
  category    TEXT NOT NULL DEFAULT 'general',
  -- categories: 'general','notifications','finance','production','dispatch'
  description TEXT,
  updated_by  UUID REFERENCES users(id),
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (company_id, key)
);

CREATE INDEX IF NOT EXISTS idx_ss_company ON system_settings(company_id, category);
DROP TRIGGER IF EXISTS trg_ss_upd ON system_settings;
CREATE TRIGGER trg_ss_upd BEFORE UPDATE ON system_settings
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
ALTER TABLE system_settings ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS ss_tenant ON system_settings;
CREATE POLICY ss_tenant ON system_settings
  USING (company_id = (auth.jwt() ->> 'company_id')::UUID);
DROP TRIGGER IF EXISTS trg_audit_ss ON system_settings;
CREATE TRIGGER trg_audit_ss AFTER INSERT OR UPDATE OR DELETE ON system_settings
  FOR EACH ROW EXECUTE FUNCTION log_audit_event();

-- ─── ACTIVITY LOG VIEW (for admin audit trail) ────────────────────────────────
CREATE OR REPLACE VIEW admin_audit_trail AS
SELECT
  al.id,
  al.company_id,
  al.table_name,
  al.record_id,
  al.action,
  al.old_values,
  al.new_values,
  al.changed_at    AS performed_at,
  u.full_name      AS performed_by_name,
  u.email          AS performed_by_email
FROM audit_log al
LEFT JOIN users u ON u.id = al.changed_by
ORDER BY al.changed_at DESC;

-- ─── MULTI-COMPANY HELPER FUNCTION ───────────────────────────────────────────
-- Returns all companies a superadmin can access
CREATE OR REPLACE FUNCTION get_accessible_companies(p_user_id UUID)
RETURNS TABLE (
  company_id   UUID,
  company_name TEXT,
  is_primary   BOOLEAN,
  user_role    TEXT
) AS $$
BEGIN
  RETURN QUERY
  SELECT
    c.id,
    c.name,
    (u.company_id = c.id) AS is_primary,
    u.role
  FROM users u
  JOIN companies c ON c.id = u.company_id
  WHERE u.id = p_user_id
  UNION
  -- Superadmins can see all companies
  SELECT
    c2.id,
    c2.name,
    FALSE,
    'superadmin'::TEXT
  FROM companies c2
  WHERE EXISTS (
    SELECT 1 FROM users u2
    WHERE u2.id = p_user_id AND u2.role IN ('superadmin','super_admin')
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ─── SEED: DEFAULT SYSTEM SETTINGS ───────────────────────────────────────────
INSERT INTO system_settings (company_id, key, value, category, description) VALUES
  ('00000000-0000-0000-0000-000000000001', 'company_name',        'Jafson Print Pack',  'general',      'Company display name'),
  ('00000000-0000-0000-0000-000000000001', 'company_phone',       '+92 42 0000000',     'general',      'Primary phone number'),
  ('00000000-0000-0000-0000-000000000001', 'company_address',     'Lahore, Pakistan',   'general',      'Company address'),
  ('00000000-0000-0000-0000-000000000001', 'company_ntn',         '',                   'general',      'NTN number for invoices'),
  ('00000000-0000-0000-0000-000000000001', 'company_strn',        '',                   'general',      'STRN number'),
  ('00000000-0000-0000-0000-000000000001', 'invoice_prefix',      'INV',                'finance',      'Invoice number prefix'),
  ('00000000-0000-0000-0000-000000000001', 'default_tax_pct',     '0',                  'finance',      'Default GST/tax percentage'),
  ('00000000-0000-0000-0000-000000000001', 'default_payment_terms','30',                'finance',      'Default payment terms (days)'),
  ('00000000-0000-0000-0000-000000000001', 'low_stock_alerts',    'true',               'production',   'Enable low stock notifications'),
  ('00000000-0000-0000-0000-000000000001', 'job_auto_assign',     'false',              'production',   'Auto-assign jobs to default workflow'),
  ('00000000-0000-0000-0000-000000000001', 'dispatch_sms',        'false',              'dispatch',     'Send WhatsApp message on dispatch (via Meta WhatsApp Cloud API)'),
  ('00000000-0000-0000-0000-000000000001', 'qc_mandatory',        'true',               'production',   'QC mandatory before dispatch'),
  ('00000000-0000-0000-0000-000000000001', 'currency_symbol',     'PKR',                'finance',      'Currency symbol'),
  ('00000000-0000-0000-0000-000000000001', 'date_format',         'DD/MM/YYYY',         'general',      'Display date format'),
  ('00000000-0000-0000-0000-000000000001', 'fiscal_year_start',   '07',                 'finance',      'Fiscal year start month (01-12)')
ON CONFLICT (company_id, key) DO NOTHING;

NOTIFY pgrst, 'reload schema';


-- ════════════════════════════════════════════════════════
-- MIGRATION 022_users_employee_code.sql
-- ════════════════════════════════════════════════════════
-- ══════════════════════════════════════════════════════════════════════════════
-- JAFSON PRINT ERP — MIGRATION 022: EMPLOYEE CODE ON USERS
-- Fix: the Settings → Users UI (UsersClient.tsx) was already built expecting an
-- employee_code field ("EMP-001" placeholder) but the column never existed on
-- the users table, so create/update requests were failing.
-- ══════════════════════════════════════════════════════════════════════════════

ALTER TABLE users ADD COLUMN employee_code TEXT;

-- One employee code per company (nullable — existing/legacy users may not have one)
CREATE UNIQUE INDEX idx_users_employee_code
  ON users(company_id, employee_code)
  WHERE employee_code IS NOT NULL AND deleted_at IS NULL;

NOTIFY pgrst, 'reload schema';


-- ════════════════════════════════════════════════════════
-- MIGRATION 023_fix_get_accessible_companies.sql
-- ════════════════════════════════════════════════════════
-- ══════════════════════════════════════════════════════════════════════════════
-- JAFSON PRINT ERP — MIGRATION 023: FIX get_accessible_companies()
-- 021_admin.sql referenced a column `u.app_role` that does not exist on the
-- users table (the real column is `role`) — this patches the already-deployed
-- function. The fix has also been applied directly in 021_admin.sql for any
-- future fresh installs.
-- ══════════════════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION get_accessible_companies(p_user_id UUID)
RETURNS TABLE (
  company_id   UUID,
  company_name TEXT,
  is_primary   BOOLEAN,
  user_role    TEXT
) AS $$
BEGIN
  RETURN QUERY
  SELECT
    c.id,
    c.name,
    (u.company_id = c.id) AS is_primary,
    u.role
  FROM users u
  JOIN companies c ON c.id = u.company_id
  WHERE u.id = p_user_id
  UNION
  -- Superadmins can see all companies
  SELECT
    c2.id,
    c2.name,
    FALSE,
    'superadmin'::TEXT
  FROM companies c2
  WHERE EXISTS (
    SELECT 1 FROM users u2
    WHERE u2.id = p_user_id AND u2.role IN ('superadmin','super_admin')
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

NOTIFY pgrst, 'reload schema';


-- ════════════════════════════════════════════════════════
-- MIGRATION 025_partition_auto_maintenance.sql
-- ════════════════════════════════════════════════════════
-- ══════════════════════════════════════════════════════════════════════════════
-- JAFSON PRINT ERP — MIGRATION 025: PARTITION AUTO-MAINTENANCE
--
-- audit_log and activity_log are both partitioned by month, but only the
-- partitions created in 003_audit_notifications.sql exist (audit_log through
-- Feb 2027, activity_log through Jan 2027) — nothing was ever set up to create
-- the next month's partition automatically. Since almost every business table
-- has an audit trigger, the first write after the last partition's date range
-- would fail with "no partition of relation audit_log found for row" and take
-- down writes across the app.
--
-- Fix: a function that creates any missing partitions N months ahead for both
-- tables, run once now and scheduled monthly via pg_cron so this can never run
-- out again.
-- ══════════════════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION ensure_future_partitions(p_months_ahead INT DEFAULT 6)
RETURNS void AS $$
DECLARE
  target_tables TEXT[] := ARRAY['audit_log', 'activity_log'];
  tbl             TEXT;
  i               INT;
  partition_start DATE;
  partition_end   DATE;
  partition_name  TEXT;
BEGIN
  FOREACH tbl IN ARRAY target_tables LOOP
    FOR i IN 0..p_months_ahead LOOP
      partition_start := (date_trunc('month', now()) + (i || ' months')::INTERVAL)::DATE;
      partition_end    := (partition_start + INTERVAL '1 month')::DATE;
      partition_name   := tbl || '_' || to_char(partition_start, 'YYYY_MM');

      IF NOT EXISTS (SELECT 1 FROM pg_class WHERE relname = partition_name) THEN
        EXECUTE format(
          'CREATE TABLE %I PARTITION OF %I FOR VALUES FROM (%L) TO (%L)',
          partition_name, tbl, partition_start, partition_end
        );
        RAISE NOTICE 'Created partition %', partition_name;
      END IF;
    END LOOP;
  END LOOP;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Top up partitions right now regardless of whether pg_cron ends up enabled below.
SELECT ensure_future_partitions(6);

-- Schedule monthly auto-maintenance via pg_cron, if the extension is available.
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_cron') THEN
    PERFORM cron.schedule(
      'ensure-future-partitions-monthly',
      '0 0 1 * *', -- 1st of every month, midnight UTC
      $sched$SELECT ensure_future_partitions(6);$sched$
    );
    RAISE NOTICE 'pg_cron job "ensure-future-partitions-monthly" scheduled.';
  ELSE
    RAISE NOTICE 'pg_cron extension is not enabled, so partitions will NOT auto-create going forward. Enable it in Supabase Dashboard -> Database -> Extensions -> pg_cron, then re-run this migration file.';
  END IF;
END $$;

NOTIFY pgrst, 'reload schema';


-- ════════════════════════════════════════════════════════
-- MIGRATION 026_reports_security_invoker.sql
-- ════════════════════════════════════════════════════════
-- ══════════════════════════════════════════════════════════════════════════════
-- JAFSON PRINT ERP — MIGRATION 026: REPORTS RLS DEFENSE-IN-DEPTH
--
-- The 6 report views in 020_reports.sql have no RLS of their own — views
-- created by a migration (which runs as a role with BYPASSRLS) execute with
-- that role's privileges by default, so they silently bypass RLS on the
-- underlying jobs/customers/invoices/etc. tables entirely.
--
-- Today the only thing preventing a cross-tenant data leak through these views
-- is that src/app/api/v1/reports/route.ts happens to add .eq('company_id', ...)
-- on every query. That's correct, but it's the *only* layer of defense — a
-- single missed filter in a future change, or any other caller (including a
-- direct Supabase client call from the browser), would expose every company's
-- job, sales, and financial data through these views.
--
-- security_invoker (Postgres 15+) makes a view enforce RLS as the querying
-- user instead of the view's owner, closing that gap at the database level as
-- a backstop — regardless of what the application code does or forgets to do.
-- ══════════════════════════════════════════════════════════════════════════════

ALTER VIEW report_job_turnaround      SET (security_invoker = true);
ALTER VIEW report_customer_sales      SET (security_invoker = true);
ALTER VIEW report_monthly_production  SET (security_invoker = true);
ALTER VIEW report_financial_summary   SET (security_invoker = true);
ALTER VIEW report_machine_utilization SET (security_invoker = true);
ALTER VIEW report_qc_analysis         SET (security_invoker = true);

NOTIFY pgrst, 'reload schema';


-- ════════════════════════════════════════════════════════
-- MIGRATION 027_grain_direction.sql
-- ════════════════════════════════════════════════════════
-- ══════════════════════════════════════════════════════════════════════════════
-- JAFSON PRINT ERP — MIGRATION 027: GRAIN DIRECTION
-- Printing-industry paper/board spec field — was missing entirely from the
-- schema despite being on the required feature checklist.
-- ══════════════════════════════════════════════════════════════════════════════

ALTER TABLE jobs ADD COLUMN grain_direction TEXT
  CHECK (grain_direction IN ('long_grain', 'short_grain'));

NOTIFY pgrst, 'reload schema';


-- ════════════════════════════════════════════════════════
-- MIGRATION 028_wastage_tracking.sql
-- ════════════════════════════════════════════════════════
-- ══════════════════════════════════════════════════════════════════════════════
-- JAFSON PRINT ERP — MIGRATION 028: WASTAGE TRACKING
-- Printing-industry cost-control feature — was missing entirely from the
-- schema despite being on the required feature checklist. Follows the same
-- pattern as delay_reasons (company-scoped lookup table + soft delete).
-- ══════════════════════════════════════════════════════════════════════════════

CREATE TABLE wastage_reasons (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id  UUID NOT NULL REFERENCES companies(id),
  name        TEXT NOT NULL,
  category    TEXT NOT NULL DEFAULT 'general'
              CHECK (category IN ('setup','machine_fault','material_defect','operator_error','color_mismatch','damaged','general')),
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_by  UUID, updated_by UUID, deleted_at TIMESTAMPTZ,
  is_active   BOOLEAN NOT NULL DEFAULT TRUE,
  UNIQUE (company_id, name)
);

CREATE INDEX idx_wastage_reasons_company ON wastage_reasons(company_id);
CREATE TRIGGER trg_wastage_reasons_upd BEFORE UPDATE ON wastage_reasons FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
ALTER TABLE wastage_reasons ENABLE ROW LEVEL SECURITY;
CREATE POLICY wastage_reasons_tenant ON wastage_reasons USING (company_id = (auth.jwt() ->> 'company_id')::UUID);

INSERT INTO wastage_reasons (company_id, name, category) VALUES
  ('00000000-0000-0000-0000-000000000001', 'Machine Setup Waste',      'setup'),
  ('00000000-0000-0000-0000-000000000001', 'Machine Fault / Jam',      'machine_fault'),
  ('00000000-0000-0000-0000-000000000001', 'Material Defect',         'material_defect'),
  ('00000000-0000-0000-0000-000000000001', 'Operator Error',           'operator_error'),
  ('00000000-0000-0000-0000-000000000001', 'Colour / Print Mismatch',  'color_mismatch'),
  ('00000000-0000-0000-0000-000000000001', 'Torn / Damaged Sheet',     'damaged'),
  ('00000000-0000-0000-0000-000000000001', 'Other',                    'general');

-- ─── WASTAGE RECORDS ────────────────────────────────────────────────────────
CREATE TABLE job_wastage (
  id                 UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id         UUID NOT NULL REFERENCES companies(id),
  job_id             UUID NOT NULL REFERENCES jobs(id) ON DELETE CASCADE,
  stage_progress_id  UUID REFERENCES job_stage_progress(id),
  machine_id         UUID REFERENCES machines(id),
  wastage_reason_id  UUID NOT NULL REFERENCES wastage_reasons(id),
  quantity            NUMERIC(12,2) NOT NULL CHECK (quantity > 0),
  notes              TEXT,
  recorded_by        UUID REFERENCES users(id),
  occurred_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_at         TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at         TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_by UUID, updated_by UUID, deleted_at TIMESTAMPTZ,
  is_active  BOOLEAN NOT NULL DEFAULT TRUE
);

CREATE INDEX idx_job_wastage_job     ON job_wastage(job_id, occurred_at DESC);
CREATE INDEX idx_job_wastage_company ON job_wastage(company_id, occurred_at DESC);
CREATE INDEX idx_job_wastage_machine ON job_wastage(machine_id);
CREATE TRIGGER trg_job_wastage_upd BEFORE UPDATE ON job_wastage FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
ALTER TABLE job_wastage ENABLE ROW LEVEL SECURITY;
CREATE POLICY job_wastage_tenant ON job_wastage USING (company_id = (auth.jwt() ->> 'company_id')::UUID);
CREATE TRIGGER trg_audit_job_wastage AFTER INSERT OR UPDATE OR DELETE ON job_wastage
  FOR EACH ROW EXECUTE FUNCTION log_audit_event();

-- ─── REPORT: WASTAGE SUMMARY (for Reports module, same pattern as report_*) ──
CREATE OR REPLACE VIEW report_wastage_summary AS
SELECT
  jw.company_id,
  DATE_TRUNC('month', jw.occurred_at)  AS month,
  TO_CHAR(jw.occurred_at, 'Mon YYYY')  AS month_label,
  wr.category                          AS reason_category,
  wr.name                              AS reason_name,
  m.name                               AS machine_name,
  COUNT(*)                             AS wastage_events,
  COALESCE(SUM(jw.quantity), 0)        AS total_quantity
FROM job_wastage jw
JOIN wastage_reasons wr ON wr.id = jw.wastage_reason_id
LEFT JOIN machines m ON m.id = jw.machine_id
WHERE jw.deleted_at IS NULL
GROUP BY jw.company_id, DATE_TRUNC('month', jw.occurred_at), TO_CHAR(jw.occurred_at, 'Mon YYYY'), wr.category, wr.name, m.name
ORDER BY month DESC;

ALTER VIEW report_wastage_summary SET (security_invoker = true);

-- ─── FIX: machine_floor_status had the same RLS-bypass gap as the report_*
-- views (noted in the audit) — it's a view with no RLS of its own, created by
-- a role that bypasses RLS on the underlying tables. Close it the same way.
ALTER VIEW machine_floor_status SET (security_invoker = true);

-- Let wastage entries show up in the job timeline alongside hold/resume/etc.
ALTER TABLE job_stage_events DROP CONSTRAINT job_stage_events_event_type_check;
ALTER TABLE job_stage_events ADD CONSTRAINT job_stage_events_event_type_check
  CHECK (event_type IN (
    'created','status_changed','stage_started','stage_completed',
    'stage_skipped','hold_started','hold_ended','remark_added',
    'artwork_uploaded','repeat_created','assigned','priority_changed',
    'wastage_recorded'
  ));

NOTIFY pgrst, 'reload schema';


-- ════════════════════════════════════════════════════════
-- MIGRATION 029_fix_jwt_hook_null_crash.sql
-- ════════════════════════════════════════════════════════
-- ══════════════════════════════════════════════════════════════════════════════
-- JAFSON PRINT ERP — MIGRATION 029: FIX custom_access_token_hook NULL crash
--
-- The hook used chained jsonb_set() calls to add claims. jsonb_set() is a
-- STRICT function — if any argument is NULL (e.g. a user's department_id is
-- NULL, which is normal for users with no department assigned), the whole
-- call returns NULL, which then poisons every subsequent jsonb_set() in the
-- chain and makes the hook return NULL entirely. Supabase then rejects the
-- token with "output claims do not conform to the expected schema" and the
-- user cannot log in at all.
--
-- Fix: jsonb_build_object + the || merge operator, which encode NULL field
-- values as JSON null instead of erroring. Source also updated in
-- 002_auth_users.sql for future fresh installs.
-- ══════════════════════════════════════════════════════════════════════════════

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

  claims := COALESCE(event -> 'claims', '{}'::jsonb);

  IF user_rec.company_id IS NOT NULL THEN
    claims := claims || jsonb_build_object(
      'company_id',    user_rec.company_id::TEXT,
      'role',          user_rec.role,
      'department_id', user_rec.department_id::TEXT,
      'full_name',     user_rec.full_name,
      'user_table_id', user_rec.user_table_id::TEXT
    );
  END IF;

  RETURN jsonb_set(event, '{claims}', claims);
END;
$$ LANGUAGE plpgsql STABLE SECURITY DEFINER;

NOTIFY pgrst, 'reload schema';


-- ════════════════════════════════════════════════════════
-- MIGRATION 030_fix_reserved_role_claim.sql
-- ════════════════════════════════════════════════════════
-- ══════════════════════════════════════════════════════════════════════════════
-- JAFSON PRINT ERP — MIGRATION 030: FIX RESERVED 'role' JWT CLAIM
--
-- custom_access_token_hook set a top-level 'role' claim to the user's
-- application role (e.g. 'superadmin'). The top-level 'role' claim in a
-- Supabase JWT is RESERVED — PostgREST reads it to decide which Postgres
-- database role to connect as for that request. Since no Postgres role
-- literally named 'superadmin' (or 'sales', 'staff', etc.) exists, PostgREST
-- fails every query for that user with "role \"<value>\" does not exist".
--
-- Fix: rename the claim to 'app_role'. The application code already expects
-- this name (src/modules/settings/permissions/hooks/usePermission.ts and
-- src/app/api/v1/admin/companies/route.ts read claims.app_role, not
-- claims.role) — this migration makes the hook actually match that.
-- ══════════════════════════════════════════════════════════════════════════════

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

  claims := COALESCE(event -> 'claims', '{}'::jsonb);

  IF user_rec.company_id IS NOT NULL THEN
    claims := claims || jsonb_build_object(
      'company_id',    user_rec.company_id::TEXT,
      'app_role',      user_rec.role,
      'department_id', user_rec.department_id::TEXT,
      'full_name',     user_rec.full_name,
      'user_table_id', user_rec.user_table_id::TEXT
    );
  END IF;

  RETURN jsonb_set(event, '{claims}', claims);
END;
$$ LANGUAGE plpgsql STABLE SECURITY DEFINER;

NOTIFY pgrst, 'reload schema';


-- ════════════════════════════════════════════════════════
-- MIGRATION 031_missing_permission_modules.sql
-- ════════════════════════════════════════════════════════
-- ══════════════════════════════════════════════════════════════════════════════
-- JAFSON PRINT ERP — MIGRATION 031: MISSING PERMISSION MODULES
--
-- 005_permissions.sql only seeded 21 of the app's ~27 real modules — finance,
-- qc, workflow, machines, production, and admin had no permission rows at
-- all. Since non-superadmin roles start with zero permissions until granted,
-- and now that RBAC checks are actually being wired into API routes (see
-- requirePermission.ts), any staff role would have been silently unable to
-- ever be granted access to those modules through the Settings > Permissions
-- UI — the modules simply wouldn't have appeared as options.
-- ══════════════════════════════════════════════════════════════════════════════

DO $$
DECLARE
  cid UUID := '00000000-0000-0000-0000-000000000001';
  modules TEXT[] := ARRAY['finance','qc','workflow','machines','production','admin'];
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

  -- Give the superadmin role these new permissions too (it already has every
  -- other module's permissions from 005_permissions.sql's seed).
  INSERT INTO role_permissions (company_id, role_id, permission_id)
  SELECT cid, r.id, p.id
  FROM roles r
  CROSS JOIN permissions p
  WHERE r.company_id = cid
    AND r.slug = 'superadmin'
    AND p.module = ANY(modules)
  ON CONFLICT DO NOTHING;
END $$;

NOTIFY pgrst, 'reload schema';


-- ════════════════════════════════════════════════════════
-- MIGRATION 032_mrn_inventory_consumption.sql
-- ════════════════════════════════════════════════════════
-- ══════════════════════════════════════════════════════════════════════════════
-- JAFSON PRINT ERP — MIGRATION 032: MRN → BOARD INVENTORY AUTO-CONSUMPTION
--
-- material_requisition_items only ever had a free-text material_name — there
-- was no link to a specific board_inventory row, so issuing an MRN never
-- touched board_inventory.current_stock or created a board_inventory_movements
-- record. "Inventory Consumption" was effectively unimplemented despite the
-- movements table already existing for exactly this purpose.
-- ══════════════════════════════════════════════════════════════════════════════

ALTER TABLE material_requisition_items
  ADD COLUMN board_item_id UUID REFERENCES board_inventory(id);

CREATE INDEX idx_mrn_items_board_item ON material_requisition_items(board_item_id);

NOTIFY pgrst, 'reload schema';


-- ════════════════════════════════════════════════════════
-- MIGRATION 033_invoices_tax_fk.sql
-- ════════════════════════════════════════════════════════
-- ══════════════════════════════════════════════════════════════════════════════
-- JAFSON PRINT ERP — MIGRATION 033: TAX FK ON INVOICES
-- invoices.tax_pct/tax_amount were free-floating numbers with no link back to
-- a configured tax rule — unlike quotations.tax_id and sales_orders.tax_id,
-- which both already reference the taxes table.
-- ══════════════════════════════════════════════════════════════════════════════

ALTER TABLE invoices ADD COLUMN tax_id UUID REFERENCES taxes(id);

NOTIFY pgrst, 'reload schema';


-- ════════════════════════════════════════════════════════
-- MIGRATION 034_board_inventory_vendor_fk.sql
-- ════════════════════════════════════════════════════════
-- ══════════════════════════════════════════════════════════════════════════════
-- JAFSON PRINT ERP — MIGRATION 034: MISSING FK ON board_inventory.vendor_id
-- board_inventory.vendor_id was a plain UUID with no REFERENCES clause, unlike
-- purchase_orders.vendor_id which correctly references vendors(id) — meaning
-- board_inventory could silently point at a vendor that doesn't exist.
-- ══════════════════════════════════════════════════════════════════════════════

-- Defensive: null out any orphaned references before adding the constraint,
-- so this migration can never fail on existing data.
UPDATE board_inventory
SET vendor_id = NULL
WHERE vendor_id IS NOT NULL
  AND vendor_id NOT IN (SELECT id FROM vendors);

-- Guarded so this is safe to run whether or not 015_pre_production.sql
-- already added the constraint (it now does, for fresh installs going
-- forward — this migration exists to patch databases where 015 already ran
-- without it).
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'board_inventory_vendor_id_fkey'
  ) THEN
    ALTER TABLE board_inventory
      ADD CONSTRAINT board_inventory_vendor_id_fkey
      FOREIGN KEY (vendor_id) REFERENCES vendors(id);
  END IF;
END $$;

NOTIFY pgrst, 'reload schema';


-- ════════════════════════════════════════════════════════
-- MIGRATION 035_fix_qc_analysis_fanout.sql
-- ════════════════════════════════════════════════════════
-- ══════════════════════════════════════════════════════════════════════════════
-- JAFSON PRINT ERP — MIGRATION 035: FIX report_qc_analysis FAN-OUT BUG
--
-- The view LEFT JOINed reprint_requests to qc_inspections on job_id alone (no
-- date or inspection linkage). Two problems:
--
-- 1. Fan-out: if a job had more than one reprint_request, that job's
--    inspection row was duplicated once per matching reprint BEFORE the
--    GROUP BY/aggregation ran — inflating total_inspections, passed, failed,
--    conditional, pass_rate_pct, and total_defects (COUNT(DISTINCT rpr.id)
--    only protected the reprint_requests count itself, not the other
--    aggregates in the same row).
-- 2. Misattribution: a job's reprint could get counted against every month
--    that job happened to have an inspection in, not the month the reprint
--    was actually requested.
--
-- Fix: aggregate qc_inspections and reprint_requests independently (each to
-- one row per company+month) before joining, so neither side can fan out
-- the other.
-- ══════════════════════════════════════════════════════════════════════════════

CREATE OR REPLACE VIEW report_qc_analysis AS
WITH inspections_agg AS (
  SELECT
    qi.company_id,
    DATE_TRUNC('month', qi.created_at)              AS month,
    TO_CHAR(qi.created_at, 'Mon YYYY')              AS month_label,
    COUNT(*)                                         AS total_inspections,
    COUNT(*) FILTER (WHERE qi.result = 'pass')       AS passed,
    COUNT(*) FILTER (WHERE qi.result = 'fail')       AS failed,
    COUNT(*) FILTER (WHERE qi.result = 'conditional_pass') AS conditional,
    ROUND(
      100.0 * COUNT(*) FILTER (WHERE qi.result = 'pass')
      / NULLIF(COUNT(*) FILTER (WHERE qi.result IS NOT NULL), 0), 1
    )                                                AS pass_rate_pct,
    COALESCE(SUM(qi.defect_count), 0)               AS total_defects
  FROM qc_inspections qi
  WHERE qi.deleted_at IS NULL
  GROUP BY qi.company_id, DATE_TRUNC('month', qi.created_at), TO_CHAR(qi.created_at, 'Mon YYYY')
),
reprints_agg AS (
  SELECT
    rpr.company_id,
    DATE_TRUNC('month', rpr.created_at) AS month,
    COUNT(*)                            AS reprint_requests
  FROM reprint_requests rpr
  WHERE rpr.deleted_at IS NULL
  GROUP BY rpr.company_id, DATE_TRUNC('month', rpr.created_at)
)
SELECT
  ia.company_id,
  ia.month,
  ia.month_label,
  ia.total_inspections,
  ia.passed,
  ia.failed,
  ia.conditional,
  ia.pass_rate_pct,
  ia.total_defects,
  COALESCE(ra.reprint_requests, 0) AS reprint_requests
FROM inspections_agg ia
LEFT JOIN reprints_agg ra ON ra.company_id = ia.company_id AND ra.month = ia.month
ORDER BY ia.month DESC;

ALTER VIEW report_qc_analysis SET (security_invoker = true);

NOTIFY pgrst, 'reload schema';


-- ════════════════════════════════════════════════════════
-- MIGRATION 036_storage_buckets.sql
-- ════════════════════════════════════════════════════════
-- ══════════════════════════════════════════════════════════════════════════════
-- JAFSON PRINT ERP — MIGRATION 036: REAL FILE STORAGE FOR ARTWORK & QC PHOTOS
--
-- Neither artwork upload nor QC defect photos ever actually used Supabase
-- Storage — artwork's "file_url" was a plain text box for pasting a URL, and
-- qc_defects.photo_url had no upload UI behind it at all. This sets up real
-- storage buckets with tenant-scoped RLS policies.
--
-- Convention: every object path starts with the uploader's company_id as the
-- first folder segment (e.g. "{company_id}/{job_id}/filename.pdf"), and RLS
-- policies check that prefix against the JWT's company_id claim — the same
-- tenant-isolation pattern used everywhere else in this schema.
-- ══════════════════════════════════════════════════════════════════════════════

-- ─── BUCKETS ──────────────────────────────────────────────────────────────────
INSERT INTO storage.buckets (id, name, public)
VALUES ('artwork', 'artwork', false)
ON CONFLICT (id) DO NOTHING;

INSERT INTO storage.buckets (id, name, public)
VALUES ('qc-photos', 'qc-photos', false)
ON CONFLICT (id) DO NOTHING;

-- ─── ARTWORK BUCKET POLICIES ──────────────────────────────────────────────────
DROP POLICY IF EXISTS artwork_tenant_select ON storage.objects;
CREATE POLICY artwork_tenant_select ON storage.objects FOR SELECT
  USING (bucket_id = 'artwork' AND (storage.foldername(name))[1] = (auth.jwt() ->> 'company_id'));

DROP POLICY IF EXISTS artwork_tenant_insert ON storage.objects;
CREATE POLICY artwork_tenant_insert ON storage.objects FOR INSERT
  WITH CHECK (bucket_id = 'artwork' AND (storage.foldername(name))[1] = (auth.jwt() ->> 'company_id'));

DROP POLICY IF EXISTS artwork_tenant_update ON storage.objects;
CREATE POLICY artwork_tenant_update ON storage.objects FOR UPDATE
  USING (bucket_id = 'artwork' AND (storage.foldername(name))[1] = (auth.jwt() ->> 'company_id'));

DROP POLICY IF EXISTS artwork_tenant_delete ON storage.objects;
CREATE POLICY artwork_tenant_delete ON storage.objects FOR DELETE
  USING (bucket_id = 'artwork' AND (storage.foldername(name))[1] = (auth.jwt() ->> 'company_id'));

-- ─── QC-PHOTOS BUCKET POLICIES ────────────────────────────────────────────────
DROP POLICY IF EXISTS qc_photos_tenant_select ON storage.objects;
CREATE POLICY qc_photos_tenant_select ON storage.objects FOR SELECT
  USING (bucket_id = 'qc-photos' AND (storage.foldername(name))[1] = (auth.jwt() ->> 'company_id'));

DROP POLICY IF EXISTS qc_photos_tenant_insert ON storage.objects;
CREATE POLICY qc_photos_tenant_insert ON storage.objects FOR INSERT
  WITH CHECK (bucket_id = 'qc-photos' AND (storage.foldername(name))[1] = (auth.jwt() ->> 'company_id'));

DROP POLICY IF EXISTS qc_photos_tenant_update ON storage.objects;
CREATE POLICY qc_photos_tenant_update ON storage.objects FOR UPDATE
  USING (bucket_id = 'qc-photos' AND (storage.foldername(name))[1] = (auth.jwt() ->> 'company_id'));

DROP POLICY IF EXISTS qc_photos_tenant_delete ON storage.objects;
CREATE POLICY qc_photos_tenant_delete ON storage.objects FOR DELETE
  USING (bucket_id = 'qc-photos' AND (storage.foldername(name))[1] = (auth.jwt() ->> 'company_id'));

-- ─── qc_defects: support multiple photos ──────────────────────────────────────
-- photo_url (single, legacy) is kept as-is for backward compatibility with any
-- existing rows; photo_urls is the new array column the UI now writes to.
ALTER TABLE qc_defects ADD COLUMN IF NOT EXISTS photo_urls TEXT[] NOT NULL DEFAULT '{}';

-- ─── qc_defects: inspection_id was NOT NULL, but the standalone "Log Defect"
-- flow (QCClient.tsx) has no inspection picker and always submitted an empty
-- string for it — meaning every defect logged that way was failing this
-- constraint. A defect can legitimately be spotted on the floor without a
-- formal inspection behind it, so this is now optional.
ALTER TABLE qc_defects ALTER COLUMN inspection_id DROP NOT NULL;

NOTIFY pgrst, 'reload schema';


-- ════════════════════════════════════════════════════════
-- MIGRATION 037_fix_notifications_rls.sql
-- ════════════════════════════════════════════════════════
-- ══════════════════════════════════════════════════════════════════════════════
-- JAFSON PRINT ERP — MIGRATION 037: FIX NOTIFICATIONS RLS
--
-- notifications_own compared user_id = auth.uid() — but notifications.user_id
-- is a FK to public.users(id) (the app's own primary key), while auth.uid()
-- returns the Supabase Auth id, a different UUID entirely. This meant the
-- policy could never match, so no user could ever see their own notifications
-- via RLS — the same id/auth_user_id confusion found and fixed everywhere
-- else in this project (getCompanyId, usePermission, etc.).
--
-- Fix: compare against the user_table_id JWT claim (set by
-- custom_access_token_hook) instead, which already holds the correct
-- public.users.id for the current session.
-- ══════════════════════════════════════════════════════════════════════════════

DROP POLICY IF EXISTS notifications_own ON notifications;
CREATE POLICY notifications_own ON notifications
  USING (
    company_id = (auth.jwt() ->> 'company_id')::UUID
    AND user_id = (auth.jwt() ->> 'user_table_id')::UUID
  );

NOTIFY pgrst, 'reload schema';


-- ════════════════════════════════════════════════════════
-- MIGRATION 038_dispatch_notification_whatsapp_label.sql
-- ════════════════════════════════════════════════════════
-- ══════════════════════════════════════════════════════════════════════════════
-- JAFSON PRINT ERP — MIGRATION 038: DISPATCH NOTIFICATION → WHATSAPP
-- The dispatch_sms setting's label is updated to reflect that dispatch
-- notifications now go out via Meta WhatsApp Cloud API, not generic SMS.
-- The internal key name is left as 'dispatch_sms' (it's not user-facing —
-- only the description is shown in Settings) to avoid touching every place
-- that already references this key.
-- ══════════════════════════════════════════════════════════════════════════════

UPDATE system_settings
SET description = 'Send WhatsApp message on dispatch (via Meta WhatsApp Cloud API)'
WHERE key = 'dispatch_sms';

NOTIFY pgrst, 'reload schema';


-- ════════════════════════════════════════════════════════
-- MIGRATION 039_ups_sheet_qty.sql
-- ════════════════════════════════════════════════════════
-- ══════════════════════════════════════════════════════════════════════════════
-- JAFSON PRINT ERP — MIGRATION 039: UPS / SHEET QTY (SHEET PLANNING)
-- Printing-industry field — "Ups" (how many times the design repeats on one
-- printed sheet) and the derived "Sheet Qty" (Box Qty / Ups, rounded up).
-- This was on the required feature checklist and was previously documented
-- as a locked-in decision, but never actually existed in the schema or code.
-- ══════════════════════════════════════════════════════════════════════════════

ALTER TABLE jobs ADD COLUMN ups INTEGER CHECK (ups > 0);
ALTER TABLE jobs ADD COLUMN sheet_qty INTEGER;

NOTIFY pgrst, 'reload schema';


-- ════════════════════════════════════════════════════════
-- MIGRATION 040_crm_pipeline_stage.sql
-- ════════════════════════════════════════════════════════
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


-- ════════════════════════════════════════════════════════
-- MIGRATION 041_fix_customer_sales_fanout.sql
-- ════════════════════════════════════════════════════════
-- ══════════════════════════════════════════════════════════════════════════════
-- JAFSON PRINT ERP — MIGRATION 041: FIX report_customer_sales FAN-OUT BUG
--
-- The view LEFT JOINed both jobs AND invoices to the same customers row in
-- one query. That's two independent one-to-many relationships joined to the
-- same parent — for a customer with, say, 3 jobs and 2 invoices, the join
-- produces 3 × 2 = 6 rows before the GROUP BY runs.
--
-- COUNT(DISTINCT j.id) / COUNT(DISTINCT inv.id) were protected from this by
-- DISTINCT, but SUM(j.quoted_amount), SUM(inv.total_amount),
-- SUM(inv.paid_amount), and SUM(inv.balance_due) were NOT — each job's
-- quoted_amount got summed once per invoice row it was paired with (and vice
-- versa), so Total Quoted / Total Invoiced / Total Paid / Total Outstanding
-- were all inflated for any customer with more than one job AND more than
-- one invoice — a very common case.
--
-- Fix: aggregate jobs and invoices independently (each to one row per
-- customer) before joining, so neither side can fan out the other — same
-- pattern used to fix report_qc_analysis in migration 035.
-- ══════════════════════════════════════════════════════════════════════════════

CREATE OR REPLACE VIEW report_customer_sales AS
WITH jobs_agg AS (
  SELECT
    j.customer_id,
    COUNT(*)                                              AS total_jobs,
    COUNT(*) FILTER (WHERE j.status = 'completed')        AS completed_jobs,
    COUNT(*) FILTER (WHERE j.status = 'dispatched')        AS dispatched_jobs,
    COUNT(*) FILTER (WHERE j.status = 'cancelled')          AS cancelled_jobs,
    COALESCE(SUM(j.quoted_amount), 0)                     AS total_quoted,
    MAX(j.created_at)                                     AS last_job_date,
    MIN(j.created_at)                                     AS first_job_date
  FROM jobs j
  WHERE j.deleted_at IS NULL
  GROUP BY j.customer_id
),
invoices_agg AS (
  SELECT
    inv.customer_id,
    COALESCE(SUM(inv.total_amount), 0)  AS total_invoiced,
    COALESCE(SUM(inv.paid_amount), 0)   AS total_paid,
    COALESCE(SUM(inv.balance_due), 0)   AS total_outstanding,
    COUNT(*)                            AS invoice_count
  FROM invoices inv
  WHERE inv.deleted_at IS NULL
  GROUP BY inv.customer_id
)
SELECT
  c.id                                              AS customer_id,
  c.company_id,
  c.name                                            AS customer_name,
  c.customer_code,
  c.industry,
  COALESCE(ja.total_jobs, 0)                        AS total_jobs,
  COALESCE(ja.completed_jobs, 0)                    AS completed_jobs,
  COALESCE(ja.dispatched_jobs, 0)                   AS dispatched_jobs,
  COALESCE(ja.cancelled_jobs, 0)                    AS cancelled_jobs,
  COALESCE(ja.total_quoted, 0)                      AS total_quoted,
  COALESCE(ia.total_invoiced, 0)                    AS total_invoiced,
  COALESCE(ia.total_paid, 0)                        AS total_paid,
  COALESCE(ia.total_outstanding, 0)                 AS total_outstanding,
  COALESCE(ia.invoice_count, 0)                     AS invoice_count,
  ja.last_job_date,
  ja.first_job_date
FROM customers c
LEFT JOIN jobs_agg ja     ON ja.customer_id = c.id
LEFT JOIN invoices_agg ia ON ia.customer_id = c.id
WHERE c.deleted_at IS NULL AND c.is_active = TRUE;

ALTER VIEW report_customer_sales SET (security_invoker = true);

NOTIFY pgrst, 'reload schema';


-- ════════════════════════════════════════════════════════
-- MIGRATION 042_plate_management.sql
-- ════════════════════════════════════════════════════════
-- ══════════════════════════════════════════════════════════════════════════════
-- JAFSON PRINT ERP — MIGRATION 042: PLATE MANAGEMENT
--
-- Two tables:
--   plates      — master registry of physical printing plates. A plate is a
--                  reusable asset: it can be made for one job and, if kept in
--                  good condition, reused on a REPEAT job later instead of
--                  remaking (saves plate-making cost, common in offset printing).
--   job_plates  — junction: which plates were assigned to which job, on which
--                  machine, and in what condition they went out / came back.
--                  A plate can appear in job_plates more than once over its
--                  life (original job + every repeat that reused it).
-- ══════════════════════════════════════════════════════════════════════════════

-- ─── PLATES (master registry) ───────────────────────────────────────────────
CREATE TABLE plates (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id            UUID NOT NULL REFERENCES companies(id),
  plate_code            TEXT NOT NULL,
  color                 TEXT NOT NULL,
  die_number            TEXT,
  plate_size            TEXT,
  material              TEXT NOT NULL DEFAULT 'aluminum' CHECK (material IN ('aluminum','polyester','other')),
  status                TEXT NOT NULL DEFAULT 'pending' CHECK (status IN (
                          'pending','in_storage','in_use','damaged','retired'
                        )),
  origin_job_id         UUID REFERENCES jobs(id),
  vendor_id             UUID REFERENCES vendors(id),
  cost                  NUMERIC(12,2),
  made_date             DATE,
  storage_location      TEXT,
  reuse_count           INTEGER NOT NULL DEFAULT 0,
  last_used_at          TIMESTAMPTZ,
  retired_reason        TEXT,
  remarks               TEXT,

  created_at            TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at            TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_by            UUID,
  updated_by            UUID,
  deleted_at            TIMESTAMPTZ,
  is_active             BOOLEAN NOT NULL DEFAULT TRUE,

  UNIQUE (company_id, plate_code)
);

CREATE INDEX idx_plates_company    ON plates(company_id);
CREATE INDEX idx_plates_status     ON plates(company_id, status);
CREATE INDEX idx_plates_origin_job ON plates(origin_job_id);

CREATE TRIGGER trg_plates_updated_at BEFORE UPDATE ON plates
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

ALTER TABLE plates ENABLE ROW LEVEL SECURITY;
CREATE POLICY plates_tenant ON plates
  USING (company_id = (auth.jwt() ->> 'company_id')::UUID);

CREATE TRIGGER trg_audit_plates AFTER INSERT OR UPDATE OR DELETE ON plates
  FOR EACH ROW EXECUTE FUNCTION log_audit_event();

-- ─── JOB_PLATES (assignment junction) ───────────────────────────────────────
CREATE TABLE job_plates (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id            UUID NOT NULL REFERENCES companies(id),
  job_id                UUID NOT NULL REFERENCES jobs(id),
  plate_id              UUID NOT NULL REFERENCES plates(id),
  machine_id            UUID REFERENCES machines(id),
  is_reused             BOOLEAN NOT NULL DEFAULT FALSE,
  assigned_at           TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  returned_at           TIMESTAMPTZ,
  condition_on_assign   TEXT CHECK (condition_on_assign IN ('new','good','worn','damaged')),
  condition_on_return   TEXT CHECK (condition_on_return IN ('good','worn','damaged','discarded')),
  remarks               TEXT,

  created_at            TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at            TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_by            UUID,
  updated_by            UUID,
  deleted_at            TIMESTAMPTZ,
  is_active             BOOLEAN NOT NULL DEFAULT TRUE,

  UNIQUE (company_id, job_id, plate_id)
);

CREATE INDEX idx_job_plates_job   ON job_plates(job_id);
CREATE INDEX idx_job_plates_plate ON job_plates(plate_id);

CREATE TRIGGER trg_job_plates_updated_at BEFORE UPDATE ON job_plates
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

ALTER TABLE job_plates ENABLE ROW LEVEL SECURITY;
CREATE POLICY job_plates_tenant ON job_plates
  USING (company_id = (auth.jwt() ->> 'company_id')::UUID);

CREATE TRIGGER trg_audit_job_plates AFTER INSERT OR UPDATE OR DELETE ON job_plates
  FOR EACH ROW EXECUTE FUNCTION log_audit_event();

-- ─── ATOMIC REUSE HELPER ─────────────────────────────────────────────────────
-- Called when an existing stored plate is assigned to a (repeat) job, so
-- concurrent assignment requests can't race on reading-then-writing reuse_count.
CREATE OR REPLACE FUNCTION mark_plate_reused(p_plate_id UUID)
RETURNS VOID
LANGUAGE plpgsql
SECURITY INVOKER
AS $$
BEGIN
  UPDATE plates
  SET status = 'in_use',
      reuse_count = reuse_count + 1,
      last_used_at = NOW()
  WHERE id = p_plate_id;
END;
$$;

-- ─── JOB TIMELINE: allow plate events alongside hold/wastage/etc ───────────────
ALTER TABLE job_stage_events DROP CONSTRAINT job_stage_events_event_type_check;
ALTER TABLE job_stage_events ADD CONSTRAINT job_stage_events_event_type_check
  CHECK (event_type IN (
    'created','status_changed','stage_started','stage_completed',
    'stage_skipped','hold_started','hold_ended','remark_added',
    'artwork_uploaded','repeat_created','assigned','priority_changed',
    'wastage_recorded','plate_assigned','plate_returned'
  ));

-- ─── PERMISSION MODULE SEED (pattern from 031_missing_permission_modules.sql) ──
DO $$
DECLARE
  cid UUID := '00000000-0000-0000-0000-000000000001';
  actions TEXT[] := ARRAY['view','create','edit','delete','approve','reject','print','export','settings'];
  a TEXT;
BEGIN
  FOREACH a IN ARRAY actions LOOP
    INSERT INTO permissions (company_id, module, action, label)
    VALUES (cid, 'plates', a, 'Plates — ' || initcap(a))
    ON CONFLICT (company_id, module, action) DO NOTHING;
  END LOOP;

  INSERT INTO role_permissions (company_id, role_id, permission_id)
  SELECT cid, r.id, p.id
  FROM roles r
  CROSS JOIN permissions p
  WHERE r.company_id = cid
    AND r.slug = 'superadmin'
    AND p.module = 'plates'
  ON CONFLICT DO NOTHING;
END $$;

NOTIFY pgrst, 'reload schema';


-- ════════════════════════════════════════════════════════
-- MIGRATION 043_job_costing_autolink.sql
-- ════════════════════════════════════════════════════════
-- ══════════════════════════════════════════════════════════════════════════════
-- JAFSON PRINT ERP — MIGRATION 043: JOB COSTING AUTO-LINK
--
-- job_costings was a fully manual sheet — nothing wrote to it except the
-- Finance costing form. This adds an atomic accrual function that other
-- modules call whenever an ACTUAL cost is incurred against a job:
--   • Store issues material against an MRN linked to a job (board/paper/ink/
--     lamination/foil consumption at board_inventory.unit_cost)
--   • A new plate is made for a job (plates.cost)
--   • A stored plate is reused for a (repeat) job (no cost, but still counts
--     toward printing_plates so the sheet reflects how many plates ran)
--
-- The function is additive/idempotent-safe: it upserts a job_costings row on
-- first call, adds the delta to the right bucket, then recomputes
-- overhead_amount / total_cost / margin fresh from the current bucket values
-- (never from a stale total_cost), so repeated calls can't double-count.
-- Values it writes remain fully editable afterwards from the manual Finance
-- costing form — that form's Save still overwrites with whatever's on screen,
-- which is pre-filled from this same row.
-- ══════════════════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION apply_job_actual_cost(
  p_company_id    UUID,
  p_job_id        UUID,
  p_bucket        TEXT,               -- 'board','printing','plate','ink','lamination','foiling','uv','die_cutting','pasting','other'
  p_amount        NUMERIC DEFAULT 0,  -- cost delta to add to that bucket
  p_sheets_delta  NUMERIC DEFAULT NULL,
  p_plates_delta  INTEGER DEFAULT NULL
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY INVOKER
AS $$
BEGIN
  IF p_bucket NOT IN ('board','printing','plate','ink','lamination','foiling','uv','die_cutting','pasting','other') THEN
    RAISE EXCEPTION 'apply_job_actual_cost: unknown bucket %', p_bucket;
  END IF;

  INSERT INTO job_costings (company_id, job_id)
  VALUES (p_company_id, p_job_id)
  ON CONFLICT (company_id, job_id) DO NOTHING;

  UPDATE job_costings SET
    board_cost       = board_cost + CASE WHEN p_bucket = 'board'    THEN p_amount ELSE 0 END,
    board_sheets     = COALESCE(board_sheets, 0) + COALESCE(p_sheets_delta, 0),
    printing_cost    = printing_cost + CASE WHEN p_bucket = 'printing' THEN p_amount ELSE 0 END,
    printing_plates  = COALESCE(printing_plates, 0) + COALESCE(p_plates_delta, 0),
    plate_cost       = COALESCE(plate_cost, 0) + CASE WHEN p_bucket = 'plate'      THEN p_amount ELSE 0 END,
    ink_cost         = COALESCE(ink_cost, 0)  + CASE WHEN p_bucket = 'ink'         THEN p_amount ELSE 0 END,
    lamination_cost  = COALESCE(lamination_cost, 0) + CASE WHEN p_bucket = 'lamination' THEN p_amount ELSE 0 END,
    foiling_cost     = COALESCE(foiling_cost, 0)    + CASE WHEN p_bucket = 'foiling'    THEN p_amount ELSE 0 END,
    uv_cost          = COALESCE(uv_cost, 0)         + CASE WHEN p_bucket = 'uv'         THEN p_amount ELSE 0 END,
    die_cutting_cost = COALESCE(die_cutting_cost, 0) + CASE WHEN p_bucket = 'die_cutting' THEN p_amount ELSE 0 END,
    pasting_cost     = COALESCE(pasting_cost, 0)    + CASE WHEN p_bucket = 'pasting'    THEN p_amount ELSE 0 END,
    other_finishing  = COALESCE(other_finishing, 0) + CASE WHEN p_bucket = 'other'      THEN p_amount ELSE 0 END,
    updated_at       = NOW()
  WHERE company_id = p_company_id AND job_id = p_job_id;

  -- Recompute overhead fresh from current direct-cost buckets (not additive).
  UPDATE job_costings jc SET
    overhead_amount = ROUND((
      jc.board_cost + jc.printing_cost + COALESCE(jc.plate_cost,0) + COALESCE(jc.ink_cost,0) +
      COALESCE(jc.lamination_cost,0) + COALESCE(jc.foiling_cost,0) + COALESCE(jc.uv_cost,0) +
      COALESCE(jc.die_cutting_cost,0) + COALESCE(jc.pasting_cost,0) + COALESCE(jc.other_finishing,0) +
      COALESCE(jc.labour_cost,0)
    ) * COALESCE(jc.overhead_pct, 0) / 100, 2)
  WHERE jc.company_id = p_company_id AND jc.job_id = p_job_id;

  -- Recompute total_cost + margin fresh from current buckets + overhead.
  UPDATE job_costings jc SET
    total_cost = jc.board_cost + jc.printing_cost + COALESCE(jc.plate_cost,0) + COALESCE(jc.ink_cost,0) +
      COALESCE(jc.lamination_cost,0) + COALESCE(jc.foiling_cost,0) + COALESCE(jc.uv_cost,0) +
      COALESCE(jc.die_cutting_cost,0) + COALESCE(jc.pasting_cost,0) + COALESCE(jc.other_finishing,0) +
      COALESCE(jc.labour_cost,0) + COALESCE(jc.overhead_amount,0),
    margin_amount = CASE WHEN jc.quoted_amount IS NOT NULL THEN
      jc.quoted_amount - (jc.board_cost + jc.printing_cost + COALESCE(jc.plate_cost,0) + COALESCE(jc.ink_cost,0) +
        COALESCE(jc.lamination_cost,0) + COALESCE(jc.foiling_cost,0) + COALESCE(jc.uv_cost,0) +
        COALESCE(jc.die_cutting_cost,0) + COALESCE(jc.pasting_cost,0) + COALESCE(jc.other_finishing,0) +
        COALESCE(jc.labour_cost,0) + COALESCE(jc.overhead_amount,0))
      ELSE NULL END,
    margin_pct = CASE WHEN jc.quoted_amount IS NOT NULL AND jc.quoted_amount <> 0 THEN
      ROUND((jc.quoted_amount - (jc.board_cost + jc.printing_cost + COALESCE(jc.plate_cost,0) + COALESCE(jc.ink_cost,0) +
        COALESCE(jc.lamination_cost,0) + COALESCE(jc.foiling_cost,0) + COALESCE(jc.uv_cost,0) +
        COALESCE(jc.die_cutting_cost,0) + COALESCE(jc.pasting_cost,0) + COALESCE(jc.other_finishing,0) +
        COALESCE(jc.labour_cost,0) + COALESCE(jc.overhead_amount,0))) / jc.quoted_amount * 100, 2)
      ELSE NULL END
  WHERE jc.company_id = p_company_id AND jc.job_id = p_job_id;
END;
$$;

NOTIFY pgrst, 'reload schema';


-- ════════════════════════════════════════════════════════
-- MIGRATION 044_notification_digest_batching.sql
-- ════════════════════════════════════════════════════════
-- ══════════════════════════════════════════════════════════════════════════════
-- JAFSON PRINT ERP — MIGRATION 044: NOTIFICATION DIGEST / BATCHING
--
-- Every notification currently inserts a brand-new row, so a repeated event
-- (same low-stock item breaching threshold on three separate MRN issues in
-- an hour) creates three separate rows instead of one updating entry. This
-- adds an optional group_key: callers that pass one get merged into a single
-- open (unread) notification within a time window instead of spamming the
-- bell; callers that don't pass one keep the old one-row-per-event behavior
-- exactly as before (fully backward compatible).
-- ══════════════════════════════════════════════════════════════════════════════

ALTER TABLE notifications
  ADD COLUMN group_key         TEXT,
  ADD COLUMN occurrence_count  INTEGER NOT NULL DEFAULT 1,
  ADD COLUMN last_occurred_at  TIMESTAMPTZ NOT NULL DEFAULT NOW();

-- Fast lookup of "is there already an open digest for this user+group" —
-- partial index since only unread, non-deleted rows are ever searched this way.
CREATE INDEX idx_notifications_group_open
  ON notifications(user_id, group_key, last_occurred_at DESC)
  WHERE is_read = FALSE AND deleted_at IS NULL AND group_key IS NOT NULL;

-- ─── ATOMIC DIGEST UPSERT ────────────────────────────────────────────────────
-- If an unread notification with the same (user_id, group_key) was last
-- touched within p_window_minutes, bump its occurrence_count and refresh its
-- title/message/last_occurred_at instead of inserting a new row. Otherwise
-- insert a fresh one. Row-locked so concurrent callers for the same group
-- can't both slip past the check at once.
CREATE OR REPLACE FUNCTION upsert_notification_digest(
  p_company_id      UUID,
  p_user_id         UUID,
  p_group_key       TEXT,
  p_title           TEXT,
  p_message         TEXT,
  p_type            TEXT DEFAULT 'info',
  p_link_url        TEXT DEFAULT NULL,
  p_window_minutes  INTEGER DEFAULT 60
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY INVOKER
AS $$
DECLARE
  v_id UUID;
BEGIN
  SELECT id INTO v_id FROM notifications
  WHERE company_id = p_company_id
    AND user_id = p_user_id
    AND group_key = p_group_key
    AND is_read = FALSE
    AND deleted_at IS NULL
    AND last_occurred_at > NOW() - (p_window_minutes || ' minutes')::INTERVAL
  ORDER BY last_occurred_at DESC
  LIMIT 1
  FOR UPDATE;

  IF v_id IS NOT NULL THEN
    UPDATE notifications SET
      occurrence_count = occurrence_count + 1,
      title            = p_title,
      message          = p_message,
      link_url         = COALESCE(p_link_url, link_url),
      last_occurred_at = NOW(),
      updated_at       = NOW()
    WHERE id = v_id;
  ELSE
    INSERT INTO notifications (
      company_id, user_id, title, message, type, link_url,
      group_key, occurrence_count, last_occurred_at
    ) VALUES (
      p_company_id, p_user_id, p_title, p_message, p_type, p_link_url,
      p_group_key, 1, NOW()
    ) RETURNING id INTO v_id;
  END IF;

  RETURN v_id;
END;
$$;

NOTIFY pgrst, 'reload schema';


-- ════════════════════════════════════════════════════════
-- MIGRATION 045_quotation_approval_link.sql
-- ════════════════════════════════════════════════════════
-- ══════════════════════════════════════════════════════════════════════════════
-- JAFSON PRINT ERP — MIGRATION 045: QUOTATION APPROVAL LINK
--
-- Customer-facing self-service approval, same pattern documented for Artwork:
-- a random token, 7-day expiry, IP-logged response, public page at
-- /approve/[token]. A token is minted when a quotation moves to 'sent' and
-- consumed (single use for the approve/reject action) when the customer
-- responds — the quotation's own `status` remains the source of truth,
-- these columns only carry the link mechanics.
-- ══════════════════════════════════════════════════════════════════════════════

ALTER TABLE quotations
  ADD COLUMN approval_token             TEXT UNIQUE,
  ADD COLUMN approval_token_expires_at  TIMESTAMPTZ,
  ADD COLUMN approval_responded_at      TIMESTAMPTZ,
  ADD COLUMN approval_ip                TEXT;

CREATE INDEX idx_quotations_approval_token
  ON quotations(approval_token)
  WHERE approval_token IS NOT NULL;

NOTIFY pgrst, 'reload schema';


-- ════════════════════════════════════════════════════════
-- MIGRATION 046_quotation_costing_engine.sql
-- ════════════════════════════════════════════════════════
-- ══════════════════════════════════════════════════════════════════════════════
-- JAFSON PRINT ERP — MIGRATION 046: QUOTATION COSTING ENGINE
--
-- Estimating a quotation line was pure guesswork typed into unit_price. This
-- adds a real cost-plus-margin calculator:
--   • board_types / lamination_types get rate-card fields (sheet size + rate
--     per sheet, rate per sq.ft) — edited from Settings → Materials, same
--     generic TypeManager UI already used for GSM/flute/color fields.
--   • system_settings gets company-wide default rates for the cost drivers
--     that aren't tied to a specific material (plate/printing/die-cutting/
--     pasting rates, default wastage/overhead/margin %) — editable from a
--     new Settings → Costing Rates page.
--   • quotation_items gets the same "ups → sheet_qty" pattern already used
--     on jobs (Ups is the estimator's judgement call, never auto-derived
--     from raw geometry — box dieline nesting isn't a simple grid), plus a
--     full per-line cost breakdown so the calculated unit_price stays
--     auditable and editable rather than a black-box number.
-- ══════════════════════════════════════════════════════════════════════════════

ALTER TABLE board_types
  ADD COLUMN sheet_length_in NUMERIC(10,2),
  ADD COLUMN sheet_width_in  NUMERIC(10,2),
  ADD COLUMN rate_per_sheet  NUMERIC(12,2);

ALTER TABLE lamination_types
  ADD COLUMN rate_per_sqft NUMERIC(10,2);

ALTER TABLE quotation_items
  ADD COLUMN ups               INTEGER CHECK (ups > 0),
  ADD COLUMN sheet_qty         INTEGER,
  ADD COLUMN wastage_percent   NUMERIC(5,2),
  ADD COLUMN board_cost        NUMERIC(14,2),
  ADD COLUMN plate_cost        NUMERIC(14,2),
  ADD COLUMN printing_cost     NUMERIC(14,2),
  ADD COLUMN lamination_cost   NUMERIC(14,2),
  ADD COLUMN die_cutting_cost  NUMERIC(14,2),
  ADD COLUMN pasting_cost      NUMERIC(14,2),
  ADD COLUMN other_cost        NUMERIC(14,2),
  ADD COLUMN overhead_percent  NUMERIC(5,2),
  ADD COLUMN margin_percent    NUMERIC(5,2),
  ADD COLUMN total_cost        NUMERIC(14,2);

-- ─── DEFAULT COSTING RATE CARD (company-wide, editable) ─────────────────────
DO $$
DECLARE
  cid UUID := '00000000-0000-0000-0000-000000000001';
  defaults RECORD;
BEGIN
  FOR defaults IN SELECT * FROM (VALUES
    ('costing_plate_rate_per_color',        '800',  'Plate cost per color (PKR)'),
    ('costing_printing_rate_per_1000',      '600',  'Printing/press run cost per 1000 sheets (PKR)'),
    ('costing_die_cutting_rate_per_1000',   '400',  'Die-cutting cost per 1000 sheets (PKR)'),
    ('costing_pasting_rate_per_1000',       '300',  'Pasting/gluing cost per 1000 sheets (PKR)'),
    ('costing_default_wastage_percent',     '5',    'Default sheet wastage % added to every run'),
    ('costing_default_overhead_percent',    '15',   'Default overhead % applied on direct cost'),
    ('costing_default_margin_percent',      '20',   'Default target gross margin % used to suggest selling price')
  ) AS t(key, value, description)
  LOOP
    INSERT INTO system_settings (company_id, key, value, category, description)
    VALUES (cid, defaults.key, defaults.value, 'costing', defaults.description)
    ON CONFLICT (company_id, key) DO NOTHING;
  END LOOP;
END $$;

NOTIFY pgrst, 'reload schema';


-- ════════════════════════════════════════════════════════
-- MIGRATION 047_customer_supplier_ledger.sql
-- ════════════════════════════════════════════════════════
-- ═══════════════════════════════════════════════════════════════════════════
-- PHASE A — CUSTOMER & SUPPLIER LEDGER
-- ═══════════════════════════════════════════════════════════════════════════
-- Running-balance ledgers for both sides of the business:
--   customer_ledger_entries — what each customer owes us (AR)
--   supplier_ledger_entries — what we owe each vendor (AP)
-- Both follow the same convention already used elsewhere in this schema
-- (board_inventory_movements.balance_after): every entry snapshots the
-- running balance at insert time via an atomic, row-locked RPC — never
-- computed client-side, never re-derived by summing history at read time.
--
-- Sign convention (matches standard double-entry bookkeeping):
--   Customer ledger: debit increases what they owe us (invoice), credit
--     decreases it (payment, credit note). balance_after = running AR.
--   Supplier ledger: credit increases what we owe them (PO/bill), debit
--     decreases it (payment we make). balance_after = running AP.
-- ═══════════════════════════════════════════════════════════════════════════

-- ─── CUSTOMER LEDGER ────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS customer_ledger_entries (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id      UUID NOT NULL REFERENCES companies(id),
  customer_id     UUID NOT NULL REFERENCES customers(id),
  entry_date      DATE NOT NULL DEFAULT CURRENT_DATE,
  entry_type      TEXT NOT NULL CHECK (entry_type IN
                    ('invoice','payment','credit_note','debit_note','opening_balance','adjustment')),
  reference_type  TEXT,             -- 'invoice' | 'payment' | null for manual entries
  reference_id    UUID,             -- FK to invoices.id / payments.id (not enforced — polymorphic)
  description     TEXT NOT NULL,
  debit           NUMERIC(14,2) NOT NULL DEFAULT 0,
  credit          NUMERIC(14,2) NOT NULL DEFAULT 0,
  balance_after   NUMERIC(14,2) NOT NULL,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_by UUID, updated_by UUID, deleted_at TIMESTAMPTZ,
  is_active  BOOLEAN NOT NULL DEFAULT TRUE,
  CHECK (debit = 0 OR credit = 0)   -- an entry moves the balance one direction, never both
);

CREATE INDEX IF NOT EXISTS idx_cle_customer ON customer_ledger_entries(company_id, customer_id, entry_date, created_at);
CREATE INDEX IF NOT EXISTS idx_cle_ref      ON customer_ledger_entries(reference_type, reference_id);
DROP TRIGGER IF EXISTS trg_cle_upd ON customer_ledger_entries;
CREATE TRIGGER trg_cle_upd BEFORE UPDATE ON customer_ledger_entries
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
ALTER TABLE customer_ledger_entries ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS cle_tenant ON customer_ledger_entries;
CREATE POLICY cle_tenant ON customer_ledger_entries
  USING (company_id = (auth.jwt() ->> 'company_id')::UUID)
  WITH CHECK (company_id = (auth.jwt() ->> 'company_id')::UUID);
DROP TRIGGER IF EXISTS trg_audit_cle ON customer_ledger_entries;
CREATE TRIGGER trg_audit_cle AFTER INSERT OR UPDATE OR DELETE ON customer_ledger_entries
  FOR EACH ROW EXECUTE FUNCTION log_audit_event();

-- ─── SUPPLIER LEDGER ────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS supplier_ledger_entries (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id      UUID NOT NULL REFERENCES companies(id),
  vendor_id       UUID NOT NULL REFERENCES vendors(id),
  entry_date      DATE NOT NULL DEFAULT CURRENT_DATE,
  entry_type      TEXT NOT NULL CHECK (entry_type IN
                    ('purchase_order','payment','credit_note','debit_note','opening_balance','adjustment')),
  reference_type  TEXT,             -- 'purchase_order' | 'vendor_payment' | null
  reference_id    UUID,
  description     TEXT NOT NULL,
  debit           NUMERIC(14,2) NOT NULL DEFAULT 0,
  credit          NUMERIC(14,2) NOT NULL DEFAULT 0,
  balance_after   NUMERIC(14,2) NOT NULL,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_by UUID, updated_by UUID, deleted_at TIMESTAMPTZ,
  is_active  BOOLEAN NOT NULL DEFAULT TRUE,
  CHECK (debit = 0 OR credit = 0)
);

CREATE INDEX IF NOT EXISTS idx_sle_vendor ON supplier_ledger_entries(company_id, vendor_id, entry_date, created_at);
CREATE INDEX IF NOT EXISTS idx_sle_ref    ON supplier_ledger_entries(reference_type, reference_id);
DROP TRIGGER IF EXISTS trg_sle_upd ON supplier_ledger_entries;
CREATE TRIGGER trg_sle_upd BEFORE UPDATE ON supplier_ledger_entries
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
ALTER TABLE supplier_ledger_entries ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS sle_tenant ON supplier_ledger_entries;
CREATE POLICY sle_tenant ON supplier_ledger_entries
  USING (company_id = (auth.jwt() ->> 'company_id')::UUID)
  WITH CHECK (company_id = (auth.jwt() ->> 'company_id')::UUID);
DROP TRIGGER IF EXISTS trg_audit_sle ON supplier_ledger_entries;
CREATE TRIGGER trg_audit_sle AFTER INSERT OR UPDATE OR DELETE ON supplier_ledger_entries
  FOR EACH ROW EXECUTE FUNCTION log_audit_event();

-- ─── VENDOR PAYMENTS (new — mirrors `payments`, which was customer-only) ────
CREATE TABLE IF NOT EXISTS vendor_payments (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id      UUID NOT NULL REFERENCES companies(id),
  vendor_id       UUID NOT NULL REFERENCES vendors(id),
  po_id           UUID REFERENCES purchase_orders(id),   -- nullable: some payments aren't tied to one PO
  amount          NUMERIC(14,2) NOT NULL,
  payment_date    DATE NOT NULL DEFAULT CURRENT_DATE,
  payment_method  TEXT NOT NULL DEFAULT 'bank_transfer'
                  CHECK (payment_method IN ('cash','cheque','bank_transfer','online','other')),
  reference       TEXT,
  bank_name       TEXT,
  notes           TEXT,
  paid_by         UUID REFERENCES users(id),
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_by UUID, updated_by UUID, deleted_at TIMESTAMPTZ,
  is_active  BOOLEAN NOT NULL DEFAULT TRUE
);

CREATE INDEX IF NOT EXISTS idx_vp_vendor  ON vendor_payments(vendor_id);
CREATE INDEX IF NOT EXISTS idx_vp_po      ON vendor_payments(po_id);
CREATE INDEX IF NOT EXISTS idx_vp_company ON vendor_payments(company_id, payment_date DESC);
DROP TRIGGER IF EXISTS trg_vp_upd ON vendor_payments;
CREATE TRIGGER trg_vp_upd BEFORE UPDATE ON vendor_payments
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
ALTER TABLE vendor_payments ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS vp_tenant ON vendor_payments;
CREATE POLICY vp_tenant ON vendor_payments
  USING (company_id = (auth.jwt() ->> 'company_id')::UUID)
  WITH CHECK (company_id = (auth.jwt() ->> 'company_id')::UUID);
DROP TRIGGER IF EXISTS trg_audit_vp ON vendor_payments;
CREATE TRIGGER trg_audit_vp AFTER INSERT OR UPDATE OR DELETE ON vendor_payments
  FOR EACH ROW EXECUTE FUNCTION log_audit_event();

-- ─── ATOMIC RPC: record a customer ledger entry ─────────────────────────────
-- Row-locks the customer's most recent entry (if any) so two concurrent
-- writes (e.g. an invoice created at the same moment a payment posts) can
-- never compute their running balance from the same stale snapshot.
CREATE OR REPLACE FUNCTION record_customer_ledger_entry(
  p_company_id     UUID,
  p_customer_id    UUID,
  p_entry_type     TEXT,
  p_description    TEXT,
  p_debit          NUMERIC DEFAULT 0,
  p_credit         NUMERIC DEFAULT 0,
  p_reference_type TEXT DEFAULT NULL,
  p_reference_id   UUID DEFAULT NULL,
  p_entry_date     DATE DEFAULT CURRENT_DATE,
  p_created_by     UUID DEFAULT NULL
)
RETURNS customer_ledger_entries
LANGUAGE plpgsql
SECURITY INVOKER
AS $$
DECLARE
  v_last_balance NUMERIC(14,2);
  v_new_row      customer_ledger_entries;
BEGIN
  SELECT balance_after INTO v_last_balance
  FROM customer_ledger_entries
  WHERE company_id = p_company_id AND customer_id = p_customer_id AND deleted_at IS NULL
  ORDER BY entry_date DESC, created_at DESC
  LIMIT 1
  FOR UPDATE;

  IF v_last_balance IS NULL THEN v_last_balance := 0; END IF;

  INSERT INTO customer_ledger_entries (
    company_id, customer_id, entry_date, entry_type, reference_type, reference_id,
    description, debit, credit, balance_after, created_by
  ) VALUES (
    p_company_id, p_customer_id, p_entry_date, p_entry_type, p_reference_type, p_reference_id,
    p_description, p_debit, p_credit, v_last_balance + p_debit - p_credit, p_created_by
  )
  RETURNING * INTO v_new_row;

  RETURN v_new_row;
END;
$$;

-- ─── ATOMIC RPC: record a supplier ledger entry ─────────────────────────────
CREATE OR REPLACE FUNCTION record_supplier_ledger_entry(
  p_company_id     UUID,
  p_vendor_id      UUID,
  p_entry_type     TEXT,
  p_description    TEXT,
  p_debit          NUMERIC DEFAULT 0,
  p_credit         NUMERIC DEFAULT 0,
  p_reference_type TEXT DEFAULT NULL,
  p_reference_id   UUID DEFAULT NULL,
  p_entry_date     DATE DEFAULT CURRENT_DATE,
  p_created_by     UUID DEFAULT NULL
)
RETURNS supplier_ledger_entries
LANGUAGE plpgsql
SECURITY INVOKER
AS $$
DECLARE
  v_last_balance NUMERIC(14,2);
  v_new_row      supplier_ledger_entries;
BEGIN
  SELECT balance_after INTO v_last_balance
  FROM supplier_ledger_entries
  WHERE company_id = p_company_id AND vendor_id = p_vendor_id AND deleted_at IS NULL
  ORDER BY entry_date DESC, created_at DESC
  LIMIT 1
  FOR UPDATE;

  IF v_last_balance IS NULL THEN v_last_balance := 0; END IF;

  INSERT INTO supplier_ledger_entries (
    company_id, vendor_id, entry_date, entry_type, reference_type, reference_id,
    description, debit, credit, balance_after, created_by
  ) VALUES (
    p_company_id, p_vendor_id, p_entry_date, p_entry_type, p_reference_type, p_reference_id,
    p_description, p_debit, p_credit, v_last_balance + p_credit - p_debit, p_created_by
  )
  RETURNING * INTO v_new_row;

  RETURN v_new_row;
END;
$$;

-- ─── PERMISSIONS: extend existing 'finance' and 'purchase' modules ──────────
-- No new permission module needed — ledger reads/writes are gated by the
-- same 'finance' (customer ledger, vendor payments viewed from Finance) and
-- 'purchase' (supplier ledger, vendor payments made) modules already seeded.

NOTIFY pgrst, 'reload schema';


-- ════════════════════════════════════════════════════════
-- MIGRATION 048_customer_portal.sql
-- ════════════════════════════════════════════════════════
-- ═══════════════════════════════════════════════════════════════════════════
-- PHASE B — CUSTOMER PORTAL
-- ═══════════════════════════════════════════════════════════════════════════
-- Read-only, token-based portal access — same pattern as the quotation
-- approval link (045_quotation_approval_link.sql): no separate customer
-- login/auth system, just a long-lived rotating token a staff member shares
-- with the customer. Public routes are scoped strictly by the token and use
-- the service-role client, never a session.
-- ═══════════════════════════════════════════════════════════════════════════

ALTER TABLE customers
  ADD COLUMN IF NOT EXISTS portal_token TEXT UNIQUE,
  ADD COLUMN IF NOT EXISTS portal_token_expires_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS portal_enabled BOOLEAN NOT NULL DEFAULT FALSE;

CREATE INDEX IF NOT EXISTS idx_customers_portal_token ON customers(portal_token) WHERE portal_token IS NOT NULL;

NOTIFY pgrst, 'reload schema';


-- ════════════════════════════════════════════════════════
-- MIGRATION 049_email_notifications.sql
-- ════════════════════════════════════════════════════════
-- ═══════════════════════════════════════════════════════════════════════════
-- EMAIL NOTIFICATIONS — seed toggle keys under category='notifications'
-- ═══════════════════════════════════════════════════════════════════════════
-- Pre-seeding these (rather than letting the first PATCH create them) means
-- the row already has category='notifications' set. The generic
-- admin/settings PATCH upsert only writes company_id/key/value on conflict,
-- so if these rows didn't exist yet, the first toggle-save would INSERT them
-- with category = NULL and they'd silently vanish from this settings page on
-- next load (which filters by category='notifications').
--
-- dispatch_sms already existed as a working key with no seed row and no UI —
-- it's included here too so it shows up in the same screen instead of being
-- the one channel that's invisible until someone sets it by hand in the DB.
-- ═══════════════════════════════════════════════════════════════════════════

INSERT INTO system_settings (company_id, key, value, category, description)
SELECT c.id, k.key, 'false', 'notifications', k.description
FROM companies c
CROSS JOIN (VALUES
  ('dispatch_sms',    'Send a WhatsApp message to the customer when an order is dispatched'),
  ('dispatch_email',  'Email the customer when an order is dispatched'),
  ('quotation_email', 'Email the customer their approval link when a quotation is sent'),
  ('invoice_email',   'Email the customer a copy when an invoice is sent')
) AS k(key, description)
ON CONFLICT (company_id, key) DO NOTHING;

NOTIFY pgrst, 'reload schema';


-- ════════════════════════════════════════════════════════
-- MIGRATION 050_machine_downtime_maintenance.sql
-- ════════════════════════════════════════════════════════
-- ═══════════════════════════════════════════════════════════════════════════
-- MACHINE DOWNTIME & MAINTENANCE LOG
-- ═══════════════════════════════════════════════════════════════════════════
-- machine_status_history (006_machines.sql) already logs every status
-- transition with a free-text reason, but nothing categorizes WHY a machine
-- went down (breakdown vs planned service vs no-operator) or tracks
-- scheduled/completed maintenance work separately from ad-hoc status
-- changes. This adds both.
-- ═══════════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS machine_downtime_log (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id      UUID NOT NULL REFERENCES companies(id),
  machine_id      UUID NOT NULL REFERENCES machines(id) ON DELETE CASCADE,
  category        TEXT NOT NULL CHECK (category IN
                    ('breakdown','planned_maintenance','no_operator','material_shortage','power_outage','other')),
  reason          TEXT,
  started_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  ended_at        TIMESTAMPTZ,                          -- NULL while still down
  duration_minutes INTEGER,                              -- filled in when closed
  reported_by     UUID REFERENCES users(id),
  resolved_by     UUID REFERENCES users(id),
  resolution_notes TEXT,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_by UUID, updated_by UUID, deleted_at TIMESTAMPTZ,
  is_active  BOOLEAN NOT NULL DEFAULT TRUE
);

CREATE INDEX IF NOT EXISTS idx_mdl_machine ON machine_downtime_log(company_id, machine_id, started_at DESC);
CREATE INDEX IF NOT EXISTS idx_mdl_open    ON machine_downtime_log(machine_id) WHERE ended_at IS NULL;
DROP TRIGGER IF EXISTS trg_mdl_upd ON machine_downtime_log;
CREATE TRIGGER trg_mdl_upd BEFORE UPDATE ON machine_downtime_log
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
ALTER TABLE machine_downtime_log ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS mdl_tenant ON machine_downtime_log;
CREATE POLICY mdl_tenant ON machine_downtime_log
  USING (company_id = (auth.jwt() ->> 'company_id')::UUID)
  WITH CHECK (company_id = (auth.jwt() ->> 'company_id')::UUID);
DROP TRIGGER IF EXISTS trg_audit_mdl ON machine_downtime_log;
CREATE TRIGGER trg_audit_mdl AFTER INSERT OR UPDATE OR DELETE ON machine_downtime_log
  FOR EACH ROW EXECUTE FUNCTION log_audit_event();

-- ─── SCHEDULED / COMPLETED MAINTENANCE ───────────────────────────────────────
CREATE TABLE IF NOT EXISTS machine_maintenance_log (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id      UUID NOT NULL REFERENCES companies(id),
  machine_id      UUID NOT NULL REFERENCES machines(id) ON DELETE CASCADE,
  maintenance_type TEXT NOT NULL CHECK (maintenance_type IN
                    ('preventive','corrective','inspection','calibration','other')),
  status          TEXT NOT NULL DEFAULT 'scheduled' CHECK (status IN ('scheduled','in_progress','completed','cancelled')),
  scheduled_date  DATE,
  completed_date  DATE,
  description     TEXT NOT NULL,
  performed_by    TEXT,                                 -- often an outside technician, not a system user
  cost            NUMERIC(12,2),
  next_due_date   DATE,                                  -- for recurring preventive maintenance
  notes           TEXT,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_by UUID, updated_by UUID, deleted_at TIMESTAMPTZ,
  is_active  BOOLEAN NOT NULL DEFAULT TRUE
);

CREATE INDEX IF NOT EXISTS idx_mml_machine ON machine_maintenance_log(company_id, machine_id, scheduled_date DESC);
CREATE INDEX IF NOT EXISTS idx_mml_due     ON machine_maintenance_log(company_id, next_due_date) WHERE status != 'completed';
DROP TRIGGER IF EXISTS trg_mml_upd ON machine_maintenance_log;
CREATE TRIGGER trg_mml_upd BEFORE UPDATE ON machine_maintenance_log
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
ALTER TABLE machine_maintenance_log ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS mml_tenant ON machine_maintenance_log;
CREATE POLICY mml_tenant ON machine_maintenance_log
  USING (company_id = (auth.jwt() ->> 'company_id')::UUID)
  WITH CHECK (company_id = (auth.jwt() ->> 'company_id')::UUID);
DROP TRIGGER IF EXISTS trg_audit_mml ON machine_maintenance_log;
CREATE TRIGGER trg_audit_mml AFTER INSERT OR UPDATE OR DELETE ON machine_maintenance_log
  FOR EACH ROW EXECUTE FUNCTION log_audit_event();

-- Closing a downtime entry (ended_at set) also flips the machine's own
-- status back, and computes duration_minutes atomically rather than trusting
-- a client-computed value.
CREATE OR REPLACE FUNCTION close_machine_downtime(
  p_company_id  UUID,
  p_downtime_id UUID,
  p_resolved_by UUID,
  p_resolution_notes TEXT DEFAULT NULL,
  p_new_machine_status TEXT DEFAULT 'idle'
)
RETURNS machine_downtime_log
LANGUAGE plpgsql
SECURITY INVOKER
AS $$
DECLARE
  v_row machine_downtime_log;
BEGIN
  UPDATE machine_downtime_log SET
    ended_at          = NOW(),
    duration_minutes  = EXTRACT(EPOCH FROM (NOW() - started_at)) / 60,
    resolved_by       = p_resolved_by,
    resolution_notes  = p_resolution_notes
  WHERE id = p_downtime_id AND company_id = p_company_id AND ended_at IS NULL
  RETURNING * INTO v_row;

  IF v_row.id IS NULL THEN
    RAISE EXCEPTION 'close_machine_downtime: no open downtime entry % for company %', p_downtime_id, p_company_id;
  END IF;

  UPDATE machines SET status = p_new_machine_status
  WHERE id = v_row.machine_id AND company_id = p_company_id;

  INSERT INTO machine_status_history (company_id, machine_id, status, reason, changed_by)
  VALUES (p_company_id, v_row.machine_id, p_new_machine_status, p_resolution_notes, p_resolved_by);

  RETURN v_row;
END;
$$;

NOTIFY pgrst, 'reload schema';


-- ════════════════════════════════════════════════════════
-- MIGRATION 051_mrp.sql
-- ════════════════════════════════════════════════════════
-- ═══════════════════════════════════════════════════════════════════════════
-- MRP — MATERIAL REQUIREMENT PLANNING
-- ═══════════════════════════════════════════════════════════════════════════
-- Board demand is aggregated by board_type_id (the material catalog entry —
-- jobs.board_type_id), not by a specific board_inventory lot, since a job
-- doesn't commit to one physical stock lot until material is actually
-- issued via an MRN. Stock and incoming-PO quantities are then summed
-- across every board_inventory row that shares that board_type_id, since
-- a board type can have multiple lots/sizes in stock at once.
--
-- This is read-only reporting (a function, not a table) — there is nothing
-- to migrate for existing data, and the numbers are always computed fresh
-- from jobs/board_inventory/purchase_order_items rather than cached, so
-- they can never drift out of sync with the underlying data the way a
-- materialized snapshot could.
-- ═══════════════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION get_mrp_summary(p_company_id UUID)
RETURNS TABLE (
  board_type_id   UUID,
  board_type_name TEXT,
  gsm             INTEGER,
  demand_sheets   NUMERIC,
  stock_sheets    NUMERIC,
  incoming_sheets NUMERIC,
  shortfall_sheets NUMERIC,
  reorder_level   NUMERIC,
  open_job_count  INTEGER
)
LANGUAGE sql
STABLE
SECURITY INVOKER
AS $$
  WITH demand AS (
    -- Open jobs (not yet completed/dispatched/cancelled) with a known board
    -- type and a computed sheet quantity. sheet_qty is the same field the
    -- job costing engine and printing floor already use — no separate
    -- "material required" figure exists per job, this reuses it.
    SELECT
      j.board_type_id,
      SUM(COALESCE(j.sheet_qty, 0)) AS demand_sheets,
      COUNT(*)::INTEGER AS open_job_count
    FROM jobs j
    WHERE j.company_id = p_company_id
      AND j.deleted_at IS NULL
      AND j.board_type_id IS NOT NULL
      AND j.status NOT IN ('completed', 'dispatched', 'cancelled')
    GROUP BY j.board_type_id
  ),
  stock AS (
    SELECT
      bi.board_type_id,
      SUM(bi.current_stock - bi.reserved_stock) AS stock_sheets,
      MAX(bi.reorder_level) AS reorder_level
    FROM board_inventory bi
    WHERE bi.company_id = p_company_id
      AND bi.deleted_at IS NULL
      AND bi.is_active = TRUE
      AND bi.board_type_id IS NOT NULL
    GROUP BY bi.board_type_id
  ),
  incoming AS (
    -- Board already on order but not yet received — counted so MRP doesn't
    -- suggest re-ordering material that's already inbound.
    SELECT
      bi.board_type_id,
      SUM(poi.quantity - poi.quantity_received) AS incoming_sheets
    FROM purchase_order_items poi
    JOIN purchase_orders po ON po.id = poi.po_id
    JOIN board_inventory bi ON bi.id = poi.board_item_id
    WHERE poi.company_id = p_company_id
      AND po.status NOT IN ('received', 'cancelled')
      AND poi.quantity > poi.quantity_received
      AND bi.board_type_id IS NOT NULL
    GROUP BY bi.board_type_id
  )
  SELECT
    bt.id,
    bt.name,
    bt.gsm,
    COALESCE(d.demand_sheets, 0),
    COALESCE(s.stock_sheets, 0),
    COALESCE(i.incoming_sheets, 0),
    GREATEST(0, COALESCE(d.demand_sheets, 0) - COALESCE(s.stock_sheets, 0) - COALESCE(i.incoming_sheets, 0)),
    COALESCE(s.reorder_level, 0),
    COALESCE(d.open_job_count, 0)
  FROM board_types bt
  LEFT JOIN demand   d ON d.board_type_id = bt.id
  LEFT JOIN stock    s ON s.board_type_id = bt.id
  LEFT JOIN incoming i ON i.board_type_id = bt.id
  WHERE bt.company_id = p_company_id
    AND bt.deleted_at IS NULL
    -- Only surface types with either open demand or existing stock —
    -- an unused board type with neither is noise, not a planning signal.
    AND (COALESCE(d.demand_sheets, 0) > 0 OR COALESCE(s.stock_sheets, 0) > 0)
  ORDER BY GREATEST(0, COALESCE(d.demand_sheets, 0) - COALESCE(s.stock_sheets, 0) - COALESCE(i.incoming_sheets, 0)) DESC;
$$;

NOTIFY pgrst, 'reload schema';


-- ════════════════════════════════════════════════════════
-- MIGRATION 052_auth_lockout.sql
-- ════════════════════════════════════════════════════════
-- ═══════════════════════════════════════════════════════════════════════════
-- AUTH HARDENING — ACCOUNT LOCKOUT
-- ═══════════════════════════════════════════════════════════════════════════
-- Login previously went straight from the browser to Supabase Auth
-- (supabase.auth.signInWithPassword called client-side), so the app never
-- had a hook to count failures or enforce a lockout. This adds the tracking
-- columns; the actual lockout logic lives in the new server-side
-- /api/v1/auth/login route, which the login form now calls instead of
-- talking to Supabase Auth directly.
-- ═══════════════════════════════════════════════════════════════════════════

ALTER TABLE users
  ADD COLUMN IF NOT EXISTS failed_login_attempts INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS locked_until TIMESTAMPTZ;

NOTIFY pgrst, 'reload schema';


-- ════════════════════════════════════════════════════════
-- MIGRATION 053_crm_lead_source_activity.sql
-- ════════════════════════════════════════════════════════
-- ═══════════════════════════════════════════════════════════════════════════
-- CRM — LEAD SOURCE TRACKING & ACTIVITY TIMELINE
-- ═══════════════════════════════════════════════════════════════════════════

ALTER TABLE customers
  ADD COLUMN IF NOT EXISTS lead_source TEXT
    CHECK (lead_source IN ('referral','website','cold_call','exhibition','social_media','existing_customer','other'));

-- ─── ACTIVITY TIMELINE ────────────────────────────────────────────────────────
-- A manually-logged interaction (call, meeting, email, note) against a
-- customer. This is distinct from job_stage_events (which is job-specific,
-- system-generated, append-only) — activities are customer-relationship
-- level, manually entered, and editable/deletable by the person who logged
-- them (soft-delete, not append-only).
CREATE TABLE IF NOT EXISTS customer_activities (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id    UUID NOT NULL REFERENCES companies(id),
  customer_id   UUID NOT NULL REFERENCES customers(id) ON DELETE CASCADE,
  activity_type TEXT NOT NULL CHECK (activity_type IN ('call','meeting','email','note','site_visit','other')),
  subject       TEXT NOT NULL,
  notes         TEXT,
  activity_date TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  logged_by     UUID REFERENCES users(id),
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_by UUID, updated_by UUID, deleted_at TIMESTAMPTZ,
  is_active  BOOLEAN NOT NULL DEFAULT TRUE
);

CREATE INDEX IF NOT EXISTS idx_ca_customer ON customer_activities(company_id, customer_id, activity_date DESC);
DROP TRIGGER IF EXISTS trg_ca_upd ON customer_activities;
CREATE TRIGGER trg_ca_upd BEFORE UPDATE ON customer_activities
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
ALTER TABLE customer_activities ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS ca_tenant ON customer_activities;
CREATE POLICY ca_tenant ON customer_activities
  USING (company_id = (auth.jwt() ->> 'company_id')::UUID)
  WITH CHECK (company_id = (auth.jwt() ->> 'company_id')::UUID);
DROP TRIGGER IF EXISTS trg_audit_ca ON customer_activities;
CREATE TRIGGER trg_audit_ca AFTER INSERT OR UPDATE OR DELETE ON customer_activities
  FOR EACH ROW EXECUTE FUNCTION log_audit_event();

NOTIFY pgrst, 'reload schema';


-- ════════════════════════════════════════════════════════
-- MIGRATION 054_so_fulfillment_tracking.sql
-- ════════════════════════════════════════════════════════
-- ═══════════════════════════════════════════════════════════════════════════
-- SALES ORDERS — PARTIAL SHIPMENT / INVOICE TRACKING
-- ═══════════════════════════════════════════════════════════════════════════
-- Dispatched and invoiced quantities are derived, not stored — jobs already
-- link back to sales_order_items (jobs.sales_order_item_id), dispatch_items
-- and invoice_items already link to jobs. This just aggregates what already
-- exists rather than adding new columns that could drift out of sync with
-- the underlying dispatch/invoice records.
-- ═══════════════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION get_so_fulfillment(p_company_id UUID, p_sales_order_id UUID)
RETURNS TABLE (
  sales_order_item_id UUID,
  ordered_qty         NUMERIC,
  dispatched_qty      NUMERIC,
  invoiced_qty        NUMERIC
)
LANGUAGE sql
STABLE
SECURITY INVOKER
AS $$
  SELECT
    soi.id,
    soi.quantity,
    COALESCE((
      SELECT SUM(di.quantity_dispatched)
      FROM dispatch_items di
      JOIN dispatch_orders do_ ON do_.id = di.dispatch_id
      JOIN jobs j ON j.id = di.job_id
      WHERE j.sales_order_item_id = soi.id
        AND do_.status IN ('dispatched', 'delivered')
    ), 0) AS dispatched_qty,
    COALESCE((
      SELECT SUM(ii.quantity)
      FROM invoice_items ii
      JOIN invoices inv ON inv.id = ii.invoice_id
      JOIN jobs j ON j.id = ii.job_id
      WHERE j.sales_order_item_id = soi.id
        AND inv.status NOT IN ('draft', 'void', 'cancelled')
    ), 0) AS invoiced_qty
  FROM sales_order_items soi
  WHERE soi.company_id = p_company_id
    AND soi.sales_order_id = p_sales_order_id
    AND soi.is_active = TRUE;
$$;

NOTIFY pgrst, 'reload schema';


-- ════════════════════════════════════════════════════════
-- MIGRATION 055_board_lot_tracking.sql
-- ════════════════════════════════════════════════════════
-- ═══════════════════════════════════════════════════════════════════════════
-- INVENTORY — BATCH/LOT TRACKING ON BOARD STOCK
-- ═══════════════════════════════════════════════════════════════════════════
-- Tracks WHICH received batch a piece of board stock came from (vendor,
-- date, cost, lot/batch number) — the traceability question a printing
-- shop actually needs answered when a customer complains about board
-- quality: "which delivery was this from?"
--
-- SCOPE NOTE: lots are created and decremented for the two receipt/issue
-- paths this phase touches directly — PO receiving and manual Stock In/Out
-- on the Board Inventory page. MRN material issuance (032) and job wastage
-- still only move the aggregate board_inventory.current_stock, the same as
-- before this migration — they do not yet decrement a specific lot's
-- quantity_remaining. Wiring every consumption path to FIFO-deduct from
-- lots is a larger follow-up; this phase adds the traceability data
-- structure and the two highest-value entry points without touching the
-- already-working MRN/wastage consumption logic.
-- ═══════════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS board_inventory_lots (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id        UUID NOT NULL REFERENCES companies(id),
  board_item_id     UUID NOT NULL REFERENCES board_inventory(id) ON DELETE CASCADE,
  lot_number        TEXT NOT NULL,
  vendor_id         UUID REFERENCES vendors(id),
  reference_type    TEXT,                          -- 'purchase_order' | 'manual' | 'opening_stock'
  reference_id      UUID,
  received_date     DATE NOT NULL DEFAULT CURRENT_DATE,
  quantity_received NUMERIC(12,2) NOT NULL,
  quantity_remaining NUMERIC(12,2) NOT NULL,
  unit_cost         NUMERIC(12,4),
  notes             TEXT,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_by UUID, updated_by UUID, deleted_at TIMESTAMPTZ,
  is_active  BOOLEAN NOT NULL DEFAULT TRUE,
  CHECK (quantity_remaining >= 0 AND quantity_remaining <= quantity_received)
);

CREATE INDEX IF NOT EXISTS idx_bil_item ON board_inventory_lots(board_item_id, received_date);
CREATE INDEX IF NOT EXISTS idx_bil_open ON board_inventory_lots(board_item_id) WHERE quantity_remaining > 0;
DROP TRIGGER IF EXISTS trg_bil_upd ON board_inventory_lots;
CREATE TRIGGER trg_bil_upd BEFORE UPDATE ON board_inventory_lots
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
ALTER TABLE board_inventory_lots ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS bil_tenant ON board_inventory_lots;
CREATE POLICY bil_tenant ON board_inventory_lots
  USING (company_id = (auth.jwt() ->> 'company_id')::UUID)
  WITH CHECK (company_id = (auth.jwt() ->> 'company_id')::UUID);
DROP TRIGGER IF EXISTS trg_audit_bil ON board_inventory_lots;
CREATE TRIGGER trg_audit_bil AFTER INSERT OR UPDATE OR DELETE ON board_inventory_lots
  FOR EACH ROW EXECUTE FUNCTION log_audit_event();

-- FIFO consumption across lots for a manual Stock Out — oldest received_date
-- first. Row-locks the lots it touches so two concurrent stock-outs can't
-- both deduct from the same lot past its remaining quantity.
CREATE OR REPLACE FUNCTION consume_board_lots_fifo(
  p_company_id  UUID,
  p_board_item_id UUID,
  p_quantity    NUMERIC
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY INVOKER
AS $$
DECLARE
  v_lot RECORD;
  v_remaining_to_consume NUMERIC := p_quantity;
  v_take NUMERIC;
BEGIN
  FOR v_lot IN
    SELECT id, quantity_remaining
    FROM board_inventory_lots
    WHERE company_id = p_company_id AND board_item_id = p_board_item_id
      AND quantity_remaining > 0 AND deleted_at IS NULL
    ORDER BY received_date, created_at
    FOR UPDATE
  LOOP
    EXIT WHEN v_remaining_to_consume <= 0;
    v_take := LEAST(v_lot.quantity_remaining, v_remaining_to_consume);
    UPDATE board_inventory_lots SET quantity_remaining = quantity_remaining - v_take WHERE id = v_lot.id;
    v_remaining_to_consume := v_remaining_to_consume - v_take;
  END LOOP;
  -- If demand exceeds all known lots (e.g. stock predates this feature),
  -- the excess is simply not attributed to any lot — the aggregate
  -- board_inventory.current_stock (updated separately by the caller) is
  -- still the source of truth for total quantity; lots are a traceability
  -- layer on top of it, not a replacement for it.
END;
$$;

NOTIFY pgrst, 'reload schema';


-- ════════════════════════════════════════════════════════
-- MIGRATION 056_purchase_three_way_match.sql
-- ════════════════════════════════════════════════════════
-- ═══════════════════════════════════════════════════════════════════════════
-- PURCHASE — 3-WAY MATCH (PO ↔ GOODS RECEIVED ↔ VENDOR BILL)
-- ═══════════════════════════════════════════════════════════════════════════
-- This schema never had a "vendor bill" concept — purchase_order_items
-- already tracks ordered qty (quantity) vs received qty (quantity_received,
-- filled in by the existing 'receive' action), which covers 2 of the 3
-- legs. The missing third leg is what the vendor actually billed for —
-- added here as vendor_bills/vendor_bill_items, deliberately modeled after
-- the existing invoices/invoice_items shape for consistency.
-- ═══════════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS vendor_bills (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id      UUID NOT NULL REFERENCES companies(id),
  po_id           UUID NOT NULL REFERENCES purchase_orders(id),
  vendor_id       UUID NOT NULL REFERENCES vendors(id),
  bill_number     TEXT NOT NULL,                    -- the vendor's own invoice/bill number, not ours
  bill_date       DATE NOT NULL DEFAULT CURRENT_DATE,
  due_date        DATE,
  total_amount    NUMERIC(14,2) NOT NULL DEFAULT 0,
  status          TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','matched','discrepancy','paid')),
  notes           TEXT,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_by UUID, updated_by UUID, deleted_at TIMESTAMPTZ,
  is_active  BOOLEAN NOT NULL DEFAULT TRUE
);

CREATE TABLE IF NOT EXISTS vendor_bill_items (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id      UUID NOT NULL REFERENCES companies(id),
  bill_id         UUID NOT NULL REFERENCES vendor_bills(id) ON DELETE CASCADE,
  po_item_id      UUID REFERENCES purchase_order_items(id),
  description     TEXT NOT NULL,
  quantity_billed NUMERIC(12,2) NOT NULL DEFAULT 0,
  unit_price      NUMERIC(14,4) NOT NULL DEFAULT 0,
  subtotal        NUMERIC(14,2) NOT NULL DEFAULT 0,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_by UUID, updated_by UUID, deleted_at TIMESTAMPTZ,
  is_active  BOOLEAN NOT NULL DEFAULT TRUE
);

CREATE INDEX IF NOT EXISTS idx_vb_po      ON vendor_bills(po_id);
CREATE INDEX IF NOT EXISTS idx_vb_vendor  ON vendor_bills(vendor_id);
CREATE INDEX IF NOT EXISTS idx_vbi_bill   ON vendor_bill_items(bill_id);
CREATE INDEX IF NOT EXISTS idx_vbi_poitem ON vendor_bill_items(po_item_id);

DROP TRIGGER IF EXISTS trg_vb_upd ON vendor_bills;
CREATE TRIGGER trg_vb_upd BEFORE UPDATE ON vendor_bills
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
DROP TRIGGER IF EXISTS trg_vbi_upd ON vendor_bill_items;
CREATE TRIGGER trg_vbi_upd BEFORE UPDATE ON vendor_bill_items
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

ALTER TABLE vendor_bills ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS vb_tenant ON vendor_bills;
CREATE POLICY vb_tenant ON vendor_bills
  USING (company_id = (auth.jwt() ->> 'company_id')::UUID)
  WITH CHECK (company_id = (auth.jwt() ->> 'company_id')::UUID);
ALTER TABLE vendor_bill_items ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS vbi_tenant ON vendor_bill_items;
CREATE POLICY vbi_tenant ON vendor_bill_items
  USING (company_id = (auth.jwt() ->> 'company_id')::UUID)
  WITH CHECK (company_id = (auth.jwt() ->> 'company_id')::UUID);

DROP TRIGGER IF EXISTS trg_audit_vb ON vendor_bills;
CREATE TRIGGER trg_audit_vb AFTER INSERT OR UPDATE OR DELETE ON vendor_bills
  FOR EACH ROW EXECUTE FUNCTION log_audit_event();

-- ─── 3-WAY MATCH ──────────────────────────────────────────────────────────
-- Per PO line: ordered (PO) vs received (GRN, already tracked on
-- purchase_order_items.quantity_received) vs billed (sum across all vendor
-- bill items linked to that PO line). match_status flags the specific kind
-- of discrepancy rather than a single pass/fail, since "vendor billed more
-- than delivered" and "vendor billed less than ordered" need different
-- follow-up action.
CREATE OR REPLACE FUNCTION get_po_three_way_match(p_company_id UUID, p_po_id UUID)
RETURNS TABLE (
  po_item_id      UUID,
  description     TEXT,
  ordered_qty     NUMERIC,
  received_qty    NUMERIC,
  billed_qty      NUMERIC,
  ordered_price   NUMERIC,
  billed_price    NUMERIC,
  match_status    TEXT
)
LANGUAGE sql
STABLE
SECURITY INVOKER
AS $$
  SELECT
    poi.id,
    poi.description,
    poi.quantity,
    poi.quantity_received,
    COALESCE(billed.qty, 0),
    poi.unit_price,
    billed.avg_price,
    CASE
      WHEN COALESCE(billed.qty, 0) = 0 THEN 'not_billed'
      WHEN COALESCE(billed.qty, 0) > poi.quantity_received THEN 'billed_exceeds_received'
      WHEN billed.avg_price IS NOT NULL AND ABS(billed.avg_price - poi.unit_price) > (poi.unit_price * 0.02) THEN 'price_mismatch'
      WHEN COALESCE(billed.qty, 0) < poi.quantity_received THEN 'partially_billed'
      ELSE 'matched'
    END
  FROM purchase_order_items poi
  LEFT JOIN LATERAL (
    SELECT SUM(vbi.quantity_billed) AS qty, AVG(vbi.unit_price) AS avg_price
    FROM vendor_bill_items vbi
    JOIN vendor_bills vb ON vb.id = vbi.bill_id
    WHERE vbi.po_item_id = poi.id AND vb.deleted_at IS NULL
  ) billed ON TRUE
  WHERE poi.company_id = p_company_id
    AND poi.po_id = p_po_id
    AND poi.is_active = TRUE;
$$;

NOTIFY pgrst, 'reload schema';


-- ════════════════════════════════════════════════════════
-- MIGRATION 057_qc_defect_trends.sql
-- ════════════════════════════════════════════════════════
-- ═══════════════════════════════════════════════════════════════════════════
-- QC — DEFECT TREND ANALYTICS
-- ═══════════════════════════════════════════════════════════════════════════
-- Read-only aggregation over the existing qc_defects table — no new columns,
-- no new tables. Three cuts of the same data: by defect type, by severity,
-- and a weekly count for the trend line. All scoped to a date range so the
-- UI can offer "last 30/90 days" without re-querying everything.
-- ═══════════════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION get_qc_defect_trends(
  p_company_id UUID,
  p_date_from  DATE,
  p_date_to    DATE
)
RETURNS TABLE (
  by_type     JSONB,
  by_severity JSONB,
  by_week     JSONB,
  by_customer JSONB,
  total_defects  BIGINT,
  total_qty_affected NUMERIC
)
LANGUAGE sql
STABLE
SECURITY INVOKER
AS $$
  WITH base AS (
    SELECT d.*, j.customer_id, c.name AS customer_name
    FROM qc_defects d
    JOIN jobs j ON j.id = d.job_id
    LEFT JOIN customers c ON c.id = j.customer_id
    WHERE d.company_id = p_company_id
      AND d.deleted_at IS NULL
      AND d.created_at::date BETWEEN p_date_from AND p_date_to
  ),
  by_type AS (
    SELECT jsonb_agg(jsonb_build_object('defect_type', defect_type, 'count', cnt, 'qty_affected', qty) ORDER BY cnt DESC) AS j
    FROM (SELECT defect_type, COUNT(*) AS cnt, SUM(quantity_affected) AS qty FROM base GROUP BY defect_type) t
  ),
  by_severity AS (
    SELECT jsonb_agg(jsonb_build_object('severity', severity, 'count', cnt) ORDER BY
      CASE severity WHEN 'critical' THEN 1 WHEN 'major' THEN 2 ELSE 3 END) AS j
    FROM (SELECT severity, COUNT(*) AS cnt FROM base GROUP BY severity) t
  ),
  by_week AS (
    SELECT jsonb_agg(jsonb_build_object('week_start', week_start, 'count', cnt) ORDER BY week_start) AS j
    FROM (SELECT date_trunc('week', created_at)::date AS week_start, COUNT(*) AS cnt FROM base GROUP BY 1) t
  ),
  by_customer AS (
    SELECT jsonb_agg(jsonb_build_object('customer_name', COALESCE(customer_name, 'Unknown'), 'count', cnt) ORDER BY cnt DESC) AS j
    FROM (SELECT customer_name, COUNT(*) AS cnt FROM base GROUP BY customer_name ORDER BY COUNT(*) DESC LIMIT 10) t
  )
  SELECT
    COALESCE((SELECT j FROM by_type), '[]'::jsonb),
    COALESCE((SELECT j FROM by_severity), '[]'::jsonb),
    COALESCE((SELECT j FROM by_week), '[]'::jsonb),
    COALESCE((SELECT j FROM by_customer), '[]'::jsonb),
    (SELECT COUNT(*) FROM base),
    (SELECT COALESCE(SUM(quantity_affected), 0) FROM base);
$$;

NOTIFY pgrst, 'reload schema';


-- ════════════════════════════════════════════════════════
-- MIGRATION 058_finance_aging_report.sql
-- ════════════════════════════════════════════════════════
-- ═══════════════════════════════════════════════════════════════════════════
-- FINANCE — ACCOUNTS RECEIVABLE AGING REPORT
-- ═══════════════════════════════════════════════════════════════════════════
-- Buckets every unpaid/partially-paid invoice by how overdue it is,
-- grouped by customer. Read-only aggregation over the existing invoices
-- table (balance_due, due_date already tracked) — no new columns.
-- ═══════════════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION get_ar_aging_report(p_company_id UUID)
RETURNS TABLE (
  customer_id     UUID,
  customer_name   TEXT,
  current_amt     NUMERIC,   -- not yet due
  days_1_30       NUMERIC,
  days_31_60      NUMERIC,
  days_61_90      NUMERIC,
  days_over_90    NUMERIC,
  total_due       NUMERIC,
  oldest_invoice_date DATE
)
LANGUAGE sql
STABLE
SECURITY INVOKER
AS $$
  WITH open_invoices AS (
    SELECT
      i.customer_id,
      i.balance_due,
      i.due_date,
      i.invoice_date,
      COALESCE(CURRENT_DATE - i.due_date, 0) AS days_overdue
    FROM invoices i
    WHERE i.company_id = p_company_id
      AND i.deleted_at IS NULL
      AND i.status NOT IN ('draft', 'void', 'cancelled')
      AND i.balance_due > 0
  )
  SELECT
    c.id,
    c.name,
    COALESCE(SUM(oi.balance_due) FILTER (WHERE oi.days_overdue <= 0), 0),
    COALESCE(SUM(oi.balance_due) FILTER (WHERE oi.days_overdue BETWEEN 1 AND 30), 0),
    COALESCE(SUM(oi.balance_due) FILTER (WHERE oi.days_overdue BETWEEN 31 AND 60), 0),
    COALESCE(SUM(oi.balance_due) FILTER (WHERE oi.days_overdue BETWEEN 61 AND 90), 0),
    COALESCE(SUM(oi.balance_due) FILTER (WHERE oi.days_overdue > 90), 0),
    COALESCE(SUM(oi.balance_due), 0),
    MIN(oi.invoice_date)
  FROM open_invoices oi
  JOIN customers c ON c.id = oi.customer_id
  GROUP BY c.id, c.name
  HAVING COALESCE(SUM(oi.balance_due), 0) > 0
  ORDER BY COALESCE(SUM(oi.balance_due), 0) DESC;
$$;

-- ─── ACCOUNTS PAYABLE — SIMPLER VIEW ─────────────────────────────────────────
-- vendor_bills (056) doesn't track payment status/balance per bill the way
-- invoices does for AR, so this uses the supplier ledger's running balance
-- per vendor instead — total owed, not bucketed by invoice age. A true
-- per-bill AP aging would need a paid_amount/balance_due column added to
-- vendor_bills first; noted as a follow-up rather than guessed at here.
CREATE OR REPLACE FUNCTION get_ap_summary(p_company_id UUID)
RETURNS TABLE (
  vendor_id    UUID,
  vendor_name  TEXT,
  balance_owed NUMERIC
)
LANGUAGE sql
STABLE
SECURITY INVOKER
AS $$
  WITH latest AS (
    SELECT DISTINCT ON (vendor_id) vendor_id, balance_after
    FROM supplier_ledger_entries
    WHERE company_id = p_company_id AND deleted_at IS NULL
    ORDER BY vendor_id, entry_date DESC, created_at DESC
  )
  SELECT v.id, v.name, l.balance_after
  FROM latest l
  JOIN vendors v ON v.id = l.vendor_id
  WHERE l.balance_after > 0
  ORDER BY l.balance_after DESC;
$$;

NOTIFY pgrst, 'reload schema';


-- ════════════════════════════════════════════════════════
-- MIGRATION 059_report_schedules.sql
-- ════════════════════════════════════════════════════════
-- ═══════════════════════════════════════════════════════════════════════════
-- REPORTS — SCHEDULED EMAIL DELIVERY
-- ═══════════════════════════════════════════════════════════════════════════
-- Recipients and cadence for automatically emailing a report. The actual
-- sending is driven by a Vercel Cron job hitting /api/cron/send-scheduled-
-- reports once a day — this table just holds what's due and when it was
-- last sent, so the cron endpoint can determine which schedules fire today
-- without needing its own state.
-- ═══════════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS report_schedules (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id     UUID NOT NULL REFERENCES companies(id),
  report_type    TEXT NOT NULL CHECK (report_type IN
                   ('kpi','monthly_production','customer_sales','financial','machines','qc','overdue')),
  frequency      TEXT NOT NULL CHECK (frequency IN ('daily','weekly','monthly')),
  recipients     TEXT[] NOT NULL,          -- email addresses
  is_active      BOOLEAN NOT NULL DEFAULT TRUE,
  last_sent_at   TIMESTAMPTZ,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_by UUID, updated_by UUID, deleted_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_rs_company ON report_schedules(company_id) WHERE is_active = TRUE;
DROP TRIGGER IF EXISTS trg_rs_upd ON report_schedules;
CREATE TRIGGER trg_rs_upd BEFORE UPDATE ON report_schedules
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
ALTER TABLE report_schedules ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS rs_tenant ON report_schedules;
CREATE POLICY rs_tenant ON report_schedules
  USING (company_id = (auth.jwt() ->> 'company_id')::UUID)
  WITH CHECK (company_id = (auth.jwt() ->> 'company_id')::UUID);

NOTIFY pgrst, 'reload schema';


-- ════════════════════════════════════════════════════════
-- MIGRATION 060_quotation_costing_expansion.sql
-- ════════════════════════════════════════════════════════
-- ═══════════════════════════════════════════════════════════════════════════
-- QUOTATION COSTING ENGINE — EXPANSION TO MATCH MANUAL COSTING WORKSHEET
-- ═══════════════════════════════════════════════════════════════════════════
-- The costing engine (046) covered board/plate/printing/lamination/die-
-- cutting/pasting. Comparing against Mehboob's actual costing worksheet
-- surfaced 7 cost drivers that worksheet has and the engine didn't:
-- coating (UV/Spot UV/water-base/etc.), foiling, embossing, die making
-- (distinct from die cutting — the one-time block cost, not the per-run
-- operation), breaking, packing, and cartage/delivery.
--
-- NOT added in this pass: weight-based (KG × rate) board costing. The
-- worksheet prices board by weight; this engine prices it by sheet count
-- (board_types.rate_per_sheet, from 046). Both are valid costing methods —
-- switching board costing to weight-based is a larger change (needs GSM→KG
-- conversion from sheet dimensions) than the other 7 additions, which are
-- all independent new line items. Flagging this explicitly rather than
-- silently leaving it out.
-- ═══════════════════════════════════════════════════════════════════════════

-- ─── COATING TYPES CATALOG (same shape as lamination_types) ─────────────────
CREATE TABLE IF NOT EXISTS coating_types (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id     UUID NOT NULL REFERENCES companies(id),
  name           TEXT NOT NULL,
  rate_per_sheet NUMERIC(10,4),
  created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_by UUID, updated_by UUID, deleted_at TIMESTAMPTZ,
  is_active  BOOLEAN NOT NULL DEFAULT TRUE
);
CREATE INDEX IF NOT EXISTS idx_coating_types_company ON coating_types(company_id) WHERE deleted_at IS NULL;
DROP TRIGGER IF EXISTS trg_coating_types_upd ON coating_types;
CREATE TRIGGER trg_coating_types_upd BEFORE UPDATE ON coating_types
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
ALTER TABLE coating_types ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS coating_types_tenant ON coating_types;
CREATE POLICY coating_types_tenant ON coating_types
  USING (company_id = (auth.jwt() ->> 'company_id')::UUID)
  WITH CHECK (company_id = (auth.jwt() ->> 'company_id')::UUID);

INSERT INTO coating_types (company_id, name)
SELECT '00000000-0000-0000-0000-000000000001', n FROM (VALUES
  ('UV Coating'), ('Spot UV'), ('Gloss Water Base'), ('Matt Water Base'), ('Drip Off'), ('Blaster Coating')
) AS t(n)
ON CONFLICT DO NOTHING;

-- ─── NEW COST FIELDS ON quotation_items ──────────────────────────────────────
ALTER TABLE quotation_items
  ADD COLUMN IF NOT EXISTS coating_type_id  UUID REFERENCES coating_types(id),
  ADD COLUMN IF NOT EXISTS coating_cost     NUMERIC(14,2),
  ADD COLUMN IF NOT EXISTS foiling_cost     NUMERIC(14,2),
  ADD COLUMN IF NOT EXISTS embossing_cost   NUMERIC(14,2),
  ADD COLUMN IF NOT EXISTS die_making_cost  NUMERIC(14,2),
  ADD COLUMN IF NOT EXISTS breaking_cost    NUMERIC(14,2),
  ADD COLUMN IF NOT EXISTS packing_cost     NUMERIC(14,2),
  ADD COLUMN IF NOT EXISTS cartage_cost     NUMERIC(14,2);

-- ─── NEW DEFAULT COSTING RATES (company-wide, editable) ─────────────────────
DO $$
DECLARE
  cid UUID := '00000000-0000-0000-0000-000000000001';
  defaults RECORD;
BEGIN
  FOR defaults IN SELECT * FROM (VALUES
    ('costing_foiling_rate_per_sheet',      '0', 'Foiling cost per sheet (PKR)'),
    ('costing_embossing_rate_per_1000',     '0', 'Embossing cost per 1000 sheets (PKR)'),
    ('costing_die_making_rate_per_ups',     '0', 'Die making (block) cost per ups — one-time per job (PKR)'),
    ('costing_breaking_rate_per_1000',      '0', 'Breaking cost per 1000 sheets (PKR)'),
    ('costing_packing_rate_per_1000_boxes', '0', 'Packing cost per 1000 boxes (PKR)'),
    ('costing_cartage_rate_per_1000_boxes', '0', 'Cartage/delivery cost per 1000 boxes (PKR)')
  ) AS t(key, value, description)
  LOOP
    INSERT INTO system_settings (company_id, key, value, category, description)
    VALUES (cid, defaults.key, defaults.value, 'costing', defaults.description)
    ON CONFLICT (company_id, key) DO NOTHING;
  END LOOP;
END $$;

NOTIFY pgrst, 'reload schema';


-- ════════════════════════════════════════════════════════
-- MIGRATION 061_quotation_versions.sql
-- ════════════════════════════════════════════════════════
-- ═══════════════════════════════════════════════════════════════════════════
-- QUOTATIONS — VERSION HISTORY / COMPARISON
-- ═══════════════════════════════════════════════════════════════════════════
-- Snapshots the full quotation (header + items) as JSONB every time it's
-- meaningfully edited (items changed, or key pricing fields changed), so
-- estimators/sales can see what changed between versions — price drift,
-- items added/removed, quantity changes — rather than only ever seeing the
-- current state.
--
-- Also fixes a real bug found while building this: PATCH
-- /api/v1/quotations/[id] never handled the `items` array the edit form
-- already sends — line-item edits were silently dropped, only header fields
-- (customer/discount/notes/status) were ever actually saved.
-- ═══════════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS quotation_versions (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id      UUID NOT NULL REFERENCES companies(id),
  quotation_id    UUID NOT NULL REFERENCES quotations(id) ON DELETE CASCADE,
  version_number  INTEGER NOT NULL,
  snapshot        JSONB NOT NULL,     -- { header: {...}, items: [...] }
  change_summary  TEXT,               -- short human-readable note of what changed, if known
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_by      UUID REFERENCES users(id),
  UNIQUE (quotation_id, version_number)
);

CREATE INDEX IF NOT EXISTS idx_qv_quotation ON quotation_versions(quotation_id, version_number DESC);
ALTER TABLE quotation_versions ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS qv_tenant ON quotation_versions;
CREATE POLICY qv_tenant ON quotation_versions
  USING (company_id = (auth.jwt() ->> 'company_id')::UUID)
  WITH CHECK (company_id = (auth.jwt() ->> 'company_id')::UUID);

NOTIFY pgrst, 'reload schema';


-- ════════════════════════════════════════════════════════
-- MIGRATION 062_dynamic_cost_lines.sql
-- ════════════════════════════════════════════════════════
-- ═══════════════════════════════════════════════════════════════════════════
-- QUOTATION COSTING — DYNAMIC COST-LINE CATALOG + WEIGHT-BASED BOARD COSTING
-- ═══════════════════════════════════════════════════════════════════════════
-- Replaces the fixed plate/printing/foiling/embossing/die-making/die-cutting/
-- breaking/pasting/packing/cartage columns added in 046/060 with a catalog +
-- child-line pattern: every new cost item (today or in the future — e.g.
-- "Varnish", "Perforation") is a row in cost_item_types with a name + unit
-- basis + default rate, and a quotation line picks any number of them via
-- "+ Add Cost Line" instead of the estimator being limited to whatever
-- fixed columns happen to exist.
--
-- Board and Lamination/Coating stay as they were — board is the one driver
-- everything else (sheet_qty) is computed FROM, so it can't be "just
-- another line item"; lamination/coating already work as type-pickers with
-- their own area/sheet-based rate and weren't part of the complaint.
--
-- NOT dropping the old fixed columns on quotation_items (plate_cost,
-- printing_cost, foiling_cost, etc.) — they stay for any already-saved
-- quotations and the version-history snapshots already taken. New
-- quotations use cost lines instead; the calculation engine no longer
-- writes to those fixed columns going forward.
-- ═══════════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS cost_item_types (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id   UUID NOT NULL REFERENCES companies(id),
  name         TEXT NOT NULL,
  unit_basis   TEXT NOT NULL CHECK (unit_basis IN
                 ('per_sheet','per_1000_sheets','per_plate','per_ups','per_1000_boxes','per_1000_boxes_carton')),
  default_rate NUMERIC(12,4) NOT NULL DEFAULT 0,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_by UUID, updated_by UUID, deleted_at TIMESTAMPTZ,
  is_active  BOOLEAN NOT NULL DEFAULT TRUE
);
CREATE INDEX IF NOT EXISTS idx_cost_item_types_company ON cost_item_types(company_id) WHERE deleted_at IS NULL;
DROP TRIGGER IF EXISTS trg_cost_item_types_upd ON cost_item_types;
CREATE TRIGGER trg_cost_item_types_upd BEFORE UPDATE ON cost_item_types
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
ALTER TABLE cost_item_types ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS cost_item_types_tenant ON cost_item_types;
CREATE POLICY cost_item_types_tenant ON cost_item_types
  USING (company_id = (auth.jwt() ->> 'company_id')::UUID)
  WITH CHECK (company_id = (auth.jwt() ->> 'company_id')::UUID);

-- Seed from the rates already set under 046/060 so nothing resets to zero.
INSERT INTO cost_item_types (company_id, name, unit_basis, default_rate)
SELECT '00000000-0000-0000-0000-000000000001', t.name, t.unit_basis,
  COALESCE((SELECT value::NUMERIC FROM system_settings
            WHERE company_id = '00000000-0000-0000-0000-000000000001' AND key = t.rate_key), 0)
FROM (VALUES
  ('Plate',       'per_plate',            'costing_plate_rate_per_color'),
  ('Printing',    'per_1000_sheets',      'costing_printing_rate_per_1000'),
  ('Die Cutting', 'per_1000_sheets',      'costing_die_cutting_rate_per_1000'),
  ('Pasting',     'per_1000_sheets',      'costing_pasting_rate_per_1000'),
  ('Foiling',     'per_sheet',            'costing_foiling_rate_per_sheet'),
  ('Embossing',   'per_1000_sheets',      'costing_embossing_rate_per_1000'),
  ('Die Making',  'per_ups',              'costing_die_making_rate_per_ups'),
  ('Breaking',    'per_1000_sheets',      'costing_breaking_rate_per_1000'),
  ('Packing',     'per_1000_boxes',       'costing_packing_rate_per_1000_boxes'),
  ('Cartage',     'per_1000_boxes_carton','costing_cartage_rate_per_1000_boxes')
) AS t(name, unit_basis, rate_key)
ON CONFLICT DO NOTHING;

-- ─── QUOTATION LINE'S CHOSEN COST LINES ──────────────────────────────────────
CREATE TABLE IF NOT EXISTS quotation_item_cost_lines (
  id                 UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id         UUID NOT NULL REFERENCES companies(id),
  quotation_item_id  UUID NOT NULL REFERENCES quotation_items(id) ON DELETE CASCADE,
  cost_item_type_id  UUID REFERENCES cost_item_types(id),
  name               TEXT NOT NULL,     -- denormalized at time of use — a later rename/delete
  unit_basis         TEXT NOT NULL,     -- of the catalog entry must not change historical quotations
  rate               NUMERIC(12,4) NOT NULL DEFAULT 0,
  quantity           NUMERIC(12,4) NOT NULL DEFAULT 0,
  amount             NUMERIC(14,2) NOT NULL DEFAULT 0,
  sort_order         INTEGER NOT NULL DEFAULT 1,
  created_at         TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at         TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_by UUID, updated_by UUID
);
CREATE INDEX IF NOT EXISTS idx_qicl_item ON quotation_item_cost_lines(quotation_item_id);
ALTER TABLE quotation_item_cost_lines ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS qicl_tenant ON quotation_item_cost_lines;
CREATE POLICY qicl_tenant ON quotation_item_cost_lines
  USING (company_id = (auth.jwt() ->> 'company_id')::UUID)
  WITH CHECK (company_id = (auth.jwt() ->> 'company_id')::UUID);

-- ─── BOARD: WEIGHT-BASED COSTING OPTION ──────────────────────────────────────
ALTER TABLE board_types
  ADD COLUMN IF NOT EXISTS rate_per_kg NUMERIC(12,4);

ALTER TABLE quotation_items
  ADD COLUMN IF NOT EXISTS board_costing_method TEXT NOT NULL DEFAULT 'per_sheet'
    CHECK (board_costing_method IN ('per_sheet','per_kg'));

NOTIFY pgrst, 'reload schema';


-- ════════════════════════════════════════════════════════
-- MIGRATION 063_costing_v2_worksheet_match.sql
-- ════════════════════════════════════════════════════════
-- ═══════════════════════════════════════════════════════════════════════════
-- COSTING v2 — EXACT MATCH TO MEHBOOB'S MANUAL WORKSHEET (Coast.xlsx)
-- ═══════════════════════════════════════════════════════════════════════════
-- Corrections/additions found by reviewing the actual formulas (not just the
-- item names) in the worksheet:
--
--   1. Board weight constant was wrong (0.00064516 m²-conversion based) —
--      the real trade formula used is Weight(kg) = L(in) × W(in) × GSM / 15500
--      per sheet. Fixed in the calculation engine (TS), not this migration —
--      no schema change needed for that, board_types.rate_per_kg already exists.
--
--   2. UV, Lamination, and Foiling are all area-based (rate × sheet sqft ×
--      sheet count), not flat per-sheet — same formula as each other. Folding
--      all three into the dynamic cost-line catalog with a new 'per_sqft'
--      basis, rather than keeping Lamination/Coating as separate dropdowns.
--      The worksheet also had a broken duplicate "Foiling" row referencing
--      empty cells (B3/D3/H6) — confirmed with Mehboob as a leftover/mistake,
--      dropped.
--
--   3. Printing needs BOTH a color multiplier AND the stepped-1000 rounding
--      Embossing/Die-Cutting/Breaking use — none of the existing unit_basis
--      values combine those two, so a new 'per_1000_sheets_per_color' basis
--      is added specifically for it.
--
--   4. Embossing/Die-Cutting/Breaking in the worksheet formula also multiply
--      by color count — confirmed with Mehboob this was copied from the
--      Printing row by mistake and should NOT multiply by color. No schema
--      change needed (they already use plain 'per_1000_sheets' in this
--      system, never had a color multiplier here).
--
--   5. Pasting is priced on BOX quantity (+ wastage%) per 1000, not sheet
--      quantity — was seeded as 'per_1000_sheets' in 062, corrected here.
-- ═══════════════════════════════════════════════════════════════════════════

ALTER TABLE cost_item_types DROP CONSTRAINT IF EXISTS cost_item_types_unit_basis_check;
ALTER TABLE cost_item_types ADD CONSTRAINT cost_item_types_unit_basis_check CHECK (unit_basis IN
  ('per_sheet','per_1000_sheets','per_1000_sheets_per_color','per_plate','per_ups',
   'per_1000_boxes','per_1000_boxes_carton','per_sqft','per_1000_boxes_wastage'));

-- quotation_item_cost_lines.unit_basis has no CHECK constraint (denormalized
-- free text so historical rows survive a later catalog change) — nothing to
-- alter there.

-- Fix Pasting's basis (was wrongly seeded as per_1000_sheets in 062 — it's
-- actually box-quantity-based with wastage applied, same as the worksheet's
-- "(B5+B5*3%)*H21/1000" but using the editable wastage% instead of a
-- hardcoded 3%).
UPDATE cost_item_types SET unit_basis = 'per_1000_boxes_wastage' WHERE name = 'Pasting';

-- Fix Printing's basis to the new color-aware stepped-rounding one.
UPDATE cost_item_types SET unit_basis = 'per_1000_sheets_per_color' WHERE name = 'Printing';

-- Add UV, Lamination, and (single, correct) Foiling as area-based catalog
-- items, seeded from the old lamination_types default (if any) — new rows
-- only, existing lamination_type_id-based quotations are untouched.
INSERT INTO cost_item_types (company_id, name, unit_basis, default_rate)
SELECT '00000000-0000-0000-0000-000000000001', name, 'per_sqft', 0
FROM (VALUES ('UV'), ('Lamination')) AS t(name)
WHERE NOT EXISTS (
  SELECT 1 FROM cost_item_types
  WHERE company_id = '00000000-0000-0000-0000-000000000001' AND name = t.name AND deleted_at IS NULL
);

-- Foiling already exists from 062 (seeded as 'per_sheet') — correct it to
-- area-based per the worksheet's actual (non-broken) Foiling row.
UPDATE cost_item_types SET unit_basis = 'per_sqft' WHERE name = 'Foiling';

NOTIFY pgrst, 'reload schema';


-- ════════════════════════════════════════════════════════
-- MIGRATION 064_quotation_line_board_overrides.sql
-- ════════════════════════════════════════════════════════
-- ═══════════════════════════════════════════════════════════════════════════
-- QUOTATION ITEMS — PER-LINE BOARD OVERRIDES + SALES TAX WIRING
-- ═══════════════════════════════════════════════════════════════════════════
-- Sheet size, board GSM, and board rate were only ever settable at the
-- Board Type catalog level — meaning a custom or one-off sheet size not in
-- the catalog (or a board whose rate has since changed) couldn't be costed
-- at all. These are now per-line fields, pre-filled from the selected board
-- type but always overridable, so "Per KG" costing has GSM/rate to work
-- with even when nothing in the catalog matches exactly.
--
-- Sales tax already had a home — quotations.tax_id already referenced the
-- existing `taxes` catalog (008_units_currencies_taxes.sql) with its own
-- rate_percent; the quotation form just never surfaced it. No new tax
-- column needed here, just wiring in the UI/API (done separately).
--
-- overhead_percent / margin_percent columns from 046 are left in place
-- (existing quotations keep their saved values) but are no longer written
-- to by new saves — overhead/margin-driven auto-pricing was removed per
-- Mehboob's request; profit is now just unit_price minus cost, shown live.
-- ═══════════════════════════════════════════════════════════════════════════

ALTER TABLE quotation_items
  ADD COLUMN IF NOT EXISTS sheet_length_in     NUMERIC(8,2),
  ADD COLUMN IF NOT EXISTS sheet_width_in      NUMERIC(8,2),
  ADD COLUMN IF NOT EXISTS board_gsm           INTEGER,
  ADD COLUMN IF NOT EXISTS board_rate_per_sheet NUMERIC(12,4),
  ADD COLUMN IF NOT EXISTS board_rate_per_kg    NUMERIC(12,4);

NOTIFY pgrst, 'reload schema';


-- ════════════════════════════════════════════════════════
-- MIGRATION 065_quotation_costing_v4_excel_match.sql
-- ════════════════════════════════════════════════════════
-- ══════════════════════════════════════════════════════════════════════════════
-- MIGRATION 065: QUOTATION COSTING v4 — EXACT MATCH TO Cost.xlsx
-- ══════════════════════════════════════════════════════════════════════════════
-- Rebuild of the per-line costing calculator to mirror Mehboob's actual
-- Cost.xlsx line by line (analyzed formula-by-formula, not just item names).
--
-- Fixes a real bug found in the previous engine: Board Weight (kg) was
-- computed as `L(in) x W(in) x GSM / 15500` per sheet and multiplied
-- directly by sheet count. The Excel's own "Packets / Pkt Weight" section
-- proves that constant is actually the weight of a BATCH OF 100 SHEETS in
-- kg, not one sheet — the correct formula divides by 100 again. The old
-- formula therefore overstated Board Weight (and Board Cost, when using
-- Per-KG costing) by 100x. Fixed in the TS engine (lib/costing/quotationCosting.ts),
-- no schema change needed for that specific fix.
--
-- New fields:
--   • margin_percent already existed (migration 046, unused since the v3
--     "remove auto-pricing" decision) — REPURPOSED here as the Excel's
--     "Profit Margin %" input, which now DOES drive the suggested unit
--     price again, per Mehboob's explicit request to restore this.
--   • packet_length_in / packet_width_in / packet_div — the Excel's
--     "Packet Size" + "Div" fields. In the raw Excel these are dead code
--     (the Pkt Weight formula actually reads the Sheet Size cells, not the
--     Packet Size cells, and Div cancels out of the final Total KG either
--     way) — kept editable per Mehboob's request for future use. Wired to
--     an actual (corrected) formula in the TS engine using the real packet
--     dimensions, rather than reproducing the Excel's dead reference, so
--     they're not just decorative.
--
-- Business-logic confirmations from Mehboob (differ from the raw Excel,
-- which has known copy-paste errors in these two spots):
--   • Printing Charges: rate DOES multiply by color count (Excel's copy
--     does not — confirmed as an Excel mistake).
--   • Breaking: rate does NOT multiply by color count (Excel's copy does —
--     confirmed as a leftover copy-paste error from the Printing row).
-- Both already match the existing 'per_1000_sheets_per_color' (Printing)
-- and 'per_1000_sheets' (Breaking) unit_basis values already seeded in
-- migration 063 — no cost_item_types change needed, only confirmed.
-- ══════════════════════════════════════════════════════════════════════════════

ALTER TABLE quotation_items
  ADD COLUMN IF NOT EXISTS packet_length_in NUMERIC(8,2),
  ADD COLUMN IF NOT EXISTS packet_width_in  NUMERIC(8,2),
  ADD COLUMN IF NOT EXISTS packet_div       NUMERIC(8,2) DEFAULT 1;

COMMENT ON COLUMN quotation_items.margin_percent IS
  'Profit Margin % (Excel: "Profit Margin"). Drives Agreed Rate / suggested unit price = Total Cost x (1 + margin%/100). Re-activated in migration 065 after being unused since v3.';
COMMENT ON COLUMN quotation_items.packet_length_in IS
  'Excel "Packet Size" Width field — informational bundling detail, not a cost driver.';
COMMENT ON COLUMN quotation_items.packet_width_in IS
  'Excel "Packet Size" Height field — informational bundling detail, not a cost driver.';
COMMENT ON COLUMN quotation_items.packet_div IS
  'Excel "Div" field — informational bundling divisor, not a cost driver.';

NOTIFY pgrst, 'reload schema';


-- ════════════════════════════════════════════════════════
-- MIGRATION 066_cost_item_types_sort_order.sql
-- ════════════════════════════════════════════════════════
-- ══════════════════════════════════════════════════════════════════════════════
-- MIGRATION 066: COST ITEM TYPES — WORKFLOW-BASED SORT ORDER
-- ══════════════════════════════════════════════════════════════════════════════
-- Finish Goods list on New Quotation was ordered alphabetically (A→Z by
-- name), which scatters items out of production sequence (e.g. "Cartage"
-- and "Breaking" sort before "Plates" and "Printing"). Adds a sort_order
-- column so the list can follow the actual production workflow instead:
-- Plates -> Printing -> UV -> Lamination -> Foiling -> Embossing ->
-- Die Making -> Die Cutting -> Breaking -> Pasting -> Packing -> Cartage.
--
-- Backfills the known seeded items (migrations 062/063) to that order.
-- Any custom item Mehboob has already added keeps a sort_order after all
-- of these (ordered by name as a stable tie-break) — new items created
-- from now on append at the end automatically (POST route computes
-- max(sort_order)+1), not scattered alphabetically.
-- ══════════════════════════════════════════════════════════════════════════════

ALTER TABLE cost_item_types ADD COLUMN IF NOT EXISTS sort_order INTEGER NOT NULL DEFAULT 0;

DO $$
DECLARE
  cid UUID := '00000000-0000-0000-0000-000000000001';
  ord RECORD;
BEGIN
  FOR ord IN SELECT * FROM (VALUES
    ('Plates',          10),
    ('Printing Charges',20),
    ('Printing',        20),
    ('UV',              30),
    ('Lamination',      40),
    ('Foiling',         50),
    ('Embossing',       60),
    ('Embosing',        60),
    ('Die Making',      70),
    ('Die Cutting',     80),
    ('Breaking',        90),
    ('Pasting Folding', 100),
    ('Pasting',         100),
    ('Packing',         110),
    ('Cartage Charges', 120),
    ('Cartage',         120)
  ) AS t(name, seq)
  LOOP
    UPDATE cost_item_types SET sort_order = ord.seq
    WHERE company_id = cid AND name = ord.name AND deleted_at IS NULL;
  END LOOP;

  -- Any item that didn't match the known names (custom items already
  -- added via Settings -> Materials) goes after all of the above, in
  -- their current alphabetical order, so nothing jumps ahead of the
  -- real workflow items.
  UPDATE cost_item_types
  SET sort_order = 200 + sub.rn
  FROM (
    SELECT id, ROW_NUMBER() OVER (ORDER BY name) AS rn
    FROM cost_item_types
    WHERE company_id = cid AND deleted_at IS NULL AND sort_order = 0
  ) sub
  WHERE cost_item_types.id = sub.id;
END $$;

NOTIFY pgrst, 'reload schema';


-- ════════════════════════════════════════════════════════
-- MIGRATION 067_fix_plate_sort_order.sql
-- ════════════════════════════════════════════════════════
-- ══════════════════════════════════════════════════════════════════════════════
-- MIGRATION 067: FIX — "Plate" sort_order landed at the end instead of first
-- ══════════════════════════════════════════════════════════════════════════════
-- Migration 066's backfill matched on name = 'Plates' (plural), but the
-- actual seeded row (migration 062) is named 'Plate' (singular) — so it
-- never matched, fell into the "unrecognized item" bucket, and sorted
-- alphabetically after everything else instead of first in the workflow.
-- Confirmed by Mehboob's screenshot (Plate showing last).
-- ══════════════════════════════════════════════════════════════════════════════

UPDATE cost_item_types
SET sort_order = 10
WHERE name IN ('Plate', 'Plates') AND deleted_at IS NULL;

NOTIFY pgrst, 'reload schema';


-- ════════════════════════════════════════════════════════
-- MIGRATION 068_jobs_form_updates.sql
-- ════════════════════════════════════════════════════════
-- ══════════════════════════════════════════════════════════════════════════════
-- MIGRATION 068: JOBS FORM UPDATES — Pasting side, combined material dropdown,
-- UV Coating type
-- ══════════════════════════════════════════════════════════════════════════════
-- 1. Pasting: no schema change — jobs.pasting was already TEXT (free text
--    "e.g. Auto, Manual"), now becomes a dropdown storing 'Side' or 'B/Side'
--    from the same column.
-- 2. Board Type + Paper Type: no schema change — still two separate columns
--    (board_type_id, paper_type_id) since board_type_id is depended on
--    elsewhere (MRP demand aggregation in get_mrp_summary(), board_inventory
--    lots, quotation costing) — merging the tables would be a much larger,
--    riskier change than what was asked. Only the UI now shows one combined
--    dropdown; it still writes to whichever column matches what was picked.
-- 3. UV Coating: WAS boolean (Yes/No), now a TEXT coating type — 'UV',
--    'Soft UV', 'Water Base', 'Drip-off', or NULL for none. Existing TRUE
--    rows become 'UV' (the most common/default type) rather than being lost;
--    existing FALSE rows become NULL (no coating), matching how the new
--    dropdown represents "none" (blank), not a fourth coating option.
-- ══════════════════════════════════════════════════════════════════════════════

ALTER TABLE jobs ALTER COLUMN uv_coating DROP DEFAULT;
ALTER TABLE jobs ALTER COLUMN uv_coating TYPE TEXT
  USING (CASE WHEN uv_coating THEN 'UV' ELSE NULL END);

COMMENT ON COLUMN jobs.uv_coating IS
  'Coating type: UV, Soft UV, Water Base, Drip-off, or NULL for none. Was boolean before migration 068 — existing TRUE rows were converted to ''UV''.';

NOTIFY pgrst, 'reload schema';


-- ════════════════════════════════════════════════════════
-- MIGRATION 069_artwork_status_model.sql
-- ════════════════════════════════════════════════════════
-- ══════════════════════════════════════════════════════════════════════════════
-- MIGRATION 069: ARTWORK STATUS MODEL — Phase 1 of the Artwork/Plates redesign
-- ══════════════════════════════════════════════════════════════════════════════
-- Replaces job_artworks' single is_production_ready boolean with a real
-- status state machine:
--   draft -> internal_review -> waiting_customer_approval ->
--     (changes_requested -> back to draft, or) approved -> archived
--   (rejected is a terminal state reachable from waiting_customer_approval)
--
-- is_production_ready is KEPT (not dropped) for this release, per the
-- documented migration strategy: it's still read by the production gate in
-- jobs/[id]/workflow/route.ts. That route is updated in THIS SAME migration
-- batch (application code, not SQL) to read `status = 'approved'` instead —
-- is_production_ready becomes a mirrored/derived field the API keeps in
-- sync going forward (set true only when status moves to 'approved'), so
-- nothing that still reads the boolean silently breaks, and it can be
-- dropped cleanly in a later migration once confirmed nothing else needs it.
--
-- Also adds workflow_stages.stage_type so the production gate can match on
-- TYPE instead of matching the literal string "Artwork" against
-- workflow_stages.name — today, renaming that one stage silently disables
-- the entire artwork-approval production gate with no error anywhere.
-- ══════════════════════════════════════════════════════════════════════════════

ALTER TABLE job_artworks
  ADD COLUMN status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN (
    'draft', 'internal_review', 'waiting_customer_approval',
    'changes_requested', 'approved', 'rejected', 'archived'
  ));

-- Backfill from the existing boolean so nothing already marked ready loses
-- its state.
UPDATE job_artworks SET status = 'approved' WHERE is_production_ready = TRUE;

CREATE INDEX idx_job_artworks_status ON job_artworks(job_id, status);

ALTER TABLE workflow_stages ADD COLUMN stage_type TEXT;

-- Backfill: any existing stage literally named "Artwork" (case-insensitive)
-- is tagged as the artwork stage type, preserving current gate behavior
-- across every already-created workflow template.
UPDATE workflow_stages SET stage_type = 'artwork' WHERE name ILIKE 'artwork';

COMMENT ON COLUMN workflow_stages.stage_type IS
  'Optional stage category for server-side rules that need to find "the artwork stage" (or similar) without depending on exact stage naming. NULL for stages with no special rule attached. Currently only ''artwork'' is used, by the production gate in jobs/[id]/workflow/route.ts.';

-- Extend the job_stage_events type check (same pattern as migration 042 did
-- for plate_assigned/plate_returned) so artwork status transitions can be
-- recorded on the job timeline alongside everything else.
ALTER TABLE job_stage_events DROP CONSTRAINT job_stage_events_event_type_check;
ALTER TABLE job_stage_events ADD CONSTRAINT job_stage_events_event_type_check
  CHECK (event_type IN (
    'created','status_changed','stage_started','stage_completed',
    'stage_skipped','hold_started','hold_ended','remark_added',
    'artwork_uploaded','repeat_created','assigned','priority_changed',
    'wastage_recorded','plate_assigned','plate_returned',
    'artwork_status_changed'
  ));

NOTIFY pgrst, 'reload schema';


-- ════════════════════════════════════════════════════════
-- MIGRATION 070_artwork_customer_approval_link.sql
-- ════════════════════════════════════════════════════════
-- ══════════════════════════════════════════════════════════════════════════════
-- MIGRATION 070: ARTWORK CUSTOMER APPROVAL LINK — Phase 2
-- ══════════════════════════════════════════════════════════════════════════════
-- Same token-link convention already used for quotations (migration 045)
-- and the Customer Portal: a random 32-byte token + expiry column directly
-- on the row, validated server-side with no login required.
--
-- Also tags the existing "Customer Approval" workflow stage (already
-- seeded in every template since migration 010 — Standard Carton Workflow,
-- Premium Rigid Box, Label/Sticker all already have it as stage #2, right
-- after "Artwork") with stage_type = 'customer_approval', mirroring what
-- migration 069 did for the Artwork stage. This is what lets the public
-- approval endpoint find "the customer approval stage" for a job without
-- depending on its exact name.
-- ══════════════════════════════════════════════════════════════════════════════

ALTER TABLE job_artworks
  ADD COLUMN approval_token             TEXT UNIQUE,
  ADD COLUMN approval_token_expires_at  TIMESTAMPTZ,
  ADD COLUMN approval_link_created_at   TIMESTAMPTZ;

CREATE INDEX idx_job_artworks_approval_token
  ON job_artworks(approval_token)
  WHERE approval_token IS NOT NULL;

UPDATE workflow_stages SET stage_type = 'customer_approval' WHERE name ILIKE 'customer approval';

NOTIFY pgrst, 'reload schema';


-- ════════════════════════════════════════════════════════
-- MIGRATION 071_artwork_comments.sql
-- ════════════════════════════════════════════════════════
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


-- ════════════════════════════════════════════════════════
-- MIGRATION 072_plate_sets.sql
-- ════════════════════════════════════════════════════════
-- ══════════════════════════════════════════════════════════════════════════════
-- MIGRATION 072: PLATE SETS + AUTO-GENERATION + REPLACE-IN-PLACE — Phase 5
-- ══════════════════════════════════════════════════════════════════════════════
-- plate_sets: groups the plates made together for one job's color count into
-- a unit (C/M/Y/K as one set, not four independent plates). A job can have
-- more than one set over time (set_number increments) — e.g. a repeat job
-- reusing some plates but needing a fresh set for a redesign.
--
-- plates gains:
--   plate_set_id     — which set this plate belongs to (NULL for older
--                       plates made before this migration, and for
--                       standalone reusable stock plates never tied to a
--                       specific job/set — both stay valid, just ungrouped)
--   plate_version     — 1 for an original plate, 2+ for a replacement
--   replaces_plate_id — self-FK, so "Black damaged -> Black V2" has a
--                       queryable history chain instead of just being a
--                       new unrelated row
--
-- Status vocabulary expands from the original 5 values to the requested
-- list, PLUS 'in_storage' kept alongside it — none of the 10 requested
-- statuses (created/mounted/printing/removed/damaged/remade/reused/
-- archived/disposed/lost) cleanly means "available, not on any job right
-- now", which the existing Reuse/Return flow depends on knowing. Old rows
-- are backfilled: pending->created, in_use->mounted, retired->disposed
-- (in_storage and damaged already match, kept as-is).
--
-- job_plates gains operator_id (machine_id already existed) — the original
-- spec asks for operator-wise plate usage reporting (Phase 7), which needs
-- this captured at assignment time, not reconstructed after the fact.
--
-- Two RPCs do the actual generation/replacement work atomically:
--   generate_plate_set(job_id)  — reads jobs.no_of_colors, creates the set
--                                  + one plate per color in one transaction
--   replace_plate(plate_id)     — retires the damaged plate (status stays
--                                  in the SAME row, just marked 'damaged'),
--                                  inserts ONE new plate row (version+1,
--                                  same set, same color) — never touches
--                                  the other plates in the set
-- ══════════════════════════════════════════════════════════════════════════════

CREATE TABLE plate_sets (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id    UUID NOT NULL REFERENCES companies(id),
  job_id        UUID NOT NULL REFERENCES jobs(id),
  set_number    INTEGER NOT NULL DEFAULT 1,
  no_of_colors  INTEGER NOT NULL,
  notes         TEXT,

  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_by    UUID,
  updated_by    UUID,
  deleted_at    TIMESTAMPTZ,
  is_active     BOOLEAN NOT NULL DEFAULT TRUE,

  UNIQUE (company_id, job_id, set_number)
);

CREATE INDEX idx_plate_sets_job ON plate_sets(job_id);

CREATE TRIGGER trg_plate_sets_updated_at BEFORE UPDATE ON plate_sets
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

ALTER TABLE plate_sets ENABLE ROW LEVEL SECURITY;
CREATE POLICY plate_sets_tenant ON plate_sets
  USING (company_id = (auth.jwt() ->> 'company_id')::UUID);

CREATE TRIGGER trg_audit_plate_sets AFTER INSERT OR UPDATE OR DELETE ON plate_sets
  FOR EACH ROW EXECUTE FUNCTION log_audit_event();

ALTER TABLE plates
  ADD COLUMN plate_set_id     UUID REFERENCES plate_sets(id),
  ADD COLUMN plate_version    INTEGER NOT NULL DEFAULT 1,
  ADD COLUMN replaces_plate_id UUID REFERENCES plates(id);

CREATE INDEX idx_plates_set ON plates(plate_set_id);

-- Backfill old status values to the new vocabulary before widening the
-- CHECK constraint (in_storage/damaged already match, left alone).
UPDATE plates SET status = 'created' WHERE status = 'pending';
UPDATE plates SET status = 'mounted' WHERE status = 'in_use';
UPDATE plates SET status = 'disposed' WHERE status = 'retired';

ALTER TABLE plates DROP CONSTRAINT plates_status_check;
ALTER TABLE plates ADD CONSTRAINT plates_status_check CHECK (status IN (
  'created', 'mounted', 'printing', 'removed', 'in_storage',
  'damaged', 'remade', 'reused', 'archived', 'disposed', 'lost'
));
ALTER TABLE plates ALTER COLUMN status SET DEFAULT 'created';

-- mark_plate_reused() (migration 042) hardcoded status = 'in_use' — no
-- longer a valid value under the new CHECK constraint above. Replaced with
-- the same function body, only the status literal changed to 'mounted'.
CREATE OR REPLACE FUNCTION mark_plate_reused(p_plate_id UUID)
RETURNS VOID
LANGUAGE plpgsql
SECURITY INVOKER
AS $$
BEGIN
  UPDATE plates
  SET status = 'mounted',
      reuse_count = reuse_count + 1,
      last_used_at = NOW()
  WHERE id = p_plate_id;
END;
$$;

ALTER TABLE job_plates ADD COLUMN operator_id UUID REFERENCES users(id);

-- ─── generate_plate_set(): one job -> one full set, atomically ────────────────
CREATE OR REPLACE FUNCTION generate_plate_set(p_job_id UUID, p_company_id UUID, p_created_by UUID)
RETURNS UUID
LANGUAGE plpgsql
SECURITY INVOKER
AS $$
DECLARE
  v_no_of_colors INTEGER;
  v_job_number   TEXT;
  v_set_id       UUID;
  v_next_set     INTEGER;
  v_colors       TEXT[];
  v_i            INTEGER;
BEGIN
  SELECT no_of_colors, job_number INTO v_no_of_colors, v_job_number
  FROM jobs WHERE id = p_job_id AND company_id = p_company_id;

  IF v_job_number IS NULL THEN
    RAISE EXCEPTION 'Job not found';
  END IF;
  IF v_no_of_colors IS NULL OR v_no_of_colors < 1 THEN
    RAISE EXCEPTION 'Job has no color count set — add "No. of Colors" on the job first';
  END IF;

  SELECT COALESCE(MAX(set_number), 0) + 1 INTO v_next_set
  FROM plate_sets WHERE job_id = p_job_id AND company_id = p_company_id;

  INSERT INTO plate_sets (company_id, job_id, set_number, no_of_colors, created_by)
  VALUES (p_company_id, p_job_id, v_next_set, v_no_of_colors, p_created_by)
  RETURNING id INTO v_set_id;

  -- Default color names: standard CMYK for a 4-color job (by far the most
  -- common case), plain "Black" for a 1-color job, generic "Color N"
  -- placeholders otherwise (2/3/5+ color jobs are usually specific spot
  -- colors the estimator/designer picks, not a fixed formula) — every
  -- generated plate's color name stays freely editable afterward either way.
  v_colors := CASE
    WHEN v_no_of_colors = 1 THEN ARRAY['Black']
    WHEN v_no_of_colors = 4 THEN ARRAY['Cyan', 'Magenta', 'Yellow', 'Black']
    ELSE (SELECT array_agg('Color ' || g) FROM generate_series(1, v_no_of_colors) g)
  END;

  FOR v_i IN 1 .. array_length(v_colors, 1) LOOP
    INSERT INTO plates (company_id, plate_code, color, status, origin_job_id, plate_set_id, made_date, created_by)
    VALUES (
      p_company_id,
      v_job_number || '-S' || v_next_set || '-' || v_colors[v_i],
      v_colors[v_i], 'created', p_job_id, v_set_id, CURRENT_DATE, p_created_by
    );
  END LOOP;

  RETURN v_set_id;
END;
$$;

-- ─── replace_plate(): retire one plate, insert its replacement — set untouched ─
CREATE OR REPLACE FUNCTION replace_plate(p_plate_id UUID, p_company_id UUID, p_reason TEXT, p_created_by UUID)
RETURNS UUID
LANGUAGE plpgsql
SECURITY INVOKER
AS $$
DECLARE
  v_old plates%ROWTYPE;
  v_new_id UUID;
BEGIN
  SELECT * INTO v_old FROM plates WHERE id = p_plate_id AND company_id = p_company_id;
  IF v_old.id IS NULL THEN
    RAISE EXCEPTION 'Plate not found';
  END IF;

  UPDATE plates
  SET status = 'damaged', retired_reason = COALESCE(p_reason, retired_reason), updated_by = p_created_by
  WHERE id = p_plate_id;

  INSERT INTO plates (
    company_id, plate_code, color, plate_size, material, status,
    origin_job_id, plate_set_id, plate_version, replaces_plate_id, made_date, created_by
  ) VALUES (
    p_company_id,
    v_old.plate_code || '-v' || (v_old.plate_version + 1),
    v_old.color, v_old.plate_size, v_old.material, 'created',
    v_old.origin_job_id, v_old.plate_set_id, v_old.plate_version + 1, v_old.id, CURRENT_DATE, p_created_by
  ) RETURNING id INTO v_new_id;

  RETURN v_new_id;
END;
$$;

NOTIFY pgrst, 'reload schema';


-- ════════════════════════════════════════════════════════
-- MIGRATION 073_plates_simplified.sql
-- ════════════════════════════════════════════════════════
-- ══════════════════════════════════════════════════════════════════════════════
-- MIGRATION 073: PLATES MODULE — FULL SIMPLIFICATION
-- ══════════════════════════════════════════════════════════════════════════════
-- Reverses Phase 5's plate_sets/auto-generation/replace-in-place complexity
-- entirely, per Mehboob's explicit feedback that the module had become too
-- complicated for real day-to-day use. New shape:
--
--   - Plate Code, Die Number, Material, Cost, Vendor, Storage Location,
--     Made Date: no longer collected from the user. plate_code stays a
--     required/unique DB column (auto-generated server-side, never shown);
--     the rest stay as nullable/defaulted columns, simply unused going
--     forward — not dropped, since they're harmless sitting empty and
--     dropping columns is a one-way door with no real benefit here.
--   - Plate Size: was free text, now locked to exactly two real values this
--     shop uses: '1030 x 790' and '1030 x 770'.
--   - Status: was 11 values (created/mounted/printing/removed/in_storage/
--     damaged/remade/reused/archived/disposed/lost), now exactly 3:
--     in_storage / in_use / damaged. Existing rows remapped: mounted/
--     printing/reused -> in_use; created/removed/remade -> in_storage
--     (unchanged); archived/disposed/lost -> damaged (closest "not usable"
--     bucket — imperfect for 'archived' specifically, but there's no
--     "archived" concept left in the 3-value model).
--   - plate_sets, generate_plate_set(), replace_plate(): all removed.
--     "Replace a damaged plate" is now just: mark the old one Damaged, add
--     a new plate manually — no dedicated mechanism, per Mehboob's request.
--   - Cutting a plate down to the smaller size (a real recurring case —
--     plate made at 1030x790, later manually trimmed to 1030x770) is
--     handled by just editing plate_size directly on the existing row (no
--     new plate created) — the existing `remarks` column gets an
--     auto-appended note ("Cut from 1030 x 790 to 1030 x 770 on <date>")
--     so the history isn't silently lost, without needing a new column.
-- ══════════════════════════════════════════════════════════════════════════════

-- Drop the columns tying plates to the old Set concept before dropping the
-- table itself.
ALTER TABLE plates DROP COLUMN IF EXISTS plate_set_id;
ALTER TABLE plates DROP COLUMN IF EXISTS plate_version;
ALTER TABLE plates DROP COLUMN IF EXISTS replaces_plate_id;

DROP FUNCTION IF EXISTS generate_plate_set(UUID, UUID, UUID);
DROP FUNCTION IF EXISTS replace_plate(UUID, UUID, TEXT, UUID);
DROP TABLE IF EXISTS plate_sets;

-- Remap status values down to the 3-value model before narrowing the CHECK.
UPDATE plates SET status = 'in_use'     WHERE status IN ('mounted', 'printing', 'reused');
UPDATE plates SET status = 'in_storage' WHERE status IN ('created', 'removed', 'remade');
UPDATE plates SET status = 'damaged'    WHERE status IN ('archived', 'disposed', 'lost');
-- 'in_storage' and 'damaged' rows already at those exact values are untouched.

ALTER TABLE plates DROP CONSTRAINT plates_status_check;
ALTER TABLE plates ADD CONSTRAINT plates_status_check CHECK (status IN ('in_storage', 'in_use', 'damaged'));
ALTER TABLE plates ALTER COLUMN status SET DEFAULT 'in_storage';

-- Normalize plate_size to the two real values — anything else (old free-text
-- entries like '24 x 36 in') becomes NULL rather than silently kept as an
-- now-invalid value.
UPDATE plates SET plate_size = NULL WHERE plate_size NOT IN ('1030 x 790', '1030 x 770');
ALTER TABLE plates ADD CONSTRAINT plates_size_check CHECK (plate_size IS NULL OR plate_size IN ('1030 x 790', '1030 x 770'));

-- mark_plate_reused() (migrations 042/072) — no change needed, 'mounted' is
-- still a valid... wait, it isn't anymore. Point it at 'in_use' instead.
CREATE OR REPLACE FUNCTION mark_plate_reused(p_plate_id UUID)
RETURNS VOID
LANGUAGE plpgsql
SECURITY INVOKER
AS $$
BEGIN
  UPDATE plates
  SET status = 'in_use',
      reuse_count = reuse_count + 1,
      last_used_at = NOW()
  WHERE id = p_plate_id;
END;
$$;

NOTIFY pgrst, 'reload schema';


-- ════════════════════════════════════════════════════════
-- MIGRATION 074_machine_cycle_times.sql
-- ════════════════════════════════════════════════════════
-- ═══════════════════════════════════════════════════════════════════════════
-- MACHINE CYCLE-TIME ANALYTICS (Task 45 — data foundation for scheduling)
-- ═══════════════════════════════════════════════════════════════════════════
-- Read-only aggregation over the existing production_assignments table — no
-- new columns, no new tables. actual_minutes has been captured on every
-- completed assignment since migration 016; this just surfaces the average/
-- min/max per machine + workflow stage so a "standard time" reference can be
-- derived from real historical performance instead of a manually-maintained
-- table that immediately goes stale. Same SECURITY INVOKER + STABLE pattern
-- as get_qc_defect_trends (migration 057).
-- ═══════════════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION get_machine_cycle_times(
  p_company_id UUID,
  p_days       INTEGER DEFAULT 90
)
RETURNS TABLE (
  machine_id   UUID,
  machine_name TEXT,
  stage_name   TEXT,
  sample_count BIGINT,
  avg_minutes  NUMERIC,
  min_minutes  INTEGER,
  max_minutes  INTEGER
)
LANGUAGE sql
STABLE
SECURITY INVOKER
AS $$
  SELECT
    pa.machine_id,
    m.name AS machine_name,
    ws.name AS stage_name,
    COUNT(*) AS sample_count,
    ROUND(AVG(pa.actual_minutes), 1) AS avg_minutes,
    MIN(pa.actual_minutes) AS min_minutes,
    MAX(pa.actual_minutes) AS max_minutes
  FROM production_assignments pa
  JOIN machines m ON m.id = pa.machine_id
  LEFT JOIN job_stage_progress jsp ON jsp.id = pa.stage_progress_id
  LEFT JOIN workflow_stages ws ON ws.id = jsp.workflow_stage_id
  WHERE pa.company_id = p_company_id
    AND pa.status = 'completed'
    AND pa.actual_minutes IS NOT NULL
    AND pa.deleted_at IS NULL
    AND pa.actual_end >= NOW() - (p_days || ' days')::INTERVAL
  GROUP BY pa.machine_id, m.name, ws.name
  ORDER BY m.name, ws.name;
$$;

NOTIFY pgrst, 'reload schema';


-- ════════════════════════════════════════════════════════
-- MIGRATION 075_costing_variance_report.sql
-- ════════════════════════════════════════════════════════
-- ─── REPORT: JOB COSTING VARIANCE (Task 18) ───────────────────────────────────
-- One row per costed job: quoted vs actual cost vs margin, so Mehboob can see
-- which jobs overran their estimate and which customers/job-types are most
-- profitable. Read-only view over the existing job_costings + jobs tables —
-- no new columns, no change to the costing calculation itself.

CREATE OR REPLACE VIEW report_job_costing_variance AS
SELECT
  jc.id                                            AS costing_id,
  jc.company_id,
  jc.job_id,
  j.job_number,
  j.job_title,
  j.customer_id,
  c.name                                           AS customer_name,
  j.order_date,
  j.quantity,
  jc.quoted_amount,
  jc.total_cost,
  jc.margin_amount,
  jc.margin_pct,
  (jc.quoted_amount - jc.total_cost)               AS variance_amount,
  CASE
    WHEN jc.quoted_amount IS NULL OR jc.quoted_amount = 0 THEN NULL
    ELSE ROUND((((jc.quoted_amount - jc.total_cost) / jc.quoted_amount) * 100)::numeric, 2)
  END                                               AS variance_pct,
  CASE
    WHEN jc.quoted_amount IS NULL THEN 'not_quoted'
    WHEN jc.total_cost > jc.quoted_amount THEN 'over_budget'
    WHEN jc.total_cost < jc.quoted_amount THEN 'under_budget'
    ELSE 'on_budget'
  END                                               AS budget_status,
  jc.costed_at,
  jc.costed_by
FROM job_costings jc
JOIN jobs j       ON j.id = jc.job_id
LEFT JOIN customers c ON c.id = j.customer_id
WHERE jc.is_active = TRUE
  AND j.deleted_at IS NULL;

NOTIFY pgrst, 'reload schema';


-- ════════════════════════════════════════════════════════
-- MIGRATION 076_color_specs_library.sql
-- ════════════════════════════════════════════════════════
-- ══════════════════════════════════════════════════════════════════════════════
-- MIGRATION 076: COLOR / SPEC MATCHING LIBRARY — Task 25
-- ══════════════════════════════════════════════════════════════════════════════
-- Centralized repository of named color specs (Pantone / CMYK build / custom
-- spot mix) so staff can search-and-reuse an exact spec instead of retyping a
-- color name/shade from memory on every job. Purely additive: existing
-- plates.color / ink_types.color_code free-text fields are untouched — a
-- plate can optionally link to a color_specs row via the new nullable
-- plates.color_spec_id, or keep using free text exactly as before.
-- ══════════════════════════════════════════════════════════════════════════════

CREATE TABLE color_specs (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id    UUID NOT NULL REFERENCES companies(id),
  name          TEXT NOT NULL,                 -- e.g. "ABC Brand Red", "Pantone 286C"
  color_type    TEXT NOT NULL DEFAULT 'custom' CHECK (color_type IN ('pantone','cmyk','spot','custom')),
  pantone_code  TEXT,                           -- e.g. "286 C", only meaningful when color_type='pantone'
  cmyk_c        NUMERIC(5,2),
  cmyk_m        NUMERIC(5,2),
  cmyk_y        NUMERIC(5,2),
  cmyk_k        NUMERIC(5,2),
  hex_preview   TEXT,                           -- optional swatch color for the UI, display only
  customer_id   UUID REFERENCES customers(id),  -- NULL = global/house spec, set = customer-specific brand color
  notes         TEXT,

  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_by    UUID,
  updated_by    UUID,
  deleted_at    TIMESTAMPTZ,
  is_active     BOOLEAN NOT NULL DEFAULT TRUE
);

CREATE INDEX idx_color_specs_company  ON color_specs(company_id);
CREATE INDEX idx_color_specs_customer ON color_specs(customer_id);

CREATE TRIGGER trg_color_specs_updated_at BEFORE UPDATE ON color_specs
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

ALTER TABLE color_specs ENABLE ROW LEVEL SECURITY;
CREATE POLICY color_specs_tenant ON color_specs
  USING (company_id = (auth.jwt() ->> 'company_id')::UUID);

CREATE TRIGGER trg_audit_color_specs AFTER INSERT OR UPDATE OR DELETE ON color_specs
  FOR EACH ROW EXECUTE FUNCTION log_audit_event();

-- Optional link from an existing plate to a library spec. Nullable, additive —
-- plates.color (free text) keeps working exactly as before for anyone who
-- doesn't use the library.
ALTER TABLE plates ADD COLUMN color_spec_id UUID REFERENCES color_specs(id);

NOTIFY pgrst, 'reload schema';


-- ════════════════════════════════════════════════════════
-- MIGRATION 077_webhook_delivery.sql
-- ════════════════════════════════════════════════════════
-- ══════════════════════════════════════════════════════════════════════════════
-- MIGRATION 077: WEBHOOK DELIVERY — Task 21
-- ══════════════════════════════════════════════════════════════════════════════
-- Lets Mehboob (or a customer's own system, via Zapier/Make/custom code)
-- register a URL that gets an HTTPS POST whenever a subscribed business
-- event happens. Two tables: webhook_endpoints (what to call, which events,
-- a signing secret) and webhook_deliveries (every attempt, for a visible
-- delivery log / debugging — same spirit as the existing audit_log table
-- but scoped to outbound calls instead of DB writes).
--
-- Scope for this pass: two real trigger points wired in app code (not in
-- this migration) — dispatch delivered (POD confirmed) and invoice payment
-- recorded. Event vocabulary is a plain text column, not a DB enum, so
-- Mehboob can ask for more event types later without a migration.
-- ══════════════════════════════════════════════════════════════════════════════

CREATE TABLE webhook_endpoints (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id    UUID NOT NULL REFERENCES companies(id),
  name          TEXT NOT NULL,
  url           TEXT NOT NULL,
  secret        TEXT NOT NULL,              -- HMAC-SHA256 signing key, shown once on creation
  event_types   TEXT[] NOT NULL DEFAULT '{}', -- e.g. {'dispatch.delivered','invoice.payment_recorded'}
  is_active     BOOLEAN NOT NULL DEFAULT TRUE,

  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_by    UUID,
  updated_by    UUID,
  deleted_at    TIMESTAMPTZ,
  is_active_row BOOLEAN NOT NULL DEFAULT TRUE  -- placeholder never used, see note below
);

-- NOTE: is_active already carries the endpoint's own on/off toggle (a real
-- business field the UI needs), so the universal 8-column pattern's own
-- is_active would collide with it. Drop the placeholder and use deleted_at
-- alone for the soft-delete half of the pattern instead.
ALTER TABLE webhook_endpoints DROP COLUMN is_active_row;

CREATE INDEX idx_webhook_endpoints_company ON webhook_endpoints(company_id);

CREATE TRIGGER trg_webhook_endpoints_updated_at BEFORE UPDATE ON webhook_endpoints
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

ALTER TABLE webhook_endpoints ENABLE ROW LEVEL SECURITY;
CREATE POLICY webhook_endpoints_tenant ON webhook_endpoints
  USING (company_id = (auth.jwt() ->> 'company_id')::UUID);

CREATE TRIGGER trg_audit_webhook_endpoints AFTER INSERT OR UPDATE OR DELETE ON webhook_endpoints
  FOR EACH ROW EXECUTE FUNCTION log_audit_event();

CREATE TABLE webhook_deliveries (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id    UUID NOT NULL REFERENCES companies(id),
  endpoint_id   UUID NOT NULL REFERENCES webhook_endpoints(id),
  event_type    TEXT NOT NULL,
  payload       JSONB NOT NULL,
  status        TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','success','failed')),
  response_code INTEGER,
  error_message TEXT,
  attempt_count INTEGER NOT NULL DEFAULT 0,
  attempted_at  TIMESTAMPTZ,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_webhook_deliveries_endpoint ON webhook_deliveries(endpoint_id, created_at DESC);

ALTER TABLE webhook_deliveries ENABLE ROW LEVEL SECURITY;
CREATE POLICY webhook_deliveries_tenant ON webhook_deliveries
  USING (company_id = (auth.jwt() ->> 'company_id')::UUID);

NOTIFY pgrst, 'reload schema';


-- ════════════════════════════════════════════════════════
-- MIGRATION 078_ai_artwork_preflight.sql
-- ════════════════════════════════════════════════════════
-- ══════════════════════════════════════════════════════════════════════════════
-- MIGRATION 078: AI ARTWORK PRE-FLIGHT CHECK — Task 48
-- ══════════════════════════════════════════════════════════════════════════════
-- Adds columns to store the result of an on-demand Claude vision check on an
-- uploaded artwork JPG — resolution/quality concerns relative to the job's
-- print size, flagged before the file goes to Planning/Printing. Purely
-- additive, nullable — an artwork row with no check run yet behaves exactly
-- as before (status NULL, no UI change unless the check is actually run).
-- ══════════════════════════════════════════════════════════════════════════════

ALTER TABLE job_artworks
  ADD COLUMN ai_preflight_status    TEXT CHECK (ai_preflight_status IN ('pass','warning','fail')),
  ADD COLUMN ai_preflight_summary   TEXT,
  ADD COLUMN ai_preflight_issues    JSONB,
  ADD COLUMN ai_preflight_checked_at TIMESTAMPTZ;

NOTIFY pgrst, 'reload schema';


-- ════════════════════════════════════════════════════════
-- MIGRATION 079_automation_engine.sql
-- ════════════════════════════════════════════════════════
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


-- ══════════════════════════════════════════════════════════════════════════════
-- ADDENDUM: get_next_document_number()
-- ══════════════════════════════════════════════════════════════════════════════
-- NOT part of any numbered migration (001-079) — this function exists on the
-- live Supabase database but was never created by a tracked migration file,
-- and current app code does not call it (the app actually uses
-- get_next_sequence_number(), created in migration 009_sequences.sql, for
-- real document-number generation).
--
-- Added here on 2026-07-22 by extracting the exact live definition via:
--   SELECT pg_get_functiondef(oid) FROM pg_proc
--   WHERE proname = 'get_next_document_number';
-- This is the verbatim live definition, not a guess or reconstruction —
-- included so a fresh database ends up byte-for-byte identical to the
-- current live one, even for this one orphaned/unused function.
-- ══════════════════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION public.get_next_document_number(p_company_id uuid, p_document_type text, p_year integer DEFAULT NULL::integer)
 RETURNS text
 LANGUAGE plpgsql
 SECURITY DEFINER
AS $function$
DECLARE
  v_year        INTEGER;
  v_seq_row     document_sequences%ROWTYPE;
  v_next_val    INTEGER;
  v_padded      TEXT;
  v_number      TEXT;
BEGIN
  v_year := COALESCE(p_year, EXTRACT(YEAR FROM NOW())::INTEGER);

  -- Upsert the sequence row (creates if not exists for this year)
  INSERT INTO document_sequences (company_id, document_type, year, prefix, prefix_format, zero_padding, current_value)
  VALUES (p_company_id, p_document_type, v_year,
    CASE p_document_type
      WHEN 'job'       THEN 'JO'
      WHEN 'quotation' THEN 'QT'
      WHEN 'so'        THEN 'SO'
      WHEN 'po'        THEN 'PO'
      WHEN 'dispatch'  THEN 'DS'
      ELSE UPPER(p_document_type)
    END,
    '{PREFIX}-{YEAR}-{SEQ}', 5, 0
  )
  ON CONFLICT (company_id, document_type, year) DO NOTHING;

  -- Lock the row for this transaction (prevents concurrent duplicates)
  SELECT * INTO v_seq_row
  FROM document_sequences
  WHERE company_id = p_company_id
    AND document_type = p_document_type
    AND year = v_year
  FOR UPDATE;

  -- Increment
  v_next_val := v_seq_row.current_value + 1;

  UPDATE document_sequences
  SET current_value = v_next_val, updated_at = NOW()
  WHERE id = v_seq_row.id;

  -- Format: replace placeholders
  v_padded := LPAD(v_next_val::TEXT, v_seq_row.zero_padding, '0');
  v_number := v_seq_row.prefix_format;
  v_number := REPLACE(v_number, '{PREFIX}', v_seq_row.prefix);
  v_number := REPLACE(v_number, '{YEAR}',   v_year::TEXT);
  v_number := REPLACE(v_number, '{SEQ}',    v_padded);

  RETURN v_number;
END;
$function$
;

GRANT EXECUTE ON FUNCTION public.get_next_document_number(uuid, text, integer) TO authenticated;

NOTIFY pgrst, 'reload schema';
