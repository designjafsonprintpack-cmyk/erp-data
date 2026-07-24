'use client'
import { useEffect } from 'react'
import { AlertTriangle, RefreshCw } from 'lucide-react'

// Route-level error boundary for every /dashboard page. Before this
// existed, a failed server fetch rendered Next's unstyled default error
// with no way back — this gives the user a retry instead of a dead end.
export default function DashboardError({
  error,
  reset,
}: {
  error: Error & { digest?: string }
  reset: () => void
}) {
  useEffect(() => {
    // Log for debugging — the digest links to the server-side error in
    // Vercel's logs when the real message is redacted in production.
    console.error('Dashboard route error:', error)
  }, [error])

  return (
    <div className="min-h-[60vh] flex items-center justify-center">
      <div className="rounded-xl border border-[var(--color-border)] bg-[var(--color-bg-secondary)] p-10 text-center max-w-md">
        <AlertTriangle size={36} className="text-[var(--color-danger)] mx-auto mb-4" />
        <h2 className="text-lg font-semibold text-[var(--color-text-primary)]">Something went wrong</h2>
        <p className="text-sm text-[var(--color-text-muted)] mt-1.5">
          This page failed to load. It&apos;s usually temporary — try again, and if it keeps happening, note what you were doing and contact the administrator.
        </p>
        {error.digest && (
          <p className="text-xs text-[var(--color-text-muted)] mt-2 font-mono">Ref: {error.digest}</p>
        )}
        <button
          onClick={reset}
          className="mt-5 inline-flex items-center gap-2 px-4 h-10 rounded-md bg-[var(--color-accent)] text-white text-sm font-medium hover:bg-[var(--color-accent-hover)] transition-colors"
        >
          <RefreshCw size={14} /> Try again
        </button>
      </div>
    </div>
  )
}
