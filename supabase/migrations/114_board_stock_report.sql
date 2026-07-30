-- ══════════════════════════════════════════════════════════════════════════════
-- JAFSON PRINT ERP — MIGRATION 114: MONTHLY BOARD STOCK REPORT
-- ══════════════════════════════════════════════════════════════════════════════
--
-- WHY
--   The shop's real board stock report — the Excel it has kept for years — is
--   Opening / Received / Total / Issued / Return From Production / Balance per
--   item, grouped by vendor. The ERP had every one of those movements in
--   board_inventory_movements (immutable since 015) and no way to read them back
--   as that report: the Board Stock screen shows only today's number.
--
--   That is the whole advantage of having a ledger. The Excel is overwritten
--   every month, so last month's figures are gone the moment August starts.
--   With this function ANY past month can be produced again, exactly, forever.
--
-- WHAT THIS DOES
--   Adds ONE read-only function, get_board_stock_report(company, from, to).
--   No table, no column, no data change.
--
--   Opening comes from `balance_after` of the last movement BEFORE the window —
--   not from re-adding history. balance_after is the true absolute stock at that
--   moment, so opening is right even if a quantity was ever recorded with an
--   unexpected sign. closing_sheets is computed
--   (opening + received + returned - issued + adjustments) and
--   ledger_closing is read from balance_after, so the two can be compared: if
--   they ever disagree, the ledger and the arithmetic have drifted and the report
--   itself will show it rather than hiding it.
--
-- THE SIGN CONVENTION, written down because the code disagreed with itself
--   Three routes write 'out' movements. store/[id] (MRN issue) and
--   qc/reprint/[id] both wrote a POSITIVE quantity; board-inventory/[id]
--   (manual Stock Out) wrote a NEGATIVE one. Any report that summed `quantity`
--   would therefore have been wrong the moment both paths were used.
--   **quantity is a POSITIVE MAGNITUDE; the direction lives in movement_type.**
--   The one exception is 'adjustment', which is inherently a signed delta
--   (+ when stock was corrected up, − when down).
--   The outlier route is fixed in the same commit as this migration, and
--   board_inventory_movements was at 0 rows on live when this was written
--   (probed, not assumed), so there is no historical data in the other
--   convention. The function still uses abs() per movement_type so a stray sign
--   can never silently flip a total.
--
--   'production_return' is the reference_type for board coming BACK from the
--   floor. It is an 'in' movement — reference_type is free TEXT, so no CHECK
--   needed — and it is reported in its own column, exactly as the Excel has it.
--
-- WINDOW BOUNDARIES
--   occurred_at is TIMESTAMPTZ; the shop's month is a Pakistan month. The bounds
--   are therefore converted from Asia/Karachi wall time, so a movement at
--   1 August 02:00 PKT lands in August and not in July as a naive UTC compare
--   would have it. Written as range bounds rather than a per-row date cast so
--   the index on (company_id, occurred_at) can still be used.
--
-- WHY IT IS SAFE
--   CREATE OR REPLACE on a brand-new name. Read-only, STABLE, SECURITY INVOKER —
--   so RLS still applies and a user cannot read another company's ledger even by
--   passing someone else's company id.
--
-- HOW TO UNDO
--   DROP FUNCTION IF EXISTS get_board_stock_report(UUID, DATE, DATE);
-- ══════════════════════════════════════════════════════════════════════════════

BEGIN;

-- Sign convention, on the column itself so the next person cannot miss it.
COMMENT ON COLUMN board_inventory_movements.quantity IS
  'A POSITIVE MAGNITUDE in SHEETS. Direction comes from movement_type, never '
  'from the sign — do not write a negative for an ''out''. The single exception '
  'is movement_type = ''adjustment'', which stores a signed delta. Reports use '
  'abs() per movement_type so a stray sign cannot flip a total silently.';

COMMENT ON COLUMN board_inventory_movements.reference_type IS
  'Where the movement came from: ''purchase_order'' (receipt), ''mrn'' (issue to '
  'a job, and QC reprints), ''production_return'' (board coming back from the '
  'floor — an ''in''), or ''manual''. Free text by design; the stock report keys '
  'the Return column off ''production_return''.';

CREATE OR REPLACE FUNCTION get_board_stock_report(
  p_company_id UUID,
  p_from       DATE,
  p_to         DATE
)
RETURNS TABLE (
  board_item_id     UUID,
  description       TEXT,
  vendor_name       TEXT,
  gsm               NUMERIC,
  sheet_width_in    NUMERIC,
  sheet_height_in   NUMERIC,
  sheets_per_packet INTEGER,
  opening_sheets    NUMERIC,
  received_sheets   NUMERIC,
  returned_sheets   NUMERIC,
  issued_sheets     NUMERIC,
  adjustment_sheets NUMERIC,
  closing_sheets    NUMERIC,
  ledger_closing    NUMERIC
)
LANGUAGE sql
STABLE
SECURITY INVOKER
AS $$
WITH bounds AS (
  SELECT (p_from::timestamp       AT TIME ZONE 'Asia/Karachi') AS lo,
         ((p_to + 1)::timestamp   AT TIME ZONE 'Asia/Karachi') AS hi
),
items AS (
  SELECT b.id, b.description, v.name AS vendor_name, b.gsm,
         b.sheet_width_in, b.sheet_height_in, b.sheets_per_packet
  FROM   board_inventory b
  LEFT   JOIN vendors v ON v.id = b.vendor_id AND v.deleted_at IS NULL
  WHERE  b.company_id = p_company_id
    AND  b.deleted_at IS NULL
    AND  b.is_active
),
-- Absolute stock immediately before the window: the newest movement's own
-- balance_after. No re-adding of history, so no sign can spoil it.
opening AS (
  SELECT DISTINCT ON (m.board_item_id) m.board_item_id, m.balance_after
  FROM   board_inventory_movements m CROSS JOIN bounds
  WHERE  m.company_id = p_company_id
    AND  m.occurred_at < bounds.lo
  ORDER  BY m.board_item_id, m.occurred_at DESC, m.id DESC
),
ranged AS (
  SELECT m.board_item_id,
         SUM(CASE WHEN m.movement_type = 'in'
                   AND COALESCE(m.reference_type, '') <> 'production_return'
                  THEN abs(m.quantity) ELSE 0 END) AS received,
         SUM(CASE WHEN m.movement_type = 'in'
                   AND m.reference_type = 'production_return'
                  THEN abs(m.quantity) ELSE 0 END) AS returned,
         SUM(CASE WHEN m.movement_type = 'out'
                  THEN abs(m.quantity) ELSE 0 END) AS issued,
         -- signed on purpose: an adjustment can correct stock up or down
         SUM(CASE WHEN m.movement_type = 'adjustment'
                  THEN m.quantity ELSE 0 END)      AS adjustment
  FROM   board_inventory_movements m CROSS JOIN bounds
  WHERE  m.company_id = p_company_id
    AND  m.occurred_at >= bounds.lo
    AND  m.occurred_at <  bounds.hi
  GROUP  BY m.board_item_id
),
closing AS (
  SELECT DISTINCT ON (m.board_item_id) m.board_item_id, m.balance_after
  FROM   board_inventory_movements m CROSS JOIN bounds
  WHERE  m.company_id = p_company_id
    AND  m.occurred_at < bounds.hi
  ORDER  BY m.board_item_id, m.occurred_at DESC, m.id DESC
)
SELECT i.id,
       i.description,
       i.vendor_name,
       i.gsm,
       i.sheet_width_in,
       i.sheet_height_in,
       i.sheets_per_packet,
       COALESCE(o.balance_after, 0)                        AS opening_sheets,
       COALESCE(r.received, 0)                             AS received_sheets,
       COALESCE(r.returned, 0)                             AS returned_sheets,
       COALESCE(r.issued, 0)                               AS issued_sheets,
       COALESCE(r.adjustment, 0)                           AS adjustment_sheets,
       COALESCE(o.balance_after, 0)
         + COALESCE(r.received, 0)
         + COALESCE(r.returned, 0)
         - COALESCE(r.issued, 0)
         + COALESCE(r.adjustment, 0)                       AS closing_sheets,
       COALESCE(c.balance_after, COALESCE(o.balance_after, 0)) AS ledger_closing
FROM   items i
LEFT   JOIN opening o ON o.board_item_id = i.id
LEFT   JOIN ranged  r ON r.board_item_id = i.id
LEFT   JOIN closing c ON c.board_item_id = i.id
ORDER  BY i.vendor_name NULLS LAST, i.description, i.gsm;
$$;

GRANT EXECUTE ON FUNCTION get_board_stock_report(UUID, DATE, DATE) TO authenticated;

COMMIT;

-- ─── VERIFY (read-only) ───────────────────────────────────────────────────────
--   SELECT description, vendor_name,
--          opening_sheets, received_sheets, returned_sheets, issued_sheets,
--          closing_sheets, ledger_closing,
--          closing_sheets = ledger_closing AS ties_up
--   FROM   get_board_stock_report('00000000-0000-0000-0000-000000000001',
--                                 '2026-07-01', '2026-07-31');
--   -- ties_up FALSE on any row means the ledger and the arithmetic disagree.

NOTIFY pgrst, 'reload schema';
