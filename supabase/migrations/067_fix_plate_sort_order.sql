-- ══════════════════════════════════════════════════════════════════════════════
-- MIGRATION 067: FIX — "Plate" sort_order landed at the end instead of first
-- ══════════════════════════════════════════════════════════════════════════════
-- Migration 066's backfill matched on name = 'Plates' (plural), but the
-- actual seeded row (migration 062) is named 'Plate' (singular) — so it
-- never matched, fell into the "unrecognized item" bucket, and sorted
-- alphabetically after everything else instead of first in the workflow.
-- Confirmed by Mehboob's screenshot (Plate showing last).
-- ══════════════════════════════════════════════════════════════════════════════

UPDATE cost_item_types
SET sort_order = 10
WHERE name IN ('Plate', 'Plates') AND deleted_at IS NULL;

NOTIFY pgrst, 'reload schema';
