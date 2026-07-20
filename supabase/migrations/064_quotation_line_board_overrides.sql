-- ═══════════════════════════════════════════════════════════════════════════
-- QUOTATION ITEMS — PER-LINE BOARD OVERRIDES + SALES TAX WIRING
-- ═══════════════════════════════════════════════════════════════════════════
-- Sheet size, board GSM, and board rate were only ever settable at the
-- Board Type catalog level — meaning a custom or one-off sheet size not in
-- the catalog (or a board whose rate has since changed) couldn't be costed
-- at all. These are now per-line fields, pre-filled from the selected board
-- type but always overridable, so "Per KG" costing has GSM/rate to work
-- with even when nothing in the catalog matches exactly.
--
-- Sales tax already had a home — quotations.tax_id already referenced the
-- existing `taxes` catalog (008_units_currencies_taxes.sql) with its own
-- rate_percent; the quotation form just never surfaced it. No new tax
-- column needed here, just wiring in the UI/API (done separately).
--
-- overhead_percent / margin_percent columns from 046 are left in place
-- (existing quotations keep their saved values) but are no longer written
-- to by new saves — overhead/margin-driven auto-pricing was removed per
-- Mehboob's request; profit is now just unit_price minus cost, shown live.
-- ═══════════════════════════════════════════════════════════════════════════

ALTER TABLE quotation_items
  ADD COLUMN IF NOT EXISTS sheet_length_in     NUMERIC(8,2),
  ADD COLUMN IF NOT EXISTS sheet_width_in      NUMERIC(8,2),
  ADD COLUMN IF NOT EXISTS board_gsm           INTEGER,
  ADD COLUMN IF NOT EXISTS board_rate_per_sheet NUMERIC(12,4),
  ADD COLUMN IF NOT EXISTS board_rate_per_kg    NUMERIC(12,4);

NOTIFY pgrst, 'reload schema';
