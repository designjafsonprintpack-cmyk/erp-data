'use client'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import {
  LayoutDashboard, Users, FileText, ShoppingCart, Briefcase,
  Image, Calendar, Package, Truck, TrendingUp,
  UserCog, Settings, ChevronLeft, ChevronRight, Building2, Layers, CreditCard, ClipboardList,
  ShieldCheck, ScanLine, X, Printer, Film, Scissors, Flame, FoldVertical, Warehouse
} from 'lucide-react'
import { cn } from '@/lib/utils/cn'

const navItems = [
  { label: 'Dashboard', href: '/dashboard', icon: LayoutDashboard, color: '#6366f1' },
  { label: 'Customers', href: '/dashboard/customers', icon: Users, color: '#ec4899' },
  { label: 'Quotations', href: '/dashboard/quotations', icon: FileText, color: '#f59e0b' },
  { label: 'Sales Orders', href: '/dashboard/sales-orders', icon: ShoppingCart, color: '#10b981' },
  { label: 'Jobs', href: '/dashboard/jobs', icon: Briefcase, color: '#3b82f6' },
  { label: 'Artwork', href: '/dashboard/artwork', icon: Image, color: '#a855f7' },
  { label: 'Plates', href: '/dashboard/plates', icon: Layers, color: '#14b8a6' },
  { label: 'Planning', href: '/dashboard/planning', icon: Calendar, color: '#06b6d4' },
  { label: 'Store (MRN)', href: '/dashboard/store', icon: Warehouse, color: '#84cc16' },
  { label: 'Board Inventory', href: '/dashboard/board-inventory', icon: Building2, color: '#f97316' },
  { label: 'MRP', href: '/dashboard/mrp', icon: ClipboardList, color: '#8b5cf6' },
  { label: 'Purchase', href: '/dashboard/purchase', icon: ShoppingCart, color: '#eab308' },
  { label: 'Vendors', href: '/dashboard/vendors', icon: Users, color: '#ef4444' },
  { label: 'Finance', href: '/dashboard/finance', icon: CreditCard, color: '#ca8a04' },
  { divider: true, label: 'Production' },
  { label: 'Printing', href: '/dashboard/production/printing', icon: Printer, color: '#f43f5e' },
  { label: 'Lamination', href: '/dashboard/production/lamination', icon: Film, color: '#fb923c' },
  { label: 'Die Cutting', href: '/dashboard/production/die-cutting', icon: Scissors, color: '#facc15' },
  { label: 'Hot Foil', href: '/dashboard/production/hot-foil', icon: Flame, color: '#fbbf24' },
  { label: 'Folder Gluing', href: '/dashboard/production/folder-gluing', icon: FoldVertical, color: '#fb7185' },
  { label: 'Packing', href: '/dashboard/production/packing', icon: Package, color: '#34d399' },
  { label: 'QC', href: '/dashboard/qc', icon: ShieldCheck, color: '#22d3ee' },
  { label: 'Dispatch', href: '/dashboard/dispatch', icon: Truck, color: '#0ea5e9' },
  { divider: true, label: 'Operations' },
  { label: 'Scan', href: '/dashboard/scan', icon: ScanLine, color: '#a3e635' },
  { label: 'Reports', href: '/dashboard/reports', icon: TrendingUp, color: '#22c55e' },
  { label: 'Users', href: '/dashboard/users', icon: UserCog, color: '#64748b' },
  { label: 'Admin', href: '/dashboard/admin', icon: Building2, color: '#78716c' },
  { label: 'Settings', href: '/dashboard/settings', icon: Settings, color: '#94a3b8' },
]

interface SidebarProps {
  collapsed: boolean
  onToggleCollapse: () => void
  // Mobile drawer state (< md breakpoint) — on desktop these are inert.
  mobileOpen: boolean
  onMobileClose: () => void
}

export function Sidebar({ collapsed, onToggleCollapse, mobileOpen, onMobileClose }: SidebarProps) {
  const pathname = usePathname()

  return (
    <>
      {/* Mobile backdrop — tap anywhere outside the drawer to close */}
      {mobileOpen && (
        <div
          className="fixed inset-0 z-30 bg-black/50 md:hidden"
          onClick={onMobileClose}
          aria-hidden="true"
        />
      )}
      <aside
        style={{ width: collapsed ? '56px' : 'var(--sidebar-width)' }}
        className={cn(
          'fixed left-0 top-[var(--header-height)] bottom-0 z-30',
          'bg-[var(--color-bg-secondary)] border-r border-[var(--color-border)]',
          'flex flex-col transition-all duration-200 overflow-hidden',
          // Mobile: overlay drawer, slides in from the left. Desktop: always visible.
          'max-md:!w-[240px] max-md:z-40 max-md:shadow-xl',
          mobileOpen ? 'max-md:translate-x-0' : 'max-md:-translate-x-full'
        )}
      >
        {/* Mobile-only close row */}
        <div className="md:hidden flex items-center justify-end px-2 pt-2">
          <button
            onClick={onMobileClose}
            className="w-9 h-9 flex items-center justify-center rounded-md text-[var(--color-text-muted)] hover:bg-[var(--color-bg-elevated)]"
            aria-label="Close menu"
          >
            <X size={18} />
          </button>
        </div>

        {/* Nav Items */}
        <nav className="flex-1 overflow-y-auto py-2 scrollbar-none">
          {navItems.map((item, idx) => {
            if ('divider' in item) {
              return (
                <div key={idx} className={cn(
                  'px-3 pt-4 pb-1',
                  collapsed && 'md:px-0'
                )}>
                  <span className={cn(
                    'text-xs font-semibold text-[var(--color-text-muted)] uppercase tracking-wider px-2',
                    collapsed && 'md:hidden'
                  )}>
                    {item.label}
                  </span>
                  {collapsed && <div className="hidden md:block h-px bg-[var(--color-border-subtle)] mx-2 my-1" />}
                </div>
              )
            }
            const navItem = item as { label: string; href: string; icon: React.ComponentType<{size?: number; className?: string; style?: React.CSSProperties}>; color: string }
            const isActive = pathname === navItem.href || (navItem.href !== '/dashboard' && pathname.startsWith(navItem.href))
            const Icon = navItem.icon

            return (
              <Link
                key={navItem.href}
                href={navItem.href}
                title={collapsed ? navItem.label : undefined}
                onClick={onMobileClose}
                className={cn(
                  'flex items-center gap-3 px-3 py-2 mx-2 rounded-md text-sm font-medium transition-all duration-150',
                  // Slightly taller rows on touch screens
                  'max-md:py-2.5',
                  'hover:bg-[var(--color-bg-elevated)] hover:text-[var(--color-text-primary)]',
                  isActive
                    ? 'bg-[var(--color-accent)]/10 text-[var(--color-accent)] border border-[var(--color-accent)]/20'
                    : 'text-[var(--color-text-secondary)]',
                  collapsed && 'md:justify-center md:px-0'
                )}
              >
                <Icon size={16} className="flex-shrink-0" style={{ color: navItem.color }} />
                <span className={cn('truncate', collapsed && 'md:hidden')}>{navItem.label}</span>
              </Link>
            )
          })}
        </nav>

        {/* Collapse toggle — desktop only; on mobile the drawer just closes */}
        <div className="hidden md:block border-t border-[var(--color-border)] p-2">
          <button
            onClick={onToggleCollapse}
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
