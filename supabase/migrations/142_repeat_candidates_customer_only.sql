-- ═══════════════════════════════════════════════════════════════════════════
-- Repeat search sirf USI CUSTOMER ke jobs mein
-- ═══════════════════════════════════════════════════════════════════════════
--
-- WHY
-- ---
-- 141 doosre customers ke milte julte carton bhi wapas karta tha — neeche, aur
-- "doosra customer" ke nishan ke sath — is khayal se ke shayad kaam aayen.
-- Mehboob: *"jo customer hay usi k jobs main search kery."*
--
-- Aur wo theek hai. Sales Order banate waqt customer hamesha maloom hota hai,
-- aur doosre customer ka carton is line ka repeat ho hi nahi sakta: alag
-- artwork, alag die, alag plates. Wo sirf shor tha — aur shor ka nuqsan yahan
-- asal hai, kyunke agla qadam "select karo aur specs bhar do" hai. Ghalat
-- customer ka carton chun liya jata to us ki L/W/H aur colours seedhe is line
-- par charh jate.
--
-- Live par yeh khatra farzi nahi: "Achari Macaroni" do customers ke paas hai,
-- "Banana Custard 120g" bhi, "Kheer Mix" bhi, "Capital Gole Hl 20" bhi.
--
-- `same_customer` column wapas aata rehta hai (return type nahi badla, taake
-- CREATE OR REPLACE chal jaye) — ab wo hamesha true hoga jab customer diya gaya
-- ho. Bagair customer ke bulaya jaye to pehle jaisa hi chalta hai.
--
-- HOW TO UNDO
-- -----------
--   141 ka function block dobara chala dein.
-- ═══════════════════════════════════════════════════════════════════════════

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
    -- Naam ka shor hata do: bare-chhote haraf, aakhir ka nuqta, '&' / '/'.
    -- Live par yehi farq ILIKE ko nakaam karte hain — "Citizen 20 Hl" vs
    -- "Citizen 20 Hl.", "SP" vs "Sp.".
    -- Adaad JAAN BUJH KAR nahi chhere jate: "12 Watt" aur "12.5 Watt" do alag
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
      -- SIRF isi customer ke carton. Doosre customer ka carton is line ka
      -- repeat ho hi nahi sakta.
      AND (p_customer_id IS NULL OR j.customer_id = p_customer_id)
  ),
  scored AS (
    SELECT
      l.*,
      -- word_similarity: adha naam likha ho tab bhi mile. similarity: poora naam.
      -- Pehle lafz ka wazan: Mehboob ke naamon mein pehla lafz BRAND hota hai
      -- (Heaven, Citizen, Aktive) aur wahi carton ki asal pehchan hai.
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
    j.id, j.job_number, f.stem_no, j.job_title,
    j.customer_id, c.name,
    (p_customer_id IS NULL OR j.customer_id = p_customer_id),
    j.size_l, j.size_w, j.size_h,
    j.ups, j.gsm,
    COALESCE(bt.name, pt.name),
    j.die_number,
    f.last_run, j.quantity, f.runs, f.sc
  FROM fam f
  JOIN jobs j ON j.id = f.newest_id
  LEFT JOIN customers   c  ON c.id  = j.customer_id
  LEFT JOIN board_types bt ON bt.id = j.board_type_id
  LEFT JOIN paper_types pt ON pt.id = j.paper_type_id
  ORDER BY f.sc DESC, f.last_run DESC NULLS LAST
  LIMIT GREATEST(COALESCE(p_limit, 8), 1);
$$;

NOTIFY pgrst, 'reload schema';
