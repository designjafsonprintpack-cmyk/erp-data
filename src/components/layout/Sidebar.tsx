'use client'
import { useState, useEffect } from 'react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import {
  LayoutDashboard, Users, FileText, ShoppingCart, Briefcase,
  Image, Calendar, Package, BarChart3, Truck, TrendingUp,
  UserCog, Settings, ChevronLeft, ChevronRight, Building2, Layers, ClipboardList
} from 'lucide-react'
import { cn } from '@/lib/utils/cn'
import { SIDEBAR_COLLAPSED_KEY } from '@/config/app'

const navItems = [
  { label: 'Dashboard', href: '/dashboard', icon: LayoutDashboard },
  { label: 'Customers', href: '/dashboard/customers', icon: Users },
  { label: 'Quotations', href: '/dashboard/quotations', icon: FileText },
  { label: 'Sales Orders', href: '/dashboard/sales-orders', icon: ShoppingCart },
  { label: 'Jobs', href: '/dashboard/jobs', icon: Briefcase },
  { label: 'Artwork', href: '/dashboard/artwork', icon: Image },
  { label: 'Plates', href: '/dashboard/plates', icon: Layers },
  { label: 'Planning', href: '/dashboard/planning', icon: Calendar },
  { label: 'Store', href: '/dashboard/store', icon: Package },
  { label: 'Board Inventory', href: '/dashboard/board-inventory', icon: Building2 },
  { label: 'MRP', href: '/dashboard/mrp', icon: ClipboardList },
  { label: 'Purchase', href: '/dashboard/purchase', icon: ShoppingCart },
  { label: 'Vendors', href: '/dashboard/vendors', icon: Users },
  { divider: true, label: 'Production' },
  { label: 'Printing', href: '/dashboard/production/printing', icon: BarChart3 },
  { label: 'Lamination', href: '/dashboard/production/lamination', icon: BarChart3 },
  { label: 'Die Cutting', href: '/dashboard/production/die-cutting', icon: BarChart3 },
  { label: 'Hot Foil', href: '/dashboard/production/hot-foil', icon: BarChart3 },
  { label: 'Folder Gluing', href: '/dashboard/production/folder-gluing', icon: BarChart3 },
  { label: 'Packing', href: '/dashboard/production/packing', icon: Package },
  { divider: true, label: 'Operations' },
  { label: 'Dispatch', href: '/dashboard/dispatch', icon: Truck },
  { label: 'Reports', href: '/dashboard/reports', icon: TrendingUp },
  { label: 'Users', href: '/dashboard/users', icon: UserCog },
  { label: 'Admin', href: '/dashboard/admin', icon: Building2 },
  { label: 'Settings', href: '/dashboard/settings', icon: Settings },
]

type NavItem = { label: string; href: string; icon: React.ComponentType<{size?: number; className?: string}> } | { divider: true; label: string }

export function Sidebar() {
  const pathname = usePathname()
  const [collapsed, setCollapsed] = useState(false)

  useEffect(() => {
    const saved = localStorage.getItem(SIDEBAR_COLLAPSED_KEY)
    if (saved !== null) setCollapsed(saved === 'true')
  }, [])

  const toggleCollapse = () => {
    const next = !collapsed
    setCollapsed(next)
    localStorage.setItem(SIDEBAR_COLLAPSED_KEY, String(next))
  }

  return (
    <aside
      style={{ width: collapsed ? '56px' : 'var(--sidebar-width)' }}
      className={cn(
        'fixed left-0 top-[var(--header-height)] bottom-0 z-30',
        'bg-[var(--color-bg-secondary)] border-r border-[var(--color-border)]',
        'flex flex-col transition-all duration-200 overflow-hidden'
      )}
    >
      {/* Nav Items */}
      <nav className="flex-1 overflow-y-auto py-2 scrollbar-none">
        {navItems.map((item, idx) => {
          if ('divider' in item) {
            return (
              <div key={idx} className={cn(
                'px-3 pt-4 pb-1',
                collapsed && 'px-0'
              )}>
                {!collapsed && (
                  <span className="text-xs font-semibold text-[var(--color-text-muted)] uppercase tracking-wider px-2">
                    {item.label}
                  </span>
                )}
                {collapsed && <div className="h-px bg-[var(--color-border-subtle)] mx-2 my-1" />}
              </div>
            )
          }
          const navItem = item as { label: string; href: string; icon: React.ComponentType<{size?: number; className?: string}> }
          const isActive = pathname === navItem.href || (navItem.href !== '/dashboard' && pathname.startsWith(navItem.href))
          const Icon = navItem.icon

          return (
            <Link
              key={navItem.href}
              href={navItem.href}
              title={collapsed ? navItem.label : undefined}
              className={cn(
                'flex items-center gap-3 px-3 py-2 mx-2 rounded-md text-sm font-medium transition-all duration-150',
                'hover:bg-[var(--color-bg-elevated)] hover:text-[var(--color-text-primary)]',
                isActive
                  ? 'bg-[var(--color-accent)]/10 text-[var(--color-accent)] border border-[var(--color-accent)]/20'
                  : 'text-[var(--color-text-secondary)]',
                collapsed && 'justify-center px-0 mx-2'
              )}
            >
              <Icon size={16} className="flex-shrink-0" />
              {!collapsed && <span className="truncate">{navItem.label}</span>}
            </Link>
          )
        })}
      </nav>

      {/* Collapse toggle */}
      <div className="border-t border-[var(--color-border)] p-2">
        <button
          onClick={toggleCollapse}
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
  )
}

export default Sidebar
