-- ═══════════════════════════════════════════════════════════════════════════
-- QUOTATIONS — VERSION HISTORY / COMPARISON
-- ═══════════════════════════════════════════════════════════════════════════
-- Snapshots the full quotation (header + items) as JSONB every time it's
-- meaningfully edited (items changed, or key pricing fields changed), so
-- estimators/sales can see what changed between versions — price drift,
-- items added/removed, quantity changes — rather than only ever seeing the
-- current state.
--
-- Also fixes a real bug found while building this: PATCH
-- /api/v1/quotations/[id] never handled the `items` array the edit form
-- already sends — line-item edits were silently dropped, only header fields
-- (customer/discount/notes/status) were ever actually saved.
-- ═══════════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS quotation_versions (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id      UUID NOT NULL REFERENCES companies(id),
  quotation_id    UUID NOT NULL REFERENCES quotations(id) ON DELETE CASCADE,
  version_number  INTEGER NOT NULL,
  snapshot        JSONB NOT NULL,     -- { header: {...}, items: [...] }
  change_summary  TEXT,               -- short human-readable note of what changed, if known
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_by      UUID REFERENCES users(id),
  UNIQUE (quotation_id, version_number)
);

CREATE INDEX IF NOT EXISTS idx_qv_quotation ON quotation_versions(quotation_id, version_number DESC);
ALTER TABLE quotation_versions ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS qv_tenant ON quotation_versions;
CREATE POLICY qv_tenant ON quotation_versions
  USING (company_id = (auth.jwt() ->> 'company_id')::UUID)
  WITH CHECK (company_id = (auth.jwt() ->> 'company_id')::UUID);

NOTIFY pgrst, 'reload schema';
