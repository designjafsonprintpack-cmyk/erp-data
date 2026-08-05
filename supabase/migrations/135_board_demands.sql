-- ═══════════════════════════════════════════════════════════════════════════
-- BOARD DEMANDS — har job ka board, khud ba khud
-- ═══════════════════════════════════════════════════════════════════════════
--
-- WHAT WAS BROKEN
-- ---------------
-- Board ka pata sirf Printing shuru karte waqt chalta tha, aur wo bhi ek narm
-- warning ki soorat mein jo board TYPE ka total stock jorti thi — GSM aur sheet
-- size ko nazarandaz karte hue. Us waqt tak plate ban chuki hoti hai. Store se
-- Purchase tak koi document tha hi nahi: MRN sirf store→floor hai. Purchase ko
-- board kam hone ka pata sirf tab chalta tha jab wo khud MRP page kholay — aur
-- wo page board_types.gsm parhta hai jo jaan bujh ke khali chhora gaya hai, aur
-- uska "Create PO" button PO line ko stock item se link hi nahi karta, is liye
-- us PO ka maal receive hone pe stock mein kabhi add nahi hota.
--
-- Mehboob ki tasheeh, jis pe ye poora design khara hai:
--   "hum board alag store nahi karte, job ke hisab se board order karte hain.
--    stock mein wo board hota hai jo rah jaye … per job cancel ho gaya to us ka
--    board stock mein aa gaya … lekin agar client forecast de de to hum us board
--    stock mein mangwa ke rakh bhi lete hain."
--
-- Yani stock ek TARGET nahi, ek BACHA HUA MAAL hai. Default ye hai ke har job ka
-- board khareedna parega; stock sirf ye batane ke liye dekha jata hai ke kitna
-- KAM khareedna hai. Purana model (pehle stock dekho, kam ho to khareedo) ulta
-- tha, aur isi liye "reorder level" waghera yahan bemani hain.
--
-- WHAT THIS ADDS
-- --------------
-- `board_demands` — ek row per job (ya bagair job ke, forecast ke liye), jo job
-- banate hi khud ban jati hai. Koi button, koi form nahi. Har demand khud dekhti
-- hai ke us exact board ka koi leftover para hai ya nahi, jitna para hai utna
-- RESERVE kar leti hai, aur baqi Purchase ki list mein chali jati hai.
--
-- MATCHING — teen cheezein, aur wo teeno pehle se maujood hain:
--   gsm  +  sheet size  +  (tarjeehan) board/paper type
-- Size ka jora BE-TARTEEB match hota hai — 18.5×35 aur 35×18.5 ek hi sheet hai
-- aur ek hi khareed hai. Grain direction 068 mein hata di gayi thi, is liye
-- orientation ka koi matlab nahi raha.
--   Type ka match TARJEEH hai, SHART nahi. Live pe 51 stock rows mein se 24 ka
-- board_type_id NULL hai (Econo Board, Pack Mate, Silver Pack … ye brand hain,
-- aur board_types master list se poori tarah nahi milte). Agar type ko shart
-- bana dete to wo 24 rows kisi job se kabhi match na hote — halanke wahi
-- Mehboob ka "bleach wale vendor se dosra brand" wala case hai.
--
-- ACCOUNTING — chaar number, aur ek hi jama:
--   sheets_required   = kitna chahiye
--   sheets_from_stock = matched row pe is demand ke naam RESERVE kitna hai
--                       (khareeda hua maal receive hone pe isi mein aa jata hai)
--   sheets_ordered    = khuli PO lines pe kitna hai
--   sheets_to_purchase= GREATEST(0, required − from_stock − ordered)   ← derived
--
-- STATUS: open → partially_ordered → ordered → ready (ya seedha ready jab poora
-- stock se mil jaye), aur cancelled. 'ready' ka matlab: board hath mein hai aur
-- is job ke naam reserve hai — Board Issue ab ruk nahi sakti.
--
-- reserved_stock column 015 se maujood hai aur aaj tak koi us mein likhta hi
-- nahi tha, is liye teen jobs ek hi 20,000 sheets pe "OK" dikhti thin. Ab har
-- demand apna hissa is mein rakhti hai, aur har adjustment DELTA se hoti hai
-- taake ek row par kai demands ka hissa saath saath chal sake.
--
-- HOW TO UNDO
-- -----------
--   DROP FUNCTION IF EXISTS resolve_board_demand(UUID,UUID,NUMERIC,UUID);
--   DROP FUNCTION IF EXISTS release_board_demand(UUID,UUID,UUID);
--   DROP FUNCTION IF EXISTS recalc_board_demand(UUID);
--   DROP FUNCTION IF EXISTS apply_po_to_demand(UUID,UUID,NUMERIC,NUMERIC,UUID);
--   DROP FUNCTION IF EXISTS consume_board_reservation(UUID,UUID,UUID,NUMERIC);
--   ALTER TABLE purchase_order_items DROP COLUMN IF EXISTS demand_id;
--   ALTER TABLE board_types DROP COLUMN IF EXISTS default_vendor_id;
--   DROP TABLE IF EXISTS board_demands;
--   UPDATE board_inventory SET reserved_stock = 0;   -- reservations sirf yahan se aati hain
-- ═══════════════════════════════════════════════════════════════════════════

-- ─── 1. Board type ka default vendor ──────────────────────────────────────────
-- Mehboob: "bleach board size koi bhi ho, aana ek hi vendor se hai." Vendor board
-- ke TYPE ke saath juda hai, size ke saath nahi. Ye us rule ko likh ke rakh deta
-- hai taake demand se PO banate waqt vendor khud bhar jaye.
ALTER TABLE board_types
  ADD COLUMN IF NOT EXISTS default_vendor_id UUID;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE constraint_name = 'board_types_default_vendor_id_fkey'
      AND table_name = 'board_types'
  ) THEN
    ALTER TABLE board_types
      ADD CONSTRAINT board_types_default_vendor_id_fkey
      FOREIGN KEY (default_vendor_id) REFERENCES vendors(id);
  END IF;
END $$;

COMMENT ON COLUMN board_types.default_vendor_id IS
  'Is board type ka mamool ka vendor. Demand se PO banate waqt khud chun liya jata hai.';

-- ─── 2. board_demands ─────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS board_demands (
  id                 UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id         UUID NOT NULL REFERENCES companies(id),

  -- NULL = forecast demand: client ne forecast diya, board pehle se mangwa ke
  -- rakhna hai. Job banegi to wo isi stock se match ho jayegi.
  job_id             UUID REFERENCES jobs(id),

  -- Kya chahiye. Job banate waqt uski spec ki copy — job baad mein badle to
  -- demand dobara resolve hoti hai, is liye ye copy hamesha taza rehti hai.
  board_type_id      UUID REFERENCES board_types(id),
  paper_type_id      UUID REFERENCES paper_types(id),
  material_name      TEXT NOT NULL,
  gsm                NUMERIC(8,2),
  sheet_width_in     NUMERIC(10,2),
  sheet_height_in    NUMERIC(10,2),
  sheets_required    NUMERIC(14,2) NOT NULL DEFAULT 0,

  -- Kaise poori ho rahi hai.
  board_item_id      UUID REFERENCES board_inventory(id),
  sheets_from_stock  NUMERIC(14,2) NOT NULL DEFAULT 0,
  sheets_ordered     NUMERIC(14,2) NOT NULL DEFAULT 0,
  sheets_received    NUMERIC(14,2) NOT NULL DEFAULT 0,
  sheets_to_purchase NUMERIC(14,2) NOT NULL DEFAULT 0,

  status             TEXT NOT NULL DEFAULT 'open'
                     CHECK (status IN ('open','partially_ordered','ordered','ready','cancelled')),
  notes              TEXT,

  created_at         TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at         TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_by         UUID,
  updated_by         UUID,
  deleted_at         TIMESTAMPTZ,
  is_active          BOOLEAN NOT NULL DEFAULT TRUE
);

-- Ek job ki ek hi zinda demand. Cancelled rows tareekh ke liye rehti hain, is
-- liye unique index sirf un par jo abhi chal rahi hain. Gang run mein board ek
-- hi dafa nikalta hai (126) — demand lead job ke naam banti hai aur members ki
-- cancel ho jati hai, bilkul MRN ki tarah.
CREATE UNIQUE INDEX IF NOT EXISTS idx_board_demands_one_live_per_job
  ON board_demands(job_id)
  WHERE job_id IS NOT NULL AND deleted_at IS NULL AND status <> 'cancelled';

CREATE INDEX IF NOT EXISTS idx_board_demands_company_status
  ON board_demands(company_id, status) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_board_demands_item
  ON board_demands(board_item_id) WHERE deleted_at IS NULL;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'trg_board_demands_upd') THEN
    CREATE TRIGGER trg_board_demands_upd BEFORE UPDATE ON board_demands
      FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'trg_audit_board_demands') THEN
    CREATE TRIGGER trg_audit_board_demands AFTER INSERT OR UPDATE OR DELETE ON board_demands
      FOR EACH ROW EXECUTE FUNCTION log_audit_event();
  END IF;
END $$;

ALTER TABLE board_demands ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'board_demands' AND policyname = 'board_demands_tenant') THEN
    CREATE POLICY board_demands_tenant ON board_demands
      USING (company_id = (auth.jwt() ->> 'company_id')::UUID);
  END IF;
END $$;

COMMENT ON TABLE board_demands IS
  'Har job ka board — khud ba khud banti hai. Stock leftover hai, target nahi: demand pehle leftover se match hoti hai (gsm + size, type tarjeehan), utna reserve kar leti hai, baqi Purchase ko jati hai.';
COMMENT ON COLUMN board_demands.sheets_from_stock IS
  'Matched board_inventory row par is demand ke naam reserve sheets. Khareeda hua maal receive hone pe isi mein aata hai.';
COMMENT ON COLUMN board_demands.sheets_to_purchase IS
  'Derived: GREATEST(0, required − from_stock − ordered). Yahi wo number hai jo Purchase ki Demands list mein dikhta hai.';

-- ─── 3. PO line ↔ demand ──────────────────────────────────────────────────────
-- Ek PO line ek demand ko poora karti hai. purchase_order_items.job_id 113 se
-- pehle se maujood hai (board kis job ke liye khareeda ja raha hai); ye us se
-- aage ja kar batata hai ke ye kis demand ke khilaf hai, taake receive hone pe
-- wo demand khud 'ready' ho jaye.
ALTER TABLE purchase_order_items
  ADD COLUMN IF NOT EXISTS demand_id UUID;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE constraint_name = 'purchase_order_items_demand_id_fkey'
      AND table_name = 'purchase_order_items'
  ) THEN
    ALTER TABLE purchase_order_items
      ADD CONSTRAINT purchase_order_items_demand_id_fkey
      FOREIGN KEY (demand_id) REFERENCES board_demands(id);
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_po_items_demand ON purchase_order_items(demand_id)
  WHERE demand_id IS NOT NULL;

-- ─── 4. recalc_board_demand ───────────────────────────────────────────────────
-- Chaaron number apni jagah rakh kar sirf sheets_to_purchase aur status nikalta
-- hai. Har doosri function apni tabdeeli karne ke baad isay bulati hai, taake
-- status ka hisab ek hi jagah rahe.
CREATE OR REPLACE FUNCTION recalc_board_demand(p_demand_id UUID)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  d           board_demands%ROWTYPE;
  v_to_buy    NUMERIC;
  v_status    TEXT;
BEGIN
  SELECT * INTO d FROM board_demands WHERE id = p_demand_id;
  IF NOT FOUND OR d.status = 'cancelled' THEN RETURN; END IF;

  v_to_buy := GREATEST(0, d.sheets_required - d.sheets_from_stock - d.sheets_ordered);

  IF v_to_buy > 0 AND d.sheets_ordered > 0 THEN
    v_status := 'partially_ordered';
  ELSIF v_to_buy > 0 THEN
    v_status := 'open';
  ELSIF d.sheets_ordered > 0 THEN
    v_status := 'ordered';
  ELSE
    -- Kuch khareedna baqi nahi aur koi PO khuli nahi — poora board reserve hai.
    v_status := 'ready';
  END IF;

  UPDATE board_demands
     SET sheets_to_purchase = v_to_buy,
         status             = v_status
   WHERE id = p_demand_id;
END $$;

COMMENT ON FUNCTION recalc_board_demand(UUID) IS
  'sheets_to_purchase aur status dobara nikalta hai. Status ka hisab sirf yahan hai.';

-- ─── 5. resolve_board_demand ──────────────────────────────────────────────────
-- Job ka board demand banata ya taza karta hai: purani reservation chhorta hai,
-- dobara match dhoondta hai, aur jitna mil sakta hai utna reserve kar leta hai.
-- Idempotent — bar bar chalao, wahi nateeja.
--
-- p_sheets_required NULL ho to job ka apna sheet_qty. Gang run ke liye caller
-- (TS) run ka sheet count bhejta hai, kyunke gang ka hisab wahan pehle se hai —
-- SQL ko gang ka ilm dena is function ko be-wajah bhaari kar deta.
CREATE OR REPLACE FUNCTION resolve_board_demand(
  p_company_id      UUID,
  p_job_id          UUID,
  p_sheets_required NUMERIC DEFAULT NULL,
  p_user_id         UUID DEFAULT NULL
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  j             RECORD;
  d             board_demands%ROWTYPE;
  v_demand_id   UUID;
  v_sheets      NUMERIC;
  v_item        UUID;
  v_available   NUMERIC;
  v_take        NUMERIC;
  v_name        TEXT;
BEGIN
  SELECT jb.id, jb.status, jb.deleted_at, jb.board_type_id, jb.paper_type_id,
         jb.gsm, jb.sheet_width_in, jb.sheet_height_in, jb.sheet_qty,
         bt.name AS board_name, pt.name AS paper_name
    INTO j
    FROM jobs jb
    LEFT JOIN board_types bt ON bt.id = jb.board_type_id
    LEFT JOIN paper_types pt ON pt.id = jb.paper_type_id
   WHERE jb.id = p_job_id AND jb.company_id = p_company_id;

  IF NOT FOUND THEN RETURN NULL; END IF;

  v_sheets := COALESCE(p_sheets_required, j.sheet_qty, 0);
  v_name   := COALESCE(j.board_name, j.paper_name);

  -- Job mar gayi, cancel ho gayi, ya uske paas board ki spec hi nahi — jo
  -- reserve tha wo chhoro aur demand band kar do. (Mehboob: "job cancel ho gaya
  -- to us ka board stock mein aa gaya.")
  IF j.deleted_at IS NOT NULL OR j.status = 'cancelled'
     OR v_sheets <= 0 OR v_name IS NULL THEN
    PERFORM release_board_demand(p_company_id, p_job_id, p_user_id);
    RETURN NULL;
  END IF;

  SELECT * INTO d FROM board_demands
   WHERE job_id = p_job_id AND company_id = p_company_id
     AND deleted_at IS NULL AND status <> 'cancelled'
   LIMIT 1;

  -- Purani reservation chhoro — neeche naye sire se lagegi. Delta se, taake
  -- ek hi stock row par baithi doosri demands ka hissa na hile.
  IF FOUND AND d.board_item_id IS NOT NULL AND d.sheets_from_stock > 0 THEN
    UPDATE board_inventory
       SET reserved_stock = GREATEST(0, reserved_stock - d.sheets_from_stock)
     WHERE id = d.board_item_id AND company_id = p_company_id;
  END IF;

  -- Match: gsm + size (be-tarteeb jora). Type ka match tarjeeh deta hai, shart
  -- nahi. Us ke baad jis row par sab se zyada khali stock ho.
  -- Pehle se pinned row (jis par PO aaya ya jo pehle match hui thi) ko sab se
  -- oopar rakha jata hai, warna receive hone ke baad demand kisi aur row par
  -- chali jati aur reservation ka hisab do rows mein bant jata.
  SELECT bi.id INTO v_item
    FROM board_inventory bi
   WHERE bi.company_id = p_company_id
     AND bi.deleted_at IS NULL AND bi.is_active
     AND bi.gsm IS NOT DISTINCT FROM j.gsm
     AND LEAST(bi.sheet_width_in, bi.sheet_height_in)
         IS NOT DISTINCT FROM LEAST(j.sheet_width_in, j.sheet_height_in)
     AND GREATEST(bi.sheet_width_in, bi.sheet_height_in)
         IS NOT DISTINCT FROM GREATEST(j.sheet_width_in, j.sheet_height_in)
   ORDER BY
     (d.board_item_id IS NOT NULL AND bi.id = d.board_item_id) DESC,
     (j.board_type_id IS NOT NULL AND bi.board_type_id = j.board_type_id) DESC,
     (j.paper_type_id IS NOT NULL AND bi.paper_type_id = j.paper_type_id) DESC,
     (bi.current_stock - bi.reserved_stock) DESC,
     bi.id
   LIMIT 1
   FOR UPDATE OF bi;

  v_take := 0;
  IF v_item IS NOT NULL THEN
    SELECT GREATEST(0, current_stock - reserved_stock) INTO v_available
      FROM board_inventory WHERE id = v_item;
    -- Jo PO par pehle se chal raha hai wo dobara stock se na uthao.
    v_take := LEAST(GREATEST(0, v_sheets - COALESCE(d.sheets_ordered, 0)), v_available);
    IF v_take > 0 THEN
      UPDATE board_inventory
         SET reserved_stock = reserved_stock + v_take
       WHERE id = v_item AND company_id = p_company_id;
    END IF;
  END IF;

  IF d.id IS NULL THEN
    INSERT INTO board_demands (
      company_id, job_id, board_type_id, paper_type_id, material_name,
      gsm, sheet_width_in, sheet_height_in, sheets_required,
      board_item_id, sheets_from_stock, created_by, updated_by
    ) VALUES (
      p_company_id, p_job_id, j.board_type_id, j.paper_type_id, v_name,
      j.gsm, j.sheet_width_in, j.sheet_height_in, v_sheets,
      v_item, v_take, p_user_id, p_user_id
    ) RETURNING id INTO v_demand_id;
  ELSE
    v_demand_id := d.id;
    UPDATE board_demands
       SET board_type_id     = j.board_type_id,
           paper_type_id     = j.paper_type_id,
           material_name     = v_name,
           gsm               = j.gsm,
           sheet_width_in    = j.sheet_width_in,
           sheet_height_in   = j.sheet_height_in,
           sheets_required   = v_sheets,
           board_item_id     = COALESCE(v_item, d.board_item_id),
           sheets_from_stock = v_take,
           updated_by        = COALESCE(p_user_id, d.updated_by)
     WHERE id = v_demand_id;
  END IF;

  PERFORM recalc_board_demand(v_demand_id);
  RETURN v_demand_id;
END $$;

COMMENT ON FUNCTION resolve_board_demand(UUID,UUID,NUMERIC,UUID) IS
  'Job ka board demand banata/taza karta hai: purani reservation chhorta hai, gsm+size par match dhoondta hai (type tarjeehan), jitna khali mile utna reserve karta hai. Idempotent.';

-- ─── 6. release_board_demand ──────────────────────────────────────────────────
-- Job cancel/delete hui, ya gang mein shamil ho gayi (board ab lead job nikalega).
-- Reservation wapas, demand cancelled — row rehti hai taake tareekh na mite.
CREATE OR REPLACE FUNCTION release_board_demand(
  p_company_id UUID,
  p_job_id     UUID,
  p_user_id    UUID DEFAULT NULL
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  d board_demands%ROWTYPE;
BEGIN
  FOR d IN
    SELECT * FROM board_demands
     WHERE job_id = p_job_id AND company_id = p_company_id
       AND deleted_at IS NULL AND status <> 'cancelled'
  LOOP
    IF d.board_item_id IS NOT NULL AND d.sheets_from_stock > 0 THEN
      UPDATE board_inventory
         SET reserved_stock = GREATEST(0, reserved_stock - d.sheets_from_stock)
       WHERE id = d.board_item_id AND company_id = p_company_id;
    END IF;

    UPDATE board_demands
       SET status             = 'cancelled',
           sheets_from_stock  = 0,
           sheets_to_purchase = 0,
           updated_by         = COALESCE(p_user_id, d.updated_by)
     WHERE id = d.id;
  END LOOP;
END $$;

COMMENT ON FUNCTION release_board_demand(UUID,UUID,UUID) IS
  'Job ki demand band karke uski reservation stock ko wapas kar deta hai. Row cancelled rehti hai, mitti nahi.';

-- ─── 7. apply_po_to_demand ────────────────────────────────────────────────────
-- PO line bani (ordered +) ya maal aaya (received +). Receive hone par ordered
-- utna hi kam hota hai, kyunke wo sheets ab current_stock mein aa chuki hain —
-- aur wahan se dobara resolve unhein isi job ke naam reserve kar deta hai. Isi
-- liye 'received' koi alag status nahi hai: maal aana matlab demand 'ready'.
CREATE OR REPLACE FUNCTION apply_po_to_demand(
  p_company_id      UUID,
  p_demand_id       UUID,
  p_ordered_delta   NUMERIC DEFAULT 0,
  p_received_delta  NUMERIC DEFAULT 0,
  p_board_item_id   UUID DEFAULT NULL
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  d board_demands%ROWTYPE;
BEGIN
  SELECT * INTO d FROM board_demands
   WHERE id = p_demand_id AND company_id = p_company_id
     AND deleted_at IS NULL AND status <> 'cancelled';
  IF NOT FOUND THEN RETURN; END IF;

  UPDATE board_demands
     SET sheets_ordered  = GREATEST(0, sheets_ordered
                                       + COALESCE(p_ordered_delta, 0)
                                       - COALESCE(p_received_delta, 0)),
         sheets_received = sheets_received + COALESCE(p_received_delta, 0),
         -- PO jis stock row par khareed rahi hai, demand usi par pin ho jati hai.
         board_item_id   = COALESCE(p_board_item_id, board_item_id)
   WHERE id = p_demand_id;

  IF d.job_id IS NOT NULL THEN
    -- Naya maal ab stock mein hai — dobara resolve usay is job ke naam reserve
    -- kar dega. sheets_required wahi rehti hai jo demand par likhi hai.
    PERFORM resolve_board_demand(p_company_id, d.job_id, d.sheets_required, NULL);
  ELSE
    PERFORM recalc_board_demand(p_demand_id);
  END IF;
END $$;

COMMENT ON FUNCTION apply_po_to_demand(UUID,UUID,NUMERIC,NUMERIC,UUID) IS
  'PO line banne par ordered barhata hai; maal aane par ordered kam karke received barhata hai aur demand ko dobara resolve karke naya stock isi job ke naam reserve kar deta hai.';

-- ─── 8. consume_board_reservation ─────────────────────────────────────────────
-- Store ne MRN issue kar diya: current_stock Store route pehle se ghatata hai,
-- ye us ke saath reserved_stock bhi ghatata hai. Ye na hota to sheets stock se
-- nikal jatin magar reserve mein baithi rehtin, aur available hamesha kam
-- dikhta — dheere dheere har row "khali" ho jati.
CREATE OR REPLACE FUNCTION consume_board_reservation(
  p_company_id    UUID,
  p_board_item_id UUID,
  p_job_id        UUID,
  p_sheets        NUMERIC
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  d       board_demands%ROWTYPE;
  v_drop  NUMERIC;
BEGIN
  IF p_sheets IS NULL OR p_sheets <= 0 OR p_board_item_id IS NULL THEN RETURN; END IF;

  IF p_job_id IS NOT NULL THEN
    SELECT * INTO d FROM board_demands
     WHERE job_id = p_job_id AND company_id = p_company_id
       AND board_item_id = p_board_item_id
       AND deleted_at IS NULL AND status <> 'cancelled'
     LIMIT 1;
  END IF;

  -- Sirf utna chhoro jitna is job ke naam waqai reserve tha. Job ne apni
  -- reservation se zyada utha liya (jo ho jata hai) to baqi doosron ka hissa
  -- hai — usay yahan se chherna ghalat hoga.
  v_drop := LEAST(p_sheets, COALESCE(d.sheets_from_stock, 0));

  IF v_drop > 0 THEN
    UPDATE board_inventory
       SET reserved_stock = GREATEST(0, reserved_stock - v_drop)
     WHERE id = p_board_item_id AND company_id = p_company_id;

    UPDATE board_demands
       SET sheets_from_stock = GREATEST(0, sheets_from_stock - v_drop)
     WHERE id = d.id;

    PERFORM recalc_board_demand(d.id);
  END IF;
END $$;

COMMENT ON FUNCTION consume_board_reservation(UUID,UUID,UUID,NUMERIC) IS
  'MRN issue hone par reserved_stock ghatata hai (current_stock Store route ghatata hai). Sirf utna jitna is job ke naam reserve tha.';

NOTIFY pgrst, 'reload schema';
