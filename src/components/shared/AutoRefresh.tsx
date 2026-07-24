'use client'
import { useEffect } from 'react'
import { useRouter } from 'next/navigation'

// Auto-refreshes the current route's server data on an interval —
// router.refresh() re-runs the server components in place without a full
// page reload, so scroll position, open modals, and client state survive.
// After each refresh a window event fires so client components that fetch
// their own data (e.g. the dashboard's Alerts panel) can refetch too.
//
// Pauses while the tab is hidden and refreshes immediately when the user
// comes back — same pattern as the customer portal's polling.
export const REFRESH_EVENT = 'erp:refresh'

export function AutoRefresh({ intervalMs = 120000 }: { intervalMs?: number }) {
  const router = useRouter()

  useEffect(() => {
    const tick = () => {
      if (document.hidden) return
      router.refresh()
      window.dispatchEvent(new CustomEvent(REFRESH_EVENT))
    }
    const interval = setInterval(tick, intervalMs)
    const onVisible = () => { if (!document.hidden) tick() }
    document.addEventListener('visibilitychange', onVisible)
    return () => { clearInterval(interval); document.removeEventListener('visibilitychange', onVisible) }
  }, [router, intervalMs])

  return null
}

export default AutoRefresh
