import CommandCenterClient from './CommandCenterClient'

export default function CommandCenterPage() {
  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-2xl font-bold text-[var(--color-text-primary)]">Production Command Center</h1>
        <p className="text-sm text-[var(--color-text-muted)] mt-0.5">Live view of every machine, blocked jobs, and print output</p>
      </div>
      <CommandCenterClient />
    </div>
  )
}
