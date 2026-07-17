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
