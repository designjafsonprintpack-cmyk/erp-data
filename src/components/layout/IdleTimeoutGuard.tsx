'use client'
import { useEffect, useRef } from 'react'
import { signOut } from '@/modules/auth/services/authService'

// Default 30 minutes of no mouse/keyboard/touch activity signs the user out
// and sends them back to login. No system_settings toggle for this yet —
// hardcoded, same as most of this app's other not-yet-configurable
// constants (e.g. the 7-day quotation link expiry). A warning toast at the
// 1-minute mark gives a last chance to keep the session alive before it
// actually signs out.
const TIMEOUT_MS = 120 * 60 * 1000
const WARNING_MS = 2 * 60 * 1000

export function IdleTimeoutGuard() {
  const timeoutRef = useRef<ReturnType<typeof setTimeout>>()
  const warningRef = useRef<ReturnType<typeof setTimeout>>()

  useEffect(() => {
    const reset = () => {
      if (timeoutRef.current) clearTimeout(timeoutRef.current)
      if (warningRef.current) clearTimeout(warningRef.current)

      warningRef.current = setTimeout(() => {
        import('@/components/ui/Toast').then(({ toast }) => {
          toast.warning('You will be signed out in 1 minute due to inactivity.')
        })
      }, TIMEOUT_MS - WARNING_MS)

      timeoutRef.current = setTimeout(async () => {
        await signOut().catch(() => {})
        window.location.href = '/login?reason=idle'
      }, TIMEOUT_MS)
    }

    const events: (keyof WindowEventMap)[] = ['mousedown', 'mousemove', 'keydown', 'touchstart', 'scroll']
    events.forEach(e => window.addEventListener(e, reset, { passive: true }))
    reset()

    return () => {
      events.forEach(e => window.removeEventListener(e, reset))
      if (timeoutRef.current) clearTimeout(timeoutRef.current)
      if (warningRef.current) clearTimeout(warningRef.current)
    }
  }, [])

  return null
}
