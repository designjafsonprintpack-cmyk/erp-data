-- ══════════════════════════════════════════════════════════════════════════════
-- MIGRATION 089: ARTWORK COMMENT TYPE — client-marked emboss areas
-- ══════════════════════════════════════════════════════════════════════════════
-- WHAT WAS MISSING
--   On the artwork approval page the customer could only leave free comments.
--   There was no way for them to say *what exactly* has to be embossed — the
--   information reached us verbally, or not at all, and the Die Cutting &
--   Embossing operator had nothing written down.
--
-- WHY THIS FIXES IT
--   Embossing is inherently a "this element, right here" instruction, and the
--   pinned-comment machinery from migration 071 already carries exactly that
--   (position_x / position_y as a percentage of the image). So rather than a
--   new table or a free-text field that loses the position, this adds one
--   discriminator column: an artwork_comment is either an ordinary 'comment'
--   or an 'emboss' mark. Existing pin rendering, resolve tracking, the staff
--   comments modal and the public token route all keep working unchanged.
--
--   position_x/position_y stay nullable, so a customer who just wants to write
--   "logo and brand name" without clicking a spot still gets an emboss row.
--
-- HOW TO UNDO
--   ALTER TABLE artwork_comments DROP COLUMN comment_type;
--   DROP INDEX IF EXISTS idx_artwork_comments_emboss;
--   NOTIFY pgrst, 'reload schema';
--
--   Purely additive — every existing row defaults to 'comment', which is the
--   behaviour before this migration.
-- ══════════════════════════════════════════════════════════════════════════════

ALTER TABLE artwork_comments
  ADD COLUMN IF NOT EXISTS comment_type TEXT NOT NULL DEFAULT 'comment';

-- Dropped first so re-running the migration can't fail on a duplicate name.
ALTER TABLE artwork_comments
  DROP CONSTRAINT IF EXISTS artwork_comments_comment_type_check;
ALTER TABLE artwork_comments
  ADD CONSTRAINT artwork_comments_comment_type_check
  CHECK (comment_type IN ('comment', 'emboss'));

-- Partial index: emboss marks are a small subset that gets queried on its own
-- (job card / production view), ordinary comments already have
-- idx_artwork_comments_artwork.
CREATE INDEX IF NOT EXISTS idx_artwork_comments_emboss
  ON artwork_comments(artwork_id)
  WHERE comment_type = 'emboss';

NOTIFY pgrst, 'reload schema';
