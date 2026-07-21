-- ══════════════════════════════════════════════════════════════════════════════
-- MIGRATION 073: PLATES MODULE — FULL SIMPLIFICATION
-- ══════════════════════════════════════════════════════════════════════════════
-- Reverses Phase 5's plate_sets/auto-generation/replace-in-place complexity
-- entirely, per Mehboob's explicit feedback that the module had become too
-- complicated for real day-to-day use. New shape:
--
--   - Plate Code, Die Number, Material, Cost, Vendor, Storage Location,
--     Made Date: no longer collected from the user. plate_code stays a
--     required/unique DB column (auto-generated server-side, never shown);
--     the rest stay as nullable/defaulted columns, simply unused going
--     forward — not dropped, since they're harmless sitting empty and
--     dropping columns is a one-way door with no real benefit here.
--   - Plate Size: was free text, now locked to exactly two real values this
--     shop uses: '1030 x 790' and '1030 x 770'.
--   - Status: was 11 values (created/mounted/printing/removed/in_storage/
--     damaged/remade/reused/archived/disposed/lost), now exactly 3:
--     in_storage / in_use / damaged. Existing rows remapped: mounted/
--     printing/reused -> in_use; created/removed/remade -> in_storage
--     (unchanged); archived/disposed/lost -> damaged (closest "not usable"
--     bucket — imperfect for 'archived' specifically, but there's no
--     "archived" concept left in the 3-value model).
--   - plate_sets, generate_plate_set(), replace_plate(): all removed.
--     "Replace a damaged plate" is now just: mark the old one Damaged, add
--     a new plate manually — no dedicated mechanism, per Mehboob's request.
--   - Cutting a plate down to the smaller size (a real recurring case —
--     plate made at 1030x790, later manually trimmed to 1030x770) is
--     handled by just editing plate_size directly on the existing row (no
--     new plate created) — the existing `remarks` column gets an
--     auto-appended note ("Cut from 1030 x 790 to 1030 x 770 on <date>")
--     so the history isn't silently lost, without needing a new column.
-- ══════════════════════════════════════════════════════════════════════════════

-- Drop the columns tying plates to the old Set concept before dropping the
-- table itself.
ALTER TABLE plates DROP COLUMN IF EXISTS plate_set_id;
ALTER TABLE plates DROP COLUMN IF EXISTS plate_version;
ALTER TABLE plates DROP COLUMN IF EXISTS replaces_plate_id;

DROP FUNCTION IF EXISTS generate_plate_set(UUID, UUID, UUID);
DROP FUNCTION IF EXISTS replace_plate(UUID, UUID, TEXT, UUID);
DROP TABLE IF EXISTS plate_sets;

-- Remap status values down to the 3-value model before narrowing the CHECK.
UPDATE plates SET status = 'in_use'     WHERE status IN ('mounted', 'printing', 'reused');
UPDATE plates SET status = 'in_storage' WHERE status IN ('created', 'removed', 'remade');
UPDATE plates SET status = 'damaged'    WHERE status IN ('archived', 'disposed', 'lost');
-- 'in_storage' and 'damaged' rows already at those exact values are untouched.

ALTER TABLE plates DROP CONSTRAINT plates_status_check;
ALTER TABLE plates ADD CONSTRAINT plates_status_check CHECK (status IN ('in_storage', 'in_use', 'damaged'));
ALTER TABLE plates ALTER COLUMN status SET DEFAULT 'in_storage';

-- Normalize plate_size to the two real values — anything else (old free-text
-- entries like '24 x 36 in') becomes NULL rather than silently kept as an
-- now-invalid value.
UPDATE plates SET plate_size = NULL WHERE plate_size NOT IN ('1030 x 790', '1030 x 770');
ALTER TABLE plates ADD CONSTRAINT plates_size_check CHECK (plate_size IS NULL OR plate_size IN ('1030 x 790', '1030 x 770'));

-- mark_plate_reused() (migrations 042/072) — no change needed, 'mounted' is
-- still a valid... wait, it isn't anymore. Point it at 'in_use' instead.
CREATE OR REPLACE FUNCTION mark_plate_reused(p_plate_id UUID)
RETURNS VOID
LANGUAGE plpgsql
SECURITY INVOKER
AS $$
BEGIN
  UPDATE plates
  SET status = 'in_use',
      reuse_count = reuse_count + 1,
      last_used_at = NOW()
  WHERE id = p_plate_id;
END;
$$;

NOTIFY pgrst, 'reload schema';
