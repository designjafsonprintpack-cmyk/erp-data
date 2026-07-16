export default function NotificationsSettingsPage() {
  return (
    <div className="space-y-6 max-w-3xl">
      <div>
        <h1 className="text-2xl font-bold text-[var(--color-text-primary)]">Notification Settings</h1>
        <p className="text-sm text-[var(--color-text-muted)] mt-0.5">Configure alert rules and notification preferences</p>
      </div>
      <div className="rounded-xl border border-[var(--color-border)] bg-[var(--color-bg-secondary)] p-8">
        <div className="space-y-4">
          {[
            { label: 'Job created', desc: 'When a new job is created', enabled: true },
            { label: 'Job completed', desc: 'When a job reaches dispatch', enabled: true },
            { label: 'Job on hold', desc: 'When a job is put on hold', enabled: true },
            { label: 'Low board stock', desc: 'When board stock falls below minimum', enabled: true },
            { label: 'Material shortage', desc: 'When store material falls below minimum', enabled: false },
            { label: 'Delayed jobs', desc: 'When a job delivery date passes', enabled: true },
          ].map(item => (
            <div key={item.label} className="flex items-center justify-between py-3 border-b border-[var(--color-border-subtle)] last:border-0">
              <div>
                <p className="text-sm font-medium text-[var(--color-text-primary)]">{item.label}</p>
                <p className="text-xs text-[var(--color-text-muted)] mt-0.5">{item.desc}</p>
              </div>
              <div className={`w-10 h-5 rounded-full transition-colors cursor-pointer ${item.enabled ? 'bg-[var(--color-success)]' : 'bg-[var(--color-border)]'}`}>
                <div className={`w-4 h-4 rounded-full bg-white shadow-sm transition-transform mt-0.5 ${item.enabled ? 'translate-x-5' : 'translate-x-0.5'}`} />
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
