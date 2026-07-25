-- 087 — GSM on jobs
--
-- Why: GSM (board/paper weight in grams per square metre) was recorded on
-- board_types, paper_types, board_inventory and quotation_items, but NOT on
-- jobs. So an estimator could quote at a specific GSM and the job card that
-- reached the shop floor had no GSM on it at all — the operator had to infer
-- it from the board type name, and any job that deliberately ran a different
-- GSM than its board type's default had nowhere to say so.
--
-- Nullable on purpose: every existing job predates this column and has no
-- value to backfill. The New/Edit Job forms pre-fill it from the selected
-- board or paper type but leave it editable, which mirrors how
-- quotation_items.board_gsm already behaves.
--
-- NUMERIC (not INTEGER) to match gsm on board_types / paper_types /
-- quotation_items — some specialty stocks are quoted at fractional GSM.
--
-- Backward compatible: additive only, no rewrite of existing rows, no lock
-- of consequence on a table this size, no RLS policy change (the existing
-- company-scoped policies on jobs cover every column). Reversible with
-- ALTER TABLE jobs DROP COLUMN gsm;
--
-- NOTE: grain_direction is deliberately LEFT IN PLACE. Its input has been
-- removed from the New Job and Edit Job forms, but historical jobs still
-- carry values and dropping the column would destroy them irreversibly.

ALTER TABLE jobs ADD COLUMN IF NOT EXISTS gsm NUMERIC;

COMMENT ON COLUMN jobs.gsm IS
  'Board/paper weight in GSM for this job. Pre-filled from the selected board or paper type, but overridable per job.';

NOTIFY pgrst, 'reload schema';
