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
}

export function AppShell({ children, user }: AppShellProps) {
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

  const sidebarWidth = collapsed ? 56 : 240

  return (
    <div className="min-h-screen bg-[var(--color-bg-primary)]">
      <IdleTimeoutGuard />
      <Header user={user} sidebarCollapsed={collapsed} />
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
