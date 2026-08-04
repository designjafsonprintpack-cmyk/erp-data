-- 133 — one carton, one job number: renumber the 5 existing repeats
--
-- WHAT BROKE
--   Mehboob: "job number aik hi hona chahiye jo us ka hi ho, hum job ko us
--   number se bhi yaad rakh sakein." He remembers a carton BY its number — Al
--   Safwa Mint *is* JOB-2025-00408 to him. Its reorder took a brand-new number
--   from the JOB series (JOB-2026-00010), so one box ended up with two
--   unrelated numbers and search showed what looked like two jobs.
--
--   The route is fixed in the same change: a repeat now carries the original's
--   number with the run appended. This renumbers the five that already exist.
--
--       JOB-2026-00001  ->  JOB-2025-00115-R2
--       JOB-2026-00004  ->  JOB-2025-00451-R2
--       JOB-2026-00008  ->  JOB-2025-00407-R2
--       JOB-2026-00009  ->  JOB-2025-00406-R2
--       JOB-2026-00010  ->  JOB-2025-00408-R2
--
--   The " (Repeat 2)" suffix is stripped from the title at the same time. The
--   number now says which run this is, and saying it twice is what made the
--   two rows read as different jobs in the first place.
--
-- THIS IS AN EXISTING CONVENTION
--   Press proofs are already numbered `${parent}-P1` off their parent
--   (migration 104). `-R2` is the same scheme for reorders.
--
-- ⚠ THE ONE REAL RISK — READ THIS
--   A job number is printed on the Job Card that goes to the shop floor. Any
--   card already printed for these five still shows the OLD number. Four of
--   them are in progress. Reprint the card for anything currently on a machine,
--   or tell the floor once. Nothing else references a job number as stored
--   data — `machine_floor_status`, `report_job_costing_variance` and
--   `report_job_turnaround` are VIEWS derived from `jobs`, so they follow
--   automatically. Checked, not assumed.
--
-- SAFE BY CONSTRUCTION
--   Only rows that HAVE a parent, only where the new number is not already
--   taken, and only where the number has not already been converted. Re-running
--   changes nothing. The unique index (company_id, job_number) is the backstop.
--
-- UNDO (restores each number and title exactly)
--   UPDATE jobs SET job_number='JOB-2026-00001', job_title=job_title||' (Repeat 2)' WHERE job_number='JOB-2025-00115-R2';
--   UPDATE jobs SET job_number='JOB-2026-00004', job_title=job_title||' (Repeat 2)' WHERE job_number='JOB-2025-00451-R2';
--   UPDATE jobs SET job_number='JOB-2026-00008', job_title=job_title||' (Repeat 2)' WHERE job_number='JOB-2025-00407-R2';
--   UPDATE jobs SET job_number='JOB-2026-00009', job_title=job_title||' (Repeat 2)' WHERE job_number='JOB-2025-00406-R2';
--   UPDATE jobs SET job_number='JOB-2026-00010', job_title=job_title||' (Repeat 2)' WHERE job_number='JOB-2025-00408-R2';

UPDATE jobs c
   SET job_number = p.job_number || '-R' || COALESCE(NULLIF(c.repeat_sequence, 0), 2),
       -- " (Repeat 2)" and nothing else — a title someone typed that happens to
       -- contain the word Repeat is left alone.
       job_title  = regexp_replace(c.job_title, '\s*\(Repeat \d+\)\s*$', ''),
       updated_at = NOW()
  FROM jobs p
 WHERE p.id = c.parent_job_id
   AND c.deleted_at IS NULL
   AND COALESCE(c.job_kind, 'production') = 'production'
   -- not already converted
   AND c.job_number !~ '-R\d+$'
   -- and the target must be free
   AND NOT EXISTS (
     SELECT 1 FROM jobs x
      WHERE x.company_id = c.company_id
        AND x.job_number = p.job_number || '-R' || COALESCE(NULLIF(c.repeat_sequence, 0), 2)
   );

NOTIFY pgrst, 'reload schema';
