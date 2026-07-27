'use client'
import { useState, useEffect } from 'react'
import Link from 'next/link'
import { useRouter, usePathname } from 'next/navigation'
import { Bell, LogOut, KeyRound, Settings, ChevronDown, Sun, Moon, ArrowLeft, Menu } from 'lucide-react'
import { cn } from '@/lib/utils/cn'
import { signOut } from '@/modules/auth/services/authService'
import { toast } from '@/components/ui/Toast'
import { THEME_KEY, DEFAULT_THEME } from '@/config/app'
import type { Theme } from '@/types/shared'
import { GlobalSearch } from '@/components/shared/GlobalSearch'
import { ChangePasswordModal } from '@/components/shared/ChangePasswordModal'
import { THEMES } from '@/types/shared'
import { NAV_ITEMS, isNavLink } from './navConfig'

interface HeaderProps {
  user?: { full_name: string; email: string; role: string } | null
  sidebarCollapsed?: boolean
  company?: { name: string; logo_url: string | null } | null
  /** Opens the navigation drawer. Below `lg` the header shows a hamburger
   *  in the top-left corner that calls this — it is the ONLY way into the
   *  full navigation on a phone, so it is shown on every screen. */
  onMenuClick?: () => void
  /** True while the drawer is open (drives aria-expanded on the hamburger). */
  menuOpen?: boolean
}

/** Every route that is a nav destination in its own right. */
const TOP_LEVEL_HREFS = new Set(
  NAV_ITEMS.filter(isNavLink).map(i => i.href)
)

export function Header({ user, company, onMenuClick, menuOpen }: HeaderProps) {
  const router = useRouter()
  const pathname = usePathname()
  const [profileOpen, setProfileOpen] = useState(false)
  const [pwModal, setPwModal] = useState(false)
  const [themeOpen, setThemeOpen] = useState(false)
  const [currentTheme, setCurrentTheme] = useState<Theme>(DEFAULT_THEME)
  const [now, setNow] = useState(new Date())

  useEffect(() => {
    const saved = localStorage.getItem(THEME_KEY) as Theme | null
    if (saved) {
      setCurrentTheme(saved)
      document.documentElement.setAttribute('data-theme', saved)
    }
    const timer = setInterval(() => setNow(new Date()), 60000)
    return () => clearInterval(timer)
  }, [])

  const handleTheme = (theme: Theme) => {
    setCurrentTheme(theme)
    document.documentElement.setAttribute('data-theme', theme)
    localStorage.setItem(THEME_KEY, theme)
    setThemeOpen(false)
  }

  const handleSignOut = async () => {
    try {
      await signOut()
      router.push('/login')
    } catch {
      toast.error('Sign out failed')
    }
  }

  const dateStr = now.toLocaleDateString('en-PK', { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' })
  const timeStr = now.toLocaleTimeString('en-PK', { hour: '2-digit', minute: '2-digit' })

  // Detail, create and edit pages have no way back on mobile other than the
  // browser gesture, so the header shows a back control on any route that
  // isn't itself a nav destination. It sits AFTER the hamburger, which is
  // always present — the menu anchor never moves, the back arrow is additive.
  const showBack = !TOP_LEVEL_HREFS.has(pathname)

  return (
    <header
      className={cn(
        'fixed top-0 right-0 left-0 z-40 h-[var(--header-total)] pt-safe',
        'bg-[var(--color-bg-secondary)] border-b border-[var(--color-border)]',
        // Side padding must ADD to the safe-area inset, not be replaced by
        // it. `px-4 pl-safe pr-safe` looked right but .pl-safe/.pr-safe SET
        // padding to var(--safe-left/right) — 0px on desktop and on a portrait
        // phone — so the 16px gutter was silently wiped and the logo sat on the
        // left edge while the avatar sat on the right edge.
        'flex items-center gap-2 lg:gap-3',
        'pl-[calc(1rem+var(--safe-left))] pr-[calc(1rem+var(--safe-right))]'
      )}
    >
      {/* Menu + Back — below lg only. The hamburger is the fixed top-left
          anchor on every screen; the back arrow appears beside it on
          non-top-level routes. */}
      <div className="lg:hidden flex items-center flex-shrink-0 -ml-2">
        <button
          onClick={onMenuClick}
          aria-label="Open navigation menu"
          aria-expanded={!!menuOpen}
          className="w-11 h-11 flex items-center justify-center rounded-md text-[var(--color-text-secondary)] hover:bg-[var(--color-bg-elevated)] transition-colors"
        >
          <Menu size={20} />
        </button>
        {showBack && (
          <button
            onClick={() => router.back()}
            className="w-10 h-11 flex items-center justify-center rounded-md text-[var(--color-text-secondary)] hover:bg-[var(--color-bg-elevated)] transition-colors"
            aria-label="Go back"
          >
            <ArrowLeft size={20} />
          </button>
        )}
      </div>

      {/* Logo */}
      <Link href="/dashboard" className="flex items-center gap-2.5 min-w-0" aria-label="Go to dashboard">
        {company?.logo_url ? (
          // eslint-disable-next-line @next/next/no-img-element -- external Supabase Storage URL, not a local asset
          <img src={company.logo_url} alt={company?.name || 'Company logo'} className="w-7 h-7 rounded-md object-contain bg-[var(--color-bg-elevated)] flex-shrink-0" />
        ) : (
          <div className="w-7 h-7 rounded-md bg-[var(--color-accent)] flex items-center justify-center flex-shrink-0">
            <span className="text-white text-xs font-bold">JP</span>
          </div>
        )}
        <span className="text-sm font-semibold text-[var(--color-text-primary)] truncate max-w-[120px] md:max-w-[180px]">
          {company?.name || 'Jafson Print ERP'}
        </span>
      </Link>

      {/* Search — inline field at md+, icon-only trigger below (a 150px search
          box on a phone is a worse affordance than an icon) */}
      <div className="flex-1 min-w-0 flex justify-end md:justify-start md:max-w-md xl:max-w-lg md:mx-4">
        <GlobalSearch />
      </div>

      {/* Right side — ml-auto pins this group to the right edge. Without it
          the capped search box is the only flex-grow item, so every pixel of
          leftover width collected to the RIGHT of these controls and they sat
          stranded mid-header on a wide screen. */}
      <div className="flex items-center gap-1 md:gap-2 flex-shrink-0 ml-auto">
        {/* Date/Time */}
        <div className="hidden xl:flex flex-col items-end">
          <span className="text-xs text-[var(--color-text-primary)] font-medium">{timeStr}</span>
          <span className="text-xs text-[var(--color-text-muted)]">{dateStr}</span>
        </div>

        {/* Theme switcher */}
        <div className="relative">
          <button
            onClick={() => setThemeOpen(!themeOpen)}
            aria-label="Change theme"
            className="w-11 h-11 lg:w-8 lg:h-8 flex items-center justify-center rounded-md text-[var(--color-text-muted)] hover:bg-[var(--color-bg-elevated)] hover:text-[var(--color-text-primary)] transition-colors"
          >
            {currentTheme === 'light' ? <Sun size={16} /> : <Moon size={16} />}
          </button>
          {themeOpen && (
            <>
              <div className="fixed inset-0 z-40" onClick={() => setThemeOpen(false)} />
              <div className="absolute right-0 top-full mt-1 z-50 w-44 rounded-lg border border-[var(--color-border)] bg-[var(--color-bg-elevated)] shadow-xl py-1">
                {THEMES.map(t => (
                  <button
                    key={t.value}
                    onClick={() => handleTheme(t.value)}
                    className={cn(
                      'w-full text-left px-3 min-h-11 lg:min-h-0 py-2 text-sm transition-colors',
                      currentTheme === t.value
                        ? 'text-[var(--color-accent)] bg-[color:color-mix(in_srgb,var(--color-accent)_10%,transparent)]'
                        : 'text-[var(--color-text-secondary)] hover:bg-[var(--color-bg-secondary)] hover:text-[var(--color-text-primary)]'
                    )}
                  >
                    {t.label}
                  </button>
                ))}
              </div>
            </>
          )}
        </div>

        {/* Notifications */}
        <button
          aria-label="Notifications"
          className="hidden md:flex w-11 h-11 lg:w-8 lg:h-8 items-center justify-center rounded-md text-[var(--color-text-muted)] hover:bg-[var(--color-bg-elevated)] hover:text-[var(--color-text-primary)] transition-colors relative"
        >
          <Bell size={16} />
          <span className="absolute top-1.5 right-1.5 lg:top-1 lg:right-1 w-2 h-2 rounded-full bg-[var(--color-danger)]" />
        </button>

        {/* Profile */}
        <div className="relative">
          <button
            onClick={() => setProfileOpen(!profileOpen)}
            aria-label="Account menu"
            className="flex items-center gap-2 px-1 md:px-2 h-11 lg:h-auto lg:py-1.5 rounded-md hover:bg-[var(--color-bg-elevated)] transition-colors"
          >
            <div className="w-7 h-7 lg:w-6 lg:h-6 rounded-full bg-[color:color-mix(in_srgb,var(--color-accent)_20%,transparent)] border border-[color:color-mix(in_srgb,var(--color-accent)_30%,transparent)] flex items-center justify-center flex-shrink-0">
              <span className="text-xs font-semibold text-[var(--color-accent)]">
                {user?.full_name?.charAt(0).toUpperCase() ?? 'U'}
              </span>
            </div>
            <div className="hidden xl:flex flex-col items-start">
              <span className="text-xs font-medium text-[var(--color-text-primary)] leading-tight">{user?.full_name ?? 'User'}</span>
              <span className="text-xs text-[var(--color-text-muted)] leading-tight capitalize">{user?.role ?? 'Staff'}</span>
            </div>
            <ChevronDown size={12} className="text-[var(--color-text-muted)] hidden xl:block" />
          </button>

          {profileOpen && (
            <>
              <div className="fixed inset-0 z-40" onClick={() => setProfileOpen(false)} />
              <div className="absolute right-0 top-full mt-1 z-50 w-56 rounded-lg border border-[var(--color-border)] bg-[var(--color-bg-elevated)] shadow-xl py-1">
                <div className="px-3 py-2 border-b border-[var(--color-border)]">
                  <p className="text-sm font-medium text-[var(--color-text-primary)] truncate">{user?.full_name}</p>
                  <p className="text-xs text-[var(--color-text-muted)] truncate">{user?.email}</p>
                  <p className="text-xs text-[var(--color-text-muted)] capitalize mt-0.5 lg:hidden">{user?.role ?? 'Staff'}</p>
                </div>
                {/* Was a dead "Profile" button that did nothing — replaced with
                    the one account action every user actually needs. */}
                <button onClick={() => { setProfileOpen(false); setPwModal(true) }}
                  className="w-full flex items-center gap-2 px-3 min-h-11 lg:min-h-0 py-2 text-sm text-[var(--color-text-secondary)] hover:bg-[var(--color-bg-secondary)] hover:text-[var(--color-text-primary)]">
                  <KeyRound size={14} /> Change Password
                </button>
                <Link href="/dashboard/settings" onClick={() => setProfileOpen(false)} className="w-full flex items-center gap-2 px-3 min-h-11 lg:min-h-0 py-2 text-sm text-[var(--color-text-secondary)] hover:bg-[var(--color-bg-secondary)] hover:text-[var(--color-text-primary)]">
                  <Settings size={14} /> Settings
                </Link>
                <div className="border-t border-[var(--color-border)] mt-1 pt-1">
                  <button onClick={handleSignOut} className="w-full flex items-center gap-2 px-3 min-h-11 lg:min-h-0 py-2 text-sm text-[var(--color-danger)] hover:bg-[color:color-mix(in_srgb,var(--color-danger)_10%,transparent)]">
                    <LogOut size={14} /> Sign Out
                  </button>
                </div>
              </div>
            </>
          )}
        </div>
      </div>

      <ChangePasswordModal open={pwModal} onClose={() => setPwModal(false)} />
    </header>
  )
}

export default Header
