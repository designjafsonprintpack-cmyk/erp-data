-- ══════════════════════════════════════════════════════════════════════════════
-- JAFSON PRINT ERP — MIGRATION 033: TAX FK ON INVOICES
-- invoices.tax_pct/tax_amount were free-floating numbers with no link back to
-- a configured tax rule — unlike quotations.tax_id and sales_orders.tax_id,
-- which both already reference the taxes table.
-- ══════════════════════════════════════════════════════════════════════════════

ALTER TABLE invoices ADD COLUMN tax_id UUID REFERENCES taxes(id);

NOTIFY pgrst, 'reload schema';
