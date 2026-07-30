'use client'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { ChevronLeft, ChevronRight, X } from 'lucide-react'
import { cn } from '@/lib/utils/cn'
import { NAV_ITEMS, isDivider, isNavLinkVisible } from './navConfig'
import { useNavPermissions } from '@/modules/settings/permissions/hooks/usePermission'

interface SidebarProps {
  collapsed: boolean
  onToggleCollapse: () => void
  /** Drawer state below the `lg` breakpoint. Inert on desktop. */
  mobileOpen: boolean
  onMobileClose: () => void
}

/**
 * BREAKPOINT NOTE (changed in Phase R1)
 *
 * The persistent-sidebar layout used to start at `md:` (768px), which meant a
 * 768px tablet got the full desktop treatment: a permanent 170px sidebar it
 * could not dismiss, leaving ~550px for content that assumes a desktop grid.
 * The desktop layout now starts at `lg:` (1024px) instead, so tablets keep the
 * dismissible drawer. Nothing changes at 1024px and above.
 */
export function Sidebar({ collapsed, onToggleCollapse, mobileOpen, onMobileClose }: SidebarProps) {
  const pathname = usePathname()
  const { ready, canView } = useNavPermissions()

  // Until permissions resolve, show everything — a nav that briefly shows too
  // much is far better than one that flickers empty on every page load.
  // isNavLinkVisible, not canView directly: Help is ungated (see navConfig).
  const items = ready ? NAV_ITEMS.filter(i => isDivider(i) || isNavLinkVisible(i, canView)) : NAV_ITEMS

  // Drop a section heading whose links were all filtered out.
  const visible = items.filter((item, idx) => {
    if (!isDivider(item)) return true
    const next = items[idx + 1]
    return next !== undefined && !isDivider(next)
  })

  return (
    <>
      {/* Drawer backdrop — tap outside to close */}
      {mobileOpen && (
        <div
          className="fixed inset-0 z-30 bg-black/50 lg:hidden"
          onClick={onMobileClose}
          aria-hidden="true"
        />
      )}
      <aside
        style={{ width: collapsed ? '56px' : 'var(--sidebar-width)' }}
        className={cn(
          'fixed left-0 top-[var(--header-total)] bottom-0 z-30 pl-safe',
          'bg-[var(--color-bg-secondary)] border-r border-[var(--color-border)]',
          'flex flex-col transition-all duration-200 overflow-hidden',
          // Below lg: overlay drawer at a fixed comfortable width.
          'max-lg:!w-[260px] max-lg:z-40 max-lg:shadow-xl',
          mobileOpen ? 'max-lg:translate-x-0' : 'max-lg:-translate-x-full'
        )}
        aria-label="Main navigation"
      >
        {/* Drawer close row (below lg only) */}
        <div className="lg:hidden flex items-center justify-between px-3 pt-2">
          <span className="text-xs font-semibold uppercase tracking-wider text-[var(--color-text-muted)]">Menu</span>
          <button
            onClick={onMobileClose}
            className="w-11 h-11 -mr-2 flex items-center justify-center rounded-md text-[var(--color-text-muted)] hover:bg-[var(--color-bg-elevated)]"
            aria-label="Close menu"
          >
            <X size={18} />
          </button>
        </div>

        <nav className="flex-1 overflow-y-auto overscroll-contain py-2 pb-[calc(0.5rem+var(--safe-bottom))] scrollbar-none">
          {visible.map((item, idx) => {
            if (isDivider(item)) {
              return (
                <div key={`d-${idx}`} className={cn('px-3 pt-4 pb-1', collapsed && 'lg:px-0')}>
                  <span className={cn(
                    'text-xs font-semibold text-[var(--color-text-muted)] uppercase tracking-wider px-2',
                    collapsed && 'lg:hidden'
                  )}>
                    {item.label}
                  </span>
                  {collapsed && <div className="hidden lg:block h-px bg-[var(--color-border-subtle)] mx-2 my-1" />}
                </div>
              )
            }

            const isActive = pathname === item.href || (item.href !== '/dashboard' && pathname.startsWith(item.href))
            const Icon = item.icon

            return (
              <Link
                key={item.href}
                href={item.href}
                title={collapsed ? item.label : undefined}
                onClick={onMobileClose}
                aria-current={isActive ? 'page' : undefined}
                className={cn(
                  'flex items-center gap-3 px-3 py-2 mx-2 rounded-md text-sm font-medium transition-all duration-150',
                  // 44px rows on touch screens
                  'max-lg:min-h-11 max-lg:py-2.5',
                  'hover:bg-[var(--color-bg-elevated)] hover:text-[var(--color-text-primary)]',
                  isActive
                    ? 'bg-[color:color-mix(in_srgb,var(--color-accent)_10%,transparent)] text-[var(--color-accent)] border border-[color:color-mix(in_srgb,var(--color-accent)_20%,transparent)]'
                    : 'text-[var(--color-text-secondary)]',
                  collapsed && 'lg:justify-center lg:px-0'
                )}
              >
                <Icon size={16} className="flex-shrink-0" style={{ color: item.color }} />
                <span className={cn('truncate', collapsed && 'lg:hidden')}>{item.label}</span>
              </Link>
            )
          })}
        </nav>

        {/* Collapse toggle — desktop only; the drawer just closes on mobile */}
        <div className="hidden lg:block border-t border-[var(--color-border)] p-2">
          <button
            onClick={onToggleCollapse}
            aria-label={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
            className={cn(
              'flex items-center gap-2 w-full px-2 py-2 rounded-md text-sm',
              'text-[var(--color-text-muted)] hover:bg-[var(--color-bg-elevated)] hover:text-[var(--color-text-primary)]',
              'transition-colors duration-150',
              collapsed && 'justify-center'
            )}
          >
            {collapsed ? <ChevronRight size={16} /> : <><ChevronLeft size={16} /><span>Collapse</span></>}
          </button>
        </div>
      </aside>
    </>
  )
}

export default Sidebar
