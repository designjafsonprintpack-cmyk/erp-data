-- 145: Sales Order ab DRAFT mein paida hoti hai
--
-- KYA TOOTA THA
--   SO ka koi draft marhala tha hi nahi. `SOFormClient` seedha
--   `status: 'confirmed'` likhta tha aur CHECK constraint bhi sirf paanch halaton
--   ki ijazat deta tha — 'draft' un mein shamil nahi. Yani "confirm" ka koi lamha
--   maujood hi nahi tha.
--
--   Ye us waqt tak sirf ek khaali khana tha, magar ab is par kaam lataka hai:
--   SO confirm hote hi uski REPEAT lines ki jobs khud ban jati hain
--   (`POST /api/v1/sales-orders/[id]/confirm`). Mehboob: *"SO save hoty nhi
--   conform hoty hi kero, save k bad ager koi changes yad aa gai to."* Bilkul —
--   jab tak SO draft hai, miqdaar aur line badalte raho; confirm production ka
--   hukm hai, aur usi par jobs banti hain.
--
-- YE MIGRATION KYA KARTI HAI
--   Sirf CHECK constraint ko chauRa karti hai taake 'draft' bhi qabool ho.
--   Column ka default JAAN BUJH KAR nahi badla: default badalne se har purana
--   raasta jo status bheje bagair SO banata hai, khamoshi se draft banane lagta.
--   Naya status form se saaf saaf likha jata hai.
--
--   Live par mojood SO ko haath nahi lagaya gaya — ek hi SO hai aur wo confirmed
--   hai, aur usay draft mein wapas dhakelna uski banni hui jobs se mel nahi
--   khata.
--
-- WAPAS KAISE LEIN
--   Pehle koi bhi draft SO confirmed ya cancelled kar lein, phir:
--   ALTER TABLE sales_orders DROP CONSTRAINT sales_orders_status_check;
--   ALTER TABLE sales_orders ADD CONSTRAINT sales_orders_status_check
--     CHECK (status = ANY (ARRAY['confirmed','in_production','completed','dispatched','cancelled']));

ALTER TABLE sales_orders DROP CONSTRAINT IF EXISTS sales_orders_status_check;

ALTER TABLE sales_orders ADD CONSTRAINT sales_orders_status_check
  CHECK (status = ANY (ARRAY[
    'draft'::text,
    'confirmed'::text,
    'in_production'::text,
    'completed'::text,
    'dispatched'::text,
    'cancelled'::text
  ]));

COMMENT ON COLUMN sales_orders.status IS
  'draft = abhi likhi ja rahi hai, jitni dafa chaho badlo, koi job nahi banti. '
  'confirmed = production ka hukm; isi lamhe har repeat line ki job khud ban '
  'jati hai (POST /api/v1/sales-orders/[id]/confirm). Migration 145.';

NOTIFY pgrst, 'reload schema';
