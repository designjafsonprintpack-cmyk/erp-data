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
