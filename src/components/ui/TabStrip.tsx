'use client'
import type { ReactNode } from 'react'
import { cn } from '@/lib/utils/cn'
import { ScrollRow } from './ScrollRow'

export interface TabItem {
  key: string
  label: ReactNode
  icon?: ReactNode
  /** Optional count shown after the label. */
  count?: number
}

interface TabStripProps {
  tabs: TabItem[]
  active: string
  onChange: (key: string) => void
  /** Rendered to the right of the tabs on desktop; hidden on mobile. */
  trailing?: ReactNode
  /**
   * Scroll sideways on a phone instead of wrapping onto several lines. Only
   * right for rows where a second line would break the visual (underline tabs
   * sharing a baseline, for instance).
   */
  scrollOnMobile?: boolean
  className?: string
}

/**
 * Horizontally scrollable tab row.
 *
 * The hand-rolled tab rows use `flex items-center gap-1` with no wrap and no
 * scroll — Reports' seven tabs need roughly 770px, QC's four about 520px, so
 * below a laptop width they either squash into unreadable slivers or push the
 * whole page into horizontal scroll. This scrolls instead, keeps 44px touch
 * height on mobile, and looks unchanged once everything fits.
 *
 * Scrolling is delegated to ScrollRow, which fades whichever edge still has
 * hidden tabs and pulls the active tab into view. Without that, a tab sliced
 * by the viewport edge reads as a broken layout rather than a scrollable row.
 */
export function TabStrip({ tabs, active, onChange, trailing, className, scrollOnMobile = false }: TabStripProps) {
  return (
    <div className={cn('flex items-center gap-2 min-w-0', className)}>
      <ScrollRow
        className="flex-1"
        wrap={!scrollOnMobile}
        role="tablist"
        activeSelector="[data-tab-active='true']"
        activeKey={active}
        // Keeps the first and last tab off the container edge.
        contentClassName="gap-1 -mx-1 px-1"
      >
        {tabs.map(tab => {
          const isActive = tab.key === active
          return (
            <button
              key={tab.key}
              role="tab"
              data-tab-active={isActive}
              aria-selected={isActive}
              onClick={() => onChange(tab.key)}
              className={cn(
                'flex items-center gap-1.5 rounded-md text-sm font-medium border transition-all flex-shrink-0 whitespace-nowrap',
                // Tighter horizontal padding on phones so a six-chip row costs
                // two lines rather than three.
                'px-3 md:px-4 h-11 md:h-8',
                isActive
                  ? 'bg-[var(--color-accent)] text-[var(--color-on-accent)] border-transparent'
                  : 'border-[var(--color-border)] text-[var(--color-text-secondary)] hover:text-[var(--color-text-primary)]'
              )}
            >
              {tab.icon}
              {tab.label}
              {tab.count !== undefined && (
                <span className={cn('tabular-nums', isActive ? 'opacity-80' : 'text-[var(--color-text-muted)]')}>
                  ({tab.count})
                </span>
              )}
            </button>
          )
        })}
      </ScrollRow>
      {trailing && <div className="hidden md:flex items-center gap-2 flex-shrink-0">{trailing}</div>}
    </div>
  )
}

export default TabStrip
