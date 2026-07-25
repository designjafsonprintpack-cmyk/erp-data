'use client'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { ScanLine } from 'lucide-react'
import { cn } from '@/lib/utils/cn'
import { buildMobileTabs } from './navConfig'
import { useNavPermissions } from '@/modules/settings/permissions/hooks/usePermission'

/**
 * Mobile bottom tab bar (below `lg`).
 *
 * Four role-appropriate destinations with a raised Scan button dead centre.
 * Scanning is THE floor action in a printing factory — every role that can see
 * jobs scans job cards all day — so it gets the one slot that is always under
 * the thumb, on every screen, without costing any role one of its four tabs.
 * Hidden only for users without jobs access, in which case the bar is a plain
 * four-tab row.
 *
 * The four tabs are derived from the user's actual permissions (see
 * buildMobileTabs in navConfig.ts), not from a hardcoded per-role list, so a
 * role Mehboob creates later works with no code change.
 *
 * NO "More" tab: it made the bar a six-slot row, which pushed the raised Scan
 * button off the true centre and left the layout visibly lopsided. Full
 * navigation now opens from the hamburger in the header's top-left corner,
 * which is present on every screen. Five slots keep Scan exactly centred.
 *
 * Hidden at `lg` and above, where the persistent sidebar does this job.
 */
export function BottomNav() {
  const pathname = usePathname()
  const { ready, role, canView } = useNavPermissions()

  const tabs = buildMobileTabs(role, ready ? canView : () => true)

  // Scan is gated on 'jobs' (it has no permission module of its own — every
  // scan resolves to a job or dispatch record). Fail-open while loading, same
  // as the tabs themselves.
  const showScan = ready ? canView('jobs') : true
  const scanActive = pathname.startsWith('/dashboard/scan')
  // Split the four tabs 2 + 2 around the centre button.
  const leftTabs = showScan ? tabs.slice(0, 2) : tabs
  const rightTabs = showScan ? tabs.slice(2) : []

  const renderTab = (tab: (typeof tabs)[number]) => {
    const isActive =
      pathname === tab.href || (tab.href !== '/dashboard' && pathname.startsWith(tab.href))
    const Icon = tab.icon
    return (
      <Link
        key={tab.href}
        href={tab.href}
        aria-current={isActive ? 'page' : undefined}
        className={cn(
          'flex-1 min-w-0 h-14 flex flex-col items-center justify-center gap-0.5 transition-colors',
          isActive ? 'text-[var(--color-accent)]' : 'text-[var(--color-text-muted)]'
        )}
      >
        <Icon size={20} className="flex-shrink-0" />
        <span className="text-[11px] leading-none font-medium truncate max-w-full px-1">
          {tab.shortLabel ?? tab.label}
        </span>
      </Link>
    )
  }

  return (
    <nav
      className={cn(
        'lg:hidden fixed bottom-0 left-0 right-0 z-30',
        'bg-[var(--color-bg-secondary)] border-t border-[var(--color-border)]',
        'flex items-stretch px-safe',
        // Real bar height plus the iOS home-indicator inset.
        'pb-[var(--safe-bottom)]'
      )}
      aria-label="Primary"
    >
      {leftTabs.map(renderTab)}

      {showScan && (
        <Link
          href="/dashboard/scan"
          aria-current={scanActive ? 'page' : undefined}
          aria-label="Scan"
          className="flex-1 min-w-0 h-14 flex flex-col items-center justify-center gap-0.5"
        >
          {/* Raised accent circle — reads as the bar's primary action and
              stays tappable well past 44px including the overhang. */}
          <span
            className={cn(
              'w-11 h-11 -mt-4 rounded-full flex items-center justify-center shadow-lg transition-colors',
              'border-4 border-[var(--color-bg-secondary)]',
              scanActive ? 'bg-[var(--color-accent-hover)]' : 'bg-[var(--color-accent)]'
            )}
          >
            <ScanLine size={20} className="text-white" />
          </span>
          <span
            className={cn(
              'text-[11px] leading-none font-medium',
              scanActive ? 'text-[var(--color-accent)]' : 'text-[var(--color-text-muted)]'
            )}
          >
            Scan
          </span>
        </Link>
      )}

      {rightTabs.map(renderTab)}
    </nav>
  )
}

export default BottomNav
