'use client'
import type { ReactNode } from 'react'
import { cn } from '@/lib/utils/cn'

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
 */
export function TabStrip({ tabs, active, onChange, trailing, className }: TabStripProps) {
  return (
    <div className={cn('flex items-center gap-2 min-w-0', className)}>
      <div
        className={cn(
          'flex items-center gap-1 min-w-0 flex-1',
          // Scrolls only when it needs to; the scrollbar is hidden because a
          // 6px bar under a tab row reads as a rendering fault, not an affordance.
          'overflow-x-auto scrollbar-none',
          // Keeps the last tab from sitting flush against the viewport edge.
          '-mx-1 px-1'
        )}
        role="tablist"
      >
        {tabs.map(tab => {
          const isActive = tab.key === active
          return (
            <button
              key={tab.key}
              role="tab"
              aria-selected={isActive}
              onClick={() => onChange(tab.key)}
              className={cn(
                'flex items-center gap-1.5 px-4 rounded-md text-sm font-medium border transition-all flex-shrink-0',
                'h-11 md:h-8',
                isActive
                  ? 'bg-[var(--color-accent)] text-white border-transparent'
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
      </div>
      {trailing && <div className="hidden md:flex items-center gap-2 flex-shrink-0">{trailing}</div>}
    </div>
  )
}

export default TabStrip
