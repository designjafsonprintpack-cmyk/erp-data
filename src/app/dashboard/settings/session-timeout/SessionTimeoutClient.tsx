'use client'
import { useState } from 'react'
import { Save, Clock } from 'lucide-react'
import { toast } from '@/components/ui/Toast'
import { SESSION_TIMEOUT_KEY, SESSION_TIMEOUT_OPTIONS, type SessionTimeoutValue } from '@/config/sessionTimeout'

const selectCls = 'w-full h-10 px-3 rounded-md border text-sm bg-[var(--color-bg-elevated)] text-[var(--color-text-primary)] border-[var(--color-border)] focus:outline-none focus:border-[var(--color-accent)] focus:ring-1 focus:ring-[var(--color-accent)] transition-colors'

export default function SessionTimeoutClient({ initialValue }: { initialValue: SessionTimeoutValue }) {
  const [value, setValue] = useState<SessionTimeoutValue>(initialValue)
  const [loading, setLoading] = useState(false)

  const save = async () => {
    setLoading(true)
    try {
      const res = await fetch('/api/v1/admin/settings', {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ [SESSION_TIMEOUT_KEY]: value }),
      })
      if (!res.ok) { const e = await res.json(); throw new Error(e.error) }
      toast.success('Session timeout updated — takes effect on next page load')
    } catch (e: any) {
      toast.error(e.message || 'Failed to save')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="rounded-xl border border-[var(--color-border)] bg-[var(--color-bg-secondary)] overflow-hidden">
      <div className="px-5 py-4 flex items-center gap-3">
        <Clock size={16} className="text-[var(--color-text-secondary)] flex-shrink-0" />
        <div className="flex-1">
          <label className="block text-sm font-medium text-[var(--color-text-primary)] mb-1.5">
            Sign out after
          </label>
          <select
            value={value}
            onChange={e => setValue(e.target.value as SessionTimeoutValue)}
            className={selectCls}
          >
            {SESSION_TIMEOUT_OPTIONS.map(opt => (
              <option key={opt.value} value={opt.value}>{opt.label}</option>
            ))}
          </select>
        </div>
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
