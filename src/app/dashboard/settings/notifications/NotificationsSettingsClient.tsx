'use client'
import { useState } from 'react'
import { Save, MessageCircle, Mail } from 'lucide-react'
import { toast } from '@/components/ui/Toast'

const CHANNELS: { key: string; label: string; desc: string; icon: 'whatsapp' | 'email' }[] = [
  { key: 'dispatch_sms',    label: 'Dispatch — WhatsApp', desc: 'Send a WhatsApp message to the customer when an order is dispatched', icon: 'whatsapp' },
  { key: 'dispatch_email',  label: 'Dispatch — Email',    desc: 'Email the customer when an order is dispatched', icon: 'email' },
  { key: 'quotation_email', label: 'Quotation — Email',   desc: 'Email the customer their approval link when a quotation is sent', icon: 'email' },
  { key: 'invoice_email',   label: 'Invoice — Email',     desc: 'Email the customer a copy when an invoice is sent', icon: 'email' },
]

export default function NotificationsSettingsClient({ initialSettings }: { initialSettings: Record<string, string> }) {
  const [settings, setSettings] = useState<Record<string, string>>(initialSettings)
  const [loading, setLoading] = useState(false)

  const toggle = (key: string) => {
    setSettings(prev => ({ ...prev, [key]: prev[key] === 'true' ? 'false' : 'true' }))
  }

  const save = async () => {
    setLoading(true)
    try {
      const res = await fetch('/api/v1/admin/settings', {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(settings),
      })
      if (!res.ok) { const e = await res.json(); throw new Error(e.error) }
      toast.success('Notification settings updated')
    } catch (e: any) { toast.error(e.message || 'Failed to save') }
    finally { setLoading(false) }
  }

  return (
    <div className="rounded-xl border border-[var(--color-border)] bg-[var(--color-bg-secondary)] overflow-hidden">
      <div className="divide-y divide-[var(--color-border-subtle)]">
        {CHANNELS.map(c => {
          const enabled = settings[c.key] === 'true'
          return (
            <div key={c.key} className="flex items-center justify-between px-5 py-4">
              <div className="flex items-center gap-3">
                {c.icon === 'whatsapp'
                  ? <MessageCircle size={16} className="text-[var(--color-success)] flex-shrink-0" />
                  : <Mail size={16} className="text-[var(--color-info)] flex-shrink-0" />}
                <div>
                  <p className="text-sm font-medium text-[var(--color-text-primary)]">{c.label}</p>
                  <p className="text-xs text-[var(--color-text-muted)] mt-0.5">{c.desc}</p>
                </div>
              </div>
              <button
                onClick={() => toggle(c.key)}
                className={`w-10 h-5 rounded-full transition-colors flex-shrink-0 ${enabled ? 'bg-[var(--color-success)]' : 'bg-[var(--color-border)]'}`}
              >
                <div className={`w-4 h-4 rounded-full bg-white shadow-sm transition-transform mt-0.5 ${enabled ? 'translate-x-5' : 'translate-x-0.5'}`} />
              </button>
            </div>
          )
        })}
      </div>
      <div className="px-5 py-4 border-t border-[var(--color-border)] bg-[var(--color-bg-elevated)]/50 flex justify-end">
        <button onClick={save} disabled={loading}
          className="flex items-center gap-2 px-4 h-9 rounded-md bg-[var(--color-accent)] text-white text-sm font-medium hover:bg-[var(--color-accent-hover)] disabled:opacity-50 transition-colors">
          <Save size={15} /> {loading ? 'Saving…' : 'Save Settings'}
        </button>
      </div>
    </div>
  )
}
