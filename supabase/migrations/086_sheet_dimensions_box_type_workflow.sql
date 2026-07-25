-- 086 — Sheet Width/Height everywhere · Box Type master · HL workflow ·
--       merged Artwork & Customer Approval stage
--
-- Why: the same physical measurement — the size of a printed sheet — was
-- stored under three different names, and on jobs it was not stored as a
-- number at all:
--
--   board_types      sheet_length_in / sheet_width_in
--   quotation_items  sheet_length_in / sheet_width_in
--   board_inventory  size_l          / size_w
--   jobs             sheet_size TEXT  ("25 X 25.5")
--
-- Because the job carried free text, the auto-MRN board demand could only
-- match on board_type_id — so one board stocked in two sheet sizes was
-- indistinguishable. After this migration every one of them is
-- sheet_width_in / sheet_height_in, and demand can match the exact stock row.
--
-- Renames are two-step and ORDERED (width -> height first, then length ->
-- width) because doing it the other way collides on the name. Each step is
-- guarded on the TARGET name being absent as well, so re-running the file is
-- a no-op instead of renaming the already-renamed column a second time. No value ever
-- moves between columns; only the labels change.
--
-- Also: Box Type becomes a real settings-managed master (Box / HL / Label /
-- Sticker), an HL workflow template is added, and Artwork + Customer Approval
-- become one stage across every template.

-- ══════════════════════════════════════════════════════════════════════════
-- 1. RENAMES — board_types, quotation_items, board_inventory
-- ══════════════════════════════════════════════════════════════════════════

DO $$
BEGIN
  -- board_types
  IF EXISTS (SELECT 1 FROM information_schema.columns
             WHERE table_name = 'board_types' AND column_name = 'sheet_width_in')
     AND NOT EXISTS (SELECT 1 FROM information_schema.columns
             WHERE table_name = 'board_types' AND column_name = 'sheet_height_in') THEN
    ALTER TABLE board_types RENAME COLUMN sheet_width_in TO sheet_height_in;
  END IF;
  IF EXISTS (SELECT 1 FROM information_schema.columns
             WHERE table_name = 'board_types' AND column_name = 'sheet_length_in') THEN
    ALTER TABLE board_types RENAME COLUMN sheet_length_in TO sheet_width_in;
  END IF;

  -- quotation_items
  IF EXISTS (SELECT 1 FROM information_schema.columns
             WHERE table_name = 'quotation_items' AND column_name = 'sheet_width_in')
     AND NOT EXISTS (SELECT 1 FROM information_schema.columns
             WHERE table_name = 'quotation_items' AND column_name = 'sheet_height_in') THEN
    ALTER TABLE quotation_items RENAME COLUMN sheet_width_in TO sheet_height_in;
  END IF;
  IF EXISTS (SELECT 1 FROM information_schema.columns
             WHERE table_name = 'quotation_items' AND column_name = 'sheet_length_in') THEN
    ALTER TABLE quotation_items RENAME COLUMN sheet_length_in TO sheet_width_in;
  END IF;

  -- board_inventory — size_l/size_w here ARE the sheet size (unlike
  -- quotation_items.size_l/size_w, which are the finished box dimensions and
  -- are deliberately left alone).
  IF EXISTS (SELECT 1 FROM information_schema.columns
             WHERE table_name = 'board_inventory' AND column_name = 'size_w')
     AND NOT EXISTS (SELECT 1 FROM information_schema.columns
             WHERE table_name = 'board_inventory' AND column_name = 'sheet_height_in') THEN
    ALTER TABLE board_inventory RENAME COLUMN size_w TO sheet_height_in;
  END IF;
  IF EXISTS (SELECT 1 FROM information_schema.columns
             WHERE table_name = 'board_inventory' AND column_name = 'size_l') THEN
    ALTER TABLE board_inventory RENAME COLUMN size_l TO sheet_width_in;
  END IF;
END $$;

COMMENT ON COLUMN board_types.sheet_width_in      IS 'Default sheet width in inches.';
COMMENT ON COLUMN board_types.sheet_height_in     IS 'Default sheet height in inches.';
COMMENT ON COLUMN quotation_items.sheet_width_in  IS 'Sheet width in inches for this costed line.';
COMMENT ON COLUMN quotation_items.sheet_height_in IS 'Sheet height in inches for this costed line.';
COMMENT ON COLUMN board_inventory.sheet_width_in  IS 'Stocked sheet width in inches — matched against jobs.sheet_width_in for board demand.';
COMMENT ON COLUMN board_inventory.sheet_height_in IS 'Stocked sheet height in inches — matched against jobs.sheet_height_in for board demand.';

-- ══════════════════════════════════════════════════════════════════════════
-- 2. JOBS — free-text sheet_size becomes two numbers
-- ══════════════════════════════════════════════════════════════════════════

ALTER TABLE jobs
  ADD COLUMN IF NOT EXISTS sheet_width_in  NUMERIC(10,2),
  ADD COLUMN IF NOT EXISTS sheet_height_in NUMERIC(10,2);

-- Backfill from the old text. Stripping every space first means the sloppy
-- entries parse too — '18.75  x 3 5' becomes '18.75x35'. Anything that still
-- does not match the pattern is left NULL rather than guessed at.
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.columns
             WHERE table_name = 'jobs' AND column_name = 'sheet_size') THEN
    UPDATE jobs j
    SET sheet_width_in  = (s.m[1])::NUMERIC,
        sheet_height_in = (s.m[2])::NUMERIC
    FROM (
      SELECT id,
             regexp_match(
               replace(replace(replace(sheet_size, ' ', ''), '"', ''), '''', ''),
               '^([0-9]+(?:\.[0-9]+)?)[xX×*]([0-9]+(?:\.[0-9]+)?)$'
             ) AS m
      FROM jobs
      WHERE sheet_size IS NOT NULL AND sheet_size <> ''
    ) s
    WHERE j.id = s.id AND s.m IS NOT NULL;
  END IF;
END $$;

-- global_search_index (Phase 28, master migration ~line 1801) reads
-- jobs.sheet_size directly inside its search_vector tsvector, so Postgres
-- refuses ALTER TABLE jobs DROP COLUMN sheet_size with "other objects depend
-- on it" while that view still exists. Drop it and recreate it right after
-- the column is gone, pointed at the new numeric columns instead of the old
-- text one. Search behaviour is unchanged: a sheet size still becomes
-- searchable text, just built from two numbers now ('18.75 35') instead of
-- the old free-text field.
--
-- The master migration defines this as a MATERIALIZED view, but a live
-- database can have drifted from that file (a manual fix applied straight in
-- Supabase, never captured back into a migration) — exactly what happened
-- here: this environment's copy turned out to be a plain VIEW, so a hardcoded
-- DROP MATERIALIZED VIEW fails with "is not a materialized view". Rather than
-- assume either shape, detect which one actually exists and recreate that
-- SAME shape — upgrading/downgrading it is a separate decision this
-- migration has no business making on its own.
--
-- NUMERIC(10,2)::text always pads to 2 decimals ('25.00', '18.75'), and
-- 'simple' tsvector treats a decimal as ONE token — without trimming that
-- padding, typing '25' would never find a job whose sheet is 25.00 wide.
-- regexp_replace(...,'\.?0+$','') strips trailing zeros (and a now-bare
-- trailing dot), so '25.00' -> '25' while '18.75' is left untouched.
--
-- Unconditional drop+recreate on every run, so this migration stays a no-op
-- to re-run regardless of which step it's re-run from. DDL statements below
-- are plain (not EXECUTE'd) since none of them reference a dynamic
-- identifier — only the branch taken is dynamic, not the SQL text itself.
DO $$
DECLARE
  was_matview BOOLEAN;
BEGIN
  was_matview := EXISTS (
    SELECT 1 FROM pg_matviews WHERE schemaname = 'public' AND matviewname = 'global_search_index'
  );

  IF was_matview THEN
    DROP MATERIALIZED VIEW global_search_index CASCADE;
  ELSIF EXISTS (SELECT 1 FROM pg_views WHERE schemaname = 'public' AND viewname = 'global_search_index') THEN
    DROP VIEW global_search_index CASCADE;
  END IF;

  ALTER TABLE jobs DROP COLUMN IF EXISTS sheet_size;

  IF was_matview THEN
    CREATE MATERIALIZED VIEW global_search_index AS
    SELECT
      j.id,
      j.company_id,
      'job'::TEXT AS entity_type,
      j.job_number AS code,
      j.job_title AS title,
      j.status,
      j.customer_id,
      c.name AS customer_name,
      j.created_at,
      j.required_date,
      to_tsvector('simple',
        coalesce(j.job_number,'') || ' ' ||
        coalesce(j.job_title,'') || ' ' ||
        coalesce(c.name,'') || ' ' ||
        coalesce(j.die_number,'') || ' ' ||
        coalesce(regexp_replace(j.sheet_width_in::text,  '\.?0+$', ''), '') || ' ' ||
        coalesce(regexp_replace(j.sheet_height_in::text, '\.?0+$', ''), '') || ' ' ||
        coalesce(j.pasting,'')
      ) AS search_vector
    FROM jobs j
    LEFT JOIN customers c ON c.id = j.customer_id
    WHERE j.deleted_at IS NULL AND j.is_active = TRUE
    UNION ALL
    SELECT
      cu.id, cu.company_id, 'customer'::TEXT,
      cu.customer_code, cu.name, 'active', cu.id, cu.name, cu.created_at, NULL,
      to_tsvector('simple', coalesce(cu.customer_code,'') || ' ' || coalesce(cu.name,'') || ' ' || coalesce(cu.email,'') || ' ' || coalesce(cu.phone,''))
    FROM customers cu WHERE cu.deleted_at IS NULL AND cu.is_active = TRUE
    UNION ALL
    SELECT
      so.id, so.company_id, 'sales_order'::TEXT,
      so.so_number, so.so_number, so.status, so.customer_id, c2.name, so.created_at, so.required_date,
      to_tsvector('simple', coalesce(so.so_number,'') || ' ' || coalesce(c2.name,''))
    FROM sales_orders so
    LEFT JOIN customers c2 ON c2.id = so.customer_id
    WHERE so.deleted_at IS NULL AND so.is_active = TRUE;

    CREATE UNIQUE INDEX idx_gsi_id ON global_search_index(id, entity_type);
    CREATE INDEX idx_gsi_company ON global_search_index(company_id);
    CREATE INDEX idx_gsi_search  ON global_search_index USING GIN(search_vector);
  ELSE
    CREATE VIEW global_search_index AS
    SELECT
      j.id,
      j.company_id,
      'job'::TEXT AS entity_type,
      j.job_number AS code,
      j.job_title AS title,
      j.status,
      j.customer_id,
      c.name AS customer_name,
      j.created_at,
      j.required_date,
      to_tsvector('simple',
        coalesce(j.job_number,'') || ' ' ||
        coalesce(j.job_title,'') || ' ' ||
        coalesce(c.name,'') || ' ' ||
        coalesce(j.die_number,'') || ' ' ||
        coalesce(regexp_replace(j.sheet_width_in::text,  '\.?0+$', ''), '') || ' ' ||
        coalesce(regexp_replace(j.sheet_height_in::text, '\.?0+$', ''), '') || ' ' ||
        coalesce(j.pasting,'')
      ) AS search_vector
    FROM jobs j
    LEFT JOIN customers c ON c.id = j.customer_id
    WHERE j.deleted_at IS NULL AND j.is_active = TRUE
    UNION ALL
    SELECT
      cu.id, cu.company_id, 'customer'::TEXT,
      cu.customer_code, cu.name, 'active', cu.id, cu.name, cu.created_at, NULL,
      to_tsvector('simple', coalesce(cu.customer_code,'') || ' ' || coalesce(cu.name,'') || ' ' || coalesce(cu.email,'') || ' ' || coalesce(cu.phone,''))
    FROM customers cu WHERE cu.deleted_at IS NULL AND cu.is_active = TRUE
    UNION ALL
    SELECT
      so.id, so.company_id, 'sales_order'::TEXT,
      so.so_number, so.so_number, so.status, so.customer_id, c2.name, so.created_at, so.required_date,
      to_tsvector('simple', coalesce(so.so_number,'') || ' ' || coalesce(c2.name,''))
    FROM sales_orders so
    LEFT JOIN customers c2 ON c2.id = so.customer_id
    WHERE so.deleted_at IS NULL AND so.is_active = TRUE;
    -- Plain views can't carry their own indexes — none to recreate here.
  END IF;
END $$;

COMMENT ON COLUMN jobs.sheet_width_in  IS 'Sheet width in inches. Replaced the free-text sheet_size column in migration 086.';
COMMENT ON COLUMN jobs.sheet_height_in IS 'Sheet height in inches. Replaced the free-text sheet_size column in migration 086.';

-- ══════════════════════════════════════════════════════════════════════════
-- 3. BOX TYPES — settings-managed master, same shape as the other lookups
-- ══════════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS box_types (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id  UUID NOT NULL REFERENCES companies(id),
  name        TEXT NOT NULL,
  description TEXT,
  sort_order  INTEGER NOT NULL DEFAULT 0,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_by  UUID, updated_by UUID, deleted_at TIMESTAMPTZ,
  is_active   BOOLEAN NOT NULL DEFAULT TRUE
);

CREATE INDEX IF NOT EXISTS idx_box_types_company ON box_types(company_id) WHERE deleted_at IS NULL;

DROP TRIGGER IF EXISTS trg_box_types_upd ON box_types;
CREATE TRIGGER trg_box_types_upd BEFORE UPDATE ON box_types
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

ALTER TABLE box_types ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS box_types_tenant ON box_types;
CREATE POLICY box_types_tenant ON box_types
  USING (company_id = (auth.jwt() ->> 'company_id')::UUID)
  WITH CHECK (company_id = (auth.jwt() ->> 'company_id')::UUID);

-- Seeded for every existing tenant, not just the default company, so a second
-- company created before this migration is not left with an empty dropdown.
INSERT INTO box_types (company_id, name, sort_order)
SELECT c.id, v.n, v.o
FROM companies c
CROSS JOIN (VALUES ('Box', 1), ('HL', 2), ('Label', 3), ('Sticker', 4)) AS v(n, o)
WHERE NOT EXISTS (
  SELECT 1 FROM box_types b
  WHERE b.company_id = c.id AND lower(b.name) = lower(v.n) AND b.deleted_at IS NULL
);

ALTER TABLE jobs               ADD COLUMN IF NOT EXISTS box_type_id UUID REFERENCES box_types(id);
ALTER TABLE quotation_items    ADD COLUMN IF NOT EXISTS box_type_id UUID REFERENCES box_types(id);
-- Quotation -> Sales Order -> Job: the box type has to survive both hops.
ALTER TABLE sales_order_items  ADD COLUMN IF NOT EXISTS box_type_id UUID REFERENCES box_types(id);

CREATE INDEX IF NOT EXISTS idx_jobs_box_type ON jobs(box_type_id) WHERE deleted_at IS NULL;

COMMENT ON COLUMN jobs.box_type_id            IS 'Box / HL / Label / Sticker — editable master in Settings > Materials > Box Types.';
COMMENT ON COLUMN quotation_items.box_type_id IS 'Box type for this quoted line; carried onto the job when the quotation converts.';

-- ══════════════════════════════════════════════════════════════════════════
-- 4. MERGE Artwork + Customer Approval into ONE stage, every template
-- ══════════════════════════════════════════════════════════════════════════
-- Mehboob: "Artwork → Customer Approval aik hi hay". A single stage can only
-- carry one stage_type, so the merged stage gets a new one — 'artwork_approval'
-- — and the three code paths that used to look for 'artwork' or
-- 'customer_approval' now accept it as well. Old rows keep their old type, so
-- nothing that is already running changes meaning.

UPDATE workflow_stages
SET name = 'Artwork & Customer Approval',
    stage_type = 'artwork_approval'
WHERE stage_type = 'artwork'
  AND deleted_at IS NULL;

-- A job that has not reached approval yet would otherwise sit waiting on a
-- step its template no longer has. Pending rows are skipped; anything
-- in_progress or completed is left exactly as it is, so live jobs and history
-- are untouched.
UPDATE job_stage_progress p
SET status = 'skipped'
FROM workflow_stages s
WHERE p.workflow_stage_id = s.id
  AND s.stage_type = 'customer_approval'
  AND p.status = 'pending';

-- Soft delete only — job_stage_progress.workflow_stage_id is a hard FK, and
-- running jobs still point at this row.
UPDATE workflow_stages
SET deleted_at = NOW(), is_active = FALSE
WHERE stage_type = 'customer_approval'
  AND deleted_at IS NULL;

-- ══════════════════════════════════════════════════════════════════════════
-- 5. HL WORKFLOW TEMPLATE
-- ══════════════════════════════════════════════════════════════════════════
-- Mehboob's own sequence for hinge-lid cigarette packs:
--   · Artwork and customer approval are one step
--   · Varnish/coating is usually inline with printing and only sometimes a
--     separate offline pass — so it is OPTIONAL, not mandatory
--   · Embossing is done on the die-cutting machine, so they are one stage
--   · No lamination and no folder gluing — the press supplies flat blanks
--     and pasting happens on the customer's own packing machine

DO $$
DECLARE
  c RECORD;
  v_tpl_id UUID;
BEGIN
  FOR c IN SELECT id FROM companies LOOP
    IF EXISTS (
      SELECT 1 FROM workflow_templates
      WHERE company_id = c.id AND lower(name) = 'hl (hinge lid)' AND deleted_at IS NULL
    ) THEN
      CONTINUE;
    END IF;

    INSERT INTO workflow_templates (company_id, name, description)
    VALUES (c.id, 'HL (Hinge Lid)', 'Hinge-lid cigarette pack — flat blanks, no lamination or gluing')
    RETURNING id INTO v_tpl_id;

    INSERT INTO workflow_stages
      (company_id, workflow_template_id, name, sequence_order, is_optional, stage_type, estimated_hours)
    VALUES
      (c.id, v_tpl_id, 'Artwork & Customer Approval', 1, FALSE, 'artwork_approval', 24),
      (c.id, v_tpl_id, 'Planning',                    2, FALSE, 'planning',          2),
      (c.id, v_tpl_id, 'Board Issue',                 3, FALSE, 'board_issue',       1),
      (c.id, v_tpl_id, 'Printing',                    4, FALSE, 'printing',          8),
      (c.id, v_tpl_id, 'Varnish / Coating',           5, TRUE,  'coating',           3),
      (c.id, v_tpl_id, 'Die Cutting & Embossing',     6, FALSE, 'die_cutting',       5),
      (c.id, v_tpl_id, 'Packing',                     7, FALSE, 'packing',           3),
      (c.id, v_tpl_id, 'Dispatch',                    8, FALSE, 'dispatch',          2);
  END LOOP;
END $$;

NOTIFY pgrst, 'reload schema';
