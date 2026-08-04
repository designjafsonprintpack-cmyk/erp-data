/**
 * Removes artwork FILES from Storage 30 days after they stop being needed.
 *
 * WHY
 *   Deleting an artwork soft-deletes the `job_artworks` row and never touches
 *   the object behind it, so nothing ever collected the files. Measured on live
 *   2026-07-31: `JOB-2026-00002` held **7 objects behind 2 live rows** and
 *   `JOB-2026-00003` held 6 behind 2 — the residue of uploading, hitting an
 *   error, deleting and re-uploading. Mehboob set the retention: **30 days.**
 *
 * TWO KINDS OF DEAD FILE, AND THEY AGE DIFFERENTLY
 *   1. **A soft-deleted row's file.** Aged from `deleted_at` — the moment
 *      someone chose to remove it. Within 30 days the file survives, so an
 *      artwork deleted by mistake can still be recovered by clearing
 *      `deleted_at`.
 *   2. **An orphan with no row at all.** The upload reaches Storage BEFORE the
 *      row is inserted, so a failed insert leaves a file nothing points at —
 *      exactly what the duplicate-key errors produced. There is no `deleted_at`
 *      to age from, so it is aged from the OBJECT's own `created_at`.
 *
 * THE SAFETY RULE
 *   A file is deleted only when it is **provably unreferenced**. The keep-set
 *   is built from every live row AND every recently-deleted row first; anything
 *   in it is never touched, whatever its age. A row whose read failed must
 *   never be read as "no row" — so a query error aborts the sweep rather than
 *   letting it delete against a partial picture.
 *
 * PAGING IS NOT OPTIONAL
 *   Both reads page: PostgREST caps a select at 1000 rows (§5, three times
 *   now), and Storage's `list()` returns 100 by default. A sweep that silently
 *   saw only the first page would build an incomplete keep-set and **delete
 *   live files** — the one failure mode here that actually costs something.
 */
import { fetchAllRows } from './fetchAllRows'

/** Mehboob's answer when asked how long a deleted artwork keeps its file. */
export const ARTWORK_RETENTION_DAYS = 30

/** Storage bucket holding artwork. */
const BUCKET = 'artwork'

/** Storage `list()` page size. 100 is its default; 1000 is its documented max. */
const LIST_PAGE = 1000

/** `remove()` takes an array; kept well under any request-size limit. */
const DELETE_CHUNK = 100

export interface ArtworkSweepResult {
  /** Objects examined in Storage. */
  scanned: number
  /** Paths deleted (or that would be, when dryRun). */
  deleted: string[]
  /** Still referenced by a live row. */
  keptLive: number
  /** Referenced by a row deleted less than the retention window ago. */
  keptRecentlyDeleted: number
  /** No row at all, but younger than the retention window. */
  keptRecentOrphan: number
  /** Non-fatal problems, e.g. a folder that could not be listed. */
  warnings: string[]
  dryRun: boolean
  cutoff: string
}

interface ArtworkRow {
  file_url: string | null
  /** The small preview beside the original (migration 130). It is a SECOND
   *  object in the same bucket and nothing else points at it, so leaving it out
   *  of the keep-set would have the sweep read every thumbnail as an orphan and
   *  delete the lot 30 days after upload — with the row still live. */
  thumb_url: string | null
  deleted_at: string | null
}

/** Recursively lists every object path under a prefix, paging as it goes. */
async function listAll(
  supabase: any,
  prefix: string,
  out: { path: string; createdAt: string | null }[],
  warnings: string[],
  depth = 0,
): Promise<void> {
  // The bucket is company/job/file — three levels. The guard is a backstop
  // against a cycle or an unexpected layout, not an expected condition.
  if (depth > 4) { warnings.push(`stopped at depth ${depth}: ${prefix}`); return }

  // Pages until a page comes back EMPTY, and advances the offset by however
  // many rows actually arrived — never by the number requested.
  //
  // The obvious loop ("stop when a page is shorter than the limit, advance by
  // the limit") is wrong against any server that silently returns fewer rows
  // than asked for, which Storage is free to do. Asking for 1000 and getting
  // 100 would then read as "that was the last page", and the sweep would build
  // its keep-set from a fraction of the bucket — the worst possible failure
  // here, because unseen files look unreferenced. Caught by a unit test that
  // capped the stub at 100: the first version scanned 100 of 250 objects.
  // Same silent-cap family as PostgREST's 1000-row ceiling (§5).
  let offset = 0
  for (let guard = 0; guard < 10_000; guard++) {
    const { data, error } = await supabase.storage
      .from(BUCKET)
      .list(prefix, { limit: LIST_PAGE, offset })

    if (error) { warnings.push(`list "${prefix}": ${error.message}`); return }
    const entries = data ?? []
    if (entries.length === 0) return

    for (const e of entries) {
      // Supabase marks a real object by giving it an `id`; a "folder" is a
      // synthesised prefix with a null id. The placeholder object it creates
      // for an empty folder is never a real artwork file.
      if (e.name === '.emptyFolderPlaceholder') continue
      const path = prefix ? `${prefix}/${e.name}` : e.name
      if (e.id) out.push({ path, createdAt: e.created_at ?? null })
      else await listAll(supabase, path, out, warnings, depth + 1)
    }

    offset += entries.length
  }
  warnings.push(`stopped listing "${prefix}" after 10000 pages`)
}

export async function sweepArtworkFiles(
  supabase: any,
  opts: { now?: Date; dryRun?: boolean } = {},
): Promise<ArtworkSweepResult> {
  const now = opts.now ?? new Date()
  const dryRun = opts.dryRun ?? false
  const cutoffMs = now.getTime() - ARTWORK_RETENTION_DAYS * 24 * 60 * 60 * 1000
  const cutoff = new Date(cutoffMs).toISOString()

  // ─── every artwork row, paged and ordered ────────────────────────────────
  // `id` is the table's primary key, so ordering on it gives a total order and
  // pages can neither repeat nor skip.
  const rows = await fetchAllRows<ArtworkRow>(
    (from, to) => supabase
      .from('job_artworks' as any)
      .select('file_url, thumb_url, deleted_at')
      .order('id')
      .range(from, to) as any,
    'artwork retention sweep',
  )

  const keep = new Set<string>()
  const expired = new Set<string>()
  let keptLive = 0
  let keptRecentlyDeleted = 0

  for (const r of rows) {
    // A row owns up to two objects — the original and its preview — and both
    // live and die together. Counted once per ROW so the reported figures still
    // mean "artworks", not "files".
    const paths = [r.file_url, r.thumb_url].filter(Boolean) as string[]
    if (paths.length === 0) continue
    if (r.deleted_at === null) { paths.forEach(p => keep.add(p)); keptLive++; continue }
    if (new Date(r.deleted_at).getTime() >= cutoffMs) {
      paths.forEach(p => keep.add(p)); keptRecentlyDeleted++
    } else {
      paths.forEach(p => expired.add(p))
    }
  }

  // A path referenced by BOTH a live row and an old deleted one must be kept.
  // Two rows can legitimately point at one object (a re-upload of the same
  // file), and "keep" has to win — deleting it would break the live row.
  for (const p of Array.from(expired)) if (keep.has(p)) expired.delete(p)

  // ─── every object in the bucket ──────────────────────────────────────────
  const warnings: string[] = []
  const objects: { path: string; createdAt: string | null }[] = []
  await listAll(supabase, '', objects, warnings)

  const toDelete: string[] = []
  let keptRecentOrphan = 0

  for (const o of objects) {
    if (keep.has(o.path)) continue
    if (expired.has(o.path)) { toDelete.push(o.path); continue }

    // No row points here. Age it from the object itself. An unknown created_at
    // is treated as RECENT and left alone — never delete on a missing date.
    const created = o.createdAt ? new Date(o.createdAt).getTime() : NaN
    if (Number.isFinite(created) && created < cutoffMs) toDelete.push(o.path)
    else keptRecentOrphan++
  }

  if (!dryRun && toDelete.length) {
    for (let i = 0; i < toDelete.length; i += DELETE_CHUNK) {
      const chunk = toDelete.slice(i, i + DELETE_CHUNK)
      const { error } = await supabase.storage.from(BUCKET).remove(chunk)
      if (error) warnings.push(`remove chunk ${i / DELETE_CHUNK}: ${error.message}`)
    }
  }

  return {
    scanned: objects.length,
    deleted: toDelete,
    keptLive,
    keptRecentlyDeleted,
    keptRecentOrphan,
    warnings,
    dryRun,
    cutoff,
  }
}

export default sweepArtworkFiles
