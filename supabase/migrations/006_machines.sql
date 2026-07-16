-- ══════════════════════════════════════════════════════════════════════════════
-- JAFSON PRINT ERP — MIGRATION 006: MACHINES
-- Phase 8 — Departments already seeded in migration 002
-- ══════════════════════════════════════════════════════════════════════════════

-- ─── MACHINES ─────────────────────────────────────────────────────────────────
CREATE TABLE machines (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id          UUID NOT NULL REFERENCES companies(id),
  name                TEXT NOT NULL,
  code                TEXT NOT NULL,
  machine_type        TEXT NOT NULL CHECK (machine_type IN (
                        'printing','diecutting','foldergluing',
                        'lamination','hotfoil','other'
                      )),
  capacity_per_hour   INTEGER,
  status              TEXT NOT NULL DEFAULT 'idle' CHECK (status IN ('running','idle','maintenance','breakdown')),
  current_operator_id UUID REFERENCES users(id),
  notes               TEXT,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_by          UUID,
  updated_by          UUID,
  deleted_at          TIMESTAMPTZ,
  is_active           BOOLEAN NOT NULL DEFAULT TRUE,
  UNIQUE (company_id, code)
);

CREATE INDEX idx_machines_company ON machines(company_id);
CREATE INDEX idx_machines_type   ON machines(company_id, machine_type);
CREATE TRIGGER trg_machines_updated_at BEFORE UPDATE ON machines FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

ALTER TABLE machines ENABLE ROW LEVEL SECURITY;
CREATE POLICY machines_tenant ON machines
  USING (company_id = (auth.jwt() ->> 'company_id')::UUID);

-- ─── MACHINE STATUS HISTORY (append-only) ─────────────────────────────────────
CREATE TABLE machine_status_history (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id  UUID NOT NULL REFERENCES companies(id),
  machine_id  UUID NOT NULL REFERENCES machines(id) ON DELETE CASCADE,
  status      TEXT NOT NULL,
  reason      TEXT,
  changed_by  UUID REFERENCES users(id),
  changed_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_msh_machine ON machine_status_history(machine_id, changed_at DESC);
ALTER TABLE machine_status_history ENABLE ROW LEVEL SECURITY;
CREATE POLICY msh_tenant ON machine_status_history
  USING (company_id = (auth.jwt() ->> 'company_id')::UUID);

-- ─── SEED MACHINES FOR JAFSON ─────────────────────────────────────────────────
INSERT INTO machines (company_id, name, code, machine_type, capacity_per_hour) VALUES
  ('00000000-0000-0000-0000-000000000001', 'MP-1 (5 Color)',           'MP-1',  'printing',     3000),
  ('00000000-0000-0000-0000-000000000001', 'MP-2 (5 Color + UV)',      'MP-2',  'printing',     3000),
  ('00000000-0000-0000-0000-000000000001', 'MP-3 (6 Color + Coater)',  'MP-3',  'printing',     2500),
  ('00000000-0000-0000-0000-000000000001', 'Die Cutting Machine 1',    'DC-1',  'diecutting',   5000),
  ('00000000-0000-0000-0000-000000000001', 'Die Cutting Machine 2',    'DC-2',  'diecutting',   5000),
  ('00000000-0000-0000-0000-000000000001', 'Folder Gluing Machine 1',  'FG-1',  'foldergluing', 8000),
  ('00000000-0000-0000-0000-000000000001', 'Folder Gluing Machine 2',  'FG-2',  'foldergluing', 8000),
  ('00000000-0000-0000-0000-000000000001', 'Lamination Machine',       'LAM-1', 'lamination',   4000),
  ('00000000-0000-0000-0000-000000000001', 'Kirma Die Cut + Hot Foil', 'KDC-1', 'hotfoil',      2000);

-- Audit trigger
CREATE TRIGGER trg_audit_machines AFTER INSERT OR UPDATE OR DELETE ON machines FOR EACH ROW EXECUTE FUNCTION log_audit_event();

NOTIFY pgrst, 'reload schema';
