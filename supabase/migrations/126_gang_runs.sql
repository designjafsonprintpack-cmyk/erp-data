-- ═══════════════════════════════════════════════════════════════════════════
-- GANG RUNS — two jobs, one sheet, one set of plates
-- ═══════════════════════════════════════════════════════════════════════════
-- WHAT THIS IS
--   Mehboob: *"akser asa hota hay k hum 2 job jin k size aik jasy hoty hain
--   aik sath chalaty hain — jasy layout 8 ups ka hay per 4 ups aik job k aur
--   4 ups aik job k, kabi 3 aur 5, kabi 2 aur 6."*
--
--   The shop deliberately picks the ups split so ONE run finishes BOTH jobs:
--
--     Job A  order 10,000  →  3 ups  →  12,000   (+2,000, agreed with the client)
--     Job B  order 20,000  →  5 ups  →  20,000
--                                       4,000 sheets
--
--   Run separately that is 1,250 + 2,500 = 3,750 sheets, TWO press setups, TWO
--   plate sets, TWO die setups. Ganged it is 4,000 sheets and ONE of each. The
--   extra 250 sheets are not a loss — they are the 2,000 extra boxes the client
--   agreed to buy. **The saving is the setup, not the board.**
--
-- WHAT IS BROKEN WITHOUT THIS
--   Nothing models it; ganging lives in `jobs.internal_remarks` as free text.
--   So the ERP asks for 1,250 + 2,500 sheets of board when the press uses
--   4,000 once — board stock, MRP and costing all wrong — and Printing is
--   hard-blocked on each job until each has its own `job_plates` rows, for one
--   physical set of plates.
--
-- ─── THE FACTS THIS IS BUILT ON, ALL FROM MEHBOOB ─────────────────────────
--   · Ganged jobs are ALWAYS for the same customer.
--   · The ups split is chosen so both jobs finish in the same run. A job is
--     never half-ganged, so a job belongs to at most ONE gang.
--   · **The DIE bounds the layout, not arithmetic.** 10 ups + 10 ups is not a
--     20-up layout — that needs a 27x44 sheet and a new die. The planner knows
--     which die they have; the ERP must NOT invent a split.
--   · They run together until PACKING. Only packing separates them.
--   · The agreed quantity replaces the order: **the Sales Order becomes
--     12,000**, because the SO is the document everyone downstream reads —
--     *"werna to hum bad main bhool jaey gy k humary pas 10000 ki jagha 12000
--     hy"*. The quotation keeps the original 10,000 and
--     `sales_order_items.quotation_item_id` still points at it, so the quoted
--     figure survives on its own — the same quoted/planned/actual separation
--     the GSM columns already use.
--
-- ─── WHY `is_gang_shared` IS A COLUMN AND NOT A RULE IN CODE ──────────────
--   The obvious implementation is "shared = every stage before Packing",
--   inferred from `stage_type`. **That does not work on this database.**
--   Probed on live first: on `Standard Carton Workflow` only Artwork, Board
--   Issue, Printing and Quality Check carry a `stage_type` at all — Planning,
--   UV Coating, Die Cutting, Folder Gluing, Packing and Dispatch are all NULL.
--   Inferring the boundary from a column that is empty on six of ten stages
--   would silently share the wrong stages.
--
--   So it is DATA on the stage, backfilled here and editable in Settings —
--   the same precedent 110 set for box type -> workflow and 093 for coating
--   types.
--
-- MIGRATION RISK
--   Purely additive: one defaulted column on `workflow_stages` and two new
--   tables. `is_gang_shared` defaults FALSE, so **nothing changes for any job
--   until a gang is actually created.** No existing query mentions these
--   objects. Nothing locks meaningfully — `workflow_stages` is a handful of
--   rows per template.
--
-- HOW TO UNDO
--   DROP TABLE IF EXISTS job_gang_members;
--   DROP TABLE IF EXISTS job_gangs;
--   ALTER TABLE workflow_stages DROP COLUMN IF EXISTS is_gang_shared;
--   DELETE FROM document_sequences WHERE document_type = 'GANG';
-- ═══════════════════════════════════════════════════════════════════════════

-- ─── 1. WHICH STAGES A GANG SHARES ────────────────────────────────────────
ALTER TABLE workflow_stages
  ADD COLUMN IF NOT EXISTS is_gang_shared BOOLEAN NOT NULL DEFAULT FALSE;

COMMENT ON COLUMN workflow_stages.is_gang_shared IS
  'TRUE when this stage is worked ONCE for a whole gang run rather than once '
  'per job — Board Issue through Folder Gluing, where the jobs are physically '
  'on the same sheet. Completing it on any member completes it on all. '
  'Artwork and Customer Approval stay per job (different products, different '
  'approvals); Packing onward stays per job (the sheet has been cut). '
  'Set as DATA, not inferred from stage_type — most live stages have none.';

-- Backfill per template: everything from Board Issue up to (but not
-- including) Packing. Computed from each template's own sequence, so a
-- template with extra stages (Lamination, Hot Foil in 111) is covered without
-- naming them, and a template without a Packing stage is left alone rather
-- than guessed at.
DO $$
DECLARE
  t         RECORD;
  seq_from  INTEGER;
  seq_to    INTEGER;
  touched   INTEGER;
  done_here BOOLEAN;
BEGIN
  FOR t IN SELECT DISTINCT workflow_template_id AS id FROM workflow_stages WHERE deleted_at IS NULL
  LOOP
    -- Skip a template that has ALREADY been backfilled, so a stage someone
    -- switched OFF in Settings stays off on a re-run — the same rule 119-123
    -- follow for permissions. A boolean cannot tell "never decided" from
    -- "deliberately false", so the decision is made per TEMPLATE: once any of
    -- its stages is shared, this migration never touches that template again.
    -- A template added later still gets backfilled, because none of ITS stages
    -- are shared yet. Caught by a test that turned UV Coating off and re-ran.
    SELECT EXISTS (
      SELECT 1 FROM workflow_stages
      WHERE workflow_template_id = t.id AND deleted_at IS NULL AND is_gang_shared
    ) INTO done_here;

    IF done_here THEN
      RAISE NOTICE 'template %: already set up, left alone', t.id;
      CONTINUE;
    END IF;

    SELECT MIN(sequence_order) INTO seq_from
    FROM workflow_stages
    WHERE workflow_template_id = t.id AND deleted_at IS NULL
      AND (stage_type = 'board_issue' OR name ILIKE '%board%issue%');

    SELECT MIN(sequence_order) INTO seq_to
    FROM workflow_stages
    WHERE workflow_template_id = t.id AND deleted_at IS NULL
      AND (stage_type = 'packing' OR name ILIKE '%packing%');

    -- Both ends must be identifiable. A template missing either is skipped
    -- and reported — marking a guess would share stages that must not be.
    IF seq_from IS NULL OR seq_to IS NULL OR seq_to <= seq_from THEN
      RAISE NOTICE 'template %: skipped (board_issue=%, packing=%)', t.id, seq_from, seq_to;
      CONTINUE;
    END IF;

    UPDATE workflow_stages
       SET is_gang_shared = TRUE, updated_at = NOW()
     WHERE workflow_template_id = t.id AND deleted_at IS NULL
       AND sequence_order >= seq_from AND sequence_order < seq_to
       AND is_gang_shared = FALSE;
    GET DIAGNOSTICS touched = ROW_COUNT;
    RAISE NOTICE 'template %: % stage(s) marked shared (seq % .. %)', t.id, touched, seq_from, seq_to - 1;
  END LOOP;
END $$;

-- ─── 2. THE RUN ───────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS job_gangs (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id    UUID NOT NULL REFERENCES companies(id),
  gang_number   TEXT NOT NULL,
  customer_id   UUID NOT NULL REFERENCES customers(id),

  -- How many ups the DIE holds on this sheet. The planner types it; the ERP
  -- has no die master to look it up from (`jobs.die_number` is free text).
  layout_ups    INTEGER NOT NULL CHECK (layout_ups > 0),
  -- Sheets the run will print. Every member's ceil(quantity/ups) must equal
  -- this — that identity is what makes a gang valid, and the API asserts it.
  sheet_count   INTEGER NOT NULL CHECK (sheet_count > 0),

  -- Copied from the member jobs at creation and asserted equal across them:
  -- two jobs cannot share a sheet unless the board and the sheet size match.
  board_type_id    UUID REFERENCES board_types(id),
  sheet_width_in   NUMERIC(10,2),
  sheet_height_in  NUMERIC(10,2),

  status        TEXT NOT NULL DEFAULT 'planned'
                CHECK (status IN ('planned','in_progress','completed','cancelled')),
  notes         TEXT,

  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_by UUID, updated_by UUID, deleted_at TIMESTAMPTZ,
  is_active  BOOLEAN NOT NULL DEFAULT TRUE,
  UNIQUE (company_id, gang_number)
);

CREATE TABLE IF NOT EXISTS job_gang_members (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id    UUID NOT NULL REFERENCES companies(id),
  gang_id       UUID NOT NULL REFERENCES job_gangs(id) ON DELETE CASCADE,
  job_id        UUID NOT NULL REFERENCES jobs(id) ON DELETE CASCADE,

  -- This job's ups on the shared layout — the 3 and the 5. Every cost the run
  -- incurs is split on this: board, plates, ink, press time, wastage.
  ups_on_layout INTEGER NOT NULL CHECK (ups_on_layout > 0),

  -- What the job was ordered at BEFORE the gang, kept so "why did this order
  -- grow from 10,000 to 12,000" is answerable years later. The Sales Order
  -- itself is updated to the agreed figure on purpose — see the header.
  original_quantity NUMERIC(12,2),

  -- The job's OWN ups before the gang — 8, the die's real layout — as opposed
  -- to the 3 it runs at inside this gang.
  --
  -- WHY THIS MUST BE KEPT
  --   Mehboob: *"next time Job A 50000 aa jata hay aur job B aata hi nahi… to
  --   dono ko saprate chalana ho ga."* A gang is a decision about THIS run, not
  --   a property of the product. But `/jobs/[id]/repeat` copies `orig.ups` and
  --   recomputes `sheet_qty = ceil(newQty / orig.ups)` — so repeating a job
  --   that had been ganged at 3 ups would plan 50,000 boxes at 3 ups =
  --   **16,667 sheets instead of 6,250**, and order nearly three times the
  --   board. Repeat and QC Reprint read this column instead.
  original_ups      INTEGER,

  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_by UUID, updated_by UUID, deleted_at TIMESTAMPTZ,
  is_active  BOOLEAN NOT NULL DEFAULT TRUE
);

-- A job runs in at most ONE gang: the split is chosen so both jobs finish
-- together, so there is never a "half in this gang, half in that one".
-- Partial so a cancelled/soft-deleted membership does not block a re-gang.
CREATE UNIQUE INDEX IF NOT EXISTS job_gang_members_one_gang_per_job
  ON job_gang_members (job_id) WHERE deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS job_gang_members_gang_idx
  ON job_gang_members (gang_id) WHERE deleted_at IS NULL;

ALTER TABLE job_gangs           ENABLE ROW LEVEL SECURITY;
ALTER TABLE job_gang_members    ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'job_gangs' AND policyname = 'job_gangs_tenant') THEN
    CREATE POLICY job_gangs_tenant ON job_gangs
      USING (company_id = (auth.jwt() ->> 'company_id')::UUID);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'job_gang_members' AND policyname = 'job_gang_members_tenant') THEN
    CREATE POLICY job_gang_members_tenant ON job_gang_members
      USING (company_id = (auth.jwt() ->> 'company_id')::UUID);
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'trg_job_gangs_upd') THEN
    CREATE TRIGGER trg_job_gangs_upd BEFORE UPDATE ON job_gangs
      FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'trg_job_gang_members_upd') THEN
    CREATE TRIGGER trg_job_gang_members_upd BEFORE UPDATE ON job_gang_members
      FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
  END IF;
END $$;

-- ─── 3. ONE PLAN ENTRY FOR THE WHOLE GANG ─────────────────────────────────
-- Mehboob: *"gang job planning ek hi entry honi chahiye."* One press slot, one
-- line on the planning board — not one per member job.
--
-- `job_plans.job_id` stays NOT NULL as it has been since 015 (making it
-- nullable would mean re-validating every existing planning query for no gain),
-- so a gang's plan hangs off its FIRST member and carries `gang_id`. Anything
-- reading the board treats a row with `gang_id` as covering every member of
-- that gang — which is why the column is here rather than the membership being
-- inferred from the job.
ALTER TABLE job_plans
  ADD COLUMN IF NOT EXISTS gang_id UUID REFERENCES job_gangs(id) ON DELETE SET NULL;

COMMENT ON COLUMN job_plans.gang_id IS
  'Set when this plan is for a whole GANG RUN rather than one job. The row''s '
  'job_id is the gang''s first member and exists only to satisfy the NOT NULL '
  'that has been there since 015 — the plan covers every job in the gang. '
  'ON DELETE SET NULL: deleting a gang must not delete the day''s plan.';

-- One live plan per gang: a second would put the same press run on the board
-- twice. Partial, so a cancelled plan does not block re-planning the gang.
CREATE UNIQUE INDEX IF NOT EXISTS job_plans_one_per_gang
  ON job_plans (gang_id) WHERE gang_id IS NOT NULL AND deleted_at IS NULL;

-- ─── 4. THE AUDIT EVENTS ──────────────────────────────────────────────────
-- Ganging rewrites a job's ups, its quantity AND its Sales Order line. That
-- MUST leave a trail, so `job_stage_events` needs two new event types.
--
-- **This is the trap 108 exists for.** 104 added press-proof events and never
-- widened this CHECK; `recordJobEvent()` did not read its own insert error, so
-- the route returned 200 and only the audit trail silently lost them. Caught
-- here before it shipped: the first draft of the gang route logged
-- `job_updated`, which is not in the list either.
--
-- Postgres has no ADD CONSTRAINT IF NOT EXISTS, so this restates the whole
-- list, exactly as 028, 042, 069, 102 and 108 all did.
ALTER TABLE job_stage_events DROP CONSTRAINT IF EXISTS job_stage_events_event_type_check;
ALTER TABLE job_stage_events ADD CONSTRAINT job_stage_events_event_type_check
  CHECK (event_type IN (
    'created','status_changed','stage_started','stage_completed',
    'stage_skipped','hold_started','hold_ended','remark_added',
    'artwork_uploaded','repeat_created','assigned','priority_changed',
    'wastage_recorded','plate_assigned','plate_returned',
    'artwork_status_changed','ink_recorded','proof_created','proof_decided',
    'gang_created','gang_removed'
  ));

-- ─── 5. THE GANG NUMBER ───────────────────────────────────────────────────
-- Same shape as every other document series (JOB-, MRN-, PO-…): GANG-2026-0001.
INSERT INTO document_sequences (company_id, document_type, year, prefix, prefix_format, padding, current_value)
SELECT c.id, 'GANG', EXTRACT(YEAR FROM NOW())::INT, 'GANG', '{PREFIX}-{YEAR}-{SEQ}', 4, 0
FROM companies c
WHERE NOT EXISTS (
  SELECT 1 FROM document_sequences d
  WHERE d.company_id = c.id AND d.document_type = 'GANG'
    AND d.year = EXTRACT(YEAR FROM NOW())::INT
);

NOTIFY pgrst, 'reload schema';

-- ═══════════════════════════════════════════════════════════════════════════
-- WHAT THE CODE DOES WITH THIS (same batch, no further migration)
-- ═══════════════════════════════════════════════════════════════════════════
--   · A calculator shows BOTH scenarios before anything is written — run
--     separately vs ganged — so the trade (one setup saved, and how many extra
--     boxes the client must accept) is on screen, not in someone's head.
--   · On confirm: each member's `ups` and `quantity` are set to the agreed
--     figures, the Sales Order line and its subtotal follow, and the original
--     quantity is kept on the membership row.
--   · Board is issued ONCE for `sheet_count`; each job's share is
--     `ups_on_layout / layout_ups`.
--   · The Printing plate gate passes for a job when any member of its gang has
--     active plates.
--   · Completing a stage with `is_gang_shared` completes it for every member.
--   · Planning shows ONE row for the gang, and every member counts as planned.
--   · **Repeat and QC Reprint read `original_ups` / `original_quantity`**, so
--     next time's order starts from the job's own die layout and its own
--     quantity — a gang never follows a product forward.
--
-- HOW TO UNDO (the plan column too)
--   DROP INDEX IF EXISTS job_plans_one_per_gang;
--   ALTER TABLE job_plans DROP COLUMN IF EXISTS gang_id;
-- ═══════════════════════════════════════════════════════════════════════════
