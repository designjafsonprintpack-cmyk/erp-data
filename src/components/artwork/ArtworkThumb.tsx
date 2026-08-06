'use client'
import { useEffect, useRef, useState } from 'react'
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

/**
 * A third size for the Jobs list's Compact density. 40x52 is the size Mehboob
 * once called too small — and it still is, as a permanent default. It earns its
 * place only because Compact is an explicit, one-click-reversible choice: at
 * 60x77 a job row is ~105px tall, so 100 rows are 10,500px of scrolling. Same
 * 125:160 ratio as the other two.
 */
export const THUMB_XS_W = 40
export const THUMB_XS_H = 52
export const THUMB_XS_BOX = 'w-[40px] h-[52px]'

export type ThumbSize = 'lg' | 'sm' | 'xs'
const SIZE_BOX: Record<ThumbSize, string> = { lg: THUMB_BOX, sm: THUMB_SM_BOX, xs: THUMB_XS_BOX }

/** Extensions a browser can render directly in an <img>. */
const IMAGE_EXT = new Set(['JPG', 'JPEG', 'PNG', 'WEBP', 'GIF', 'BMP', 'SVG', 'AVIF'])

export function isPreviewable(fileName: string, fileType?: string | null): boolean {
  // Aaj ye sirf DB ke `file_type` ke saath bulaya jata hai, jahan extension
  // hota hai ("JPG"). Lekin MIME ("image/jpeg") bhi is shakal ka lagta hai aur
  // `.toUpperCase()` usay "IMAGE/JPEG" bana kar har fehrist se bahar kar deta
  // hai — bilkul wohi ghalti jis ne makeArtworkThumb ko chup-chaap band rakha
  // tha. Yahan pehle se rok di gayi hai.
  const raw = (fileType || '').trim()
  const ext = raw.includes('/')
    ? (raw.toLowerCase().split('/').pop() || '').replace('jpeg', 'JPG').toUpperCase()
    : (raw || fileName.split('.').pop() || '').toUpperCase()
  return IMAGE_EXT.has(ext) || IMAGE_EXT.has((fileName.split('.').pop() || '').toUpperCase())
}

export function extLabel(fileName: string, fileType?: string | null): string {
  return (fileType || fileName.split('.').pop() || 'FILE').toUpperCase()
}

interface ThumbSource {
  id: string
  file_url: string
  /** Small preview generated at upload (migration 130). Signed in preference to
   *  file_url when present; NULL on every row uploaded before 130 and on every
   *  non-raster file, which then fall back to the original as before. */
  thumb_url?: string | null
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
  /** Which design on the job this is (migration 124). Legacy rows are 1. */
  designNo: number
  /** Optional human name — "Lid", "Base", "Insert". Display only. */
  designLabel: string | null
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
    .filter(a => a.thumb_url || isPreviewable(a.file_name, a.file_type))
    .map(a => `${a.id}:${a.thumb_url || a.file_url}`)
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
export function useJobThumbnails(jobIds: string[]): Record<string, JobThumbData[]> {
  const [data, setData] = useState<Record<string, JobThumbData[]>>({})

  // Ids already asked for. Only the NEW ones go into the next request: with
  // "Load More" the caller's list grows by a page at a time, and re-sending
  // every id would push ?ids= past both the route's 300-id cap and the URL
  // length limit — silently blanking the thumbnails on the longer lists.
  const requested = useRef<Set<string>>(new Set())

  // Same reasoning as useArtworkThumbnails: key on the id list's content, not
  // its array identity, or every parent re-render re-fetches.
  const key = Array.from(new Set(jobIds.filter(Boolean)))
    .filter(id => !requested.current.has(id))
    .sort().join(',')

  useEffect(() => {
    if (!key) return
    key.split(',').forEach(id => requested.current.add(id))
    let cancelled = false
    ;(async () => {
      try {
        const res = await fetch(`/api/v1/jobs/thumbnails?ids=${encodeURIComponent(key)}`)
        if (!res.ok) return
        const json = await res.json()
        if (cancelled) return
        const next: Record<string, JobThumbData[]> = {}
        for (const [jobId, rows] of Object.entries<any>(json.data || {})) {
          // The route returns one entry per DESIGN since 124. Array.isArray
          // guards the moment a stale build of either side is deployed against
          // the other — a bare object would otherwise map to [undefined].
          const list = Array.isArray(rows) ? rows : [rows]
          next[jobId] = list.filter(Boolean).map((row: any) => ({
            url: row.url ?? null,
            fileName: row.file_name,
            fileType: row.file_type ?? null,
            version: row.version,
            approved: !!row.approved,
            designNo: row.design_no ?? 1,
            designLabel: row.design_label ?? null,
          }))
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
  // Both non-'lg' sizes use the tightened chrome; 'xs' only differs in the box.
  const small = size !== 'lg'
  const tiny = size === 'xs'

  const content = (
    <>
      {showImage ? (
        // eslint-disable-next-line @next/next/no-img-element -- signed Supabase Storage URL, not a local asset
        <img
          src={url}
          alt={fileName}
          loading="lazy"
          onError={() => setFailed(true)}
          /**
           * `object-contain`, not `cover` and not `fill`.
           *
           * Mehboob: "thumbnail ka size vertical hay jis main image cut jata —
           * ya to strech kero ya fill kero ta k design pora nazer aaey."
           *
           * The tile is 125x160 (portrait) while artwork is usually a landscape
           * dieline, so `cover` was filling the box and cropping the sides
           * away — on a carton that is exactly where the brand panel sits.
           *
           * He offered stretch as an option; `fill` would show the whole design
           * but squashed, and this is the image a CUSTOMER approves. A
           * misproportioned preview misrepresents the artwork, and a landscape
           * dieline crushed into portrait is unreadable. `contain` gives what
           * he actually asked for — the design whole — with the proportions
           * intact. The parent already centres and carries a background, so the
           * leftover space reads as a deliberate margin rather than a gap.
           */
          className="w-full h-full object-contain"
        />
      ) : (
        <div className={cn('flex flex-col items-center text-center', small ? 'gap-1 px-1' : 'gap-1.5 px-2')}>
          {/* At 40x52 the icon and the label together crowd the tile — the
              extension is the part that carries information, so it stays. */}
          {!tiny && <FileText size={small ? 14 : 22} className="text-[var(--color-text-muted)] opacity-50" />}
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
            ? 'bg-[var(--color-success)] text-[var(--color-on-success)]'
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

/**
 * Renders a job's artwork as one tile per DESIGN.
 *
 * WHY A COMPONENT AND NOT AN INLINE `.map()`
 *   Five places render a job thumbnail — the Jobs list, Kanban, Production
 *   Floor, Planning (twice) — and before 124 each one wrote out the same five
 *   props by hand against `thumbs[id]?.…`. Extending that to "and now show the
 *   second design too" five separate times is how they drift apart. The
 *   fallback for a job with no artwork at all also lived in five copies.
 *
 * THE `max` PROP EXISTS BECAUSE THE ROW IS TIGHT
 *   On the Jobs list the tile sits inline with the title and customer inside a
 *   3-of-12 column; a second 60px tile there would squeeze the title to
 *   nothing. So the list passes max={1} and gets a "+1" chip, while the
 *   Planning and Floor CARDS have room and pass 2. Nothing is ever hidden
 *   silently — if a design is not drawn, the chip says how many are missing.
 */
export function JobThumbStrip({
  designs,
  size = 'sm',
  max = 2,
  fallbackName,
  className,
}: {
  /** From `useJobThumbnails()[jobId]`. Undefined or empty is handled. */
  designs: JobThumbData[] | undefined
  size?: ThumbSize
  /** How many tiles to draw before collapsing the rest into a "+N" chip. */
  max?: number
  /** Shown on the placeholder tile when the job has no artwork yet. */
  fallbackName: string
  className?: string
}) {
  const list = designs ?? []

  // No artwork yet — one empty tile, exactly as before 124, so a job without
  // artwork looks identical to how it always has.
  if (list.length === 0) {
    return (
      <ArtworkThumb
        size={size}
        interactive={false}
        fileName={fallbackName}
        version={1}
        className={className}
      />
    )
  }

  const shown = list.slice(0, Math.max(1, max))
  const hidden = list.length - shown.length

  return (
    <span className={cn('flex items-center gap-1 flex-shrink-0', className)}>
      {shown.map(d => (
        <ArtworkThumb
          key={d.designNo}
          size={size}
          interactive={false}
          url={d.url ?? undefined}
          // The design label is what tells lid from base at a glance; the file
          // name is the fallback because that is what it always showed.
          fileName={d.designLabel || d.fileName || fallbackName}
          fileType={d.fileType}
          version={d.version}
          approved={d.approved}
        />
      ))}
      {hidden > 0 && (
        <span
          title={`${list.length} designs on this job`}
          className="flex-shrink-0 px-1 h-5 rounded text-[10px] font-bold flex items-center
                     bg-[var(--color-bg-elevated)] border border-[var(--color-border)]
                     text-[var(--color-text-secondary)]"
        >
          +{hidden}
        </span>
      )}
    </span>
  )
}

export default ArtworkThumb
