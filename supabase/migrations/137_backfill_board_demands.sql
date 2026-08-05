-- ═══════════════════════════════════════════════════════════════════════════
-- BOARD DEMANDS — jo jobs pehle se chal rahi hain, un ka board bhi ginno
-- ═══════════════════════════════════════════════════════════════════════════
--
-- WHY
-- ---
-- 135/136 ne demand banane ka raasta banaya, aur routes ab har NAYI job par
-- usay chalate hain. Magar "likhne ka tareeqa badalna un rows ko nahi badalta
-- jo pehle se live par hain" — yahi ghalti 128 se pehle artwork ke sath hui
-- thi, jahan "upload = approved" poori tarah sahi tha aur phir bhi 5 jobs
-- atki rah gayin kyunke unki purani row apni purani halat par khari thi.
--
-- Is liye ye migration har chalti hui job par wahi function chalata hai jo
-- routes chalate hain — `resolve_board_demand` — koi alag "backfill" mantiq
-- nahi, warna backfill aur route do alag jawab dete.
--
-- SIRF chalti hui jobs: completed / dispatched / cancelled ka board ya to
-- kharch ho chuka hai ya kabhi lena hi nahi tha. 478 legacy jobs bhi isi
-- wajah se bahar hain.
--
-- GANG: live par abhi ek bhi gang nahi (0 rows), is liye lead ka hisab yahan
-- nahi likha gaya — TS us ka zimma pehle se uthata hai (`syncBoardDemand`).
-- Gang bane to wahi route demand theek kar deta hai.
--
-- IDEMPOTENT: resolve_board_demand khud purani reservation chhor kar naye
-- sire se lagata hai, is liye ye file dobara chalane se kuch dohra nahi hota.
--
-- HOW TO UNDO
-- -----------
--   DELETE FROM board_demands;            -- BEFORE DELETE trigger (136) har
--                                         -- reservation khud wapas kar dega
-- ═══════════════════════════════════════════════════════════════════════════

DO $$
DECLARE
  j       RECORD;
  n_made  INT := 0;
  n_skip  INT := 0;
BEGIN
  FOR j IN
    SELECT id, company_id, job_number
      FROM jobs
     WHERE deleted_at IS NULL
       AND status IN ('new', 'in_progress')
     ORDER BY job_number
  LOOP
    IF resolve_board_demand(j.company_id, j.id, NULL, NULL) IS NULL THEN
      -- Board type ya sheet_qty nadarad — demand banane ko kuch hai hi nahi.
      n_skip := n_skip + 1;
      RAISE NOTICE 'skipped % (no board spec)', j.job_number;
    ELSE
      n_made := n_made + 1;
    END IF;
  END LOOP;

  RAISE NOTICE 'board demands: % created/refreshed, % skipped', n_made, n_skip;
END $$;

NOTIFY pgrst, 'reload schema';
