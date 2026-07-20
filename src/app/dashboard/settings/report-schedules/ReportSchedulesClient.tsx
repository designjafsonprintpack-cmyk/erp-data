'use client'
import { useState } from 'react'
import { Plus, Trash2, Mail } from 'lucide-react'
import { toast } from '@/components/ui/Toast'
import { ConfirmDialog } from '@/components/ui/Modal'

interface Schedule {
  id: string; report_type: string; frequency: string; recipients: string[]
  is_active: boolean; last_sent_at: string | null
}

const REPORT_TYPES = [
  { value: 'kpi', label: 'KPI Dashboard' },
  { value: 'monthly_production', label: 'Monthly Production' },
  { value: 'customer_sales', label: 'Customer Sales' },
  { value: 'financial', label: 'Financial' },
  { value: 'machines', label: 'Machine Performance' },
  { value: 'qc', label: 'Quality Control' },
  { value: 'overdue', label: 'Overdue Jobs' },
]

const inputCls = 'w-full h-9 px-3 rounded-md border text-sm bg-[var(--color-bg-elevated)] text-[var(--color-text-primary)] border-[var(--color-border)] focus:outline-none focus:border-[var(--color-accent)] focus:ring-1 focus:ring-[var(--color-accent)] transition-colors'

export default function ReportSchedulesClient({ initialSchedules }: { initialSchedules: Schedule[] }) {
  const [schedules, setSchedules] = useState(initialSchedules)
  const [form, setForm] = useState({ report_type: 'kpi', frequency: 'weekly', recipients: '' })
  const [loading, setLoading] = useState(false)
  const [deleteId, setDeleteId] = useState<string | null>(null)

  const create = async () => {
    const recipients = form.recipients.split(',').map(r => r.trim()).filter(Boolean)
    if (recipients.length === 0) { toast.error('Enter at least one recipient email'); return }
    setLoading(true)
    try {
      const res = await fetch('/api/v1/reports/schedules', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ report_type: form.report_type, frequency: form.frequency, recipients }),
      })
      if (!res.ok) { const e = await res.json(); throw new Error(e.error) }
      const { data } = await res.json()
      setSchedules(prev => [data, ...prev])
      setForm({ report_type: 'kpi', frequency: 'weekly', recipients: '' })
      toast.success('Schedule created')
    } catch (e: any) { toast.error(e.message || 'Failed') }
    finally { setLoading(false) }
  }

  const confirmDelete = async () => {
    if (!deleteId) return
    try {
      await fetch(`/api/v1/reports/schedules/${deleteId}`, { method: 'DELETE' })
      setSchedules(prev => prev.filter(s => s.id !== deleteId))
      toast.success('Schedule removed')
    } catch { toast.error('Failed') }
    finally { setDeleteId(null) }
  }

  return (
    <div className="space-y-4">
      <div className="rounded-xl border border-[var(--color-border)] bg-[var(--color-bg-secondary)] p-4 space-y-3">
        <p className="text-sm font-medium text-[var(--color-text-primary)]">New Schedule</p>
        <div className="grid grid-cols-2 gap-3">
          <select className={inputCls} value={form.report_type} onChange={e => setForm(p => ({ ...p, report_type: e.target.value }))}>
            {REPORT_TYPES.map(r => <option key={r.value} value={r.value}>{r.label}</option>)}
          </select>
          <select className={inputCls} value={form.frequency} onChange={e => setForm(p => ({ ...p, frequency: e.target.value }))}>
            <option value="daily">Daily</option>
            <option value="weekly">Weekly</option>
            <option value="monthly">Monthly</option>
          </select>
        </div>
        <input className={inputCls} value={form.recipients} onChange={e => setForm(p => ({ ...p, recipients: e.target.value }))}
          placeholder="recipient1@example.com, recipient2@example.com" />
        <button onClick={create} disabled={loading}
          className="flex items-center gap-1.5 px-4 h-9 rounded-md bg-[var(--color-accent)] text-white text-sm font-medium hover:bg-[var(--color-accent-hover)] disabled:opacity-50 transition-colors">
          <Plus size={14} /> Add Schedule
        </button>
      </div>

      <div className="rounded-xl border border-[var(--color-border)] bg-[var(--color-bg-secondary)] overflow-hidden">
        {schedules.length === 0 ? (
          <div className="p-8 text-center">
            <Mail size={24} className="text-[var(--color-text-muted)] opacity-30 mx-auto mb-2" />
            <p className="text-sm text-[var(--color-text-muted)]">No scheduled reports yet.</p>
          </div>
        ) : (
          <div className="divide-y divide-[var(--color-border-subtle)]">
            {schedules.map(s => (
              <div key={s.id} className="flex items-center justify-between px-4 py-3">
                <div>
                  <p className="text-sm font-medium text-[var(--color-text-primary)] capitalize">
                    {REPORT_TYPES.find(r => r.value === s.report_type)?.label || s.report_type} · <span className="capitalize">{s.frequency}</span>
                  </p>
                  <p className="text-xs text-[var(--color-text-muted)] mt-0.5">
                    {s.recipients.join(', ')}
                    {s.last_sent_at ? ` · Last sent ${new Date(s.last_sent_at).toLocaleDateString('en-PK')}` : ' · Not sent yet'}
                  </p>
                </div>
                <button onClick={() => setDeleteId(s.id)}
                  className="w-8 h-8 flex items-center justify-center rounded-md text-[var(--color-text-muted)] hover:bg-[var(--color-danger)]/10 hover:text-[var(--color-danger)] transition-colors">
                  <Trash2 size={13} />
                </button>
              </div>
            ))}
          </div>
        )}
      </div>

      <ConfirmDialog open={!!deleteId} onClose={() => setDeleteId(null)} onConfirm={confirmDelete}
        title="Remove Schedule" message="Stop sending this scheduled report?" loading={false} />
    </div>
  )
}
