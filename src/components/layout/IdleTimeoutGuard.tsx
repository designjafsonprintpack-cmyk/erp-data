'use client'
import { useEffect, useRef, useState, useCallback } from 'react'
import { signOut } from '@/modules/auth/services/authService'
import { Modal } from '@/components/ui/Modal'
import { Button } from '@/components/ui/Button'
import { DEFAULT_SESSION_TIMEOUT, isValidSessionTimeout } from '@/config/sessionTimeout'

// Idle-logout mechanism: signs the user out after N minutes of no
// mouse/keyboard/touch/scroll activity. N is configurable per company via
// Settings > Session Timeout (system_settings key session_timeout_minutes,
// fetched server-side in dashboard/layout.tsx and passed down through
// AppShell) — 'never' disables this entirely. Falls back to the previous
// hardcoded 120-minute default if no value was ever set for the company.
//
// A countdown dialog appears 2 minutes before the actual sign-out, giving
// the user a last chance to stay signed in. Any detected activity — including
// clicking "Stay Signed In", or simply moving the mouse while the dialog is
// up — resets the timers and dismisses the dialog.
const WARNING_MS = 2 * 60 * 1000

interface IdleTimeoutGuardProps {
  timeoutMinutes?: string | null
}

export function IdleTimeoutGuard({ timeoutMinutes }: IdleTimeoutGuardProps) {
  const setting = isValidSessionTimeout(timeoutMinutes) ? timeoutMinutes : DEFAULT_SESSION_TIMEOUT
  const isNever = setting === 'never'
  const timeoutMs = isNever ? 0 : parseInt(setting, 10) * 60 * 1000

  const timeoutRef = useRef<ReturnType<typeof setTimeout>>()
  const warningRef = useRef<ReturnType<typeof setTimeout>>()
  const countdownRef = useRef<ReturnType<typeof setInterval>>()
  const [showWarning, setShowWarning] = useState(false)
  const [secondsLeft, setSecondsLeft] = useState(0)

  const clearAll = useCallback(() => {
    if (timeoutRef.current) clearTimeout(timeoutRef.current)
    if (warningRef.current) clearTimeout(warningRef.current)
    if (countdownRef.current) clearInterval(countdownRef.current)
  }, [])

  const doLogout = useCallback(async () => {
    clearAll()
    await signOut().catch(() => {})
    window.location.href = '/login?reason=idle'
  }, [clearAll])

  const reset = useCallback(() => {
    clearAll()
    setShowWarning(false)
    if (isNever) return

    const warningDelay = Math.max(timeoutMs - WARNING_MS, 0)
    warningRef.current = setTimeout(() => {
      setSecondsLeft(Math.floor(WARNING_MS / 1000))
      setShowWarning(true)
      countdownRef.current = setInterval(() => {
        setSecondsLeft(s => (s <= 1 ? 0 : s - 1))
      }, 1000)
    }, warningDelay)

    timeoutRef.current = setTimeout(doLogout, timeoutMs)
  }, [clearAll, doLogout, isNever, timeoutMs])

  useEffect(() => {
    if (isNever) {
      clearAll()
      setShowWarning(false)
      return
    }

    const events: (keyof WindowEventMap)[] = ['mousedown', 'mousemove', 'keydown', 'touchstart', 'scroll']
    events.forEach(e => window.addEventListener(e, reset, { passive: true }))
    reset()

    return () => {
      events.forEach(e => window.removeEventListener(e, reset))
      clearAll()
    }
    // Re-arm from scratch whenever the effective timeout changes (e.g. the
    // setting is changed and the page reloads with a new value).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [timeoutMs, isNever])

  if (isNever) return null

  const mm = String(Math.floor(secondsLeft / 60)).padStart(2, '0')
  const ss = String(secondsLeft % 60).padStart(2, '0')

  return (
    <Modal
      open={showWarning}
      onClose={reset}
      title="You're about to be signed out"
      size="sm"
      footer={
        <div className="flex justify-end gap-2 w-full">
          <Button variant="secondary" onClick={doLogout}>Sign Out Now</Button>
          <Button onClick={reset}>Stay Signed In</Button>
        </div>
      }
    >
      <p className="text-sm text-[var(--color-text-secondary)]">
        You&apos;ve been inactive for a while. For your security, you&apos;ll be signed out in{' '}
        <span className="font-semibold text-[var(--color-text-primary)] tabular-nums">{mm}:{ss}</span>{' '}
        unless you stay active.
      </p>
    </Modal>
  )
}
