-- 147: DOOSRA BOARD ISSUE HO to purana RESERVE bhi chhooTe
--
-- KYA TOOTA THA
--   Mehboob ka sawal: *"board MRN main agar board available nahi to koi doosra
--   board kaise select karna hai."* Doosra board chunna pehle se mumkin hai —
--   Store ki Issue window mein har line par stock ka dropdown hai, aur GSM alag
--   ho to warning bhi aati hai. Wahan tak sab theek hai.
--
--   Masla uske BAAD ka hai. Har job ka board uske naam RESERVE hota hai (135).
--   Jab board issue hota hai to `consume_board_reservation()` wo reservation
--   khatam karta hai — magar wo demand ko ISSUE HUE board item se dhoondta hai:
--
--       WHERE job_id = p_job_id AND board_item_id = p_board_item_id
--
--   Doosra board issue karte hi ye shart poori hoti hi nahi. Koi demand nahi
--   milti, `sheets_from_stock` NULL rehta hai, `v_drop` sifar ho jata hai —
--   aur PURANE board par job ke naam ki reservation hamesha ke liye baithi
--   reh jati hai.
--
--   Nateeja do tarfa nuqsan hai: purana board "free" nahi dikhta, is liye agli
--   job usay istemal nahi kar sakti; aur Purchase ki "To Buy" list samajhti hai
--   ke wo sheets kisi aur ke naam hain, to wohi board dobara khareeda jata hai.
--   Live par abhi 5 jobs ke naam 2,04,500 sheets reserve hain, aur JOB-00115-R2
--   isi waqt Board Issue par khaRi hai — yani ye bug agli hi substitution par
--   lagta.
--
-- YE MIGRATION KYA KARTI HAI
--   Function ab do qadam mein dekhta hai:
--     1. Wohi purana sawal — is job ki demand jis ka board item ISSUE hue board
--        se milta hai. (Aam soorat: jo mangwaya tha wohi issue hua.)
--     2. Na milay to — is job ki wo demand jis par waqai stock reserve hai,
--        chahe uska board item koi aur ho. Reservation USI item se chhooTti hai
--        jis par lagi hui thi, issue hue item se nahi.
--
--   "Sirf utna chhoro jitna waqai reserve tha" wala usool jyun ka tyun hai —
--   job apni reservation se zyada utha le (jo hota hai) to baqi doosron ka
--   hissa hai aur usay chherna ghalat hoga.
--
--   Sirf function badla hai; koi table, koi column, koi data nahi. Purana
--   raasta (wohi board issue hua) bilkul pehle jaisa chalta hai.
--
-- WAPAS KAISE LEIN
--   Neeche wale function se dosra `SELECT … INTO d` wala block hata dein, ya
--   146 se pehle wali definition dobara chala dein — koi data nahi badla, is
--   liye undo ka koi asar baqi nahi rehta.

CREATE OR REPLACE FUNCTION public.consume_board_reservation(
  p_company_id UUID, p_board_item_id UUID, p_job_id UUID, p_sheets NUMERIC
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  d            board_demands%ROWTYPE;
  v_drop       NUMERIC;
  v_hold_item  UUID;
BEGIN
  IF p_sheets IS NULL OR p_sheets <= 0 OR p_board_item_id IS NULL THEN RETURN; END IF;

  IF p_job_id IS NOT NULL THEN
    -- 1. Aam soorat: jo board mangwaya tha wohi issue hua.
    SELECT * INTO d FROM board_demands
     WHERE job_id = p_job_id AND company_id = p_company_id
       AND board_item_id = p_board_item_id
       AND deleted_at IS NULL AND status <> 'cancelled'
     LIMIT 1;

    -- 2. BOARD BADLA GAYA: stock mein wo board nahi tha, Store ne doosra issue
    --    kiya. Reservation phir bhi is job ke naam hai — bas kisi AUR item par.
    --    Wo yahin chhooTti hai, warna wo sheets hamesha ke liye phans jatin.
    IF d.id IS NULL THEN
      SELECT * INTO d FROM board_demands
       WHERE job_id = p_job_id AND company_id = p_company_id
         AND deleted_at IS NULL AND status <> 'cancelled'
         AND COALESCE(sheets_from_stock, 0) > 0
       ORDER BY sheets_from_stock DESC
       LIMIT 1;
    END IF;
  END IF;

  -- Reservation usi item par lagi thi jo demand par likha hai. Demand hi na ho
  -- to issue hue item par gir jao — wohi purana amal.
  v_hold_item := COALESCE(d.board_item_id, p_board_item_id);

  -- Sirf utna chhoro jitna is job ke naam waqai reserve tha. Job ne apni
  -- reservation se zyada utha liya (jo ho jata hai) to baqi doosron ka hissa
  -- hai — usay yahan se chherna ghalat hoga.
  v_drop := LEAST(p_sheets, COALESCE(d.sheets_from_stock, 0));

  IF v_drop > 0 THEN
    UPDATE board_inventory
       SET reserved_stock = GREATEST(0, reserved_stock - v_drop)
     WHERE id = v_hold_item AND company_id = p_company_id;

    UPDATE board_demands
       SET sheets_from_stock = GREATEST(0, sheets_from_stock - v_drop)
     WHERE id = d.id;

    PERFORM recalc_board_demand(d.id);
  END IF;
END
$function$;

COMMENT ON FUNCTION public.consume_board_reservation(UUID, UUID, UUID, NUMERIC) IS
  'Board issue hone par us job ki reservation khatam karta hai. Store ne DOOSRA '
  'board issue kiya ho to reservation usi item se chhooTti hai jis par lagi thi, '
  'issue hue item se nahi — warna purana board hamesha ke liye reserve reh jata '
  'tha aur Purchase usay dobara khareedta. Migration 147.';

NOTIFY pgrst, 'reload schema';
