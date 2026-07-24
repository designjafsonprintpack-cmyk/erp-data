-- ══════════════════════════════════════════════════════════════════════════════
-- MIGRATION 081: CONFIGURABLE SESSION (IDLE) TIMEOUT
-- ══════════════════════════════════════════════════════════════════════════════
-- Adds a company-level setting for how long a user can be idle before
-- IdleTimeoutGuard signs them out (previously hardcoded at 120 minutes with
-- no toggle anywhere). Allowed values: 15 / 30 / 60 / 120 / 240 (minutes) or
-- 'never'. Seeded here under category='security' (new category, not yet
-- used elsewhere) rather than left for the first PATCH to create it — same
-- reason as migration 049's email-notification keys: the generic
-- admin/settings PATCH upsert only writes company_id/key/value on conflict,
-- so an unseeded row would come back with category = NULL and vanish from
-- any category-filtered settings screen.
--
-- Seeded value '120' matches the previous hardcoded constant exactly, so
-- existing companies see zero behavior change until someone explicitly
-- changes it in Settings > Session Timeout.
-- ══════════════════════════════════════════════════════════════════════════════

INSERT INTO system_settings (company_id, key, value, category, description)
SELECT c.id, 'session_timeout_minutes', '120', 'security',
  'Minutes of inactivity before a user is automatically signed out. One of 15/30/60/120/240 or ''never''.'
FROM companies c
ON CONFLICT (company_id, key) DO NOTHING;

NOTIFY pgrst, 'reload schema';
