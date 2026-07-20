-- ══════════════════════════════════════════════════════════════════════════════
-- JAFSON PRINT ERP — MIGRATION 044: NOTIFICATION DIGEST / BATCHING
--
-- Every notification currently inserts a brand-new row, so a repeated event
-- (same low-stock item breaching threshold on three separate MRN issues in
-- an hour) creates three separate rows instead of one updating entry. This
-- adds an optional group_key: callers that pass one get merged into a single
-- open (unread) notification within a time window instead of spamming the
-- bell; callers that don't pass one keep the old one-row-per-event behavior
-- exactly as before (fully backward compatible).
-- ══════════════════════════════════════════════════════════════════════════════

ALTER TABLE notifications
  ADD COLUMN group_key         TEXT,
  ADD COLUMN occurrence_count  INTEGER NOT NULL DEFAULT 1,
  ADD COLUMN last_occurred_at  TIMESTAMPTZ NOT NULL DEFAULT NOW();

-- Fast lookup of "is there already an open digest for this user+group" —
-- partial index since only unread, non-deleted rows are ever searched this way.
CREATE INDEX idx_notifications_group_open
  ON notifications(user_id, group_key, last_occurred_at DESC)
  WHERE is_read = FALSE AND deleted_at IS NULL AND group_key IS NOT NULL;

-- ─── ATOMIC DIGEST UPSERT ────────────────────────────────────────────────────
-- If an unread notification with the same (user_id, group_key) was last
-- touched within p_window_minutes, bump its occurrence_count and refresh its
-- title/message/last_occurred_at instead of inserting a new row. Otherwise
-- insert a fresh one. Row-locked so concurrent callers for the same group
-- can't both slip past the check at once.
CREATE OR REPLACE FUNCTION upsert_notification_digest(
  p_company_id      UUID,
  p_user_id         UUID,
  p_group_key       TEXT,
  p_title           TEXT,
  p_message         TEXT,
  p_type            TEXT DEFAULT 'info',
  p_link_url        TEXT DEFAULT NULL,
  p_window_minutes  INTEGER DEFAULT 60
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY INVOKER
AS $$
DECLARE
  v_id UUID;
BEGIN
  SELECT id INTO v_id FROM notifications
  WHERE company_id = p_company_id
    AND user_id = p_user_id
    AND group_key = p_group_key
    AND is_read = FALSE
    AND deleted_at IS NULL
    AND last_occurred_at > NOW() - (p_window_minutes || ' minutes')::INTERVAL
  ORDER BY last_occurred_at DESC
  LIMIT 1
  FOR UPDATE;

  IF v_id IS NOT NULL THEN
    UPDATE notifications SET
      occurrence_count = occurrence_count + 1,
      title            = p_title,
      message          = p_message,
      link_url         = COALESCE(p_link_url, link_url),
      last_occurred_at = NOW(),
      updated_at       = NOW()
    WHERE id = v_id;
  ELSE
    INSERT INTO notifications (
      company_id, user_id, title, message, type, link_url,
      group_key, occurrence_count, last_occurred_at
    ) VALUES (
      p_company_id, p_user_id, p_title, p_message, p_type, p_link_url,
      p_group_key, 1, NOW()
    ) RETURNING id INTO v_id;
  END IF;

  RETURN v_id;
END;
$$;

NOTIFY pgrst, 'reload schema';
