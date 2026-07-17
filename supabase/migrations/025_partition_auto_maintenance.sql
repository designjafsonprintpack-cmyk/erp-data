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
