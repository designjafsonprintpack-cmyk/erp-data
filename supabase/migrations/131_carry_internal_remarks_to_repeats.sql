-- 131 — the repeats that lost their parent's Internal Remarks
--
-- WHAT BROKE
--   `jobs.internal_remarks` is a SPEC field, not a note about one order. On live
--   it carries what the floor cannot set up without:
--
--       INNER 10_UP & OUTTER 1_UP
--       INNER SIZE 58 X 21.5 X 89.5
--       OUTTER SIZE 93 X 43 X 295
--
--   Five separate paths copy a job's specs onto a new one — exact Repeat, QC
--   Reprint, press Proof, "Repeat with Changes", and "Copy specs from an old
--   job" — and **not one of them copied this column**. So every repeat of an
--   inner+outer carton arrived without its ups split or its component sizes,
--   and the only way to get them back was to open the old job and retype them.
--   104 of 488 live jobs carry a remark, so this was not a rare loss.
--
--   All five paths are fixed in the same change as this migration; this repairs
--   the repeats already created.
--
-- SCOPED BY NAME, AND IDEMPOTENT
--   Only the three known repeats, and only where the repeat's own remark is
--   still empty. A rule like "every repeat with no remark inherits its parent's"
--   would be right today and wrong later — someone clearing a remark on purpose
--   would silently get it back. The IS NULL guard also means a re-run does
--   nothing.
--
--   JOB-2026-00001 and -00004 are not here: their parents have no remark either.
--
-- Data only — no column, index, constraint or function changes.
--
-- UNDO
--   UPDATE jobs SET internal_remarks = NULL
--    WHERE job_number IN ('JOB-2026-00008','JOB-2026-00009','JOB-2026-00010');

UPDATE jobs c
   SET internal_remarks = p.internal_remarks,
       updated_at       = NOW()
  FROM jobs p
 WHERE p.id = c.parent_job_id
   AND c.job_number IN ('JOB-2026-00008', 'JOB-2026-00009', 'JOB-2026-00010')
   AND c.deleted_at IS NULL
   AND (c.internal_remarks IS NULL OR c.internal_remarks = '')
   AND p.internal_remarks IS NOT NULL
   AND p.internal_remarks <> '';

NOTIFY pgrst, 'reload schema';
