'use client'
import { useState, type ReactNode } from 'react'
import { Search, SlidersHorizontal, X } from 'lucide-react'
import { cn } from '@/lib/utils/cn'
import { Modal } from './Modal'

interface ToolbarProps {
  search?: {
    value: string
    onChange: (v: string) => void
    placeholder?: string
  }
  /** Filter controls — selects, chips, date ranges. */
  filters?: ReactNode
  /** How many filters are currently applied; shown as a badge on mobile. */
  activeFilterCount?: number
  onClearFilters?: () => void
  /** Primary actions — New, Export. Always visible. */
  actions?: ReactNode
  className?: string
}

/**
 * List toolbar.
 *
 *   >= md   search field, filters and actions on one row, as today
 *   <  md   full-width search, actions below, and filters moved into a sheet
 *           behind a "Filters" button with a count badge
 *
 * The existing toolbars are `flex items-center gap-3` and only 19 of 147 files
 * use `flex-wrap` at all, so on a phone the controls either overflow the row
 * or squeeze each other down to nothing. Putting filters behind a sheet also
 * stops them eating a third of a small screen before any data is visible.
 */
export function Toolbar({
  search,
  filters,
  activeFilterCount = 0,
  onClearFilters,
  actions,
  className,
}: ToolbarProps) {
  const [sheetOpen, setSheetOpen] = useState(false)

  return (
    <div className={cn('space-y-2.5 md:space-y-0', className)}>
      <div className="flex flex-col md:flex-row md:items-center gap-2.5 md:gap-3">
        {search && (
          <div className="relative flex-1 min-w-0 md:max-w-xs">
            <Search
              size={15}
              className="absolute left-3 top-1/2 -translate-y-1/2 text-[var(--color-text-muted)] pointer-events-none"
            />
            <input
              value={search.value}
              onChange={e => search.onChange(e.target.value)}
              placeholder={search.placeholder ?? 'Search…'}
              type="search"
              className={cn(
                'w-full h-11 md:h-9 pl-9 pr-9 rounded-md border text-sm',
                'border-[var(--color-border)] bg-[var(--color-bg-elevated)] text-[var(--color-text-primary)]',
                'focus:outline-none focus:border-[var(--color-accent)] focus:ring-1 focus:ring-[var(--color-accent)]',
                'transition-colors duration-150'
              )}
            />
            {search.value && (
              <button
                onClick={() => search.onChange('')}
                aria-label="Clear search"
                className="absolute right-2 top-1/2 -translate-y-1/2 w-8 h-8 flex items-center justify-center rounded text-[var(--color-text-muted)] hover:text-[var(--color-text-primary)]"
              >
                <X size={14} />
              </button>
            )}
          </div>
        )}

        {/* Filters inline from md up */}
        {filters && (
          <div className="hidden md:flex items-center gap-2 flex-wrap min-w-0">{filters}</div>
        )}

        <div className="flex items-center gap-2 md:ml-auto flex-shrink-0">
          {/* Filters sheet trigger below md */}
          {filters && (
            <button
              onClick={() => setSheetOpen(true)}
              className={cn(
                'md:hidden flex items-center gap-1.5 px-3 h-11 rounded-md border text-sm font-medium flex-shrink-0',
                activeFilterCount > 0
                  ? 'border-[var(--color-accent)] text-[var(--color-accent)] bg-[var(--color-accent)]/10'
                  : 'border-[var(--color-border)] text-[var(--color-text-secondary)]'
              )}
            >
              <SlidersHorizontal size={15} />
              Filters
              {activeFilterCount > 0 && (
                <span className="ml-0.5 min-w-5 h-5 px-1 rounded-full bg-[var(--color-accent)] text-white text-[11px] font-semibold flex items-center justify-center tabular-nums">
                  {activeFilterCount}
                </span>
              )}
            </button>
          )}
          {actions && <div className="flex items-center gap-2 flex-1 md:flex-none [&>*]:flex-1 md:[&>*]:flex-none">{actions}</div>}
        </div>
      </div>

      <Modal
        open={sheetOpen}
        onClose={() => setSheetOpen(false)}
        title="Filters"
        footer={
          <>
            {onClearFilters && (
              <button
                onClick={() => { onClearFilters(); setSheetOpen(false) }}
                className="px-4 h-11 rounded-md border border-[var(--color-border)] text-sm text-[var(--color-text-secondary)]"
              >
                Clear all
              </button>
            )}
            <button
              onClick={() => setSheetOpen(false)}
              className="px-5 h-11 rounded-md bg-[var(--color-accent)] text-white text-sm font-medium"
            >
              Show results
            </button>
          </>
        }
      >
        <div className="flex flex-col gap-4 [&_select]:w-full [&_input]:w-full">{filters}</div>
      </Modal>
    </div>
  )
}

export default Toolbar
