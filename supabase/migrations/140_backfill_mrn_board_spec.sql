-- ═══════════════════════════════════════════════════════════════════════════
-- MRN ki board line par GSM + SHEET SIZE — jo pehle se bani hui hain, un par bhi
-- ═══════════════════════════════════════════════════════════════════════════
--
-- WHY
-- ---
-- MRN ki line par `specification` ka khana pehle din se maujood hai aur Store ki
-- list use dikhati bhi hai — magar us mein koi likhta nahi tha. Store ko sirf
-- "Bleach Board" aur ek maqdaar milti thi.
--
-- Ye kaafi nahi hai: live par "Bleach Board" naam ki 23 stock rows hain, alag
-- alag GSM aur alag alag sheet size ki. Board demand khud bhi isi joray se match
-- karti hai — gsm + sheet size (135) — yani jo cheez system ke liye pehchan hai,
-- wohi kaghaz par se ghayab thi. Storekeeper ko yaad rakhna parta tha ke kis job
-- ka board kaunsa tha, aur ghalat lot uthna sirf waqt ki baat thi.
--
-- Ab dono raaste — auto-MRN (Board Issue shuru hote hi) aur Store ka apna
-- "New MRN" — dono ye line likhte hain. Magar §5 ka wohi qaida: **likhne ka
-- tareeqa badalna un rows ko nahi badalta jo pehle se live par hain.** Live par
-- abhi ek MRN hai (MRN-2026-00001, JOB-00115-R2 ka, status approved) aur uski
-- line khali hai. Ye us ko — aur aage kisi bhi aisi row ko — bhar deta hai.
--
-- Sirf BOARD/PAPER ki lines, aur sirf wo jinka khana KHALI hai: ink, glue aur
-- chemical ki lines par sheet size ka koi matlab nahi, aur jo spec kisi ne haath
-- se likhi ho wo us se zyada durust hai jo hum job se banayenge.
--
-- IDEMPOTENT: `specification IS NULL OR = ''` ki shart ki wajah se dobara
-- chalane par kuch nahi hota.
--
-- HOW TO UNDO
-- -----------
--   -- Koi undo nahi: ye sirf khali khane bharta hai. Wapas khali karna ho to
--   -- UPDATE material_requisition_items SET specification = NULL
--   --  WHERE material_type IN ('board','paper') AND specification LIKE '%gsm%';
-- ═══════════════════════════════════════════════════════════════════════════

UPDATE material_requisition_items i
   SET specification = NULLIF(
         CONCAT_WS(' · ',
           CASE WHEN j.gsm IS NOT NULL THEN CONCAT(TRIM(TRAILING '.' FROM TRIM(TRAILING '0' FROM j.gsm::TEXT)), ' gsm') END,
           CASE WHEN j.sheet_width_in IS NOT NULL AND j.sheet_height_in IS NOT NULL
                THEN CONCAT(
                  TRIM(TRAILING '.' FROM TRIM(TRAILING '0' FROM j.sheet_width_in::TEXT)), ' × ',
                  TRIM(TRAILING '.' FROM TRIM(TRAILING '0' FROM j.sheet_height_in::TEXT)), ' in')
           END
         ), '')
  FROM material_requisitions m
  JOIN jobs j ON j.id = m.job_id
 WHERE i.requisition_id = m.id
   AND m.deleted_at IS NULL
   AND i.material_type IN ('board', 'paper')
   AND (i.specification IS NULL OR i.specification = '');

NOTIFY pgrst, 'reload schema';
