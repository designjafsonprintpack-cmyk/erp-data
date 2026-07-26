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

/**
 * A second, smaller size for places a job's artwork appears among a lot of
 * other rows — the Jobs list, Kanban cards, Production Floor, Planning — where
 * a full 125x160 tile would dominate the row. 60x77 keeps the exact 125:160
 * ratio, just scaled down (Mehboob: 40x52 was too small, this is 'thora bara').
 */
export const THUMB_SM_W = 60
export const THUMB_SM_H = 77
export const THUMB_SM_BOX = 'w-[60px] h-[77px]'

type ThumbSize = 'lg' | 'sm'
const SIZE_BOX: Record<ThumbSize, string> = { lg: THUMB_BOX, sm: THUMB_SM_BOX }

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

/** What a job-scoped thumbnail lookup resolves to — always the job's latest
 *  artwork version, never a specific one the caller picked. */
export interface JobThumbData {
  url: string | null
  fileName: string
  fileType: string | null
  version: number
  approved: boolean
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

/**
 * Batch-resolves "this job's latest artwork, as a thumbnail" for a list of job
 * ids — Jobs list, Kanban, Production Floor, Planning, and anywhere else a job
 * appears without already having its own artwork rows loaded (Job Detail and
 * the Artwork page both already have those, so they use useArtworkThumbnails
 * above directly instead of this).
 *
 * Goes through /api/v1/jobs/thumbnails rather than querying job_artworks and
 * Storage from the browser directly — every other client component reads
 * table data through an API route (see jobs, dispatch, etc.); only Storage
 * signing itself happens client-side elsewhere. That route does the "which
 * version is latest" query and the signed-URL batching server-side and hands
 * back one small object per job.
 */
export function useJobThumbnails(jobIds: string[]): Record<string, JobThumbData> {
  const [data, setData] = useState<Record<string, JobThumbData>>({})

  // Same reasoning as useArtworkThumbnails: key on the id list's content, not
  // its array identity, or every parent re-render re-fetches.
  const key = Array.from(new Set(jobIds.filter(Boolean))).sort().join(',')

  useEffect(() => {
    if (!key) return
    let cancelled = false
    ;(async () => {
      try {
        const res = await fetch(`/api/v1/jobs/thumbnails?ids=${encodeURIComponent(key)}`)
        if (!res.ok) return
        const json = await res.json()
        if (cancelled) return
        const next: Record<string, JobThumbData> = {}
        for (const [jobId, row] of Object.entries<any>(json.data || {})) {
          next[jobId] = {
            url: row.url ?? null,
            fileName: row.file_name,
            fileType: row.file_type ?? null,
            version: row.version,
            approved: !!row.approved,
          }
        }
        setData(prev => ({ ...prev, ...next }))
      } catch {
        // No thumbnails for this batch — the rest of the page still works.
      }
    })()
    return () => { cancelled = true }
  }, [key])

  return data
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
  /** 'lg' (125x160, default) for a dedicated artwork view; 'sm' (60x77) for a
   *  thumbnail riding along inside a job row or card. */
  size?: ThumbSize
  /**
   * Whether this tile opens the file on its own. Default true, matching every
   * existing call site (the Artwork page, the Job Detail artwork tab), which
   * all pass onClick.
   *
   * Every NEW "job thumbnail" call site (Jobs list, Kanban, Production Floor,
   * Planning) sets this false: those rows are already themselves a link to
   * the job, so a nested clickable button would be a button inside an <a> —
   * invalid HTML and two competing click targets. Non-interactive renders a
   * plain <div>, keeps the visual, drops the click handler entirely.
   */
  interactive?: boolean
}

/**
 * 125 × 160 artwork preview tile with the version number overlaid.
 *
 * Falls back to a file-type tile when the file isn't an image (print artwork is
 * often PDF/AI/EPS) or when its signed URL hasn't arrived yet, so the layout
 * never shifts once previews load.
 */
export function ArtworkThumb({
  url, fileName, fileType, version, approved, onClick, className, size = 'lg', interactive = true,
}: ArtworkThumbProps) {
  const [failed, setFailed] = useState(false)
  const showImage = !!url && !failed
  const label = extLabel(fileName, fileType)
  const small = size === 'sm'

  const content = (
    <>
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
        <div className={cn('flex flex-col items-center text-center', small ? 'gap-1 px-1' : 'gap-1.5 px-2')}>
          <FileText size={small ? 14 : 22} className="text-[var(--color-text-muted)] opacity-50" />
          <span className={cn('font-semibold tracking-wide text-[var(--color-text-muted)]', small ? 'text-[9px]' : 'text-[11px]')}>{label}</span>
        </div>
      )}

      {/* Version chip — sits on the image so the tile is self-describing in a
          grid, where there is no row label beside it. */}
      <span
        className={cn(
          'absolute top-1 left-1 rounded font-bold flex items-center',
          small ? 'px-1 h-3.5 text-[9px]' : 'px-1.5 h-5 text-[11px] top-1.5 left-1.5',
          approved
            ? 'bg-[var(--color-success)] text-white'
            : 'bg-black/65 text-white'
        )}
      >
        v{version}
      </span>
    </>
  )

  const boxClasses = cn(
    SIZE_BOX[size],
    'relative flex-shrink-0 rounded-lg overflow-hidden border bg-[var(--color-bg-elevated)]',
    'flex items-center justify-center',
    approved ? 'border-[color:color-mix(in_srgb,var(--color-success)_40%,transparent)]' : 'border-[var(--color-border)]',
    interactive && 'transition-colors hover:border-[var(--color-accent)]',
    className
  )

  if (!interactive) {
    return <div className={boxClasses} aria-label={fileName} role="img">{content}</div>
  }

  return (
    <button type="button" onClick={onClick} aria-label={`Open ${fileName}`} className={boxClasses}>
      {content}
    </button>
  )
}

export default ArtworkThumb
