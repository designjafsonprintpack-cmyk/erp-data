-- ═══════════════════════════════════════════════════════════════════════════
-- "Ye carton pehle chala hai ya naya hai?" — sawal SO par, jawab jobs se
-- ═══════════════════════════════════════════════════════════════════════════
--
-- WHY
-- ---
-- Customer PO bhejta hai: "Heaven 13w Bulb B22/E27 — 50,000". Mehboob ko phir
-- KHUD dhoondna parta hai ke ye carton pehle chala tha ya nahi — mila to
-- repeat, na mila to naya. Ye faisla paison aur waqt dono ko badalta hai: nayi
-- die 6,000/ups, nayi plates 800/colour, aur naye carton par artwork + customer
-- approval ka poora daur — yani delivery ka waada bhi alag.
--
-- Magar ye faisla kahin darj nahi hota tha. `sales_order_items` par carton ki
-- koi pehchan hai hi nahi — sirf `product_desc` (likha hua naam). Repeat ki
-- pehchan sirf JOB par rehti hai (`parent_job_id`), aur job SO ke BAAD banti
-- hai. To SO dekh kar ye jaanne ka koi tareeqa nahi tha ke 5 lines mein se
-- kitni repeat hain.
--
-- WHAT THIS ADDS
-- --------------
-- 1. `repeat_of_job_id` — quotation ki line par AUR SO ki line par. Bhara hua
--    = REPEAT (aur kis carton ka), khali = NEW. Quotation par isi liye ke rate
--    ka faisla wahin hota hai; SO line `quotation_item_id` se usay khud utha
--    legi, aur job SO line se.
-- 2. `find_repeat_candidates()` — naam se milte julte purane carton dhoondta
--    hai. `pg_trgm` live par pehle se laga hua hai.
--
-- DO CHEEZEN JO ASAL DATA NE SIKHAYIN
-- -----------------------------------
-- **(a) Naam kabhi akela kaafi nahi.** 488 jobs par chala kar dekha to chaar
-- jorey aise mile jo naam se 81–100% milte the aur phir bhi ALAG carton the:
--     Aktive Chocolate 24 SP   200×125×70   vs  24 Sp.  200×130×73
--     Begent Cream 15g          33×25×115   vs  15g New  32×20×120
--     Capital Gold Hl 20  die 1 vs  Capital Gole Hl 20  die 4
--     Citizen 20 Hl       die 2 vs  Citizen 20 Hl.      die 1
-- Mehboob ne ek nazar mein pakar liya: *"in ka size difference hay LxWxH main."*
-- Is liye ye function faisla NAHI karta — wo har candidate ke sath size, ups,
-- gsm, board aur die wapas karta hai taake insaan wahi farq dekh sake. Aur isi
-- liye `Peraq Led Zone 12 Watt` aur `12.5 Watt` (mel 0.93, magar do alag
-- carton) par koi auto-link nahi hota.
--
-- **(b) DIE NUMBER carton ki pehchan NAHI hai.** Ye maine banane se pehle
-- jaancha: Led Zone ke die "76" par 10 jobs hain, das alag naamon ki; New
-- Kashmir ke die "1" par bhi 10. Die number dobara istemal hota hai. Agar isay
-- pehchan maan liya jata to system yaqeen se ghalat "repeat" batata.
--
-- FAMILY EK ROW: ek carton ke saare runs ek hi natije mein simte hain, §4 ke
-- STEM par (`JOB-00408-R2` → `JOB-00408`) — wahi usool jo search palette
-- pehle se manti hai. Warna teen dafa chala hua carton teen dafa nazar aata.
--
-- HOW TO UNDO
-- -----------
--   DROP FUNCTION IF EXISTS find_repeat_candidates(UUID,UUID,TEXT,INT);
--   DROP INDEX IF EXISTS idx_jobs_title_trgm;
--   ALTER TABLE sales_order_items DROP COLUMN IF EXISTS repeat_of_job_id;
--   ALTER TABLE quotation_items   DROP COLUMN IF EXISTS repeat_of_job_id;
-- ═══════════════════════════════════════════════════════════════════════════

-- ─── 1. Link ka khana ─────────────────────────────────────────────────────────
ALTER TABLE quotation_items   ADD COLUMN IF NOT EXISTS repeat_of_job_id UUID;
ALTER TABLE sales_order_items ADD COLUMN IF NOT EXISTS repeat_of_job_id UUID;

DO $$
BEGIN
  -- ON DELETE SET NULL: job hard-delete hoti hai (§3). Ek purani job mit jaye to
  -- SO ki line ko sirf apna link bhoolna chahiye — khud nahi marna, aur na hi
  -- job ka delete rok dena.
  IF NOT EXISTS (SELECT 1 FROM information_schema.table_constraints
                  WHERE constraint_name = 'quotation_items_repeat_of_job_id_fkey') THEN
    ALTER TABLE quotation_items ADD CONSTRAINT quotation_items_repeat_of_job_id_fkey
      FOREIGN KEY (repeat_of_job_id) REFERENCES jobs(id) ON DELETE SET NULL;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.table_constraints
                  WHERE constraint_name = 'sales_order_items_repeat_of_job_id_fkey') THEN
    ALTER TABLE sales_order_items ADD CONSTRAINT sales_order_items_repeat_of_job_id_fkey
      FOREIGN KEY (repeat_of_job_id) REFERENCES jobs(id) ON DELETE SET NULL;
  END IF;
END $$;

COMMENT ON COLUMN sales_order_items.repeat_of_job_id IS
  'Bhara hua = ye line REPEAT hai, aur kis carton ki. Khali = naya carton. Job banate waqt yahi parent_job_id ban jata hai.';
COMMENT ON COLUMN quotation_items.repeat_of_job_id IS
  'Wahi, magar quotation par — kyunke rate ka faisla (die/plate lagegi ya nahi) yahin hota hai. SO line ise quotation se utha leti hai.';

CREATE INDEX IF NOT EXISTS idx_so_items_repeat_of ON sales_order_items(repeat_of_job_id)
  WHERE repeat_of_job_id IS NOT NULL;

-- ─── 2. Naam par trigram index ────────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_jobs_title_trgm ON jobs USING gin (lower(job_title) gin_trgm_ops);

-- ─── 3. find_repeat_candidates ────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION find_repeat_candidates(
  p_company_id  UUID,
  p_customer_id UUID DEFAULT NULL,
  p_query       TEXT DEFAULT '',
  p_limit       INT  DEFAULT 8
)
RETURNS TABLE (
  job_id         UUID,
  job_number     TEXT,
  stem           TEXT,
  job_title      TEXT,
  customer_id    UUID,
  customer_name  TEXT,
  same_customer  BOOLEAN,
  size_l         NUMERIC,
  size_w         NUMERIC,
  size_h         NUMERIC,
  ups            INTEGER,
  gsm            NUMERIC,
  board_name     TEXT,
  die_number     TEXT,
  last_run_date  DATE,
  last_quantity  NUMERIC,
  run_count      INTEGER,
  score          REAL
)
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = public
AS $$
  WITH q AS (
    -- Naam ka shor hata do: bare-chhote haraf, aakhir ka nuqta, aur '&' / '/'
    -- jaisi cheezen. Live par yehi farq ILIKE ko nakaam karte hain —
    -- "Citizen 20 Hl" vs "Citizen 20 Hl.", "SP" vs "Sp.".
    -- Number JAAN BUJH KAR nahi chhere jate: "12 Watt" aur "12.5 Watt" do alag
    -- carton hain, aur unka farq mitana sab se khatarnak ghalti hogi.
    SELECT btrim(regexp_replace(lower(COALESCE(p_query, '')), '[^a-z0-9]+', ' ', 'g')) AS needle
  ),
  live AS (
    SELECT
      j.*,
      regexp_replace(j.job_number, '-(R|P)[0-9]+$', '') AS stem_no,
      btrim(regexp_replace(lower(j.job_title), '[^a-z0-9]+', ' ', 'g')) AS hay
    FROM jobs j
    WHERE j.company_id = p_company_id
      AND j.deleted_at IS NULL
      -- Ek proof run apna carton nahi hai, apne parent ka hai.
      AND COALESCE(j.job_kind, 'production') <> 'proofing'
  ),
  scored AS (
    SELECT
      l.*,
      -- word_similarity: adha naam likha ho tab bhi mile ("Heaven 13w" ko
      -- "Heaven 13w Bulb B22 E27" ke andar dhoondna). similarity: poora naam.
      --
      -- PEHLE LAFZ KA WAZAN. Mehboob ke naamon mein pehla lafz BRAND hota hai —
      -- Heaven, Citizen, Aktive, Capital — aur wahi carton ki asal pehchan hai.
      -- Bagair is ke "Heaven 13w Bulb B22/E27" par pehla natija
      -- "Eco Missile 13w Led Bulb B22 & E27" aata tha (0.59) aur asal
      -- "Heaven 13W Led" teesre number par (0.48), sirf is liye ke Eco Missile
      -- ke baaki lafz zyada milte the. Brand milne par 0.30 ka izafa usay upar
      -- le aata hai bagair kisi doosre ko list se nikale.
      LEAST(
        GREATEST(similarity(l.hay, q.needle), word_similarity(q.needle, l.hay))
        + CASE WHEN split_part(l.hay, ' ', 1) = split_part(q.needle, ' ', 1)
                 AND split_part(q.needle, ' ', 1) <> '' THEN 0.30 ELSE 0 END,
        1.0)::REAL AS sc
    FROM live l, q
    WHERE q.needle <> ''
      AND (l.hay % q.needle OR word_similarity(q.needle, l.hay) > 0.45)
  ),
  -- EK CARTON = EK ROW. Family ka stem (§4), aur us ka sab se naya run.
  fam AS (
    SELECT
      s.stem_no,
      MAX(s.sc) AS sc,
      COUNT(*)::INTEGER AS runs,
      MAX(COALESCE(s.order_date, s.created_at::DATE)) AS last_run,
      (ARRAY_AGG(s.id ORDER BY COALESCE(s.order_date, s.created_at::DATE) DESC, s.job_number DESC))[1] AS newest_id
    FROM scored s
    GROUP BY s.stem_no
  )
  SELECT
    j.id,
    j.job_number,
    f.stem_no,
    j.job_title,
    j.customer_id,
    c.name,
    (p_customer_id IS NOT NULL AND j.customer_id = p_customer_id),
    j.size_l, j.size_w, j.size_h,
    j.ups, j.gsm,
    COALESCE(bt.name, pt.name),
    j.die_number,
    f.last_run,
    j.quantity,
    f.runs,
    f.sc
  FROM fam f
  JOIN jobs j ON j.id = f.newest_id
  LEFT JOIN customers   c  ON c.id  = j.customer_id
  LEFT JOIN board_types bt ON bt.id = j.board_type_id
  LEFT JOIN paper_types pt ON pt.id = j.paper_type_id
  ORDER BY
    -- Usi customer ke carton hamesha pehle: ek hi naam do customers ke paas ho
    -- sakta hai ("Achari Macaroni" live par do customers ka hai) aur wo DO ALAG
    -- carton hain — alag artwork, alag die. Doosre customer ka match dikhna
    -- chahiye, magar neeche aur alag se.
    (p_customer_id IS NOT NULL AND j.customer_id = p_customer_id) DESC,
    f.sc DESC,
    f.last_run DESC NULLS LAST
  LIMIT GREATEST(COALESCE(p_limit, 8), 1);
$$;

COMMENT ON FUNCTION find_repeat_candidates(UUID,UUID,TEXT,INT) IS
  'Naam se milte julte purane carton — us customer ke pehle. Har carton ek row (family stem par). Faisla NAHI karta: size/ups/gsm/board/die wapas karta hai taake insaan khud dekhe — naam 100% mil kar bhi do alag carton ho sakte hain.';

NOTIFY pgrst, 'reload schema';
