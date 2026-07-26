'use client'
import Link from 'next/link'
import type { ReactNode } from 'react'
import { cn } from '@/lib/utils/cn'

/**
 * Where a column appears once the layout stops being a table.
 *
 *   identity  the thing the user scans for — job number, quotation number.
 *             Card: bold, top-left.
 *   title     the human-readable name — product, customer.
 *             Card: second line, top-left.
 *   status    a badge or state indicator.
 *             Card: top-right.
 *   meta      supporting values. Card: 2-column label/value grid.
 *             Give these a `label`, or the card shows a bare value.
 *   actions   buttons. Card: bottom row, right-aligned.
 *   desktop   table-only. Hidden on tablet and absent from the card —
 *             use for columns that are noise on a small screen.
 */
export type ColumnRole = 'identity' | 'title' | 'status' | 'meta' | 'actions' | 'desktop'

export interface DataListColumn<T> {
  key: string
  header: ReactNode
  /** Width out of 12 in the desktop table. */
  span: number
  role: ColumnRole
  /** Shown beside the value in the mobile card. Meta columns want this. */
  label?: string
  align?: 'left' | 'right' | 'center'
  render: (row: T) => ReactNode
}

export interface DataListSelection {
  selectedIds: Set<string>
  onToggle: (id: string) => void
  onToggleAll: () => void
  allSelected: boolean
}

interface DataListProps<T> {
  rows: T[]
  columns: DataListColumn<T>[]
  getRowId: (row: T) => string
  /** Whole-row link. Checkbox and action clicks are stopped automatically. */
  rowHref?: (row: T) => string
  onRowClick?: (row: T) => void
  /** Extra classes per row — urgency tinting, etc. */
  rowClassName?: (row: T, index: number) => string | undefined
  selection?: DataListSelection
  /** Sticky column headers on desktop. Offsets below the app header. */
  stickyHeader?: boolean
  /** Zebra striping on desktop rows. */
  striped?: boolean
  empty?: ReactNode
  className?: string
}

const alignClass = {
  left: 'text-left justify-start',
  right: 'text-right justify-end',
  center: 'text-center justify-center',
}

/**
 * `col-span-N` can't be built from a runtime number — Tailwind's JIT scans
 * source text and would purge the class. And an inline `gridColumn` can't be
 * breakpoint-scoped. So each cell publishes BOTH spans as CSS variables and
 * the `.dl-cell` rule in globals.css picks the right one per breakpoint:
 * the redistributed tablet span below 1280px, the author's declared span above.
 */
function spanVars(tablet: number, desktop: number) {
  return { ['--sp-md' as string]: tablet, ['--sp-xl' as string]: desktop } as React.CSSProperties
}

/**
 * Redistributes desktop spans across the columns that survive at tablet width,
 * so the row still fills 12 units instead of leaving a gap where the
 * `desktop`-only columns were.
 */
function tabletSpans<T>(cols: DataListColumn<T>[]): number[] {
  const total = cols.reduce((n, c) => n + c.span, 0)
  if (total === 0) return cols.map(() => 1)
  const scaled = cols.map(c => Math.max(1, Math.round((c.span / total) * 12)))
  // Round-off can push the row over or under 12; absorb the difference in the
  // widest column, which is the one that can least afford to be exact.
  const diff = 12 - scaled.reduce((a, b) => a + b, 0)
  if (diff !== 0) {
    const widest = scaled.indexOf(Math.max(...scaled))
    scaled[widest] = Math.max(1, scaled[widest] + diff)
  }
  return scaled
}

function stop(e: React.MouseEvent) {
  e.preventDefault()
  e.stopPropagation()
}

/**
 * One list, three layouts.
 *
 *   >= xl (1280)   the existing 12-column grid, spans exactly as declared
 *   md  – xl       the same grid minus `desktop` columns, spans redistributed
 *   <  md (768)    a stack of cards
 *
 * Replaces the hand-rolled `grid grid-cols-12` header + row pattern that was
 * copied into 20 list files. A CSS grid does not overflow — it compresses — so
 * on a 375px screen each `col-span-1` was getting roughly 17px and the text
 * shredded into vertical slivers. Cards are the fix; a horizontal scroller
 * would just move the problem.
 *
 * Not a fit for the expandable-row lists (Purchase, Dispatch), which are card
 * lists with a disclosure rather than tables. Those get their own treatment.
 */
export function DataList<T>({
  rows,
  columns,
  getRowId,
  rowHref,
  onRowClick,
  rowClassName,
  selection,
  stickyHeader = false,
  striped = true,
  empty,
  className,
}: DataListProps<T>) {
  if (rows.length === 0 && empty) {
    return (
      <div className={cn('rounded-xl border border-[var(--color-border)] bg-[var(--color-bg-secondary)]', className)}>
        {empty}
      </div>
    )
  }

  const tabletCols = columns.filter(c => c.role !== 'desktop')
  const tSpans = tabletSpans(tabletCols)

  // The grid is 12 units wide, but a list that passes `selection` prepends its
  // own span-1 checkbox cell — so its columns have to fit in 11, not 12. The
  // Jobs list (the only one using selection) declares 12, which made the row
  // ask for 13 units and pushed its last column onto a second line at >=1280px.
  // Widening the track count instead of stealing a unit from a column keeps
  // every column's information intact and leaves selection-less lists exactly
  // as they were (12 units → identical to the grid-cols-12 class).
  const declaredUnits = columns.reduce((n, c) => n + c.span, 0) + (selection ? 1 : 0)
  const tabletUnits = tSpans.reduce((n, s) => n + s, 0) + (selection ? 1 : 0)
  const gridStyle: React.CSSProperties | undefined =
    declaredUnits === 12 && tabletUnits === 12
      ? undefined
      : {
          ['--dl-cols-md' as string]: tabletUnits,
          ['--dl-cols-xl' as string]: declaredUnits,
        }

  const identity = columns.filter(c => c.role === 'identity')
  const titles = columns.filter(c => c.role === 'title')
  const statuses = columns.filter(c => c.role === 'status')
  const metas = columns.filter(c => c.role === 'meta')
  const actions = columns.filter(c => c.role === 'actions')

  const checkbox = (row: T) =>
    selection ? (
      <input
        type="checkbox"
        checked={selection.selectedIds.has(getRowId(row))}
        // The row is often a <Link>; without this the browser navigates
        // instead of ticking the box.
        onClick={stop}
        onChange={() => selection.onToggle(getRowId(row))}
        className="w-4 h-4 flex-shrink-0 accent-[var(--color-accent)] cursor-pointer"
        aria-label="Select row"
      />
    ) : null

  const rowInner = (row: T) => (
    <>
      {selection && (
        <div className="dl-cell flex items-center" style={spanVars(1, 1)}>
          {checkbox(row)}
        </div>
      )}
      {columns.map(col => {
        const isDesktopOnly = col.role === 'desktop'
        const tablet = isDesktopOnly ? col.span : tSpans[tabletCols.indexOf(col)]
        return (
          <div
            key={col.key}
            style={spanVars(tablet, col.span)}
            className={cn(
              'dl-cell min-w-0 flex items-center',
              alignClass[col.align ?? 'left'],
              isDesktopOnly && 'hidden xl:flex'
            )}
          >
            <div className="min-w-0 truncate w-full" style={{ textAlign: col.align ?? 'left' }}>
              {col.render(row)}
            </div>
          </div>
        )
      })}
    </>
  )

  return (
    <div className={className}>
      {/* ───────────────────────── Desktop / tablet table ───────────────────────── */}
      <div className="hidden md:block rounded-xl border border-[var(--color-border)] bg-[var(--color-bg-secondary)]">
        <div
          style={gridStyle}
          className={cn(
            'grid grid-cols-12 gap-3 px-5 py-2.5 bg-[var(--color-bg-elevated)]',
            gridStyle && 'dl-grid',
            'border-b border-[var(--color-border)] text-xs font-semibold',
            'text-[var(--color-text-muted)] uppercase tracking-wider rounded-t-xl',
            // position:sticky is broken by an ancestor with overflow-hidden —
            // that container deliberately has none.
            stickyHeader && 'sticky top-[var(--header-total)] z-10'
          )}
        >
          {selection && (
            <div className="dl-cell flex items-center" style={spanVars(1, 1)}>
              <input
                type="checkbox"
                checked={selection.allSelected}
                onChange={selection.onToggleAll}
                className="w-4 h-4 accent-[var(--color-accent)] cursor-pointer"
                aria-label="Select all rows"
              />
            </div>
          )}
          {columns.map(col => {
            const isDesktopOnly = col.role === 'desktop'
            const tablet = isDesktopOnly ? col.span : tSpans[tabletCols.indexOf(col)]
            return (
              <div
                key={col.key}
                style={spanVars(tablet, col.span)}
                className={cn(
                  'dl-cell min-w-0 truncate',
                  col.align === 'right' && 'text-right',
                  col.align === 'center' && 'text-center',
                  isDesktopOnly && 'hidden xl:block'
                )}
              >
                {col.header}
              </div>
            )
          })}
        </div>

        <div className="divide-y divide-[var(--color-border-subtle)]">
          {rows.map((row, idx) => {
            const classes = cn(
              'grid grid-cols-12 gap-3 px-5 py-3.5 items-center transition-colors',
              gridStyle && 'dl-grid',
              'hover:bg-[color:color-mix(in_srgb,var(--color-bg-elevated)_50%,transparent)]',
              striped && idx % 2 === 1 && 'bg-[color:color-mix(in_srgb,var(--color-bg-elevated)_15%,transparent)]',
              rowClassName?.(row, idx)
            )
            const href = rowHref?.(row)
            if (href) {
              return <Link key={getRowId(row)} href={href} className={classes} style={gridStyle}>{rowInner(row)}</Link>
            }
            return (
              <div
                key={getRowId(row)}
                onClick={onRowClick ? () => onRowClick(row) : undefined}
                style={gridStyle}
                className={cn(classes, onRowClick && 'cursor-pointer')}
              >
                {rowInner(row)}
              </div>
            )
          })}
        </div>
      </div>

      {/* ───────────────────────────── Mobile cards ─────────────────────────────── */}
      <div className="md:hidden space-y-2.5">
        {rows.map((row, idx) => {
          const href = rowHref?.(row)
          const body = (
            <>
              <div className="flex items-start gap-2.5">
                {selection && <div className="pt-0.5">{checkbox(row)}</div>}
                <div className="flex-1 min-w-0">
                  {identity.map(c => (
                    <div key={c.key} className="text-sm font-semibold text-[var(--color-text-primary)] truncate">
                      {c.render(row)}
                    </div>
                  ))}
                  {titles.map(c => (
                    <div key={c.key} className="text-sm text-[var(--color-text-secondary)] truncate mt-0.5">
                      {c.render(row)}
                    </div>
                  ))}
                </div>
                {statuses.length > 0 && (
                  <div className="flex flex-col items-end gap-1 flex-shrink-0">
                    {statuses.map(c => <div key={c.key}>{c.render(row)}</div>)}
                  </div>
                )}
              </div>

              {metas.length > 0 && (
                <div className="grid grid-cols-2 gap-x-3 gap-y-2 mt-3 pt-3 border-t border-[var(--color-border-subtle)]">
                  {metas.map(c => (
                    <div key={c.key} className="min-w-0">
                      {c.label && (
                        <div className="text-[11px] uppercase tracking-wider text-[var(--color-text-muted)] mb-0.5">
                          {c.label}
                        </div>
                      )}
                      <div className="text-sm text-[var(--color-text-primary)] truncate">{c.render(row)}</div>
                    </div>
                  ))}
                </div>
              )}

              {actions.length > 0 && (
                <div
                  className="flex items-center justify-end flex-wrap gap-2 mt-3 pt-3 border-t border-[var(--color-border-subtle)]"
                  // Actions inside a row-level <Link> must not navigate.
                  onClick={href ? stop : undefined}
                >
                  {actions.map(c => <div key={c.key}>{c.render(row)}</div>)}
                </div>
              )}
            </>
          )

          const classes = cn(
            'block rounded-xl border border-[var(--color-border)] bg-[var(--color-bg-secondary)] p-3.5',
            'active:bg-[var(--color-bg-elevated)] transition-colors',
            rowClassName?.(row, idx)
          )

          if (href) return <Link key={getRowId(row)} href={href} className={classes}>{body}</Link>
          return (
            <div
              key={getRowId(row)}
              onClick={onRowClick ? () => onRowClick(row) : undefined}
              className={classes}
            >
              {body}
            </div>
          )
        })}
      </div>
    </div>
  )
}

export default DataList
