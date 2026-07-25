'use client'
import Link from 'next/link'
import { Monitor, ArrowLeft } from 'lucide-react'
import type { ReactNode } from 'react'

interface DesktopOnlyProps {
  children: ReactNode
  /** What this screen is, in the user's words — "Quotation costing". */
  title: string
  /** Why it needs a bigger screen. One sentence. */
  reason?: string
  /**
   * A mobile-appropriate alternative — usually a read-only view of the same
   * record. Shown instead of the guard card when provided, so the user still
   * gets something useful rather than a dead end.
   */
  fallback?: ReactNode
  /** Where "Go back" leads. Defaults to the dashboard. */
  backHref?: string
}

/**
 * Renders `children` at lg and above; below that, either `fallback` or a plain
 * explanation.
 *
 * Some screens genuinely belong on a large display — the quotation costing
 * grid, the permission matrix, the workflow builder, the financial reports.
 * Squeezing them onto a phone produces something that technically renders and
 * is impossible to use correctly, which is worse than saying so. Every
 * commercial print MIS draws this line somewhere; the honest version is a
 * clear message plus a usable alternative, not a broken layout.
 *
 * This is a CSS-visibility guard, not a route guard: `children` still mount on
 * mobile, so any data they load is loaded. That is deliberate — it keeps the
 * component free of hydration mismatches and makes it safe to wrap an existing
 * page without touching its data flow.
 */
export function DesktopOnly({ children, title, reason, fallback, backHref = '/dashboard' }: DesktopOnlyProps) {
  return (
    <>
      <div className="hidden lg:block">{children}</div>

      <div className="lg:hidden">
        {fallback ?? (
          <div className="flex flex-col items-center justify-center text-center py-14 px-6">
            <div className="w-14 h-14 rounded-2xl bg-[var(--color-bg-elevated)] border border-[var(--color-border)] flex items-center justify-center mb-4">
              <Monitor size={24} className="text-[var(--color-text-muted)]" />
            </div>
            <h2 className="text-base font-semibold text-[var(--color-text-primary)] mb-1.5">
              {title} works best on a larger screen
            </h2>
            <p className="text-sm text-[var(--color-text-secondary)] max-w-xs mb-6">
              {reason ?? 'This screen has too many columns to be usable on a phone. Open it on a desktop or a tablet in landscape.'}
            </p>
            <Link
              href={backHref}
              className="inline-flex items-center gap-2 px-4 h-11 rounded-md border border-[var(--color-border)] text-sm font-medium text-[var(--color-text-secondary)] hover:bg-[var(--color-bg-elevated)] transition-colors"
            >
              <ArrowLeft size={15} /> Go back
            </Link>
          </div>
        )}
      </div>
    </>
  )
}

export default DesktopOnly
