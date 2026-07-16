-- ══════════════════════════════════════════════════════════════════════════════
-- JAFSON PRINT ERP — MIGRATION 009: NUMBERING / SEQUENCE ENGINE
-- Phase 11 — Atomic, concurrent-safe document number generation
-- ══════════════════════════════════════════════════════════════════════════════

-- ─── DOCUMENT SEQUENCES TABLE ─────────────────────────────────────────────────
-- One row per (company, document_type, year)
-- NEVER read/written directly by app code — only via get_next_sequence_number()
CREATE TABLE document_sequences (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id      UUID NOT NULL REFERENCES companies(id),
  document_type   TEXT NOT NULL,  -- 'JOB','SO','QT','PO','DISP'
  year            INTEGER NOT NULL,
  prefix_format   TEXT NOT NULL DEFAULT '{PREFIX}-{YEAR}-{SEQ}',
  prefix          TEXT NOT NULL,
  padding         INTEGER NOT NULL DEFAULT 5,
  current_value   INTEGER NOT NULL DEFAULT 0,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (company_id, document_type, year)
);

CREATE INDEX idx_doc_seq_company ON document_sequences(company_id, document_type);
CREATE TRIGGER trg_doc_seq_upd BEFORE UPDATE ON document_sequences FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

ALTER TABLE document_sequences ENABLE ROW LEVEL SECURITY;
CREATE POLICY doc_seq_tenant ON document_sequences
  USING (company_id = (auth.jwt() ->> 'company_id')::UUID);

-- ─── ATOMIC SEQUENCE FUNCTION ─────────────────────────────────────────────────
-- Uses SELECT FOR UPDATE to guarantee no duplicate numbers under concurrency
-- Returns formatted document number, e.g. JOB-2026-00001
CREATE OR REPLACE FUNCTION get_next_sequence_number(
  p_company_id    UUID,
  p_document_type TEXT
) RETURNS TEXT AS $$
DECLARE
  v_year        INTEGER := EXTRACT(YEAR FROM NOW());
  v_seq_row     document_sequences%ROWTYPE;
  v_next_val    INTEGER;
  v_result      TEXT;
  v_padded      TEXT;
BEGIN
  -- Lock the row for this company/type/year (creates if missing)
  SELECT * INTO v_seq_row
  FROM document_sequences
  WHERE company_id = p_company_id
    AND document_type = p_document_type
    AND year = v_year
  FOR UPDATE;

  IF NOT FOUND THEN
    -- First number of the year — insert seed row
    INSERT INTO document_sequences (company_id, document_type, year, prefix, current_value)
    VALUES (
      p_company_id,
      p_document_type,
      v_year,
      p_document_type,
      0
    )
    ON CONFLICT (company_id, document_type, year) DO NOTHING;

    -- Re-select with lock after insert
    SELECT * INTO v_seq_row
    FROM document_sequences
    WHERE company_id = p_company_id
      AND document_type = p_document_type
      AND year = v_year
    FOR UPDATE;
  END IF;

  -- Increment
  v_next_val := v_seq_row.current_value + 1;

  UPDATE document_sequences
  SET current_value = v_next_val
  WHERE company_id = p_company_id
    AND document_type = p_document_type
    AND year = v_year;

  -- Format: PREFIX-YEAR-00001
  v_padded := lpad(v_next_val::TEXT, v_seq_row.padding, '0');
  v_result := v_seq_row.prefix || '-' || v_year || '-' || v_padded;

  RETURN v_result;
END;
$$ LANGUAGE plpgsql;

-- Grant to authenticated users (called via RPC)
GRANT EXECUTE ON FUNCTION get_next_sequence_number(UUID, TEXT) TO authenticated;

-- ─── SEED: Document types for Jafson ──────────────────────────────────────────
INSERT INTO document_sequences (company_id, document_type, year, prefix, padding, current_value) VALUES
  ('00000000-0000-0000-0000-000000000001', 'JOB',  2026, 'JOB',  5, 0),
  ('00000000-0000-0000-0000-000000000001', 'SO',   2026, 'SO',   5, 0),
  ('00000000-0000-0000-0000-000000000001', 'QT',   2026, 'QT',   5, 0),
  ('00000000-0000-0000-0000-000000000001', 'PO',   2026, 'PO',   5, 0),
  ('00000000-0000-0000-0000-000000000001', 'DISP', 2026, 'DISP', 5, 0)
ON CONFLICT DO NOTHING;

NOTIFY pgrst, 'reload schema';
