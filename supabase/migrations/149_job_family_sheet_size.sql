-- 149 — get_job_family() ab har run ka SHEET SIZE bhi deta hai
--
-- WHY
-- ---
-- Mehboob: "JOB-00401-R2 is job ki die 20 ups ki hay … lakin is bar hum screen
-- printing say spot uv ker rahy hain us ki waja say hum isay 10 ya 12 ups main
-- print kery gy, us k hisab say sheet size b change ho jaey ga."
--
-- Yani ek hi carton ke do run alag LAYOUT par chal sakte hain — die wohi purani,
-- sirf ups aur sheet size badalte hain. Live par ye pehle se ho chuka hai:
--   JOB-00401     12 ups · 15.5 × 27.5
--   JOB-00401-R2  18 ups · 20 × 27.5     (die 28 dono par wohi)
--
-- Masla ye hai ke exact Repeat ups aur sheet size CHUP CHAAP pichhle run se
-- naqal kar leta hai. To jis din spot-UV wale 12-up run ko repeat kiya jayega,
-- naya run bhi 12 ups par paida hoga — halanke us par spot UV hai hi nahi.
-- Mehboob ka apna faisla: "next repeat per pochy yah sahi hy."
--
-- Poochhne ke liye form ko khandaan ke har run ka layout dikhana parta hai, aur
-- 132 `ups` to deti thi magar sheet size nahi. Ye migration wohi do column
-- jorti hai.
--
-- Sirf return list barhi hai — walk, filter, tarteeb, security sab 132 wale hi
-- hain. RETURNS TABLE badalne ke liye CREATE OR REPLACE kaafi nahi (Postgres
-- return type badalne nahi deta), is liye pehle DROP. Dono maujooda pukarne
-- wale — Job Detail ka page aur `jobRunNumber.ts` — column ke NAAM se parhte
-- hain, is liye naye column un par asar nahi karte.
--
-- HOW TO UNDO
-- -----------
--   132 ka CREATE OR REPLACE dobara chala do (pehle DROP FUNCTION).

DROP FUNCTION IF EXISTS get_job_family(uuid, uuid);

CREATE FUNCTION get_job_family(p_company_id uuid, p_job_id uuid)
RETURNS TABLE (
  id              uuid,
  job_number      text,
  job_title       text,
  status          text,
  quantity        numeric,
  sheet_qty       integer,
  ups             integer,
  -- 149: is run ka apna sheet size. Ups ke bagair ye adhoora hai — "12 ups"
  -- tab tak koi layout nahi jab tak ye na pata ho ke kis sheet par.
  sheet_width_in  numeric,
  sheet_height_in numeric,
  order_date      date,
  required_date   date,
  completed_date  date,
  is_repeat       boolean,
  repeat_kind     text,
  parent_job_id   uuid,
  run_no          bigint,
  is_root         boolean
)
LANGUAGE sql
STABLE
AS $$
  -- 1. climb to the original
  WITH RECURSIVE up AS (
    SELECT j.id, j.parent_job_id
      FROM jobs j
     WHERE j.id = p_job_id
       AND j.company_id = p_company_id
       AND j.deleted_at IS NULL
    UNION ALL
    SELECT p.id, p.parent_job_id
      FROM jobs p
      JOIN up ON up.parent_job_id = p.id
     WHERE p.company_id = p_company_id
       AND p.deleted_at IS NULL
  ),
  root AS (
    SELECT up.id FROM up WHERE up.parent_job_id IS NULL LIMIT 1
  ),
  -- 2. walk back down through every repeat of it
  down AS (
    SELECT j.* FROM jobs j JOIN root ON root.id = j.id
    UNION ALL
    SELECT c.*
      FROM jobs c
      JOIN down ON c.parent_job_id = down.id
     WHERE c.company_id = p_company_id
       AND c.deleted_at IS NULL
  )
  SELECT d.id,
         d.job_number,
         d.job_title,
         d.status,
         d.quantity,
         d.sheet_qty,
         d.ups,
         d.sheet_width_in,
         d.sheet_height_in,
         d.order_date,
         d.required_date,
         d.completed_date,
         d.is_repeat,
         d.repeat_kind,
         d.parent_job_id,
         ROW_NUMBER() OVER (ORDER BY d.order_date NULLS LAST, d.created_at, d.id) AS run_no,
         (d.parent_job_id IS NULL)                                                AS is_root
    FROM down d
   WHERE COALESCE(d.job_kind, 'production') = 'production'
   ORDER BY d.order_date NULLS LAST, d.created_at, d.id;
$$;

COMMENT ON FUNCTION get_job_family(uuid, uuid) IS
  'Every production run of the job family the given job belongs to, oldest first, each with its own ups and sheet size (149). Walks up to the original then down through all repeats, so any member returns the same family. Press proofs excluded — a proof is not a run.';

NOTIFY pgrst, 'reload schema';
