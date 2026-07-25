'use client'
import { useEffect, useState } from 'react'
import { FileText } from 'lucide-react'
import { cn } from '@/lib/utils/cn'
import { createSupabaseClient } from '@/lib/supabase/client'

/**
 * Thumbnail dimensions, fixed by Mehboob's spec: 125 × 160 px.
 *
 * Exported rather than hardcoded at the call sites so the Artwork page and the
 * Job Detail artwork tab can never drift apart, and so a future size change is
 * one edit. Tailwind purges classes built from runtime values, hence the
 * arbitrary-value classes below rather than a template string.
 */
export const THUMB_W = 125
export const THUMB_H = 160
export const THUMB_BOX = 'w-[125px] h-[160px]'

/** Extensions a browser can render directly in an <img>. */
const IMAGE_EXT = new Set(['JPG', 'JPEG', 'PNG', 'WEBP', 'GIF', 'BMP', 'SVG', 'AVIF'])

export function isPreviewable(fileName: string, fileType?: string | null): boolean {
  const ext = (fileType || fileName.split('.').pop() || '').toUpperCase()
  return IMAGE_EXT.has(ext)
}

export function extLabel(fileName: string, fileType?: string | null): string {
  return (fileType || fileName.split('.').pop() || 'FILE').toUpperCase()
}

interface ThumbSource {
  id: string
  file_url: string
  file_name: string
  file_type?: string | null
}

/**
 * Batch-signs storage paths for a list of artworks and returns id → signed URL.
 *
 * The `artwork` bucket is private (migration 036), so a thumbnail cannot just
 * point at the stored path — every image needs a signed URL. Signing them one
 * at a time would mean one round trip per artwork on a page that groups many
 * versions per job, so this uses createSignedUrls() and issues a single request
 * for the whole visible list. Non-previewable files (PDF, AI, EPS, PSD) are
 * skipped entirely — they render as a file-type tile instead.
 *
 * URLs are valid for an hour, which comfortably outlives a page view.
 */
export function useArtworkThumbnails(items: ThumbSource[]): Record<string, string> {
  const [urls, setUrls] = useState<Record<string, string>>({})

  // Signing depends only on which paths are on screen, so key the effect on the
  // path list rather than the array identity — otherwise every parent re-render
  // fires a fresh batch of signing requests.
  const key = items
    .filter(a => isPreviewable(a.file_name, a.file_type))
    .map(a => `${a.id}:${a.file_url}`)
    .sort()
    .join('|')

  useEffect(() => {
    if (!key) return
    let cancelled = false
    const pairs = key.split('|').map(s => {
      const i = s.indexOf(':')
      return { id: s.slice(0, i), path: s.slice(i + 1) }
    })

    ;(async () => {
      try {
        const supabase = createSupabaseClient()
        const { data, error } = await supabase.storage
          .from('artwork')
          .createSignedUrls(pairs.map(p => p.path), 3600)
        if (cancelled || error || !data) return
        const next: Record<string, string> = {}
        // Results come back in request order; map by index rather than by the
        // returned path, which Storage may normalise.
        data.forEach((row, i) => {
          if (row?.signedUrl && pairs[i]) next[pairs[i].id] = row.signedUrl
        })
        setUrls(prev => ({ ...prev, ...next }))
      } catch {
        // A failed batch just means no previews — the file-type tile still
        // renders and every other action on the row keeps working.
      }
    })()

    return () => { cancelled = true }
  }, [key])

  return urls
}

interface ArtworkThumbProps {
  url?: string
  fileName: string
  fileType?: string | null
  version: number
  /** Approved versions get the success-coloured frame. */
  approved?: boolean
  onClick?: () => void
  className?: string
}

/**
 * 125 × 160 artwork preview tile with the version number overlaid.
 *
 * Falls back to a file-type tile when the file isn't an image (print artwork is
 * often PDF/AI/EPS) or when its signed URL hasn't arrived yet, so the layout
 * never shifts once previews load.
 */
export function ArtworkThumb({
  url, fileName, fileType, version, approved, onClick, className,
}: ArtworkThumbProps) {
  const [failed, setFailed] = useState(false)
  const showImage = !!url && !failed
  const label = extLabel(fileName, fileType)

  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={`Open ${fileName}`}
      className={cn(
        THUMB_BOX,
        'relative flex-shrink-0 rounded-lg overflow-hidden border bg-[var(--color-bg-elevated)]',
        'flex items-center justify-center transition-colors',
        approved
          ? 'border-[var(--color-success)]/40'
          : 'border-[var(--color-border)] hover:border-[var(--color-accent)]',
        className
      )}
    >
      {showImage ? (
        // eslint-disable-next-line @next/next/no-img-element -- signed Supabase Storage URL, not a local asset
        <img
          src={url}
          alt={fileName}
          loading="lazy"
          onError={() => setFailed(true)}
          className="w-full h-full object-cover"
        />
      ) : (
        <div className="flex flex-col items-center gap-1.5 px-2 text-center">
          <FileText size={22} className="text-[var(--color-text-muted)] opacity-50" />
          <span className="text-[11px] font-semibold tracking-wide text-[var(--color-text-muted)]">{label}</span>
        </div>
      )}

      {/* Version chip — sits on the image so the tile is self-describing in a
          grid, where there is no row label beside it. */}
      <span
        className={cn(
          'absolute top-1.5 left-1.5 px-1.5 h-5 rounded text-[11px] font-bold flex items-center',
          approved
            ? 'bg-[var(--color-success)] text-white'
            : 'bg-black/65 text-white'
        )}
      >
        v{version}
      </span>
    </button>
  )
}

export default ArtworkThumb
