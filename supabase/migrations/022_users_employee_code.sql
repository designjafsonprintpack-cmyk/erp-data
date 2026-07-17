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
