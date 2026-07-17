-- ══════════════════════════════════════════════════════════════════════════════
-- JAFSON PRINT ERP — MIGRATION 027: GRAIN DIRECTION
-- Printing-industry paper/board spec field — was missing entirely from the
-- schema despite being on the required feature checklist.
-- ══════════════════════════════════════════════════════════════════════════════

ALTER TABLE jobs ADD COLUMN grain_direction TEXT
  CHECK (grain_direction IN ('long_grain', 'short_grain'));

NOTIFY pgrst, 'reload schema';
