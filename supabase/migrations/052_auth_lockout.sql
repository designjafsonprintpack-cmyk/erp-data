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
