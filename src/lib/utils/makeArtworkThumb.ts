/**
 * Builds a small preview copy of an uploaded artwork file, in the browser.
 *
 * WHY
 *   Every thumbnail in the ERP used to point at the ORIGINAL upload and let the
 *   browser shrink it. On live the artwork averages 634 kB and runs to 1.17 MB,
 *   so a search listing 20 jobs pulled roughly 12 MB to paint tiles 40 px wide.
 *   The boxes appeared instantly and the pictures did not — which is exactly
 *   what Mehboob reported.
 *
 * WHY IN THE BROWSER AND NOT ON THE SERVER
 *   Server-side resizing means a native image library (sharp) in the Vercel
 *   build for one small job. The file is already in the operator's hand when
 *   they pick it, a canvas downscale of a 1 MB JPEG takes a few milliseconds,
 *   and it costs the deployment nothing.
 *
 * IT MUST NEVER FAIL THE UPLOAD
 *   Every failure path returns null and the caller carries on with the original
 *   only. A missing preview costs a slower tile; a thrown error would cost the
 *   artwork. Non-raster files (PDF, AI, EPS) and SVG return null by design —
 *   the first cannot be drawn to a canvas, the second is already tiny and
 *   scales for free.
 */

/** Long edge of the generated preview, in pixels.
 *
 *  The largest tile drawn anywhere is 125 × 160 (ArtworkThumb's 'lg'), so 400
 *  still has pixels to spare on a 2× display while keeping the file around
 *  30–60 kB. Raising this is the knob if a preview ever looks soft. */
const THUMB_MAX_EDGE = 400

/** WEBP quality. 0.82 is visually indistinguishable at tile size and about a
 *  third the bytes of 0.95. */
const THUMB_QUALITY = 0.82

/** Formats a canvas can actually draw. Deliberately excludes SVG (already
 *  small, and tainting rules around it differ per browser) and every print
 *  format the shop also uploads. */
const RASTER_EXT = new Set(['JPG', 'JPEG', 'PNG', 'WEBP', 'BMP', 'AVIF'])

export function canMakeThumb(fileName: string, fileType?: string | null): boolean {
  const ext = (fileType || fileName.split('.').pop() || '').toUpperCase()
  return RASTER_EXT.has(ext)
}

/** Loads a File into an <img>, resolving null rather than throwing. */
function loadImage(file: File): Promise<HTMLImageElement | null> {
  return new Promise(resolve => {
    const url = URL.createObjectURL(file)
    const img = new Image()
    img.onload = () => { URL.revokeObjectURL(url); resolve(img) }
    img.onerror = () => { URL.revokeObjectURL(url); resolve(null) }
    img.src = url
  })
}

/** Promise wrapper around canvas.toBlob, which is callback-based and hands back
 *  null when the browser cannot encode the requested type. */
function toBlob(canvas: HTMLCanvasElement, type: string, quality: number): Promise<Blob | null> {
  return new Promise(resolve => canvas.toBlob(b => resolve(b), type, quality))
}

/**
 * Returns a downscaled copy of `file`, or null when one cannot or should not be
 * made. The returned File keeps the original's base name with a `.webp` (or
 * `.jpg`) extension so it is recognisable in the bucket.
 */
export async function makeArtworkThumb(file: File): Promise<File | null> {
  try {
    if (typeof document === 'undefined') return null
    if (!canMakeThumb(file.name, file.type)) return null

    const img = await loadImage(file)
    if (!img || !img.naturalWidth || !img.naturalHeight) return null

    const scale = Math.min(1, THUMB_MAX_EDGE / Math.max(img.naturalWidth, img.naturalHeight))
    // Already smaller than a thumbnail — re-encoding would only lose quality
    // for no saving, so the original is left to serve as its own preview.
    if (scale >= 1) return null

    const w = Math.max(1, Math.round(img.naturalWidth * scale))
    const h = Math.max(1, Math.round(img.naturalHeight * scale))

    const canvas = document.createElement('canvas')
    canvas.width = w
    canvas.height = h
    const ctx = canvas.getContext('2d')
    if (!ctx) return null

    // Artwork with transparency (a PNG dieline) would otherwise encode black
    // where the tile expects paper.
    ctx.fillStyle = '#ffffff'
    ctx.fillRect(0, 0, w, h)
    ctx.drawImage(img, 0, 0, w, h)

    // WEBP first; Safari below 16 cannot encode it and hands back null (or a
    // PNG mislabelled as webp), so JPEG is the fallback.
    let blob = await toBlob(canvas, 'image/webp', THUMB_QUALITY)
    let ext = 'webp'
    if (!blob || blob.type !== 'image/webp') {
      blob = await toBlob(canvas, 'image/jpeg', THUMB_QUALITY)
      ext = 'jpg'
    }
    if (!blob) return null

    // A "preview" bigger than the original is not a preview. Rare, but a small
    // heavily-compressed JPEG can re-encode larger than it started.
    if (blob.size >= file.size) return null

    const base = file.name.replace(/\.[^.]+$/, '') || 'artwork'
    return new File([blob], `${base}.${ext}`, { type: blob.type })
  } catch {
    // Any browser quirk at all — a tainted canvas, an out-of-memory decode on a
    // huge scan — leaves the upload with no preview and nothing else changed.
    return null
  }
}

export default makeArtworkThumb
