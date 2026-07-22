-- ══════════════════════════════════════════════════════════════════════════════
-- JAFSON PRINT ERP — MIGRATION 080: COMPANY LOGO STORAGE
--
-- companies.logo_url has existed since migration 001 but nothing ever wrote
-- to it — no upload UI or bucket was ever built for it. This adds a bucket
-- for it, PUBLIC (unlike 'artwork'/'qc-photos' in migration 036), because the
-- logo is rendered directly via <img src> in the app header on every page
-- load and isn't sensitive data — a signed-URL round trip isn't worth it here.
--
-- Writes (upload/replace/delete) are still tenant-scoped via the same
-- {company_id}/... path-prefix RLS convention as the other buckets; reads are
-- public because the bucket itself is public (Storage serves public-bucket
-- objects directly, bypassing RLS on SELECT).
-- ══════════════════════════════════════════════════════════════════════════════

INSERT INTO storage.buckets (id, name, public)
VALUES ('company-logo', 'company-logo', true)
ON CONFLICT (id) DO NOTHING;

DROP POLICY IF EXISTS company_logo_tenant_insert ON storage.objects;
CREATE POLICY company_logo_tenant_insert ON storage.objects FOR INSERT
  WITH CHECK (bucket_id = 'company-logo' AND (storage.foldername(name))[1] = (auth.jwt() ->> 'company_id'));

DROP POLICY IF EXISTS company_logo_tenant_update ON storage.objects;
CREATE POLICY company_logo_tenant_update ON storage.objects FOR UPDATE
  USING (bucket_id = 'company-logo' AND (storage.foldername(name))[1] = (auth.jwt() ->> 'company_id'));

DROP POLICY IF EXISTS company_logo_tenant_delete ON storage.objects;
CREATE POLICY company_logo_tenant_delete ON storage.objects FOR DELETE
  USING (bucket_id = 'company-logo' AND (storage.foldername(name))[1] = (auth.jwt() ->> 'company_id'));

NOTIFY pgrst, 'reload schema';
