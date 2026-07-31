import { createSupabaseAdminClient } from '@/lib/supabase/admin'
import { loadArtworkApprovalMeta, isPreviewDrawable } from '@/lib/utils/artworkApprovalMeta'

/**
 * The thumbnail WhatsApp shows when this approval link is pasted.
 *
 * Next picks this file up by name and emits the `og:image` tag for the page
 * beside it, so the URL and the tag can never drift apart.
 *
 * WHY IT ISN'T JUST THE ARTWORK FILE
 *   1. The artwork bucket is PRIVATE — a signed URL lasts an hour, and a link
 *      gets pasted days later. This route is reachable by the token instead,
 *      exactly like the page it previews.
 *   2. **WhatsApp will not render an og:image much over 300 KB.** The five
 *      artworks on live are 353–940 KB, so pointing at the original would have
 *      produced no preview at all on the one app this shop actually uses.
 *
 * HOW IT IS RESIZED — Supabase Storage does it
 *   Storage image transformation returns a resized, re-encoded JPEG from the
 *   original object. Measured against all five live artworks: 940 KB → 54 KB,
 *   353 KB → 46 KB. That is the whole resizer, with no image library added to
 *   the project and no WASM renderer in the request path.
 *
 *   (`next/og` was built first and thrown away: its bundled default font is
 *   resolved with a path join that produces `.\file:\F:\…\noto-sans.ttf` on
 *   Windows, so every render 500'd on the machine this project is developed on.
 *   Something that can't be run locally can't be verified locally.)
 *
 * The bytes are streamed through rather than redirected to, because a crawler
 * that declines to follow a redirect for an image would silently show no
 * preview — and "silently shows nothing" is the failure this whole change
 * exists to remove.
 */
export const runtime = 'nodejs'
export const contentType = 'image/jpeg'
export const size = { width: 1200, height: 630 }
export const alt = 'Artwork approval'

// Long enough to survive the fetch this route makes immediately below it;
// the URL never leaves this function.
const SIGNED_URL_TTL_SECONDS = 120

export default async function Image({ params }: { params: { token: string } }) {
  const meta = await loadArtworkApprovalMeta(params.token)

  // No preview for a dead or unknown link — a link that no longer works must
  // not keep showing a customer's unreleased design in a chat thread. The page
  // still previews with its title and description; only the picture is absent.
  if (!meta || meta.expired || !isPreviewDrawable(meta.file_name, meta.file_type)) {
    return new Response(null, { status: 404 })
  }

  try {
    const supabase = createSupabaseAdminClient()
    const { data: signed } = await supabase.storage.from('artwork')
      .createSignedUrl(meta.file_url, SIGNED_URL_TTL_SECONDS, {
        transform: { width: size.width, height: size.height, resize: 'contain', quality: 60 },
      })
    if (!signed?.signedUrl) return new Response(null, { status: 404 })

    const res = await fetch(signed.signedUrl)
    if (!res.ok) return new Response(null, { status: 404 })

    return new Response(await res.arrayBuffer(), {
      headers: {
        'content-type': res.headers.get('content-type') || contentType,
        // Crawlers re-fetch; the artwork behind one token+version never changes.
        'cache-control': 'public, max-age=3600, s-maxage=86400',
      },
    })
  } catch {
    // A missing picture costs a nicer preview. A thrown route costs the preview
    // AND the title, so this never throws.
    return new Response(null, { status: 404 })
  }
}
