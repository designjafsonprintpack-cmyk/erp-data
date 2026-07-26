import SettingsClient from './SettingsClient'

// The section list itself lives in SettingsClient — each entry carries a
// lucide icon component, and a server component cannot hand a function to a
// client one.
export default function SettingsPage() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-[var(--color-text-primary)]">Settings</h1>
        <p className="text-sm text-[var(--color-text-muted)] mt-0.5">Configure every aspect of your ERP system</p>
      </div>
      <SettingsClient />
    </div>
  )
}
