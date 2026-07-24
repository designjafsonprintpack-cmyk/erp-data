import { SettingsBackLink } from './SettingsBackLink'
import type { ReactNode } from 'react'

// Shared layout for all Settings pages — its only job is the
// "Back to Settings" link every sub-page was missing (there was no way
// back to the settings index without using the browser back button).
export default function SettingsLayout({ children }: { children: ReactNode }) {
  return (
    <div>
      <SettingsBackLink />
      {children}
    </div>
  )
}
