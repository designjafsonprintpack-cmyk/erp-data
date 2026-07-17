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
