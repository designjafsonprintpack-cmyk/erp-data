-- ═══════════════════════════════════════════════════════════════════════════
-- BOARD DEMANDS — jo job kisi bhi wajah se chhoot gayi, wo khud pakri jaye
-- ═══════════════════════════════════════════════════════════════════════════
--
-- WHY
-- ---
-- 137 ne us waqt ki 10 chalti jobs ka demand bana diya tha. Us ke baad, code
-- deploy hone se PEHLE, live par ek aur job ban gayi — JOB-00471-R2 — aur uska
-- koi demand nahi, kyunke Vercel par abhi purana code chal raha tha. Yehi baat
-- har us job par lagti hai jo backfill aur deploy ke DARMIYAN banti hai.
--
-- Aur ye masla sirf ek dafa ka nahi. §5 ka apna sabaq hai: **jobs banane ke
-- PAANCH raaste hain** (naya, exact repeat, changed repeat, press proof, QC
-- reprint) aur har ek ka apna field list hai. Aaj paanchon par hook lag chuka
-- hai, magar chhata raasta banane wale ko yaad rakhna parega. Ek bhoola hua
-- hook khamoshi se ye karta hai: us job ka board Purchase ki list mein KABHI
-- nahi aata, aur kisi ko pata us din chalta hai jab press khali khari hoti hai.
--
-- Is liye ek jhaaru: koi bhi CHALTI job jis ke paas board ki spec hai magar
-- zinda demand nahi, uska demand bana do. Purchase ka "To Buy" page aur uska
-- API dono ise kholte waqt chalate hain, is liye chhooti hui job zyada se
-- zyada agli nazar tak chhooti rehti hai.
--
-- SASTA: sirf un jobs par chalta hai jin ka demand GHAYAB hai — mamool mein
-- sifar rows, ek index-scan. Jo demand pehle se hai usay haath nahi lagata,
-- warna har page load par reservation hilti rehti.
--
-- HOW TO UNDO
-- -----------
--   DROP FUNCTION IF EXISTS sync_missing_board_demands(UUID);
-- ═══════════════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION sync_missing_board_demands(p_company_id UUID)
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  j       RECORD;
  n_made  INTEGER := 0;
BEGIN
  FOR j IN
    SELECT jb.id
      FROM jobs jb
     WHERE jb.company_id = p_company_id
       AND jb.deleted_at IS NULL
       AND jb.status IN ('new', 'in_progress')
       -- Spec ke bagair demand ban hi nahi sakti, is liye poochna hi fuzool.
       AND (jb.board_type_id IS NOT NULL OR jb.paper_type_id IS NOT NULL)
       AND COALESCE(jb.sheet_qty, 0) > 0
       AND NOT EXISTS (
         SELECT 1 FROM board_demands d
          WHERE d.job_id = jb.id
            AND d.deleted_at IS NULL
            AND d.status <> 'cancelled'
       )
       -- Gang ka member apna board nahi maangta — run ka board lead ke naam
       -- nikalta hai (126), aur uski apni demand jaan bujh ke cancel ki jati
       -- hai. Isay "chhooti hui" samajh kar dobara banate to har member ka
       -- board dobara gina jata: 4,000 sheets ki jagah 8,000.
       AND NOT EXISTS (
         SELECT 1
           FROM job_gang_members m
           JOIN job_gangs g ON g.id = m.gang_id
          WHERE m.job_id = jb.id
            AND m.deleted_at IS NULL
            AND g.deleted_at IS NULL
            AND g.status <> 'cancelled'
       )
  LOOP
    IF resolve_board_demand(p_company_id, j.id, NULL, NULL) IS NOT NULL THEN
      n_made := n_made + 1;
    END IF;
  END LOOP;

  RETURN n_made;
END $$;

COMMENT ON FUNCTION sync_missing_board_demands(UUID) IS
  'Har chalti job jiska board demand ghayab hai, uska demand bana deta hai. Purchase ka To Buy page har dafa chalata hai, taake koi job chup chaap chhoot na jaye. Gang members ko chhorta hai — un ka board lead job ke naam hai.';

-- Abhi ke liye bhi chala do: JOB-00471-R2 (aur jo bhi backfill ke baad bani).
SELECT sync_missing_board_demands('00000000-0000-0000-0000-000000000001'::UUID);

NOTIFY pgrst, 'reload schema';
