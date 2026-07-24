'use client'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { ArrowLeft } from 'lucide-react'

// Rendered by the settings layout on every settings page. Shows a back
// link to the Settings index on sub-pages only — hidden on the index
// itself. Client component because the layout is shared and only the
// current pathname tells us which case we're in.
export function SettingsBackLink() {
  const pathname = usePathname()
  if (pathname === '/dashboard/settings') return null

  return (
    <Link
      href="/dashboard/settings"
      className="inline-flex items-center gap-1.5 text-sm text-[var(--color-text-secondary)] hover:text-[var(--color-text-primary)] transition-colors mb-4"
    >
      <ArrowLeft size={15} /> Back to Settings
    </Link>
  )
}

export default SettingsBackLink
