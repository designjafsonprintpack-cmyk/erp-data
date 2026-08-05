-- ═══════════════════════════════════════════════════════════════════════════
-- BOARD DEMANDS — job delete par band na ho, aur reservation peechay na reh jaye
-- ═══════════════════════════════════════════════════════════════════════════
--
-- WHAT WAS BROKEN
-- ---------------
-- 135 ne `board_demands.job_id` par saada FK laga diya, bagair ON DELETE ke.
-- Jobs ka delete asli HARD delete hai (§3), aur ab HAR job ki ek demand banti
-- hai — yani 135 ke baad koi bhi job kabhi delete na ho pati, 23503 par ruk
-- jati. Bilkul wahi bimari jo `jobs.parent_job_id` par pehle se darj hai, magar
-- ye har job ko lagti, sirf un ko nahi jin ke repeat ya proof hain.
--
-- ON DELETE CASCADE se demand to sath chali jati hai, lekin us ki reservation
-- `board_inventory.reserved_stock` mein baithi reh jati — sheets kisi maray
-- hue job ke naam hamesha ke liye block. Is liye cascade akela ghalat hai;
-- release BEFORE DELETE trigger se hona chahiye, taake wo cascade ke raste
-- aane wale delete par bhi chale, na sirf us route par jo release bulata hai.
--
-- HOW TO UNDO
-- -----------
--   DROP TRIGGER IF EXISTS trg_board_demands_release ON board_demands;
--   DROP FUNCTION IF EXISTS release_board_demand_reservation();
--   ALTER TABLE board_demands DROP CONSTRAINT board_demands_job_id_fkey;
--   ALTER TABLE board_demands ADD CONSTRAINT board_demands_job_id_fkey
--     FOREIGN KEY (job_id) REFERENCES jobs(id);
-- ═══════════════════════════════════════════════════════════════════════════

-- ─── 1. Reservation chhorne wala trigger ─────────────────────────────────────
-- Pehle trigger, phir cascade — warna ek delete ke darmiyan reservation kabhi
-- na chhutti.
CREATE OR REPLACE FUNCTION release_board_demand_reservation()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF OLD.board_item_id IS NOT NULL AND OLD.sheets_from_stock > 0 THEN
    UPDATE board_inventory
       SET reserved_stock = GREATEST(0, reserved_stock - OLD.sheets_from_stock)
     WHERE id = OLD.board_item_id AND company_id = OLD.company_id;
  END IF;
  RETURN OLD;
END $$;

COMMENT ON FUNCTION release_board_demand_reservation() IS
  'Demand ki row mitne par uski reserved sheets stock ko wapas kar deta hai — cascade delete par bhi.';

DROP TRIGGER IF EXISTS trg_board_demands_release ON board_demands;
CREATE TRIGGER trg_board_demands_release
  BEFORE DELETE ON board_demands
  FOR EACH ROW EXECUTE FUNCTION release_board_demand_reservation();

-- ─── 2. FK ko CASCADE par le jao ─────────────────────────────────────────────
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE constraint_name = 'board_demands_job_id_fkey' AND table_name = 'board_demands'
  ) THEN
    ALTER TABLE board_demands DROP CONSTRAINT board_demands_job_id_fkey;
  END IF;

  ALTER TABLE board_demands
    ADD CONSTRAINT board_demands_job_id_fkey
    FOREIGN KEY (job_id) REFERENCES jobs(id) ON DELETE CASCADE;
END $$;

-- ─── 3. PO line ka demand link job ke sath na maray ──────────────────────────
-- Ek PO line business record hai (113 ne isi liye us par job_id rakha aur jobs
-- ka delete us se nahi rukta). Demand mit jaye to line ko sirf apna link
-- bhoolna chahiye, khud nahi marna — warna ek job delete karne se PO ki line
-- ghayab ho jati aur PO ka total us se mel na khata.
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE constraint_name = 'purchase_order_items_demand_id_fkey'
      AND table_name = 'purchase_order_items'
  ) THEN
    ALTER TABLE purchase_order_items DROP CONSTRAINT purchase_order_items_demand_id_fkey;
  END IF;

  ALTER TABLE purchase_order_items
    ADD CONSTRAINT purchase_order_items_demand_id_fkey
    FOREIGN KEY (demand_id) REFERENCES board_demands(id) ON DELETE SET NULL;
END $$;

NOTIFY pgrst, 'reload schema';
