-- ══════════════════════════════════════════════════════════════════════════════
-- MIGRATION 066: COST ITEM TYPES — WORKFLOW-BASED SORT ORDER
-- ══════════════════════════════════════════════════════════════════════════════
-- Finish Goods list on New Quotation was ordered alphabetically (A→Z by
-- name), which scatters items out of production sequence (e.g. "Cartage"
-- and "Breaking" sort before "Plates" and "Printing"). Adds a sort_order
-- column so the list can follow the actual production workflow instead:
-- Plates -> Printing -> UV -> Lamination -> Foiling -> Embossing ->
-- Die Making -> Die Cutting -> Breaking -> Pasting -> Packing -> Cartage.
--
-- Backfills the known seeded items (migrations 062/063) to that order.
-- Any custom item Mehboob has already added keeps a sort_order after all
-- of these (ordered by name as a stable tie-break) — new items created
-- from now on append at the end automatically (POST route computes
-- max(sort_order)+1), not scattered alphabetically.
-- ══════════════════════════════════════════════════════════════════════════════

ALTER TABLE cost_item_types ADD COLUMN IF NOT EXISTS sort_order INTEGER NOT NULL DEFAULT 0;

DO $$
DECLARE
  cid UUID := '00000000-0000-0000-0000-000000000001';
  ord RECORD;
BEGIN
  FOR ord IN SELECT * FROM (VALUES
    ('Plates',          10),
    ('Printing Charges',20),
    ('Printing',        20),
    ('UV',              30),
    ('Lamination',      40),
    ('Foiling',         50),
    ('Embossing',       60),
    ('Embosing',        60),
    ('Die Making',      70),
    ('Die Cutting',     80),
    ('Breaking',        90),
    ('Pasting Folding', 100),
    ('Pasting',         100),
    ('Packing',         110),
    ('Cartage Charges', 120),
    ('Cartage',         120)
  ) AS t(name, seq)
  LOOP
    UPDATE cost_item_types SET sort_order = ord.seq
    WHERE company_id = cid AND name = ord.name AND deleted_at IS NULL;
  END LOOP;

  -- Any item that didn't match the known names (custom items already
  -- added via Settings -> Materials) goes after all of the above, in
  -- their current alphabetical order, so nothing jumps ahead of the
  -- real workflow items.
  UPDATE cost_item_types
  SET sort_order = 200 + sub.rn
  FROM (
    SELECT id, ROW_NUMBER() OVER (ORDER BY name) AS rn
    FROM cost_item_types
    WHERE company_id = cid AND deleted_at IS NULL AND sort_order = 0
  ) sub
  WHERE cost_item_types.id = sub.id;
END $$;

NOTIFY pgrst, 'reload schema';
