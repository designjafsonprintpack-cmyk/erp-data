'use client'
import { useEffect, useMemo, useState } from 'react'
import { ChevronLeft, ChevronRight, Loader2 } from 'lucide-react'
import { cn } from '@/lib/utils/cn'

/** Rows per page across every list. One number so the app is consistent. */
export const LIST_PAGE_SIZE = 50

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

  if (lastPage <= 1) {
    // One page only — still worth stating the total once a list is long enough
    // that "is this all of it?" is a real question.
    return total > 25
      ? <p className="text-xs text-[var(--color-text-muted)] text-center">All {total} {noun} shown</p>
      : null
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
      <p className="text-xs text-[var(--color-text-muted)] text-center md:text-left">
        {loading
          ? <span className="inline-flex items-center gap-1.5"><Loader2 size={12} className="animate-spin" /> Loading…</span>
          : <>Showing <span className="text-[var(--color-text-secondary)] font-medium">{first}–{shownTo}</span> of {total} {noun}</>}
      </p>

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
