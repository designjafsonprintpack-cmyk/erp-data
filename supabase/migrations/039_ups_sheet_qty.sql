-- ══════════════════════════════════════════════════════════════════════════════
-- JAFSON PRINT ERP — MIGRATION 039: UPS / SHEET QTY (SHEET PLANNING)
-- Printing-industry field — "Ups" (how many times the design repeats on one
-- printed sheet) and the derived "Sheet Qty" (Box Qty / Ups, rounded up).
-- This was on the required feature checklist and was previously documented
-- as a locked-in decision, but never actually existed in the schema or code.
-- ══════════════════════════════════════════════════════════════════════════════

ALTER TABLE jobs ADD COLUMN ups INTEGER CHECK (ups > 0);
ALTER TABLE jobs ADD COLUMN sheet_qty INTEGER;

NOTIFY pgrst, 'reload schema';
