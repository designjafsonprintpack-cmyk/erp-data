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
