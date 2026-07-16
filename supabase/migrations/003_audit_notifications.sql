-- ══════════════════════════════════════════════════════════════════════════════
-- JAFSON PRINT ERP — MIGRATION 003: AUDIT LOG, ACTIVITY LOG & NOTIFICATIONS
-- Phase 14 & 15 foundation
-- ══════════════════════════════════════════════════════════════════════════════

-- ─── AUDIT LOG (Partitioned by month, IMMUTABLE) ──────────────────────────────
CREATE TABLE audit_log (
  id            UUID NOT NULL DEFAULT gen_random_uuid(),
  company_id    UUID NOT NULL,
  table_name    TEXT NOT NULL,
  record_id     UUID,
  action        TEXT NOT NULL CHECK (action IN ('INSERT', 'UPDATE', 'DELETE')),
  old_values    JSONB,
  new_values    JSONB,
  changed_by    UUID,
  changed_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
) PARTITION BY RANGE (changed_at);

-- Create initial monthly partitions
CREATE TABLE audit_log_2026_01 PARTITION OF audit_log FOR VALUES FROM ('2026-01-01') TO ('2026-02-01');
CREATE TABLE audit_log_2026_02 PARTITION OF audit_log FOR VALUES FROM ('2026-02-01') TO ('2026-03-01');
CREATE TABLE audit_log_2026_03 PARTITION OF audit_log FOR VALUES FROM ('2026-03-01') TO ('2026-04-01');
CREATE TABLE audit_log_2026_04 PARTITION OF audit_log FOR VALUES FROM ('2026-04-01') TO ('2026-05-01');
CREATE TABLE audit_log_2026_05 PARTITION OF audit_log FOR VALUES FROM ('2026-05-01') TO ('2026-06-01');
CREATE TABLE audit_log_2026_06 PARTITION OF audit_log FOR VALUES FROM ('2026-06-01') TO ('2026-07-01');
CREATE TABLE audit_log_2026_07 PARTITION OF audit_log FOR VALUES FROM ('2026-07-01') TO ('2026-08-01');
CREATE TABLE audit_log_2026_08 PARTITION OF audit_log FOR VALUES FROM ('2026-08-01') TO ('2026-09-01');
CREATE TABLE audit_log_2026_09 PARTITION OF audit_log FOR VALUES FROM ('2026-09-01') TO ('2026-10-01');
CREATE TABLE audit_log_2026_10 PARTITION OF audit_log FOR VALUES FROM ('2026-10-01') TO ('2026-11-01');
CREATE TABLE audit_log_2026_11 PARTITION OF audit_log FOR VALUES FROM ('2026-11-01') TO ('2026-12-01');
CREATE TABLE audit_log_2026_12 PARTITION OF audit_log FOR VALUES FROM ('2026-12-01') TO ('2027-01-01');
CREATE TABLE audit_log_2027_01 PARTITION OF audit_log FOR VALUES FROM ('2027-01-01') TO ('2027-02-01');
CREATE TABLE audit_log_2027_02 PARTITION OF audit_log FOR VALUES FROM ('2027-02-01') TO ('2027-03-01');

CREATE INDEX idx_audit_log_company ON audit_log(company_id, changed_at DESC);
CREATE INDEX idx_audit_log_record ON audit_log(table_name, record_id);

ALTER TABLE audit_log ENABLE ROW LEVEL SECURITY;
-- Audit log: read only (no insert/update/delete via app — triggers only)
CREATE POLICY audit_log_tenant_read ON audit_log FOR SELECT
  USING (company_id = (auth.jwt() ->> 'company_id')::UUID);

-- ─── GENERIC AUDIT TRIGGER ────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION log_audit_event()
RETURNS TRIGGER AS $$
DECLARE
  company_id_val UUID;
BEGIN
  -- Extract company_id from the row
  BEGIN
    company_id_val := CASE
      WHEN TG_OP = 'DELETE' THEN (row_to_json(OLD) ->> 'company_id')::UUID
      ELSE (row_to_json(NEW) ->> 'company_id')::UUID
    END;
  EXCEPTION WHEN OTHERS THEN
    company_id_val := NULL;
  END;

  IF TG_OP = 'INSERT' THEN
    INSERT INTO audit_log (company_id, table_name, record_id, action, new_values, changed_by)
    VALUES (company_id_val, TG_TABLE_NAME, (row_to_json(NEW) ->> 'id')::UUID, 'INSERT', row_to_json(NEW)::JSONB, auth.uid());
    RETURN NEW;
  ELSIF TG_OP = 'UPDATE' THEN
    INSERT INTO audit_log (company_id, table_name, record_id, action, old_values, new_values, changed_by)
    VALUES (company_id_val, TG_TABLE_NAME, (row_to_json(NEW) ->> 'id')::UUID, 'UPDATE', row_to_json(OLD)::JSONB, row_to_json(NEW)::JSONB, auth.uid());
    RETURN NEW;
  ELSIF TG_OP = 'DELETE' THEN
    INSERT INTO audit_log (company_id, table_name, record_id, action, old_values, changed_by)
    VALUES (company_id_val, TG_TABLE_NAME, (row_to_json(OLD) ->> 'id')::UUID, 'DELETE', row_to_json(OLD)::JSONB, auth.uid());
    RETURN OLD;
  END IF;
  RETURN NULL;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ─── ACTIVITY LOG ─────────────────────────────────────────────────────────────
CREATE TABLE activity_log (
  id              UUID NOT NULL DEFAULT gen_random_uuid(),
  company_id      UUID NOT NULL,
  user_id         UUID,
  module_key      TEXT NOT NULL,
  action_description TEXT NOT NULL,
  entity_type     TEXT,
  entity_id       UUID,
  occurred_at     TIMESTAMPTZ NOT NULL DEFAULT NOW()
) PARTITION BY RANGE (occurred_at);

CREATE TABLE activity_log_2026_07 PARTITION OF activity_log FOR VALUES FROM ('2026-07-01') TO ('2026-08-01');
CREATE TABLE activity_log_2026_08 PARTITION OF activity_log FOR VALUES FROM ('2026-08-01') TO ('2026-09-01');
CREATE TABLE activity_log_2026_09 PARTITION OF activity_log FOR VALUES FROM ('2026-09-01') TO ('2026-10-01');
CREATE TABLE activity_log_2026_10 PARTITION OF activity_log FOR VALUES FROM ('2026-10-01') TO ('2026-11-01');
CREATE TABLE activity_log_2026_11 PARTITION OF activity_log FOR VALUES FROM ('2026-11-01') TO ('2026-12-01');
CREATE TABLE activity_log_2026_12 PARTITION OF activity_log FOR VALUES FROM ('2026-12-01') TO ('2027-01-01');
CREATE TABLE activity_log_2027_01 PARTITION OF activity_log FOR VALUES FROM ('2027-01-01') TO ('2027-02-01');

CREATE INDEX idx_activity_log_company ON activity_log(company_id, occurred_at DESC);
CREATE INDEX idx_activity_log_user ON activity_log(user_id, occurred_at DESC);

ALTER TABLE activity_log ENABLE ROW LEVEL SECURITY;
CREATE POLICY activity_log_tenant_read ON activity_log FOR SELECT
  USING (company_id = (auth.jwt() ->> 'company_id')::UUID);

-- ─── NOTIFICATIONS ────────────────────────────────────────────────────────────
CREATE TABLE notifications (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id  UUID NOT NULL REFERENCES companies(id),
  user_id     UUID REFERENCES users(id),
  title       TEXT NOT NULL,
  message     TEXT,
  type        TEXT NOT NULL DEFAULT 'info' CHECK (type IN ('info', 'success', 'warning', 'error')),
  is_read     BOOLEAN NOT NULL DEFAULT FALSE,
  link_url    TEXT,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_by  UUID,
  updated_by  UUID,
  deleted_at  TIMESTAMPTZ,
  is_active   BOOLEAN NOT NULL DEFAULT TRUE
);

CREATE INDEX idx_notifications_user ON notifications(user_id, is_read, created_at DESC);
CREATE INDEX idx_notifications_company ON notifications(company_id, created_at DESC);
CREATE TRIGGER trg_notifications_updated_at BEFORE UPDATE ON notifications FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

ALTER TABLE notifications ENABLE ROW LEVEL SECURITY;
CREATE POLICY notifications_own ON notifications
  USING (
    company_id = (auth.jwt() ->> 'company_id')::UUID
    AND user_id = auth.uid()
  );

-- Enable Realtime for notifications
ALTER PUBLICATION supabase_realtime ADD TABLE notifications;

NOTIFY pgrst, 'reload schema';
