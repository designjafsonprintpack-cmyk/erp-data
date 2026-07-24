'use client'
import { useState, useEffect } from 'react'
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
  const [collapsed, setCollapsed] = useState(false)

  useEffect(() => {
    // Restore sidebar state
    const savedCollapse = localStorage.getItem(SIDEBAR_COLLAPSED_KEY)
    if (savedCollapse !== null) setCollapsed(savedCollapse === 'true')

    // Restore theme
    const savedTheme = localStorage.getItem(THEME_KEY) as Theme | null
    document.documentElement.setAttribute('data-theme', savedTheme || DEFAULT_THEME)

    // Listen for sidebar changes
    const observer = new MutationObserver(() => {
      const saved = localStorage.getItem(SIDEBAR_COLLAPSED_KEY)
      if (saved !== null) setCollapsed(saved === 'true')
    })
    // Poll for sidebar changes (simple approach)
    const interval = setInterval(() => {
      const saved = localStorage.getItem(SIDEBAR_COLLAPSED_KEY)
      if (saved !== null) setCollapsed(saved === 'true')
    }, 300)
    return () => clearInterval(interval)
  }, [])

  // Must match --sidebar-width in src/styles/themes/index.css — the sidebar
  // itself reads the CSS variable, but this margin is applied via inline
  // style (for the collapse transition), so the number lives here too.
  const sidebarWidth = collapsed ? 56 : 170

  return (
    <div className="min-h-screen bg-[var(--color-bg-primary)]">
      <IdleTimeoutGuard timeoutMinutes={sessionTimeoutMinutes} />
      <Header user={user} sidebarCollapsed={collapsed} company={company} />
      <Sidebar />
      <main
        style={{ marginLeft: `${sidebarWidth}px`, marginTop: 'var(--header-height)' }}
        className="min-h-[calc(100vh-var(--header-height))] transition-all duration-200 p-6"
      >
        {children}
      </main>
      <ToastContainer />
    </div>
  )
}

export default AppShell
