-- ═══════════════════════════════════════════════════════════════════════════
-- BOARD TYPE ka default vendor — jo live par pehle se sach hai, wo likh do
-- ═══════════════════════════════════════════════════════════════════════════
--
-- WHY
-- ---
-- 135 ne `board_types.default_vendor_id` banaya taake demand se PO banate waqt
-- vendor khud bhar jaye. Column khali chhor dete to har pehli demand "no vendor
-- on file" par ruk jati aur wo automation, jo is poore kaam ka maqsad hai,
-- pehle hi din par insaan se vendor poochne lagti.
--
-- Aur jawab pehle se database mein hai. Live par har board type ek hi vendor se
-- aata hai — Mehboob ka apna usool, aur data usay lafz-ba-lafz mante hai:
--
--   Bleach Board  → Saud Traders  (21 items, 12,71,100 sheets)
--                   Najm Impex     (2 items,    31,300 sheets)
--   Bike Polo     → Horizon Mill  (2 items,     83,000 sheets)
--   White Eagle   → Horizon Mill  (2 items,     12,900 sheets)
--
-- Is liye vendor ANDAZE se nahi, ginti se chuna gaya: jis vendor ka us board
-- type mein sab se ZYADA stock para hai. Bleach Board par dono vendor asli
-- hain (Najm Impex se bhi board aaya hai), magar mamool Saud Traders hai —
-- aur ye sirf DEFAULT hai, taala nahi: PO banate waqt vendor badla ja sakta
-- hai, aur wahi Mehboob ka "agar nahi mil raha to doosre brand/vendor se"
-- wala raasta hai.
--
-- Sirf khali khaane bharta hai (`IS NULL`), is liye dobara chalane se kisi ki
-- chuni hui tarjeeh nahi mitti.
--
-- HOW TO UNDO
-- -----------
--   UPDATE board_types SET default_vendor_id = NULL;
-- ═══════════════════════════════════════════════════════════════════════════

WITH ranked AS (
  SELECT
    bi.board_type_id,
    bi.company_id,
    bi.vendor_id,
    ROW_NUMBER() OVER (
      PARTITION BY bi.board_type_id
      ORDER BY SUM(bi.current_stock) DESC, COUNT(*) DESC, bi.vendor_id
    ) AS rn
  FROM board_inventory bi
  WHERE bi.deleted_at IS NULL
    AND bi.is_active
    AND bi.board_type_id IS NOT NULL
    AND bi.vendor_id IS NOT NULL
  GROUP BY bi.board_type_id, bi.company_id, bi.vendor_id
)
UPDATE board_types bt
   SET default_vendor_id = r.vendor_id
  FROM ranked r
 WHERE r.rn = 1
   AND bt.id = r.board_type_id
   AND bt.company_id = r.company_id
   AND bt.default_vendor_id IS NULL
   AND bt.deleted_at IS NULL;

NOTIFY pgrst, 'reload schema';
