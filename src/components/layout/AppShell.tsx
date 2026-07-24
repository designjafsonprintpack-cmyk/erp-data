'use client'
import { useState, useEffect, useCallback } from 'react'
import { Sidebar } from './Sidebar'
import { Header } from './Header'
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
  // Mobile-only: whether the sidebar drawer is open (< md breakpoint).
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
      <IdleTimeoutGuard timeoutMinutes={sessionTimeoutMinutes} />
      <Header user={user} sidebarCollapsed={collapsed} company={company} onMenuClick={() => setMobileOpen(true)} />
      <Sidebar
        collapsed={collapsed}
        onToggleCollapse={toggleCollapse}
        mobileOpen={mobileOpen}
        onMobileClose={() => setMobileOpen(false)}
      />
      <main
        // Inline styles can't be breakpoint-scoped, so the desktop margin is
        // exposed as a CSS variable and applied only at md+ via Tailwind.
        // On mobile the sidebar is an overlay drawer, so content gets ml-0.
        style={{ ['--content-ml' as any]: `${sidebarWidth}px`, marginTop: 'var(--header-height)' }}
        className="min-h-[calc(100vh-var(--header-height))] transition-all duration-200 p-4 md:p-6 ml-0 md:ml-[var(--content-ml)]"
      >
        {children}
      </main>
      <ToastContainer />
    </div>
  )
}

export default AppShell
