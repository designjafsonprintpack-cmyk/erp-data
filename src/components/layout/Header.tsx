'use client'
import { useState, useEffect } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { Bell, LogOut, User, Settings, ChevronDown, Sun, Moon } from 'lucide-react'
import { cn } from '@/lib/utils/cn'
import { signOut } from '@/modules/auth/services/authService'
import { toast } from '@/components/ui/Toast'
import { THEME_KEY, DEFAULT_THEME } from '@/config/app'
import type { Theme } from '@/types/shared'
import { GlobalSearch } from '@/components/shared/GlobalSearch'
import { THEMES } from '@/types/shared'

interface HeaderProps {
  user?: { full_name: string; email: string; role: string } | null
  sidebarCollapsed?: boolean
  company?: { name: string; logo_url: string | null } | null
}

export function Header({ user, sidebarCollapsed, company }: HeaderProps) {
  const router = useRouter()
  const [profileOpen, setProfileOpen] = useState(false)
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

  return (
    <header
      className={cn(
        'fixed top-0 right-0 left-0 z-40 h-[var(--header-height)]',
        'bg-[var(--color-bg-secondary)] border-b border-[var(--color-border)]',
        'flex items-center px-4 gap-3'
      )}
    >
      {/* Logo */}
      <Link href="/dashboard" className="flex items-center gap-2.5 flex-shrink-0">
        {company?.logo_url ? (
          // eslint-disable-next-line @next/next/no-img-element -- external Supabase Storage URL, not a local asset
          <img src={company.logo_url} alt={company?.name || 'Company logo'} className="w-7 h-7 rounded-md object-contain bg-[var(--color-bg-elevated)]" />
        ) : (
          <div className="w-7 h-7 rounded-md bg-[var(--color-accent)] flex items-center justify-center">
            <span className="text-white text-xs font-bold">JP</span>
          </div>
        )}
        <span className="text-sm font-semibold text-[var(--color-text-primary)] hidden md:block">
          {company?.name || 'Jafson Print ERP'}
        </span>
      </Link>

      {/* Search bar */}
      <div className="flex-1 max-w-md mx-4">
        <GlobalSearch />
      </div>

      {/* Right side */}
      <div className="flex items-center gap-2 ml-auto">
        {/* Date/Time */}
        <div className="hidden lg:flex flex-col items-end">
          <span className="text-xs text-[var(--color-text-primary)] font-medium">{timeStr}</span>
          <span className="text-xs text-[var(--color-text-muted)]">{dateStr}</span>
        </div>

        {/* Theme switcher */}
        <div className="relative">
          <button
            onClick={() => setThemeOpen(!themeOpen)}
            className="w-8 h-8 flex items-center justify-center rounded-md text-[var(--color-text-muted)] hover:bg-[var(--color-bg-elevated)] hover:text-[var(--color-text-primary)] transition-colors"
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
                      'w-full text-left px-3 py-2 text-sm transition-colors',
                      currentTheme === t.value
                        ? 'text-[var(--color-accent)] bg-[var(--color-accent)]/10'
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
        <button className="w-8 h-8 flex items-center justify-center rounded-md text-[var(--color-text-muted)] hover:bg-[var(--color-bg-elevated)] hover:text-[var(--color-text-primary)] transition-colors relative">
          <Bell size={16} />
          <span className="absolute top-1 right-1 w-2 h-2 rounded-full bg-[var(--color-danger)]" />
        </button>

        {/* Profile */}
        <div className="relative">
          <button
            onClick={() => setProfileOpen(!profileOpen)}
            className="flex items-center gap-2 px-2 py-1.5 rounded-md hover:bg-[var(--color-bg-elevated)] transition-colors"
          >
            <div className="w-6 h-6 rounded-full bg-[var(--color-accent)]/20 border border-[var(--color-accent)]/30 flex items-center justify-center">
              <span className="text-xs font-semibold text-[var(--color-accent)]">
                {user?.full_name?.charAt(0).toUpperCase() ?? 'U'}
              </span>
            </div>
            <div className="hidden md:flex flex-col items-start">
              <span className="text-xs font-medium text-[var(--color-text-primary)] leading-tight">{user?.full_name ?? 'User'}</span>
              <span className="text-xs text-[var(--color-text-muted)] leading-tight capitalize">{user?.role ?? 'Staff'}</span>
            </div>
            <ChevronDown size={12} className="text-[var(--color-text-muted)] hidden md:block" />
          </button>

          {profileOpen && (
            <>
              <div className="fixed inset-0 z-40" onClick={() => setProfileOpen(false)} />
              <div className="absolute right-0 top-full mt-1 z-50 w-48 rounded-lg border border-[var(--color-border)] bg-[var(--color-bg-elevated)] shadow-xl py-1">
                <div className="px-3 py-2 border-b border-[var(--color-border)]">
                  <p className="text-sm font-medium text-[var(--color-text-primary)]">{user?.full_name}</p>
                  <p className="text-xs text-[var(--color-text-muted)]">{user?.email}</p>
                </div>
                <button className="w-full flex items-center gap-2 px-3 py-2 text-sm text-[var(--color-text-secondary)] hover:bg-[var(--color-bg-secondary)] hover:text-[var(--color-text-primary)]">
                  <User size={14} /> Profile
                </button>
                <Link href="/dashboard/settings" onClick={() => setProfileOpen(false)} className="w-full flex items-center gap-2 px-3 py-2 text-sm text-[var(--color-text-secondary)] hover:bg-[var(--color-bg-secondary)] hover:text-[var(--color-text-primary)]">
                  <Settings size={14} /> Settings
                </Link>
                <div className="border-t border-[var(--color-border)] mt-1 pt-1">
                  <button onClick={handleSignOut} className="w-full flex items-center gap-2 px-3 py-2 text-sm text-[var(--color-danger)] hover:bg-[var(--color-danger)]/10">
                    <LogOut size={14} /> Sign Out
                  </button>
                </div>
              </div>
            </>
          )}
        </div>
      </div>
    </header>
  )
}

export default Header
