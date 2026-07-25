'use client'
import { useState, useEffect, useCallback } from 'react'
import { Sidebar } from './Sidebar'
import { Header } from './Header'
import { BottomNav } from './BottomNav'
import { IdleTimeoutGuard } from './IdleTimeoutGuard'
import { ToastContainer } from '@/components/ui/Toast'
import { SIDEBAR_COLLAPSED_KEY, THEME_KEY, DEFAULT_THEME } from '@/config/app'
import type { Theme } from '@/types/shared'
import type { ReactNode } from 'react'

interface AppShellProps {
  children: ReactNode
  user?: { full_name: string; email: string; role: string } | null
  company?: { name: string; logo_url: string | null } | null
  sessionTimeoutMinutes?: string | null
}

export function AppShell({ children, user, company, sessionTimeoutMinutes }: AppShellProps) {
  // Collapse state is owned here and passed down — Sidebar used to own it
  // while AppShell polled localStorage every 300ms to stay in sync. Lifting
  // the state removes the polling loop entirely.
  const [collapsed, setCollapsed] = useState(false)
  // Whether the sidebar drawer is open. Applies below `lg` only.
  const [mobileOpen, setMobileOpen] = useState(false)

  useEffect(() => {
    const savedCollapse = localStorage.getItem(SIDEBAR_COLLAPSED_KEY)
    if (savedCollapse !== null) setCollapsed(savedCollapse === 'true')

    const savedTheme = localStorage.getItem(THEME_KEY) as Theme | null
    document.documentElement.setAttribute('data-theme', savedTheme || DEFAULT_THEME)
  }, [])

  const toggleCollapse = useCallback(() => {
    setCollapsed(prev => {
      const next = !prev
      localStorage.setItem(SIDEBAR_COLLAPSED_KEY, String(next))
      return next
    })
  }, [])

  // Must match --sidebar-width in src/styles/themes/index.css — the sidebar
  // itself reads the CSS variable, but this margin is applied via a CSS var
  // set inline (for the collapse transition), so the number lives here too.
  const sidebarWidth = collapsed ? 56 : 170

  return (
    <div className="min-h-screen bg-[var(--color-bg-primary)]">
      {/* Keyboard/screen-reader users skip the header + nav in one jump.
          Visually hidden until focused. */}
      <a
        href="#main-content"
        className="sr-only focus:not-sr-only focus:fixed focus:top-2 focus:left-2 focus:z-[100] focus:px-4 focus:py-2 focus:rounded-md focus:bg-[var(--color-accent)] focus:text-white focus:text-sm"
      >
        Skip to content
      </a>
      <IdleTimeoutGuard timeoutMinutes={sessionTimeoutMinutes} />
      <Header
        user={user}
        sidebarCollapsed={collapsed}
        company={company}
        onMenuClick={() => setMobileOpen(true)}
        menuOpen={mobileOpen}
      />
      <Sidebar
        collapsed={collapsed}
        onToggleCollapse={toggleCollapse}
        mobileOpen={mobileOpen}
        onMobileClose={() => setMobileOpen(false)}
      />
      <main
        id="main-content"
        // Inline styles can't be breakpoint-scoped, so the desktop margin is
        // exposed as a CSS variable and applied only at lg+ via Tailwind.
        // Below lg the sidebar is an overlay drawer, so content gets ml-0.
        //
        // The desktop switch moved from `md:` to `lg:` in Phase R1 — at 768px
        // a permanent 170px sidebar left tablets with ~550px of content width
        // for layouts that assume a desktop grid. Unchanged at 1024px+.
        style={{ ['--content-ml' as any]: `${sidebarWidth}px`, marginTop: 'var(--header-total)' }}
        className={
          'min-h-[calc(100dvh-var(--header-total))] transition-all duration-200 ' +
          'p-4 md:p-5 lg:p-6 ml-0 lg:ml-[var(--content-ml)] ' +
          // Clear the fixed bottom tab bar (56px + home-indicator inset).
          // Removed at lg, where the bar is hidden.
          'pb-[calc(3.5rem+1rem+var(--safe-bottom))] lg:pb-6'
        }
      >
        {children}
      </main>
      <BottomNav />
      <ToastContainer />
    </div>
  )
}

export default AppShell
