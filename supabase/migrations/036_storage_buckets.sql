-- ══════════════════════════════════════════════════════════════════════════════
-- JAFSON PRINT ERP — MIGRATION 036: REAL FILE STORAGE FOR ARTWORK & QC PHOTOS
--
-- Neither artwork upload nor QC defect photos ever actually used Supabase
-- Storage — artwork's "file_url" was a plain text box for pasting a URL, and
-- qc_defects.photo_url had no upload UI behind it at all. This sets up real
-- storage buckets with tenant-scoped RLS policies.
--
-- Convention: every object path starts with the uploader's company_id as the
-- first folder segment (e.g. "{company_id}/{job_id}/filename.pdf"), and RLS
-- policies check that prefix against the JWT's company_id claim — the same
-- tenant-isolation pattern used everywhere else in this schema.
-- ══════════════════════════════════════════════════════════════════════════════

-- ─── BUCKETS ──────────────────────────────────────────────────────────────────
INSERT INTO storage.buckets (id, name, public)
VALUES ('artwork', 'artwork', false)
ON CONFLICT (id) DO NOTHING;

INSERT INTO storage.buckets (id, name, public)
VALUES ('qc-photos', 'qc-photos', false)
ON CONFLICT (id) DO NOTHING;

-- ─── ARTWORK BUCKET POLICIES ──────────────────────────────────────────────────
DROP POLICY IF EXISTS artwork_tenant_select ON storage.objects;
CREATE POLICY artwork_tenant_select ON storage.objects FOR SELECT
  USING (bucket_id = 'artwork' AND (storage.foldername(name))[1] = (auth.jwt() ->> 'company_id'));

DROP POLICY IF EXISTS artwork_tenant_insert ON storage.objects;
CREATE POLICY artwork_tenant_insert ON storage.objects FOR INSERT
  WITH CHECK (bucket_id = 'artwork' AND (storage.foldername(name))[1] = (auth.jwt() ->> 'company_id'));

DROP POLICY IF EXISTS artwork_tenant_update ON storage.objects;
CREATE POLICY artwork_tenant_update ON storage.objects FOR UPDATE
  USING (bucket_id = 'artwork' AND (storage.foldername(name))[1] = (auth.jwt() ->> 'company_id'));

DROP POLICY IF EXISTS artwork_tenant_delete ON storage.objects;
CREATE POLICY artwork_tenant_delete ON storage.objects FOR DELETE
  USING (bucket_id = 'artwork' AND (storage.foldername(name))[1] = (auth.jwt() ->> 'company_id'));

-- ─── QC-PHOTOS BUCKET POLICIES ────────────────────────────────────────────────
DROP POLICY IF EXISTS qc_photos_tenant_select ON storage.objects;
CREATE POLICY qc_photos_tenant_select ON storage.objects FOR SELECT
  USING (bucket_id = 'qc-photos' AND (storage.foldername(name))[1] = (auth.jwt() ->> 'company_id'));

DROP POLICY IF EXISTS qc_photos_tenant_insert ON storage.objects;
CREATE POLICY qc_photos_tenant_insert ON storage.objects FOR INSERT
  WITH CHECK (bucket_id = 'qc-photos' AND (storage.foldername(name))[1] = (auth.jwt() ->> 'company_id'));

DROP POLICY IF EXISTS qc_photos_tenant_update ON storage.objects;
CREATE POLICY qc_photos_tenant_update ON storage.objects FOR UPDATE
  USING (bucket_id = 'qc-photos' AND (storage.foldername(name))[1] = (auth.jwt() ->> 'company_id'));

DROP POLICY IF EXISTS qc_photos_tenant_delete ON storage.objects;
CREATE POLICY qc_photos_tenant_delete ON storage.objects FOR DELETE
  USING (bucket_id = 'qc-photos' AND (storage.foldername(name))[1] = (auth.jwt() ->> 'company_id'));

-- ─── qc_defects: support multiple photos ──────────────────────────────────────
-- photo_url (single, legacy) is kept as-is for backward compatibility with any
-- existing rows; photo_urls is the new array column the UI now writes to.
ALTER TABLE qc_defects ADD COLUMN IF NOT EXISTS photo_urls TEXT[] NOT NULL DEFAULT '{}';

-- ─── qc_defects: inspection_id was NOT NULL, but the standalone "Log Defect"
-- flow (QCClient.tsx) has no inspection picker and always submitted an empty
-- string for it — meaning every defect logged that way was failing this
-- constraint. A defect can legitimately be spotted on the floor without a
-- formal inspection behind it, so this is now optional.
ALTER TABLE qc_defects ALTER COLUMN inspection_id DROP NOT NULL;

NOTIFY pgrst, 'reload schema';
