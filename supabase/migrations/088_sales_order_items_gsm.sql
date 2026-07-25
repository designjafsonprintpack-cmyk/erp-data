-- 088 — GSM carried from quotation through to the job
--
-- Why: quotation_items.board_gsm holds the GSM the price was actually built
-- on, but the quotation -> sales order -> job chain dropped it. Converting a
-- quotation copied board_type_id and box_type_id into sales_order_items and
-- left GSM behind, because sales_order_items had no column for it. The job
-- then had no way to know it had been quoted at 300 rather than 280.
--
-- This closes that gap: sales_order_items.gsm carries the QUOTED value
-- forward so a job created from the order starts on the GSM that was priced,
-- instead of on a guess.
--
-- Deliberately NOT backfilled from quotation_items. A backfill would have to
-- join through quotation_item_id and would silently invent a "quoted GSM" for
-- historical orders whose jobs may have run on something else entirely.
-- Existing rows stay NULL, which correctly reads as "not recorded".
--
-- NUMERIC to match quotation_items.board_gsm, board_inventory.gsm and
-- jobs.gsm (migration 087).
--
-- Backward compatible: additive only, no rewrite of existing rows, no RLS
-- change. Reversible with ALTER TABLE sales_order_items DROP COLUMN gsm;

ALTER TABLE sales_order_items ADD COLUMN IF NOT EXISTS gsm NUMERIC;

COMMENT ON COLUMN sales_order_items.gsm IS
  'GSM quoted for this line, copied from quotation_items.board_gsm at conversion. The commercial record of what was priced — not what was eventually issued.';

NOTIFY pgrst, 'reload schema';
