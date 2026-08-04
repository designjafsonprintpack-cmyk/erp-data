import type { SupabaseClient } from '@supabase/supabase-js'
import { uploadFile } from '@/lib/utils/uploadFile'
import { makeArtworkThumb } from '@/lib/utils/makeArtworkThumb'

/**
 * Uploads an artwork file and, when it is a raster image, a small preview
 * beside it.
 *
 * ONE HELPER BECAUSE THERE ARE TWO CALL SITES
 *   The Artwork page and the Job Detail artwork tab both upload artwork with
 *   the same three lines. Adding the preview step to each by hand is how they
 *   drift — and a preview generated on one screen but not the other would look
 *   exactly like a caching bug.
 *
 * THE PREVIEW IS BEST-EFFORT
 *   A failure to build or upload it returns `thumbPath: null` and the artwork
 *   row simply has no `thumb_url`; every reader falls back to the original. The
 *   upload itself only fails if the ORIGINAL fails.
 */
export async function uploadArtworkWithThumb(
  supabase: SupabaseClient,
  companyId: string,
  jobId: string,
  file: File,
): Promise<{ path: string | null; thumbPath: string | null; error: string | null }> {
  const stamp = Date.now()

  const { path, error } = await uploadFile(
    supabase, 'artwork', companyId, `${jobId}/${stamp}-${file.name}`, file
  )
  if (error || !path) return { path: null, thumbPath: null, error: error || 'Upload failed' }

  let thumbPath: string | null = null
  try {
    const thumb = await makeArtworkThumb(file)
    if (thumb) {
      // Sits in a `thumbs/` folder under the same job. The retention sweep walks
      // the bucket recursively and keeps anything a live row points at, so the
      // extra level costs nothing and makes the bucket readable by eye.
      const up = await uploadFile(
        supabase, 'artwork', companyId, `${jobId}/thumbs/${stamp}-${thumb.name}`, thumb
      )
      thumbPath = up.path
      if (up.error) console.error('[artwork] thumbnail upload failed:', up.error)
    }
  } catch (e: any) {
    console.error('[artwork] thumbnail generation failed:', e?.message ?? e)
  }

  return { path, thumbPath, error: null }
}

export default uploadArtworkWithThumb
