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
    // On a phone on factory Wi-Fi or mobile data, refreshing while offline
    // just burns the battery waking the radio for a request that will fail —
    // and on Data Saver connections a 2-minute poll is rude. So: skip ticks
    // while hidden or offline, refresh immediately when connectivity returns,
    // and halve the polling rate when the user has asked to save data.
    const saveData = (navigator as any).connection?.saveData === true
    const effectiveInterval = saveData ? intervalMs * 2 : intervalMs

    const tick = () => {
      if (document.hidden) return
      if (navigator.onLine === false) return
      router.refresh()
      window.dispatchEvent(new CustomEvent(REFRESH_EVENT))
    }
    const interval = setInterval(tick, effectiveInterval)
    const onVisible = () => { if (!document.hidden) tick() }
    const onOnline = () => tick()
    document.addEventListener('visibilitychange', onVisible)
    window.addEventListener('online', onOnline)
    return () => {
      clearInterval(interval)
      document.removeEventListener('visibilitychange', onVisible)
      window.removeEventListener('online', onOnline)
    }
  }, [router, intervalMs])

  return null
}

export default AutoRefresh
