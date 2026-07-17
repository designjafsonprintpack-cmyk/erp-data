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
