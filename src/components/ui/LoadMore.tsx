'use client'
import { Loader2, ChevronDown } from 'lucide-react'

/**
 * The list pages used to render a dead "Showing 25 of 478" line — the count was
 * right but there was no way to reach row 26. This replaces that line with the
 * same count plus a working Load More, so a list can be read to the end.
 *
 * Renders nothing once every row is loaded, so it can sit unconditionally at
 * the bottom of a list.
 */
export function LoadMore({
  loaded, total, loading, onLoadMore, noun = 'rows',
}: {
  loaded: number
  total: number
  loading: boolean
  onLoadMore: () => void
  noun?: string
}) {
  if (total <= loaded) {
    // Still worth stating the total once a list is long enough that "is this
    // all of it?" is a real question.
    return loaded > 25
      ? <p className="text-xs text-[var(--color-text-muted)] text-center">All {total} {noun} shown</p>
      : null
  }

  return (
    <div className="flex flex-col items-center gap-2 pt-1">
      <button
        type="button"
        onClick={onLoadMore}
        disabled={loading}
        className="flex items-center justify-center gap-1.5 px-4 h-11 md:h-9 rounded-md border border-[var(--color-border)] bg-[var(--color-bg-secondary)] text-sm font-medium text-[var(--color-text-secondary)] hover:bg-[var(--color-bg-elevated)] hover:text-[var(--color-text-primary)] disabled:opacity-60 transition-colors"
      >
        {loading
          ? <><Loader2 size={14} className="animate-spin" /> Loading…</>
          : <><ChevronDown size={14} /> Load More</>}
      </button>
      <p className="text-xs text-[var(--color-text-muted)]">Showing {loaded} of {total} {noun}</p>
    </div>
  )
}

export default LoadMore
