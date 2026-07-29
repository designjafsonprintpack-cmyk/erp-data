-- ══════════════════════════════════════════════════════════════════════════════
-- JAFSON PRINT ERP — MIGRATION 109: LEGACY JOB NUMBERS — "OLD" → "2025"
-- ══════════════════════════════════════════════════════════════════════════════
--
-- WHAT WAS WRONG
--   093 imported 478 historic jobs from the old Excel and numbered them
--   JOB-OLD-0001 … JOB-OLD-0478 — a deliberately separate series so the live
--   JOB counter could stay at 0. That worked, but "OLD" is not a document
--   number anybody outside the office can read, and the padding (4) does not
--   match the live format (5, set by 009's document_sequences seed).
--
-- WHAT THIS DOES
--   Renames them to JOB-2025-00001 … JOB-2025-00478.
--     · 2025 because every one of those rows carries order_date = 2025-01-01
--       and completed_date = 2025-01-01 (093's backdate). The number and the
--       record now agree.
--     · 5-digit padding so they are the same shape as live numbers.
--   The live series is UNTOUCHED: document_sequences for JOB/2026 stays at
--   current_value = 0, so the first real job is still JOB-2026-00001. Old work
--   is the 2025 series, new work is the 2026 series — no overlap, no counter
--   surgery, and the two remain tellable apart at a glance.
--
--   Also records a JOB/2025 sequence row at 478 so that series can never be
--   silently reused. get_next_sequence_number() derives the year from NOW(),
--   so it will never read this row in practice — it is documentation with
--   teeth.
--
-- WHY IT IS SAFE
--   job_number lives on `jobs` alone — UNIQUE (company_id, job_number). Every
--   other table (dispatch, invoices, costings, MRNs, stage progress) reaches a
--   job by id, never by number, so nothing else needs updating. Verified
--   against the live database before writing this: 478 rows all matching
--   JOB-OLD-%, 0 other jobs, and `plates` at 0 rows — which matters because
--   generate_plate_set() bakes job_number into plate_code, so a shop with
--   existing plates would need those rebuilt. Here there are none.
--
-- IDEMPOTENT
--   Matches only ^JOB-OLD-[0-9]+$ and skips any row whose target number is
--   already taken. Running it twice changes nothing the second time.
--
-- NOTE ON lpad()
--   lpad(str, n) TRUNCATES when str is already longer than n — lpad('00001',4,'0')
--   is '0000', not '00001'. Every number below is therefore ltrim'd of its zeros
--   before being re-padded, so the statements are correct whatever padding the
--   source happens to carry. The first draft of the UNDO block missed this and
--   collapsed all 478 rows onto JOB-OLD-0000; caught by the test, not by review.
--
-- HOW TO UNDO (tested — restores JOB-OLD-0001 … JOB-OLD-0478 exactly)
--   UPDATE jobs SET job_number = 'JOB-OLD-'
--          || lpad(ltrim(substring(job_number from '^JOB-2025-([0-9]+)'), '0'), 4, '0')
--          || coalesce(substring(job_number from '(-P[0-9]+)$'), '')
--   WHERE job_number ~ '^JOB-2025-[0-9]+(-P[0-9]+)?$';
--   DELETE FROM document_sequences WHERE document_type = 'JOB' AND year = 2025;
-- ══════════════════════════════════════════════════════════════════════════════

BEGIN;

-- ─── 1. The 478 legacy jobs ───────────────────────────────────────────────────
UPDATE jobs AS j
SET    job_number = 'JOB-2025-' || lpad(ltrim(substring(j.job_number from '^JOB-OLD-([0-9]+)$'), '0'), 5, '0'),
       updated_at = NOW()
WHERE  j.job_number ~ '^JOB-OLD-[0-9]+$'
  AND  NOT EXISTS (
         SELECT 1 FROM jobs x
         WHERE  x.company_id = j.company_id
           AND  x.job_number = 'JOB-2025-' || lpad(ltrim(substring(j.job_number from '^JOB-OLD-([0-9]+)$'), '0'), 5, '0')
       );

-- ─── 2. Any press-proof run hanging off one of them ───────────────────────────
-- 104 numbers proofs PARENT-P1, PARENT-P2… There are none on legacy jobs today
-- (proof runs need a live parent), but this keeps the rename total rather than
-- leaving a JOB-OLD-0007-P1 orphan behind if one is ever created before this
-- migration is run.
UPDATE jobs AS j
SET    job_number = 'JOB-2025-'
                    || lpad(ltrim(substring(j.job_number from '^JOB-OLD-([0-9]+)-P[0-9]+$'), '0'), 5, '0')
                    || substring(j.job_number from '(-P[0-9]+)$'),
       updated_at = NOW()
WHERE  j.job_number ~ '^JOB-OLD-[0-9]+-P[0-9]+$'
  AND  NOT EXISTS (
         SELECT 1 FROM jobs x
         WHERE  x.company_id = j.company_id
           AND  x.job_number = 'JOB-2025-'
                               || lpad(ltrim(substring(j.job_number from '^JOB-OLD-([0-9]+)-P[0-9]+$'), '0'), 5, '0')
                               || substring(j.job_number from '(-P[0-9]+)$')
       );

-- ─── 3. Close the 2025 series so it can never be handed out again ─────────────
INSERT INTO document_sequences (company_id, document_type, year, prefix, padding, current_value)
SELECT j.company_id,
       'JOB',
       2025,
       'JOB',
       5,
       MAX(substring(j.job_number from '^JOB-2025-([0-9]+)')::INTEGER)
FROM   jobs j
WHERE  j.job_number ~ '^JOB-2025-[0-9]+'
GROUP  BY j.company_id
ON CONFLICT (company_id, document_type, year) DO NOTHING;

COMMIT;

-- ─── VERIFY (read-only — run after, expect 0 / 478 / 0) ───────────────────────
--   SELECT count(*) FROM jobs WHERE job_number LIKE 'JOB-OLD-%';        -- 0
--   SELECT count(*) FROM jobs WHERE job_number ~ '^JOB-2025-[0-9]{5}$'; -- 478
--   SELECT current_value FROM document_sequences
--     WHERE document_type = 'JOB' AND year = 2026;                      -- 0

NOTIFY pgrst, 'reload schema';
