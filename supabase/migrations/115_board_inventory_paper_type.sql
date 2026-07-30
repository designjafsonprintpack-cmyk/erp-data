-- ═══════════════════════════════════════════════════════════════════════════
-- BOARD INVENTORY — PAPER TYPE ALONGSIDE BOARD TYPE
-- ═══════════════════════════════════════════════════════════════════════════
-- WHAT WAS BROKEN
--   The store stocks sheet material, and sheet material is not all board.
--   Art paper, offset paper, C1S and the rest live in `paper_types` (007,
--   seeded since day one) — but `board_inventory` only ever had
--   `board_type_id → board_types(id)`, so the "Board Type" dropdown on the
--   Add/Edit Item form could not offer them at all. A paper item had to be
--   saved with a blank type, which is why the July 2026 load left 12 of 51
--   descriptions with no type on them.
--
--   This is the same shape as 113's vendor problem: the data was fine, the
--   column simply did not exist, so a real answer had nowhere to go.
--
-- WHY A SECOND COLUMN AND NOT PAPER ROWS COPIED INTO board_types
--   Copying the paper masters into `board_types` would duplicate a master
--   table that Settings → Materials already manages on two separate tabs,
--   and `jobs` / `quotation_items` / `paper_types.gsm` all point at the real
--   table. Duplicated masters are exactly what left `units` with 28 rows for
--   14 units and made every unit dropdown list everything twice. So: one
--   nullable FK per master, and an item is one or the other.
--
--   `jobs` has carried both `board_type_id` and `paper_type_id` since 014 —
--   this makes the store side match the job side rather than invent a third
--   pattern.
--
-- THE INVARIANT
--   An item is board OR paper, never both. Enforced by a CHECK rather than
--   left to the routes, because the generic PATCH on
--   /api/v1/board-inventory/[id] does `.update(body)` — sending one of the
--   two keys while the other already held a value would otherwise leave a
--   row claiming to be both. All 51 live rows have paper_type_id NULL, so
--   the constraint validates immediately with nothing to backfill.
--
-- RISK
--   Additive and reversible. No column is dropped, no type changes, nothing
--   is rewritten. Existing rows keep their `board_type_id` untouched and get
--   NULL paper_type_id. Every current query still works — an embed of
--   `board_types(name)` is unaffected by a new FK to a DIFFERENT table
--   (the 104 "more than one relationship" trap only fires when the second FK
--   points at the SAME table, which is not the case here: board_types and
--   paper_types are two tables).
--
-- TO UNDO
--   ALTER TABLE board_inventory DROP CONSTRAINT IF EXISTS board_inventory_one_material_type;
--   ALTER TABLE board_inventory DROP COLUMN IF EXISTS paper_type_id;
--   NOTIFY pgrst, 'reload schema';
-- ═══════════════════════════════════════════════════════════════════════════

-- ─── 1. paper_type_id ─────────────────────────────────────────────────────
ALTER TABLE board_inventory
  ADD COLUMN IF NOT EXISTS paper_type_id UUID;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'board_inventory_paper_type_id_fkey'
  ) THEN
    ALTER TABLE board_inventory
      ADD CONSTRAINT board_inventory_paper_type_id_fkey
      FOREIGN KEY (paper_type_id) REFERENCES paper_types(id);
  END IF;
END $$;

COMMENT ON COLUMN board_inventory.paper_type_id IS
  'Paper master for a paper stock item (art paper, offset, C1S…). Mutually '
  'exclusive with board_type_id — an item is board OR paper, enforced by '
  'board_inventory_one_material_type. NULL on every board item. Added 115.';

COMMENT ON COLUMN board_inventory.board_type_id IS
  'Board master for a board stock item (duplex, bleach…). Mutually exclusive '
  'with paper_type_id since 115. NULL on a paper item, and NULL is also a '
  'legitimate "not classified yet" for either kind.';

CREATE INDEX IF NOT EXISTS idx_board_inv_paper_type
  ON board_inventory(paper_type_id) WHERE paper_type_id IS NOT NULL;

-- ─── 2. one material type per item ────────────────────────────────────────
-- Both NULL is allowed on purpose: 12 of the loaded items are genuinely
-- unclassified and must stay saveable until someone sets their type by hand.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'board_inventory_one_material_type'
  ) THEN
    ALTER TABLE board_inventory
      ADD CONSTRAINT board_inventory_one_material_type
      CHECK (board_type_id IS NULL OR paper_type_id IS NULL);
  END IF;
END $$;

-- ═══════════════════════════════════════════════════════════════════════════
-- VERIFY (read-only — safe to run against live)
--
--   SELECT column_name, data_type, is_nullable
--   FROM information_schema.columns
--   WHERE table_name = 'board_inventory' AND column_name = 'paper_type_id';
--   -- expect: paper_type_id | uuid | YES
--
--   SELECT conname, pg_get_constraintdef(oid)
--   FROM pg_constraint
--   WHERE conname IN ('board_inventory_paper_type_id_fkey',
--                     'board_inventory_one_material_type');
--   -- expect: 2 rows
--
--   SELECT count(*) FROM board_inventory
--   WHERE board_type_id IS NOT NULL AND paper_type_id IS NOT NULL;
--   -- expect: 0
-- ═══════════════════════════════════════════════════════════════════════════

NOTIFY pgrst, 'reload schema';
