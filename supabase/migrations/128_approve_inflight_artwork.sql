-- 128 — the 7 in-flight artwork rows marked approved
--
-- WHAT BROKE
--   "Artwork upload ho gaya matlab approved ho gaya" is now the rule: the
--   customer approves on WhatsApp and staff upload the file that was already
--   signed off, so POST /api/v1/artwork lands a row on `approved`.
--
--   That only applies to NEW uploads. The 7 rows already on live were uploaded
--   under the old model and sat on `draft` / `waiting_customer_approval` /
--   `archived` — and the workflow's artwork gate refuses to complete the
--   Artwork stage without an approved version of every design. So five jobs
--   already in flight could not move past Artwork at all:
--
--       Cannot complete "Artwork & Customer Approval"
--       — no approved artwork version exists for this job yet.
--
--   Nothing was wrong with the files. They are the approved artwork; only the
--   status column disagreed, because the ladder that used to lead to
--   `approved` (draft → internal review → waiting customer approval →
--   approved) was built for the customer approval LINK, which is retired.
--
-- WHY EACH ROW IS PINNED BY ID, NOT MATCHED BY RULE
--   A rule like "approve everything not already approved" would be correct
--   today and wrong forever after: `archived` is the deliberate undo for a
--   wrong file, so a re-run months from now would silently un-archive somebody
--   else's mistake-correction. These 7 ids are the exact rows that existed on
--   2026-08-04. Re-running this migration on any later database changes
--   nothing else.
--
-- ABOUT THE ARCHIVED ONE (JOB-2026-00005)
--   Included deliberately. It was uploaded and archived within minutes on the
--   same day, and from `draft` the old "Move to…" menu offered exactly two
--   choices — Internal Review and Archived. There was no way to reach
--   Approved. Archiving it was the menu's fault, not a decision. If it really
--   was meant to be set aside, archive it again from the UI; that still works.
--
-- Data only — no column, index, constraint or function changes.
--
-- UNDO (restores each row's exact prior status)
--   UPDATE job_artworks SET status='waiting_customer_approval', is_production_ready=false, approved_at=NULL, approved_by=NULL
--    WHERE id IN ('a5c84e57-d1b6-49ca-9183-efd781743d23','b461460d-3672-42ed-a0a3-5ee74e217008',
--                 '702ba593-f1e2-4f8a-ad0b-efc9dafeb25b','035b7744-439e-4f60-9ab2-bfced0af7699');
--   UPDATE job_artworks SET status='archived', is_production_ready=false, approved_at=NULL, approved_by=NULL
--    WHERE id = 'dc5b850c-b3a9-4ee9-9fa1-baf9a891d2e1';
--   UPDATE job_artworks SET status='draft', is_production_ready=false, approved_at=NULL, approved_by=NULL
--    WHERE id IN ('f74f0376-ab0c-4945-82b6-a9748a7242c2','62a1d025-89aa-416c-b8db-ff3502ba0d57');

UPDATE job_artworks
   SET status              = 'approved',
       is_production_ready = TRUE,
       -- approved_by stays NULL on purpose: the approval was given on WhatsApp
       -- before this migration existed and nobody in `users` actually clicked
       -- it. Naming a user here would be an invented audit trail.
       approved_at         = COALESCE(approved_at, NOW()),
       updated_at          = NOW()
 WHERE deleted_at IS NULL
   AND status <> 'approved'
   AND id IN (
     'a5c84e57-d1b6-49ca-9183-efd781743d23',  -- JOB-2026-00002 design 1  Safwa Pan Raas-01.jpg
     'b461460d-3672-42ed-a0a3-5ee74e217008',  -- JOB-2026-00002 design 2  Safwa Pan Raas Outer-01.jpg
     '702ba593-f1e2-4f8a-ad0b-efc9dafeb25b',  -- JOB-2026-00003 design 1  Platinum-01.jpg
     '035b7744-439e-4f60-9ab2-bfced0af7699',  -- JOB-2026-00003 design 2  Platinum Outer-01.jpg
     'dc5b850c-b3a9-4ee9-9fa1-baf9a891d2e1',  -- JOB-2026-00005 design 1  Move in.jpg  (was archived)
     'f74f0376-ab0c-4945-82b6-a9748a7242c2',  -- JOB-2026-00006 design 1  WhatsApp Image 2026-08-03…jpeg
     '62a1d025-89aa-416c-b8db-ff3502ba0d57'   -- JOB-2026-00007 design 1  Crande Sachet Pack.jpg
   );

NOTIFY pgrst, 'reload schema';
