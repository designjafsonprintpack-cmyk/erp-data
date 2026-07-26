import {
  LayoutDashboard, Users, FileText, ShoppingCart, Briefcase,
  Image, Calendar, Package, Truck, TrendingUp,
  UserCog, Settings, Building2, Layers, CreditCard, ClipboardList,
  ShieldCheck, ScanLine, Printer, Film, Scissors, Flame, FoldVertical, Warehouse,
  type LucideIcon,
  Activity, ListChecks,
} from 'lucide-react'

export type NavIcon = LucideIcon

export interface NavLink {
  label: string
  /** Short label for the bottom tab bar, where horizontal space is ~64px. */
  shortLabel?: string
  href: string
  icon: NavIcon
  color: string
  /**
   * Permission module this link is gated on — must match a `permissions.module`
   * value in the database (see ERP_MODULES in
   * src/modules/settings/permissions/types/permission.types.ts).
   * A link is shown when the user has `<module>::view`.
   */
  module: string
}

export interface NavDivider {
  divider: true
  label: string
}

export type NavItem = NavLink | NavDivider

export function isDivider(item: NavItem): item is NavDivider {
  return 'divider' in item
}

export function isNavLink(item: NavItem): item is NavLink {
  return !('divider' in item)
}

/**
 * THE navigation source of truth. Sidebar (desktop + mobile drawer) and
 * BottomNav (mobile) both read this array, so a link added here appears in
 * every navigation surface automatically.
 *
 * Module-key notes (verified against the migrations, not assumed):
 *  - `plates`  seeded by migration 042
 *  - `mrp`     has no permission module of its own; gated on `board_inventory`
 *              since it reads board demand vs stock
 *  - `scan`    has no permission module of its own; gated on `jobs` since every
 *              scan resolves to a job or dispatch record
 */
export const NAV_ITEMS: NavItem[] = [
  { label: 'Dashboard',       shortLabel: 'Home',    href: '/dashboard',                          icon: LayoutDashboard, color: '#6366f1', module: 'dashboard' },
  { label: 'Customers',                              href: '/dashboard/customers',                icon: Users,           color: '#ec4899', module: 'customers' },
  { label: 'Quotations',      shortLabel: 'Quotes',  href: '/dashboard/quotations',               icon: FileText,        color: '#f59e0b', module: 'quotations' },
  { label: 'Sales Orders',    shortLabel: 'Orders',  href: '/dashboard/sales-orders',             icon: ShoppingCart,    color: '#10b981', module: 'sales_orders' },
  { label: 'Jobs',                                   href: '/dashboard/jobs',                     icon: Briefcase,       color: '#3b82f6', module: 'jobs' },
  { label: 'Artwork',                                href: '/dashboard/artwork',                  icon: Image,           color: '#a855f7', module: 'artwork' },
  { label: 'Plates',                                 href: '/dashboard/plates',                   icon: Layers,          color: '#14b8a6', module: 'plates' },
  { label: 'Planning',                               href: '/dashboard/planning',                 icon: Calendar,        color: '#06b6d4', module: 'planning' },
  { label: 'Store (MRN)',     shortLabel: 'Store',   href: '/dashboard/store',                    icon: Warehouse,       color: '#84cc16', module: 'store' },
  { label: 'Board Inventory', shortLabel: 'Board',   href: '/dashboard/board-inventory',          icon: Building2,       color: '#f97316', module: 'board_inventory' },
  { label: 'MRP',                                    href: '/dashboard/mrp',                      icon: ClipboardList,   color: '#8b5cf6', module: 'board_inventory' },
  { label: 'Purchase',                               href: '/dashboard/purchase',                 icon: ShoppingCart,    color: '#eab308', module: 'purchase' },
  { label: 'Vendors',                                href: '/dashboard/vendors',                  icon: Users,           color: '#ef4444', module: 'vendors' },
  { label: 'Finance',                                href: '/dashboard/finance',                  icon: CreditCard,      color: '#ca8a04', module: 'finance' },

  { divider: true, label: 'Production' },
  // Stage-driven work list — every job currently sitting at a stage this
  // department owns, with Start / Complete right there. Was only reachable as
  // a mobile home tile until migration 091 made stage→department mapping real;
  // it belongs at the top of Production now that it actually returns rows.
  { label: 'My Queue',                               href: '/dashboard/production/queue',         icon: ListChecks,      color: '#38bdf8', module: 'jobs' },
  { label: 'Printing',                               href: '/dashboard/production/printing',      icon: Printer,         color: '#f43f5e', module: 'printing' },
  { label: 'Lamination',      shortLabel: 'Lam.',    href: '/dashboard/production/lamination',    icon: Film,            color: '#fb923c', module: 'lamination' },
  { label: 'Die Cutting',     shortLabel: 'Die Cut', href: '/dashboard/production/die-cutting',   icon: Scissors,        color: '#facc15', module: 'die_cutting' },
  { label: 'Hot Foil',                               href: '/dashboard/production/hot-foil',      icon: Flame,           color: '#fbbf24', module: 'hot_foil' },
  { label: 'Folder Gluing',   shortLabel: 'Gluing',  href: '/dashboard/production/folder-gluing', icon: FoldVertical,    color: '#fb7185', module: 'folder_gluing' },
  { label: 'Packing',                                href: '/dashboard/production/packing',       icon: Package,         color: '#34d399', module: 'packing' },
  { label: 'QC',                                     href: '/dashboard/qc',                       icon: ShieldCheck,     color: '#22d3ee', module: 'qc' },
  { label: 'Dispatch',                               href: '/dashboard/dispatch',                 icon: Truck,           color: '#0ea5e9', module: 'dispatch' },

  { divider: true, label: 'Operations' },
  { label: 'Scan',                                   href: '/dashboard/scan',                     icon: ScanLine,        color: '#a3e635', module: 'jobs' },
  { label: 'Reports',                                href: '/dashboard/reports',                  icon: TrendingUp,      color: '#22c55e', module: 'reports' },
  { label: 'Users',                                  href: '/dashboard/users',                    icon: UserCog,         color: '#64748b', module: 'users' },
  { label: 'Admin',                                  href: '/dashboard/admin',                    icon: Building2,       color: '#78716c', module: 'admin' },
  { label: 'Settings',                               href: '/dashboard/settings',                 icon: Settings,        color: '#94a3b8', module: 'settings' },
]

/**
 * Preferred order of bottom-tab destinations per role slug.
 *
 * These are HINTS, not a whitelist. The bottom bar takes the first 4 of these
 * the user actually has permission to see, then tops up from NAV_ITEMS order
 * if fewer than 4 matched. So a role that isn't listed here still gets a
 * sensible bar, and a role Mehboob creates later (e.g. a dedicated "QC" or
 * "Die Cutting" role) works with no code change — its permissions decide.
 *
 * Slugs below are the ones actually seeded in migration 002_auth_users.sql:
 * superadmin, admin, owner, sales, artwork, planning, store, printing,
 * dispatch. The rest are forward-looking entries for roles that follow the
 * same naming pattern.
 */
export const MOBILE_TAB_PRIORITY: Record<string, string[]> = {
  superadmin: ['dashboard', 'jobs', 'qc', 'reports'],
  owner:      ['dashboard', 'jobs', 'qc', 'reports'],
  admin:      ['dashboard', 'jobs', 'dispatch', 'reports'],

  sales:      ['dashboard', 'quotations', 'customers', 'sales_orders'],
  artwork:    ['dashboard', 'artwork', 'jobs', 'plates'],
  planning:   ['dashboard', 'planning', 'jobs', 'board_inventory'],
  store:      ['dashboard', 'store', 'board_inventory', 'purchase'],

  printing:   ['dashboard', 'printing', 'jobs', 'plates'],
  lamination:    ['dashboard', 'lamination', 'jobs', 'qc'],
  die_cutting:   ['dashboard', 'die_cutting', 'jobs', 'qc'],
  hot_foil:      ['dashboard', 'hot_foil', 'jobs', 'qc'],
  folder_gluing: ['dashboard', 'folder_gluing', 'jobs', 'qc'],
  packing:       ['dashboard', 'packing', 'jobs', 'dispatch'],
  qc:         ['dashboard', 'qc', 'jobs', 'reports'],
  dispatch:   ['dashboard', 'dispatch', 'jobs', 'customers'],
}

/** Used when the role slug has no entry above. */
export const DEFAULT_TAB_PRIORITY = ['dashboard', 'jobs', 'quotations', 'dispatch']

/**
 * Builds the bottom tab bar for a user: up to 4 permitted destinations in
 * role-preferred order, topped up from NAV_ITEMS order if the role hint
 * matched fewer than 4. The 5th slot ("More") is added by BottomNav itself.
 */
export function buildMobileTabs(
  role: string,
  canView: (module: string) => boolean,
): NavLink[] {
  const links = NAV_ITEMS.filter(isNavLink)
  const byModule = new Map<string, NavLink>()
  for (const l of links) if (!byModule.has(l.module)) byModule.set(l.module, l)

  const priority = MOBILE_TAB_PRIORITY[role] ?? DEFAULT_TAB_PRIORITY
  const picked: NavLink[] = []
  const seen = new Set<string>()

  for (const mod of priority) {
    const link = byModule.get(mod)
    if (link && canView(mod) && !seen.has(link.href)) {
      picked.push(link)
      seen.add(link.href)
    }
    if (picked.length === 4) return picked
  }

  // Top up in declaration order so the bar is never sparse.
  for (const link of links) {
    if (picked.length === 4) break
    if (canView(link.module) && !seen.has(link.href)) {
      picked.push(link)
      seen.add(link.href)
    }
  }

  return picked
}


/* ────────────────────────────── Mobile home ─────────────────────────────── */

/**
 * A destination tile on the mobile home screen. Distinct from NavLink because
 * two tiles can share a permission module (Scan, Floor View and My Queue are
 * all gated on `jobs`) — so tiles need their own identity key.
 */
export interface HomeAction {
  key: string
  label: string
  href: string
  icon: LucideIcon
  color: string
  /** Permission module that gates visibility, same values as NavLink.module. */
  module: string
}

/**
 * Everything a home tile can point at. Mostly mirrors NAV_ITEMS, plus three
 * destinations that aren't in the sidebar-first nav but matter most on a
 * phone in the factory: the scan station, the floor view, and the
 * department queue.
 */
export const HOME_ACTION_POOL: HomeAction[] = [
  { key: 'scan',  label: 'Scan Station', href: '/dashboard/scan',              icon: ScanLine,  color: '#a3e635', module: 'jobs' },
  { key: 'queue', label: 'My Queue',     href: '/dashboard/production/queue',  icon: ListChecks, color: '#38bdf8', module: 'jobs' },
  { key: 'floor', label: 'Floor View',   href: '/dashboard/production/floor',  icon: Activity,  color: '#f472b6', module: 'jobs' },
  // NAV_ITEMS destinations, addressable by module name:
  ...NAV_ITEMS.filter(isNavLink).map(l => ({
    key: l.module, label: l.label, href: l.href, icon: l.icon, color: l.color, module: l.module,
  })),
]

/**
 * Ordered home-tile hints per role slug. Same philosophy as
 * MOBILE_TAB_PRIORITY above: hints, not a whitelist — permissions decide, and
 * unknown roles fall back sensibly. Operator roles lead with the things done
 * standing at a machine (queue, scan); office roles lead with their
 * paperwork. `dashboard` is never a tile — the tiles ARE the dashboard here.
 */
export const MOBILE_HOME_PRIORITY: Record<string, string[]> = {
  superadmin: ['jobs', 'floor', 'qc', 'dispatch', 'reports', 'quotations'],
  owner:      ['jobs', 'floor', 'qc', 'dispatch', 'reports', 'quotations'],
  admin:      ['jobs', 'floor', 'dispatch', 'qc', 'reports', 'users'],

  sales:      ['quotations', 'sales_orders', 'customers', 'jobs', 'scan', 'dispatch'],
  artwork:    ['artwork', 'jobs', 'plates', 'scan', 'qc', 'floor'],
  planning:   ['planning', 'jobs', 'board_inventory', 'floor', 'queue', 'scan'],
  store:      ['store', 'board_inventory', 'scan', 'purchase', 'queue', 'jobs'],

  printing:      ['queue', 'scan', 'printing', 'floor', 'jobs', 'qc'],
  lamination:    ['queue', 'scan', 'lamination', 'floor', 'jobs', 'qc'],
  die_cutting:   ['queue', 'scan', 'die_cutting', 'floor', 'jobs', 'qc'],
  hot_foil:      ['queue', 'scan', 'hot_foil', 'floor', 'jobs', 'qc'],
  folder_gluing: ['queue', 'scan', 'folder_gluing', 'floor', 'jobs', 'qc'],
  packing:       ['queue', 'scan', 'packing', 'floor', 'jobs', 'dispatch'],
  qc:         ['qc', 'queue', 'scan', 'jobs', 'floor', 'reports'],
  dispatch:   ['dispatch', 'scan', 'jobs', 'queue', 'customers', 'floor'],
}

export const DEFAULT_HOME_PRIORITY = ['jobs', 'scan', 'quotations', 'dispatch', 'qc', 'reports']

/**
 * Builds the mobile home tiles: up to 6 permitted destinations in
 * role-preferred order, topped up from the pool if the hint matched fewer.
 * Mirrors buildMobileTabs so both surfaces behave identically for unknown
 * roles and partial permissions.
 */
export function buildHomeActions(
  role: string,
  canView: (module: string) => boolean,
): HomeAction[] {
  const byKey = new Map<string, HomeAction>()
  for (const a of HOME_ACTION_POOL) if (!byKey.has(a.key)) byKey.set(a.key, a)

  const priority = MOBILE_HOME_PRIORITY[role] ?? DEFAULT_HOME_PRIORITY
  const picked: HomeAction[] = []
  const seen = new Set<string>()

  const take = (a: HomeAction | undefined) => {
    if (a && canView(a.module) && !seen.has(a.href)) {
      picked.push(a)
      seen.add(a.href)
    }
  }

  for (const key of priority) {
    take(byKey.get(key))
    if (picked.length === 6) return picked
  }
  for (const a of HOME_ACTION_POOL) {
    if (picked.length === 6) break
    if (a.key === 'dashboard') continue // the tiles are the dashboard
    take(a)
  }
  return picked
}
