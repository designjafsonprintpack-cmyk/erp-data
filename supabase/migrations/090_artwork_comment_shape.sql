-- ══════════════════════════════════════════════════════════════════════════════
-- MIGRATION 090: ARTWORK COMMENT SHAPE — drawn markup on the approval page
-- ══════════════════════════════════════════════════════════════════════════════
-- WHAT WAS MISSING
--   The customer could only drop a numbered pin and type next to it. Real
--   feedback on artwork is visual — "move THIS logo", "emboss THIS border",
--   "this whole area is wrong" — and a single point cannot say any of that.
--   On a phone, placing a small pin accurately is also genuinely hard.
--
-- WHY THIS FIXES IT
--   One nullable JSONB column turns a comment into a drawing. The customer
--   draws on the artwork (pen / arrow / box / text / emboss) exactly like the
--   WhatsApp photo editor they already use every day, and each stroke is
--   stored as its own artwork_comments row with the drawn geometry attached.
--
--   Geometry is stored as PERCENTAGES of the image (0-100 on both axes), the
--   same convention position_x/position_y already use since migration 071. So
--   it renders correctly at any size — phone, desktop, or the staff modal —
--   without knowing the original pixel dimensions.
--
--   Shape format:
--     { "tool":   "pen" | "arrow" | "rect" | "text",
--       "color":  "#rrggbb",
--       "points": [[x, y], ...] }        -- x, y are 0-100
--
--   pen   = every sampled point of the freehand stroke
--   arrow = exactly 2 points (from, to)
--   rect  = exactly 2 points (opposite corners)
--   text  = 1 point (the label anchor); the words live in comment_text
--
--   Deliberately NOT a separate table: migration 071 established "one table
--   serves both", and keeping markup in artwork_comments means author,
--   resolved state, soft-delete and the emboss flag from migration 089 all
--   keep working with no extra plumbing.
--
--   Deliberately NOT a flattened image: the artwork storage bucket is private
--   and its RLS requires a company_id JWT claim (migration 036). A customer on
--   a public approval link has no session and cannot upload at all.
--
-- HOW TO UNDO
--   ALTER TABLE artwork_comments DROP COLUMN shape;
--   NOTIFY pgrst, 'reload schema';
--
--   Purely additive. Existing rows keep shape = NULL and go on rendering as
--   the numbered pins they already are.
-- ══════════════════════════════════════════════════════════════════════════════

ALTER TABLE artwork_comments
  ADD COLUMN IF NOT EXISTS shape JSONB;

-- Guard rails at the database level too, not just in the zod schema — this row
-- can be written from a public, unauthenticated endpoint.
ALTER TABLE artwork_comments
  DROP CONSTRAINT IF EXISTS artwork_comments_shape_check;
ALTER TABLE artwork_comments
  ADD CONSTRAINT artwork_comments_shape_check CHECK (
    shape IS NULL OR (
      jsonb_typeof(shape) = 'object'
      AND shape ? 'tool'
      AND shape ->> 'tool' IN ('pen', 'arrow', 'rect', 'text')
      AND jsonb_typeof(shape -> 'points') = 'array'
      AND jsonb_array_length(shape -> 'points') BETWEEN 1 AND 500
    )
  );

-- Drawn marks are fetched as a set per artwork version (the overlay renders
-- them all at once), same access pattern as the emboss index in 089.
CREATE INDEX IF NOT EXISTS idx_artwork_comments_shape
  ON artwork_comments(artwork_id)
  WHERE shape IS NOT NULL;

NOTIFY pgrst, 'reload schema';
