# Jafson ERP — Artwork thumbnails (125 × 160)

4 files (1 naya). Koi SQL migration nahi, koi env var nahi. Repo-root structure.
Ye zip pichhle `jafson-erp-artwork-users-fix.zip` ko **replace** karta hai —
usme jo Users ka fix tha wo bhi ismein shamil hai. Seedha ye extract kar do.

## Kya mila

**NEW `src/components/artwork/ArtworkThumb.tsx`** — 125 × 160 px ka thumbnail
tile. Size ek hi jagah define hai (`THUMB_W` / `THUMB_H`), taake Artwork page
aur Job Detail ka Artwork tab kabhi alag na ho jayen.

**1. List view mein thumbnail** — pehle jo chhota 40px ka "v1" chip tha uski
jagah ab poora 125 × 160 preview hai. Version number thumbnail ke upar corner
mein chala gaya. Baaqi sab (status, file info, saare buttons) waise ke waise.

**2. Naya Thumbnail (grid) view** — toolbar mein List / Thumbnail toggle. Grid
mein har version 125 × 160 tile hai, neeche file name + status, aur teen kaam
ke buttons (comments/markup, approval link, delete). Tile par click karne se
file khul jati hai. Tumhara choice **localStorage mein yaad rehta hai** — ek
baar Thumbnail chuna, aage har baar wohi khulega.

Default abhi bhi List hai taake kisi aur ka workflow na tootay.

**3. Job Detail → Artwork tab** mein bhi wohi 125 × 160 thumbnail (wahan toggle
nahi, kyunke ek job ki list chhoti hoti hai).

## Technical

- `artwork` bucket private hai (migration 036), to har image ko signed URL
  chahiye. Ek-ek karke sign karte to har artwork par ek request jati — iske
  bajaye `createSignedUrls()` se **poori screen ke liye ek hi request** jati hai.
  URL 1 ghante ka hai.
- Sirf image files (JPG/PNG/WEBP/GIF/BMP/SVG/AVIF) ka preview banta hai.
  PDF / AI / EPS / PSD ke liye file-type tile aata hai (icon + "AI", "PDF")
  — layout wahi 125 × 160 rehta hai, to previews load hote waqt page hilta nahi.
- Image `object-cover` + `loading="lazy"`. Load fail ho to khud-ba-khud
  file-type tile par gir jata hai.

## Verification

- `npx tsc --noEmit` → 0 errors
- `npm run build` → compiled successfully, 125/125 routes
- Render-tested: 13/13 PASS (exact 125/160 px, image + fallback dono branches,
  approved frame, previewable detection, toggle, default view)
