-- 130 — a small preview file per artwork, so thumbnails stop downloading the original
--
-- WHAT BROKE
--   Every thumbnail in the ERP — the Jobs list, the Kanban cards, Planning, the
--   Production Floor, and now the topbar search — points at the ORIGINAL upload
--   and lets the browser shrink it. Measured on live 2026-08-04: 16 artwork
--   files, **634 kB average, 1.17 MB largest**. A search showing 20 jobs was
--   therefore pulling around 12 MB to paint tiles 40 px wide, which is why
--   Mehboob saw the boxes appear and the pictures arrive late or not at all.
--
-- WHAT THIS ADDS
--   `thumb_url` — the storage path of a downscaled copy (max 400 px on the long
--   edge, WEBP), generated in the browser at upload time and uploaded beside the
--   original. Roughly 30–60 kB, so a 20-row search costs about 1 MB instead of
--   12.
--
--   NULLABLE ON PURPOSE. It is a cache, not data:
--     · a row uploaded before this migration has none, and every reader falls
--       back to `file_url` exactly as it does today;
--     · a file that is not a raster image (PDF, AI, EPS) never gets one and
--       still renders as its file-type tile;
--     · if thumbnail generation fails in the browser, the upload must still
--       succeed — a missing preview is not worth losing the artwork over.
--
--   The retention sweep is updated in the same change to keep `thumb_url`
--   paths alive. Without that it would see every thumb as an unreferenced
--   orphan and delete the lot after 30 days.
--
-- Additive and reversible.
--
-- UNDO
--   ALTER TABLE job_artworks DROP COLUMN IF EXISTS thumb_url;
--   (the thumb objects themselves are then collected by the normal 30-day sweep)

ALTER TABLE job_artworks
  ADD COLUMN IF NOT EXISTS thumb_url TEXT;

COMMENT ON COLUMN job_artworks.thumb_url IS
  'Storage path of a downscaled preview of file_url (max 400px, WEBP). NULL means none exists — readers fall back to file_url. Generated client-side at upload; never required.';

NOTIFY pgrst, 'reload schema';
