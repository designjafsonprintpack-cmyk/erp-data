# Jafson ERP — Migration 086 FIX #2 (view type mismatch)

1 file — dobara sirf migration `086_sheet_dimensions_box_type_workflow.sql`.
Apni pichli copy (chahe wo Stage 1 wali ho ya pehle wali fix) ko isse badal do.

## Nayi ghalti pakri gayi

```
ERROR: 42809: "global_search_index" is not a materialized view
HINT: Use DROP VIEW to remove a view.
```

Pichli fix ne maan liya tha ke `global_search_index` **materialized view** hai
(jaisa ke migration files mein likha hai). Lekin **tumhare asli database mein
ye ek plain (aam) view ban chuki hai** — kisi ne pehle kabhi Supabase mein
seedha jaake ise badla hoga, jo migration files mein wapas record nahi hua.
Isi wajah se mera pehla fix `DROP MATERIALIZED VIEW` bol raha tha jab wahan
asal mein sirf `VIEW` thi.

## Fix — is baar guess nahi kiya

Migration ab pehle **check karti hai** ke `global_search_index` abhi kaun sa
type hai (`pg_matviews` / `pg_views` se dekh kar), aur usay **wapas usi type
mein** banati hai — chahe wo materialized ho ya plain. Khud se decide nahi
karti ke konsa "behtar" hai, kyunke ye is migration ka kaam nahi hai — sirf
sheet size/box type/workflow badalne aaye hain, view ka design badalna nahi.

Plain view ka ek fayda khud pata chala: usay kabhi "refresh" karne ki zaroorat
nahi — hamesha live data dikhati hai. (Materialized view ko refresh karne wala
trigger asal mein kahin wire hi nahi hua tha, to shayad isi wajah se kisi ne
pehle isay plain view mein badal diya hoga — stale data se bachne ke liye.)

## Verification

Is baar maine **dono scenario** asli PostgreSQL par bana kar test kiye —
tumhare jaisa (plain view) aur jo migration files mein likha hai (materialized
view dono):

**Plain view (tumhari asli halat):**
- Migration ke baad bhi plain view hi rehti hai ✓, koi index nahi banta (theek
  hai, plain view index rakh hi nahi sakti) ✓
- Ek naya job **bina refresh ke** turant search mein nazar aaya ✓ (live view
  ka fayda)
- Sheet size se search ("25"), job number se search, customer se search — sab
  kaam karte hain ✓
- **Teen baar chalayi, koi error nahi** ✓

**Materialized view (agar kabhi kahin ho):**
- Migration ke baad materialized hi rehti hai ✓, teeno indexes wapas ban jate
  hain ✓
- Teen baar chalayi, koi error nahi ✓

Dono halaton mein Box Types aur HL workflow bhi theek nikle.

`tsc` 0 errors, `npm run build` 126/126 — app code mein koi tabdeeli nahi,
sirf SQL fix hai.
