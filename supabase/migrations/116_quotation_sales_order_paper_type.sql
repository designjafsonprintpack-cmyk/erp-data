-- ═══════════════════════════════════════════════════════════════════════════
-- QUOTATION + SALES ORDER LINES — PAPER TYPE ALONGSIDE BOARD TYPE
-- ═══════════════════════════════════════════════════════════════════════════
-- WHAT WAS BROKEN
--   `jobs` has carried both board_type_id and paper_type_id since 014, and
--   New Job / Edit Job have offered them as one "Board / Paper Type" dropdown
--   for a long time. The two tables UPSTREAM of a job never got the second
--   column: quotation_items and sales_order_items are board-only (013).
--
--   So a paper job could be created directly, but it could not be QUOTED.
--   The estimator picked from board types only, and the paper choice had
--   nowhere to live — it was re-entered by hand at job creation, or lost.
--   115 fixed the same hole on the store side (board_inventory).
--
--   Chain this restores end to end:
--     quotation_items.paper_type_id
--       -> sales_order_items.paper_type_id   (quotations/[id]/convert)
--         -> jobs.paper_type_id              (New Job prefill from the SO)
--
-- THE INVARIANT, SAME AS 115
--   A line is board OR paper, never both, enforced by a CHECK on each table
--   rather than left to the routes. Both NULL stays legal — a cost-only or
--   finishing line has no sheet material at all, and every existing row is
--   in exactly that state or board-only, so both constraints validate
--   immediately with nothing to backfill.
--
-- WHY NOT REUSE board_type_id AND ADD A "KIND" COLUMN
--   Because the FK is the point. board_type_id REFERENCES board_types and
--   paper_type_id REFERENCES paper_types; a single column plus a kind flag
--   can reference neither, and PostgREST could not embed the name for
--   display. This also keeps all four tables (jobs, board_inventory,
--   quotation_items, sales_order_items) on one identical pattern.
--
-- RISK
--   Additive and reversible. Two nullable columns, two FKs, two CHECKs, two
--   partial indexes. Nothing dropped, no type changed, no row rewritten.
--   Existing embeds of board_types(name) are unaffected: the new FK points at
--   a DIFFERENT table, so the 104 "more than one relationship" trap — which
--   only fires on two FKs to the SAME table — does not apply.
--
-- TO UNDO
--   ALTER TABLE quotation_items   DROP CONSTRAINT IF EXISTS quotation_items_one_material_type;
--   ALTER TABLE sales_order_items DROP CONSTRAINT IF EXISTS sales_order_items_one_material_type;
--   ALTER TABLE quotation_items   DROP COLUMN IF EXISTS paper_type_id;
--   ALTER TABLE sales_order_items DROP COLUMN IF EXISTS paper_type_id;
--   NOTIFY pgrst, 'reload schema';
-- ═══════════════════════════════════════════════════════════════════════════

-- ─── quotation_items ──────────────────────────────────────────────────────
ALTER TABLE quotation_items
  ADD COLUMN IF NOT EXISTS paper_type_id UUID;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'quotation_items_paper_type_id_fkey'
  ) THEN
    ALTER TABLE quotation_items
      ADD CONSTRAINT quotation_items_paper_type_id_fkey
      FOREIGN KEY (paper_type_id) REFERENCES paper_types(id);
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'quotation_items_one_material_type'
  ) THEN
    ALTER TABLE quotation_items
      ADD CONSTRAINT quotation_items_one_material_type
      CHECK (board_type_id IS NULL OR paper_type_id IS NULL);
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_qi_paper_type
  ON quotation_items(paper_type_id) WHERE paper_type_id IS NOT NULL;

COMMENT ON COLUMN quotation_items.paper_type_id IS
  'Quoted paper master when the line is paper rather than board. Mutually '
  'exclusive with board_type_id (quotation_items_one_material_type). Frozen '
  'like every other quoted value — nothing writes back to it. Added 116.';

-- ─── sales_order_items ────────────────────────────────────────────────────
ALTER TABLE sales_order_items
  ADD COLUMN IF NOT EXISTS paper_type_id UUID;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'sales_order_items_paper_type_id_fkey'
  ) THEN
    ALTER TABLE sales_order_items
      ADD CONSTRAINT sales_order_items_paper_type_id_fkey
      FOREIGN KEY (paper_type_id) REFERENCES paper_types(id);
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'sales_order_items_one_material_type'
  ) THEN
    ALTER TABLE sales_order_items
      ADD CONSTRAINT sales_order_items_one_material_type
      CHECK (board_type_id IS NULL OR paper_type_id IS NULL);
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_soi_paper_type
  ON sales_order_items(paper_type_id) WHERE paper_type_id IS NOT NULL;

COMMENT ON COLUMN sales_order_items.paper_type_id IS
  'Copied from quotation_items.paper_type_id on conversion, and read by the '
  'New Job prefill so a paper job does not have to be re-specified. Mutually '
  'exclusive with board_type_id. Added 116.';

-- ═══════════════════════════════════════════════════════════════════════════
-- VERIFY (read-only — safe to run against live)
--
--   SELECT table_name, column_name, data_type, is_nullable
--   FROM information_schema.columns
--   WHERE column_name = 'paper_type_id'
--     AND table_name IN ('quotation_items','sales_order_items');
--   -- expect: 2 rows, uuid, YES
--
--   SELECT conname FROM pg_constraint WHERE conname IN (
--     'quotation_items_paper_type_id_fkey','quotation_items_one_material_type',
--     'sales_order_items_paper_type_id_fkey','sales_order_items_one_material_type');
--   -- expect: 4 rows
--
--   SELECT (SELECT count(*) FROM quotation_items   WHERE board_type_id IS NOT NULL AND paper_type_id IS NOT NULL) AS qi_bad,
--          (SELECT count(*) FROM sales_order_items WHERE board_type_id IS NOT NULL AND paper_type_id IS NOT NULL) AS soi_bad;
--   -- expect: 0 | 0
-- ═══════════════════════════════════════════════════════════════════════════

NOTIFY pgrst, 'reload schema';
