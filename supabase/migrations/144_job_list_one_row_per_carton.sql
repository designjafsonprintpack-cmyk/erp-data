-- 144: Jobs list par AIK CARTON KA AIK ROW
--
-- KYA TOOTA THA
--   Mehboob: *"job repeat hony k bad R2 ban jata hy pahly wala b rahta hy aur
--   R2 b — do job nhi banany chahiyay."* Bilkul theek shikayat, aur ye wohi
--   shart hai jo unhon ne pehle bhi lagai thi: *"job hamesha aik hi rehna
--   chahiye … lekin history bhi ho, pata bhi chale ke job kab chala kitna
--   chala."*
--
--   Us waqt ka faisla (132, 133) sahi tha — har RUN apni row par rehta hai,
--   kyunki stages, MRN, plates, challan, invoice aur costing sab job_id se
--   latakte hain, aur do orders ka hisab aik row par nahi aa sakta. Pehchan
--   number ke STEM se banti hai aur Job Detail ki "Runs" tab family dikhati hai.
--
--   Lekin wo waada LIST par kabhi poora hua hi nahi. Jobs list har row alag
--   dikhati hai, to `JOB-00215` aur `JOB-00215-R2` do alag jobs lagti hain.
--   Ghalti model mein nahi thi, list mein thi.
--
-- YE MIGRATION KYA KARTI HAI
--   `jobs.is_superseded` — aik boolean jo trigger se khud bharta hai. List sirf
--   `is_superseded = false` wali rows dikhati hai, to aik carton ka aik row
--   bachta hai. Koi row delete nahi hoti, koi record nahi mitta; purane run
--   Runs tab mein aur "saare runs dikhao" toggle par poore maujood rehte hain.
--
-- USOOL — aur ye jaan bujh kar mohtaat hai
--   Row tab chhupti hai jab DONO baatein sach hon:
--     1. wo run KHATAM ho chuka ho (completed / dispatched / cancelled), AUR
--     2. usi carton ka koi NAYA run mojood ho.
--   Yani chalta hua kaam kabhi nahi chhupta. Agar kisi din aik hi carton ke do
--   run saath chal rahe hon to dono nazar aayenge — floor par dono ko dekhna
--   parta hai. Aaj live par aisi koi family nahi (saaton mein parent completed
--   hai aur R2 chal raha hai), lekin chhupi hui zinda job sab se khatarnak
--   ghalti hai, is liye usool pehle se hi mohtaat rakha gaya.
--
--   Carton ki pehchan number ka STEM hai (`JOB-00408-R2` → `JOB-00408`) — wohi
--   jo `jobNumberStem()` aur search palette pehle se istemal karte hain, taake
--   do jaga do alag qaide na chalen. `parent_job_id` par nahi rakha: R3 ka
--   parent root bhi ho sakta hai aur R2 bhi, stem dono soorat mein sahi hai.
--
--   PROOF RUNS (`-P1`, job_kind = 'proofing') ko "naya run" nahi mana jata —
--   proof carton ka agla order nahi hai, aur wo list se waise bhi `?kind=`
--   filter se bahar rehte hain. Warna aik proof nikalte hi asli job chhup jati.
--
-- WAPAS KAISE LEIN
--   DROP TRIGGER IF EXISTS trg_jobs_supersession ON jobs;
--   DROP FUNCTION IF EXISTS tg_jobs_recompute_supersession();
--   DROP FUNCTION IF EXISTS recompute_job_supersession(UUID, TEXT);
--   DROP FUNCTION IF EXISTS job_number_stem(TEXT);
--   ALTER TABLE jobs DROP COLUMN IF EXISTS is_superseded;
--   (Column girane se pehle list ka filter hatana — warna har job chhup jayegi.)

-- ---------------------------------------------------------------------------
-- 1. Column
-- ---------------------------------------------------------------------------
ALTER TABLE jobs ADD COLUMN IF NOT EXISTS is_superseded BOOLEAN NOT NULL DEFAULT false;

COMMENT ON COLUMN jobs.is_superseded IS
  'Trigger se bharta hai. true = ye run khatam ho chuka hai AUR isi carton ka '
  'naya run mojood hai, is liye jobs list is row ko nahi dikhati. Row, uska '
  'kaam aur uska poora hisab jyun ka tyun rehta hai — sirf list se chhupti hai. '
  'Migration 144.';

-- ---------------------------------------------------------------------------
-- 2. Stem — carton ki pehchan. jobNumberStem() ka SQL joRa.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION job_number_stem(p_job_number TEXT)
RETURNS TEXT
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT regexp_replace(COALESCE(p_job_number, ''), '-(R|P)[0-9]+$', '')
$$;

COMMENT ON FUNCTION job_number_stem(TEXT) IS
  'Job number bagair run suffix ke: JOB-00408-R2 → JOB-00408. '
  'src/lib/utils/jobRunNumber.ts ke jobNumberStem() ka hamsaya — dono ka '
  'regex aik jaisa rehna chahiye. Migration 144.';

-- Run number: JOB-00408-R3 → 3, saada number → 1
CREATE OR REPLACE FUNCTION job_run_no(p_job_number TEXT)
RETURNS INTEGER
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT COALESCE(NULLIF(substring(COALESCE(p_job_number, '') FROM '-R([0-9]+)$'), ''), '1')::INTEGER
$$;

CREATE INDEX IF NOT EXISTS idx_jobs_stem
  ON jobs (company_id, job_number_stem(job_number))
  WHERE deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_jobs_superseded
  ON jobs (company_id, is_superseded)
  WHERE deleted_at IS NULL;

-- ---------------------------------------------------------------------------
-- 3. Aik carton ke saare runs ka faisla dobara karo
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION recompute_job_supersession(p_company_id UUID, p_stem TEXT)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_max_run INTEGER;
BEGIN
  IF p_company_id IS NULL OR COALESCE(p_stem, '') = '' THEN
    RETURN;
  END IF;

  -- Sab se bara run number — proofs ginti mein nahi
  SELECT MAX(job_run_no(job_number)) INTO v_max_run
    FROM jobs
   WHERE company_id = p_company_id
     AND deleted_at IS NULL
     AND COALESCE(job_kind, 'production') <> 'proofing'
     AND job_number_stem(job_number) = p_stem;

  -- Sirf wahi rows likho jinki value waqai badal rahi hai. Ye zaroori hai:
  -- jobs par audit trigger laga hua hai, aur be-wajah UPDATE audit log mein
  -- shor daal deta hai — aur trigger ko dobara chala deta hai.
  UPDATE jobs j
     SET is_superseded = should.val
    FROM (
      SELECT id,
             (status IN ('completed', 'dispatched', 'cancelled')
              AND COALESCE(job_kind, 'production') <> 'proofing'
              AND job_run_no(job_number) < v_max_run) AS val
        FROM jobs
       WHERE company_id = p_company_id
         AND deleted_at IS NULL
         AND job_number_stem(job_number) = p_stem
    ) AS should
   WHERE j.id = should.id
     AND j.is_superseded IS DISTINCT FROM should.val;
END;
$$;

COMMENT ON FUNCTION recompute_job_supersession(UUID, TEXT) IS
  'Aik carton (stem) ke saare runs par is_superseded dobara likhti hai. '
  'Khatam-shuda run chhupta hai sirf tab jab uske baad ka run mojood ho; '
  'chalta hua run kabhi nahi chhupta. Migration 144.';

-- ---------------------------------------------------------------------------
-- 4. Trigger
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION tg_jobs_recompute_supersession()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    PERFORM recompute_job_supersession(OLD.company_id, job_number_stem(OLD.job_number));
    RETURN OLD;
  END IF;

  PERFORM recompute_job_supersession(NEW.company_id, job_number_stem(NEW.job_number));

  -- Number badal gaya (133 ne renumber kiya tha) to purana carton bhi dobara
  -- tolo, warna wo waheen chhupa reh jata hai.
  IF TG_OP = 'UPDATE' AND job_number_stem(OLD.job_number) IS DISTINCT FROM job_number_stem(NEW.job_number) THEN
    PERFORM recompute_job_supersession(OLD.company_id, job_number_stem(OLD.job_number));
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_jobs_supersession ON jobs;

-- Chakkar (recursion) kaise ruka hua hai: ye trigger sirf UN chaar columns par
-- chalta hai jo faisle mein shamil hain. Trigger ka apna UPDATE sirf
-- `is_superseded` likhta hai — jo is list mein hai hi nahi — is liye wo trigger
-- ko dobara chalata hi nahi. `UPDATE OF` column ka ZIKR dekhta hai, value ki
-- tabdeeli nahi, is liye ye pukhta hai.
--
-- Yahan `WHEN (pg_trigger_depth() = 1)` NAHI lagana. WHEN us waqt parkha jata
-- hai jab trigger function abhi shuru bhi nahi hua, to seedhe INSERT par depth
-- 0 hoti hai aur shart kabhi poori nahi hoti — trigger khamoshi se kabhi nahi
-- chalta. Ye ghalti aik dafa likhi ja chuki hai; test ne pakri (audit log mein
-- repeat insert par ginti ke rows).
CREATE TRIGGER trg_jobs_supersession
AFTER INSERT OR DELETE OR UPDATE OF job_number, status, job_kind, deleted_at ON jobs
FOR EACH ROW
EXECUTE FUNCTION tg_jobs_recompute_supersession();

-- ---------------------------------------------------------------------------
-- 5. Jo rows pehle se mojood hain unhein bhi bharo
--    (137 ka sabaq: backfill sirf un rows ko chhoota hai jo us waqt thin —
--    yahan trigger baqi sab sambhal leta hai, is liye aik dafa kaafi hai.)
-- ---------------------------------------------------------------------------
DO $$
DECLARE
  r RECORD;
BEGIN
  FOR r IN
    SELECT DISTINCT company_id, job_number_stem(job_number) AS stem
      FROM jobs
     WHERE deleted_at IS NULL
  LOOP
    PERFORM recompute_job_supersession(r.company_id, r.stem);
  END LOOP;
END;
$$;

NOTIFY pgrst, 'reload schema';
