'use client'
import { useEffect, useMemo, useState } from 'react'
import { ChevronLeft, ChevronRight, Loader2 } from 'lucide-react'
import { cn } from '@/lib/utils/cn'
import { LIST_PAGE_SIZE, PAGE_SIZE_OPTIONS } from '@/lib/constants/pagination'
import { useListPageSize, setListPageSize } from '@/lib/hooks/usePageSize'

// Re-exported so the dozen files that already import it from here keep working.
// The value itself moved to @/lib/constants/pagination, which has no
// 'use client' — the list SERVER components need it too, for their first-page
// .range(), and that is the pair CLAUDE.md warns must never drift apart.
export { LIST_PAGE_SIZE }

/**
 * Client-side paging for the operational pages (Dispatch, Purchase, Store,
 * Plates, Finance…). Those fetch their rows once on the server and then filter
 * them IN THE BROWSER, so server-side paging would only ever page the
 * unfiltered set and break the filter. This pages what the user is actually
 * looking at.
 *
 * Note this does not lift those pages' existing `.limit(200)` server cap — it
 * makes the rows that were already loaded browsable, nothing more.
 */
export function usePagedRows<T>(rows: T[], pageSize: number = LIST_PAGE_SIZE) {
  const [page, setPage] = useState(1)
  const lastPage = Math.max(1, Math.ceil(rows.length / pageSize))

  // Filtering to a shorter list while sitting on a high page would otherwise
  // show an empty table with no obvious way back.
  useEffect(() => { setPage(1) }, [rows.length])

  const safePage = Math.min(page, lastPage)
  const pageRows = useMemo(
    () => rows.slice((safePage - 1) * pageSize, safePage * pageSize),
    [rows, safePage, pageSize]
  )

  return { pageRows, page: safePage, setPage, total: rows.length, pageSize }
}

/**
 * Page-wise navigation for the list pages, replacing the old Load More button.
 *
 * Load More could only ever grow one list: to reach job 400 you clicked four
 * times and then carried 400 rows in the DOM. With 478 jobs already imported
 * that was the wrong shape — Mehboob asked for numbered pages instead.
 *
 * Renders nothing when everything fits on one page, so it can sit
 * unconditionally at the bottom of a list.
 *
 * Mobile shows Prev / "Page 2 of 10" / Next only; the numbered buttons appear
 * from md: up, where there is room for them without wrapping.
 */

/** Page numbers to show, with `null` marking a gap. Always includes first,
 *  last, current and its neighbours — never more than 7 slots, so the row
 *  cannot grow past the container however many pages there are. */
function pageWindow(current: number, last: number): (number | null)[] {
  if (last <= 7) return Array.from({ length: last }, (_, i) => i + 1)

  const out: (number | null)[] = [1]
  const from = Math.max(2, current - 1)
  const to = Math.min(last - 1, current + 1)

  if (from > 2) out.push(null)
  for (let p = from; p <= to; p++) out.push(p)
  if (to < last - 1) out.push(null)
  out.push(last)
  return out
}

const btn =
  'flex items-center justify-center rounded-md border border-[var(--color-border)] ' +
  'text-sm font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed'

/**
 * "Rows per page: 10 / 20 / 30 / 40 / 50".
 *
 * Writes straight to the shared preference rather than taking a callback, so no
 * list has to opt in — every Pagination gets it, and all of them stay on the
 * same number. Changing it puts the reader back on page 1, which is what
 * useServerPagedList does when it sees the size change.
 */
function PageSizePicker({ noun, loading }: { noun: string; loading: boolean }) {
  const pageSize = useListPageSize()
  return (
    <label className="flex items-center gap-1.5 text-xs text-[var(--color-text-muted)] whitespace-nowrap">
      <span className="hidden sm:inline">Show</span>
      <select
        value={pageSize}
        disabled={loading}
        onChange={e => setListPageSize(Number(e.target.value))}
        aria-label={`${noun} per page`}
        className="h-8 md:h-7 pl-2 pr-6 rounded-md border border-[var(--color-border)] bg-[var(--color-bg-secondary)]
                   text-xs text-[var(--color-text-secondary)] focus:outline-none focus:border-[var(--color-accent)]
                   disabled:opacity-50 transition-colors"
      >
        {PAGE_SIZE_OPTIONS.map(n => <option key={n} value={n}>{n}</option>)}
      </select>
      <span>per page</span>
    </label>
  )
}

export function Pagination({
  page, total, pageSize, loading, onPageChange, noun = 'rows',
}: {
  page: number
  total: number
  pageSize: number
  loading: boolean
  onPageChange: (page: number) => void
  noun?: string
}) {
  const lastPage = Math.max(1, Math.ceil(total / pageSize))
  const first = total === 0 ? 0 : (page - 1) * pageSize + 1
  const shownTo = Math.min(page * pageSize, total)

  const sizePicker = <PageSizePicker noun={noun} loading={loading} />

  if (lastPage <= 1) {
    // One page only. The picker still has to be reachable, or someone who set
    // 50 and then filtered down to 30 rows could never get back to 10 — the
    // control would vanish at exactly the moment they wanted it.
    const worthShowing = total > PAGE_SIZE_OPTIONS[0]
    if (!worthShowing && total <= 25) return null
    return (
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-2 pt-1">
        <p className="text-xs text-[var(--color-text-muted)] text-center md:text-left">
          All {total} {noun} shown
        </p>
        {worthShowing && <div className="flex justify-center md:justify-end">{sizePicker}</div>}
      </div>
    )
  }

  const go = (p: number) => {
    if (loading || p === page || p < 1 || p > lastPage) return
    onPageChange(p)
    // A new page starting halfway down the previous one's scroll is
    // disorienting on a long list, and unusable on a phone.
    if (typeof window !== 'undefined') window.scrollTo({ top: 0, behavior: 'smooth' })
  }

  return (
    <nav
      aria-label={`${noun} pagination`}
      className="flex flex-col md:flex-row md:items-center md:justify-between gap-3 pt-1"
    >
      <div className="flex flex-col sm:flex-row sm:items-center gap-2 sm:gap-4">
        <p className="text-xs text-[var(--color-text-muted)] text-center md:text-left">
          {loading
            ? <span className="inline-flex items-center gap-1.5"><Loader2 size={12} className="animate-spin" /> Loading…</span>
            : <>Showing <span className="text-[var(--color-text-secondary)] font-medium">{first}–{shownTo}</span> of {total} {noun}</>}
        </p>
        <div className="flex justify-center sm:justify-start">{sizePicker}</div>
      </div>

      <div className="flex items-center justify-center gap-1">
        <button
          type="button" onClick={() => go(page - 1)} disabled={loading || page === 1}
          aria-label="Previous page"
          className={cn(btn, 'gap-1 pl-2 pr-3 h-11 md:h-9 bg-[var(--color-bg-secondary)] text-[var(--color-text-secondary)] enabled:hover:bg-[var(--color-bg-elevated)] enabled:hover:text-[var(--color-text-primary)]')}
        >
          <ChevronLeft size={14} /> Prev
        </button>

        {/* Phone: one plain indicator instead of a row that would wrap. */}
        <span className="md:hidden px-3 text-xs text-[var(--color-text-muted)] whitespace-nowrap">
          Page {page} of {lastPage}
        </span>

        <div className="hidden md:flex items-center gap-1">
          {pageWindow(page, lastPage).map((p, i) =>
            p === null
              ? <span key={`gap-${i}`} className="px-1 text-sm text-[var(--color-text-muted)] select-none">…</span>
              : (
                <button
                  key={p} type="button" onClick={() => go(p)} disabled={loading}
                  aria-label={`Page ${p}`} aria-current={p === page ? 'page' : undefined}
                  className={cn(
                    btn, 'min-w-[2.25rem] px-2 h-9',
                    p === page
                      // Filled = the accent, so the label must be --color-on-accent.
                      // text-white fails contrast on several of the dark themes.
                      ? 'bg-[var(--color-accent)] border-[var(--color-accent)] text-[var(--color-on-accent)]'
                      : 'bg-[var(--color-bg-secondary)] text-[var(--color-text-secondary)] enabled:hover:bg-[var(--color-bg-elevated)] enabled:hover:text-[var(--color-text-primary)]'
                  )}
                >
                  {p}
                </button>
              )
          )}
        </div>

        <button
          type="button" onClick={() => go(page + 1)} disabled={loading || page === lastPage}
          aria-label="Next page"
          className={cn(btn, 'gap-1 pl-3 pr-2 h-11 md:h-9 bg-[var(--color-bg-secondary)] text-[var(--color-text-secondary)] enabled:hover:bg-[var(--color-bg-elevated)] enabled:hover:text-[var(--color-text-primary)]')}
        >
          Next <ChevronRight size={14} />
        </button>
      </div>
    </nav>
  )
}

export default Pagination
