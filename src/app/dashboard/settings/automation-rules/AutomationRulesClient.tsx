'use client'
import { useState } from 'react'
import { Bell, Mail, UserPlus, Check, X, History, Power } from 'lucide-react'
import { cn } from '@/lib/utils/cn'
import { toast } from '@/components/ui/Toast'
import { Modal } from '@/components/ui/Modal'
import { formatDateTime, formatTimeAgo } from '@/lib/utils/format'

interface Rule {
  id: string; rule_type: string; name: string; is_active: boolean
  config: Record<string, any>; last_run_at: string | null; created_at: string
}
interface RunLog {
  id: string; triggered_for: string | null; action_taken: string; created_at: string
}

const RULE_DEFS = [
  {
    type: 'job_on_hold_duration', icon: Bell,
    title: 'Job Stuck On Hold',
    desc: 'Notify superadmins when a job has been on hold longer than a set number of days.',
    defaultName: 'Job on hold too long',
    hasThreshold: true,
  },
  {
    type: 'invoice_overdue', icon: Mail,
    title: 'Overdue Invoice Reminder',
    desc: 'Automatically email the customer a payment reminder for any invoice past its due date with a balance owing.',
    defaultName: 'Overdue invoice reminder',
    hasThreshold: false,
  },
  {
    type: 'new_customer', icon: UserPlus,
    title: 'New Customer Alert',
    desc: 'Notify everyone in the Sales department when a new customer is added.',
    defaultName: 'New customer notification',
    hasThreshold: false,
  },
] as const

const inputCls = 'h-9 px-3 rounded-md border text-sm bg-[var(--color-bg-elevated)] text-[var(--color-text-primary)] border-[var(--color-border)] focus:outline-none focus:border-[var(--color-accent)] focus:ring-1 focus:ring-[var(--color-accent)] transition-colors'

export default function AutomationRulesClient({ initialRules }: { initialRules: Rule[] }) {
  const [rules, setRules] = useState(initialRules)
  const [saving, setSaving] = useState<string | null>(null)
  const [thresholdDraft, setThresholdDraft] = useState<Record<string, string>>({})
  const [logModal, setLogModal] = useState<Rule | null>(null)
  const [logs, setLogs] = useState<RunLog[]>([])
  const [logLoading, setLogLoading] = useState(false)

  const findRule = (type: string) => rules.find(r => r.rule_type === type) || null

  const toggle = async (def: typeof RULE_DEFS[number]) => {
    const existing = findRule(def.type)
    const nextActive = existing ? !existing.is_active : true
    const threshold = thresholdDraft[def.type] ?? existing?.config?.threshold_days ?? 2

    setSaving(def.type)
    try {
      const res = await fetch('/api/v1/automation-rules', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          rule_type: def.type,
          name: existing?.name || def.defaultName,
          is_active: nextActive,
          config: def.hasThreshold ? { threshold_days: parseInt(String(threshold)) || 2 } : {},
        }),
      })
      if (!res.ok) { const e = await res.json(); throw new Error(e.error) }
      const { data } = await res.json()
      setRules(prev => existing ? prev.map(r => r.rule_type === def.type ? data : r) : [...prev, data])
      toast.success(nextActive ? `${def.title} enabled` : `${def.title} paused`)
    } catch (e: any) { toast.error(e.message || 'Failed to save') }
    finally { setSaving(null) }
  }

  const saveThreshold = async (def: typeof RULE_DEFS[number]) => {
    const existing = findRule(def.type)
    const threshold = thresholdDraft[def.type] ?? existing?.config?.threshold_days ?? 2
    setSaving(def.type)
    try {
      const res = await fetch('/api/v1/automation-rules', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          rule_type: def.type, name: existing?.name || def.defaultName,
          is_active: existing?.is_active ?? false,
          config: { threshold_days: parseInt(String(threshold)) || 2 },
        }),
      })
      if (!res.ok) throw new Error()
      const { data } = await res.json()
      setRules(prev => existing ? prev.map(r => r.rule_type === def.type ? data : r) : [...prev, data])
      toast.success('Threshold saved')
    } catch { toast.error('Failed to save') }
    finally { setSaving(null) }
  }

  const openLog = async (rule: Rule) => {
    setLogModal(rule); setLogLoading(true); setLogs([])
    try {
      const res = await fetch(`/api/v1/automation-rules/${rule.id}/runs`)
      const json = await res.json()
      setLogs(json.data ?? [])
    } catch { toast.error('Failed to load log') }
    finally { setLogLoading(false) }
  }

  return (
    <div className="space-y-4">
      {RULE_DEFS.map(def => {
        const rule = findRule(def.type)
        const isActive = rule?.is_active ?? false
        return (
          <div key={def.type} className="rounded-xl border border-[var(--color-border)] bg-[var(--color-bg-secondary)] p-4">
            <div className="flex items-start gap-3">
              <div className={cn('w-10 h-10 rounded-lg flex items-center justify-center flex-shrink-0',
                isActive ? 'bg-[var(--color-success)]/10' : 'bg-[var(--color-bg-elevated)]')}>
                <def.icon size={18} className={isActive ? 'text-[var(--color-success)]' : 'text-[var(--color-text-muted)]'} />
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <h3 className="text-sm font-semibold text-[var(--color-text-primary)]">{def.title}</h3>
                  <span className={cn('text-xs px-1.5 py-0.5 rounded', isActive ? 'bg-[var(--color-success)]/10 text-[var(--color-success)]' : 'bg-[var(--color-bg-elevated)] text-[var(--color-text-muted)]')}>
                    {isActive ? 'Active' : 'Paused'}
                  </span>
                </div>
                <p className="text-xs text-[var(--color-text-muted)] mt-0.5">{def.desc}</p>
                {rule?.last_run_at && (
                  <p className="text-[10px] text-[var(--color-text-muted)] mt-1">Last checked {formatTimeAgo(rule.last_run_at)}</p>
                )}
                {def.hasThreshold && (
                  <div className="flex items-center gap-2 mt-2.5">
                    <label className="text-xs text-[var(--color-text-secondary)]">Threshold:</label>
                    <input type="number" min={1} className={cn(inputCls, 'w-20 h-8')}
                      value={thresholdDraft[def.type] ?? rule?.config?.threshold_days ?? 2}
                      onChange={e => setThresholdDraft(p => ({ ...p, [def.type]: e.target.value }))} />
                    <span className="text-xs text-[var(--color-text-muted)]">days</span>
                    <button onClick={() => saveThreshold(def)} disabled={saving === def.type}
                      className="text-xs text-[var(--color-accent)] hover:underline disabled:opacity-50">Save</button>
                  </div>
                )}
              </div>
              <div className="flex items-center gap-1.5 flex-shrink-0">
                {rule && (
                  <button onClick={() => openLog(rule)} title="Run log"
                    className="w-8 h-8 flex items-center justify-center rounded-md border border-[var(--color-border)] text-[var(--color-text-muted)] hover:text-[var(--color-text-primary)] hover:bg-[var(--color-bg-elevated)] transition-colors">
                    <History size={13} />
                  </button>
                )}
                <button onClick={() => toggle(def)} disabled={saving === def.type}
                  className={cn('flex items-center gap-1.5 px-3 h-8 rounded-md border text-xs font-medium transition-colors disabled:opacity-50',
                    isActive ? 'border-[var(--color-danger)]/30 text-[var(--color-danger)] hover:bg-[var(--color-danger)]/10' : 'bg-[var(--color-accent)] text-white border-transparent hover:bg-[var(--color-accent-hover)]')}>
                  <Power size={12} /> {isActive ? 'Pause' : 'Enable'}
                </button>
              </div>
            </div>
          </div>
        )
      })}

      <Modal open={!!logModal} onClose={() => setLogModal(null)} title={logModal ? `Run Log — ${logModal.name}` : ''} size="lg">
        {logLoading ? (
          <p className="text-sm text-[var(--color-text-muted)] text-center py-8">Loading…</p>
        ) : logs.length === 0 ? (
          <p className="text-sm text-[var(--color-text-muted)] text-center py-8">No runs logged yet.</p>
        ) : (
          <div className="max-h-96 overflow-y-auto divide-y divide-[var(--color-border-subtle)]">
            {logs.map(l => (
              <div key={l.id} className="py-2.5">
                <p className="text-sm text-[var(--color-text-primary)]">{l.triggered_for || '—'}</p>
                <p className="text-xs text-[var(--color-text-muted)]">{l.action_taken} · {formatDateTime(l.created_at)}</p>
              </div>
            ))}
          </div>
        )}
      </Modal>
    </div>
  )
}
