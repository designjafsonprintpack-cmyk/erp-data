/**
 * WHICH FILES THE ARTWORK MODULE ACCEPTS — the single answer.
 *
 * Artwork upload was JPG-only, enforced by an identical hand-written check in
 * TWO places (the Artwork page and the Job Detail artwork tab) and by nothing
 * at all on the server. Mehboob asked for PNG and WEBP as well, so the list
 * lives here once and both uploaders plus the API route read it.
 *
 * WHY THIS LIST AND NOT MORE
 *   Every accepted type has to survive the whole chain, not just the upload:
 *     · ArtworkThumb renders it in an <img>
 *     · the customer approval page renders it in an <img> and draws
 *       MarkupOverlay on top, whose shapes are stored as 0–100 % points
 *     · AI pre-flight sends the raw bytes to Claude as an image
 *   JPG, PNG and WEBP clear all three. **PDF does not** — it cannot go in an
 *   <img>, so a customer would be asked to approve a grey file-type tile with
 *   nothing to mark up. Supporting it properly means rasterising page 1 at
 *   upload and storing that preview alongside the PDF (a new column). Raised
 *   with Mehboob on 2026-07-31 and deliberately deferred: "pdf rahny do".
 *   If it ever comes back, his shape for it was one page, low resolution.
 *
 *   AI / EPS / PSD are out for the same reason and were not asked for. They
 *   already render as a file-type tile if a legacy row has one — that path in
 *   ArtworkThumb is untouched, so nothing existing breaks.
 */

/** Uppercase extensions, matching how `job_artworks.file_type` is stored. */
export const ARTWORK_EXTS = ['JPG', 'JPEG', 'PNG', 'WEBP'] as const

/** For a file input's `accept` attribute. Extensions AND mime types, because
 *  Android's file picker honours one and iOS Safari the other. */
export const ARTWORK_ACCEPT = '.jpg,.jpeg,.png,.webp,image/jpeg,image/png,image/webp'

/** What the upload help text says. Kept here so the two forms cannot disagree. */
export const ARTWORK_ACCEPT_LABEL = 'JPG, PNG or WEBP.'

/** The message both uploaders and the API route show on a rejected file. */
export const ARTWORK_REJECT_MESSAGE = 'Only JPG, PNG and WEBP files are accepted'

/** Extension of a filename, uppercased, without the dot. '' if there is none. */
export function artworkExt(fileName: string): string {
  const dot = fileName.lastIndexOf('.')
  return dot === -1 ? '' : fileName.slice(dot + 1).toUpperCase()
}

/**
 * Is this an artwork file we accept?
 *
 * Checks the EXTENSION, and treats the browser-reported mime type as a second
 * chance rather than a requirement — some Android pickers hand back an empty
 * `type`, and the old JPG check failed those files even though they were valid
 * JPGs.
 */
export function isAcceptedArtworkFile(fileName: string, mimeType?: string | null): boolean {
  const ext = artworkExt(fileName)
  if ((ARTWORK_EXTS as readonly string[]).includes(ext)) return true
  const mt = (mimeType || '').toLowerCase()
  return mt === 'image/jpeg' || mt === 'image/jpg' || mt === 'image/png' || mt === 'image/webp'
}

/**
 * The mime type to hand Claude for AI pre-flight.
 *
 * Reads `job_artworks.file_type` first (which the uploaders write as the
 * uppercase extension) and falls back to the filename. Returns null for
 * anything not accepted, so the route can refuse rather than mislabel a file —
 * it used to send `image/jpeg` unconditionally, which would now be a lie for
 * every PNG.
 */
export function artworkMimeType(fileName: string, fileType?: string | null): string | null {
  const ext = (fileType || '').toUpperCase().replace(/^\./, '') || artworkExt(fileName)
  switch (ext) {
    case 'JPG':
    case 'JPEG': return 'image/jpeg'
    case 'PNG':  return 'image/png'
    case 'WEBP': return 'image/webp'
    default:     return null
  }
}
