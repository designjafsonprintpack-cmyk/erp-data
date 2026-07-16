'use client'
import { useState } from 'react'
import { Settings, Shield, Building2, Activity, Save, ChevronRight } from 'lucide-react'
import { cn } from '@/lib/utils/cn'
import { toast } from '@/components/ui/Toast'
import { formatDateTime } from '@/lib/utils/format'

interface AuditRow { id: string; table_name: string; action: string; changed_at: string; changed_by: string | null; record_id?: string | null }
interface Company { id: string; name: string; address: string | null; branches?: { id: string; name: string; is_default: boolean }[] }

const inputCls = 'w-full h-9 px-3 rounded-md border text-sm bg-[var(--color-bg-elevated)] text-[var(--color-text-primary)] border-[var(--color-border)] placeholder:text-[var(--color-text-muted)] focus:outline-none focus:border-[var(--color-accent)] focus:ring-1 focus:ring-[var(--color-accent)] transition-colors'

const ACTION_COLOR: Record<string, string> = {
  INSERT: 'text-[var(--color-success)] bg-[var(--color-success)]/10',
  UPDATE: 'text-[var(--color-warning)] bg-[var(--color-warning)]/10',
  DELETE: 'text-[var(--color-danger)] bg-[var(--color-danger)]/10',
}

type Tab = 'settings' | 'company' | 'audit'

export default function AdminClient({ settings: initialSettings, settingsFull, auditLog, company }: {
  settings: Record<string, string>; settingsFull: any[]
  auditLog: AuditRow[]; company: Company | null
}) {
  const [tab, setTab] = useState<Tab>('settings')
  const [settings, setSettings] = useState(initialSettings)
  const [dirty, setDirty] = useState<Record<string, string>>({})
  const [loading, setLoading] = useState(false)
  const [auditFilter, setAuditFilter] = useState('')

  const set = (key: string, val: string) => {
    setSettings(p => ({ ...p, [key]: val }))
    setDirty(p => ({ ...p, [key]: val }))
  }

  const saveSettings = async () => {
    if (!Object.keys(dirty).length) { toast.error('No changes to save'); return }
    setLoading(true)
    try {
      const res = await fetch('/api/v1/admin/settings', {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(dirty),
      })
      if (!res.ok) throw new Error()
      setDirty({})
      toast.success('Settings saved')
    } catch { toast.error('Failed to save') }
    finally { setLoading(false) }
  }

  // Group settings by category
  const grouped = settingsFull.reduce((acc, s) => {
    if (!acc[s.category]) acc[s.category] = []
    acc[s.category].push(s)
    return acc
  }, {} as Record<string, any[]>)

  const CATEGORY_LABELS: Record<string, string> = {
    general:      '🏢 General',
    finance:      '💰 Finance',
    production:   '⚙️ Production',
    dispatch:     '🚚 Dispatch',
    notifications:'🔔 Notifications',
  }

  const filteredAudit = auditFilter
    ? auditLog.filter(a => a.table_name.includes(auditFilter) || a.action.includes(auditFilter.toUpperCase()))
    : auditLog

  return (
    <div className="space-y-4">
      {/* Tabs */}
      <div className="flex items-center gap-1">
        {([
          ['settings', 'System Settings', Settings],
          ['company',  'Company Info',    Building2],
          ['audit',    'Audit Trail',     Activity],
        ] as const).map(([key, label, Icon]) => (
          <button key={key} onClick={() => setTab(key)}
            className={cn('flex items-center gap-1.5 px-4 h-8 rounded-md text-sm font-medium border transition-all',
              tab === key ? 'bg-[var(--color-accent)] text-white border-transparent' : 'border-[var(--color-border)] text-[var(--color-text-secondary)] hover:text-[var(--color-text-primary)]')}>
            <Icon size={13} />{label}
          </button>
        ))}
      </div>

      {/* ── SETTINGS TAB ─────────────────────────────────────────────────────── */}
      {tab === 'settings' && (
        <div className="space-y-4">
          {Object.entries(grouped).map(([category, items]) => (
            <div key={category} className="rounded-xl border border-[var(--color-border)] bg-[var(--color-bg-secondary)] overflow-hidden">
              <div className="px-5 py-3.5 border-b border-[var(--color-border)] bg-[var(--color-bg-elevated)]">
                <h2 className="text-sm font-semibold text-[var(--color-text-primary)]">
                  {CATEGORY_LABELS[category] || category}
                </h2>
              </div>
              <div className="p-5 grid grid-cols-2 gap-4">
                {(items as any[]).map((item: any) => (
                  <div key={item.key} className="space-y-1.5">
                    <label className="text-sm font-medium text-[var(--color-text-primary)] capitalize">
                      {item.key.replace(/_/g, ' ')}
                      {dirty[item.key] !== undefined && (
                        <span className="ml-1.5 text-xs text-[var(--color-warning)]">●</span>
                      )}
                    </label>
                    {['true','false'].includes(item.value) ? (
                      <div className="flex items-center gap-3">
                        {(['true','false'] as const).map(v => (
                          <button key={v} onClick={() => set(item.key, v)}
                            className={cn('px-3 h-9 rounded-md border text-sm font-medium transition-all capitalize',
                              settings[item.key] === v ? 'bg-[var(--color-accent)] text-white border-transparent' : 'border-[var(--color-border)] text-[var(--color-text-secondary)] hover:bg-[var(--color-bg-elevated)]')}>
                            {v === 'true' ? 'Enabled' : 'Disabled'}
                          </button>
                        ))}
                      </div>
                    ) : (
                      <input className={inputCls} value={settings[item.key] ?? ''} onChange={e => set(item.key, e.target.value)} />
                    )}
                    {item.description && (
                      <p className="text-xs text-[var(--color-text-muted)]">{item.description}</p>
                    )}
                  </div>
                ))}
              </div>
            </div>
          ))}

          <div className="flex items-center justify-between">
            {Object.keys(dirty).length > 0 && (
              <p className="text-sm text-[var(--color-warning)]">{Object.keys(dirty).length} unsaved change{Object.keys(dirty).length !== 1 ? 's' : ''}</p>
            )}
            <button onClick={saveSettings} disabled={loading || !Object.keys(dirty).length}
              className="flex items-center gap-2 px-5 h-9 rounded-md bg-[var(--color-accent)] text-white text-sm font-medium hover:bg-[var(--color-accent-hover)] disabled:opacity-50 transition-colors ml-auto">
              <Save size={14} /> {loading ? 'Saving…' : 'Save Settings'}
            </button>
          </div>
        </div>
      )}

      {/* ── COMPANY TAB ──────────────────────────────────────────────────────── */}
      {tab === 'company' && (
        <div className="space-y-4">
          {/* Company info */}
          <div className="rounded-xl border border-[var(--color-border)] bg-[var(--color-bg-secondary)] overflow-hidden">
            <div className="px-5 py-3.5 border-b border-[var(--color-border)] bg-[var(--color-bg-elevated)]">
              <h2 className="text-sm font-semibold text-[var(--color-text-primary)]">Company Information</h2>
            </div>
            <div className="p-5 grid grid-cols-2 gap-5">
              {[
                { label: 'Company Name',  value: company?.name || settings['company_name'] || '—' },
                { label: 'Company ID',    value: company?.id || '—', mono: true },
                { label: 'Address',       value: company?.address || settings['company_address'] || '—' },
                { label: 'NTN',           value: settings['company_ntn'] || '—' },
                { label: 'STRN',          value: settings['company_strn'] || '—' },
                { label: 'Phone',         value: settings['company_phone'] || '—' },
              ].map(f => (
                <div key={f.label}>
                  <p className="text-xs text-[var(--color-text-muted)] mb-0.5">{f.label}</p>
                  <p className={cn('text-sm text-[var(--color-text-primary)]', (f as any).mono && 'font-mono text-xs')}>{f.value}</p>
                </div>
              ))}
            </div>
          </div>

          {/* Branches */}
          <div className="rounded-xl border border-[var(--color-border)] bg-[var(--color-bg-secondary)] overflow-hidden">
            <div className="px-5 py-3.5 border-b border-[var(--color-border)] bg-[var(--color-bg-elevated)]">
              <h2 className="text-sm font-semibold text-[var(--color-text-primary)]">Branches ({company?.branches?.length || 0})</h2>
            </div>
            <div className="divide-y divide-[var(--color-border-subtle)]">
              {(company?.branches || []).map(branch => (
                <div key={branch.id} className="flex items-center justify-between px-5 py-3.5">
                  <div>
                    <p className="text-sm font-medium text-[var(--color-text-primary)]">{branch.name}</p>
                    <p className="text-xs font-mono text-[var(--color-text-muted)]">{branch.id}</p>
                  </div>
                  {branch.is_default && (
                    <span className="text-xs px-2.5 py-1 rounded-full border font-medium text-[var(--color-accent)] bg-[var(--color-accent)]/10 border-[var(--color-accent)]/20">
                      Default
                    </span>
                  )}
                </div>
              ))}
            </div>
          </div>

          {/* Permission matrix link */}
          <div className="rounded-xl border border-[var(--color-border)] bg-[var(--color-bg-secondary)] p-5">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm font-semibold text-[var(--color-text-primary)]">Permission Matrix</p>
                <p className="text-xs text-[var(--color-text-muted)] mt-0.5">Configure role-based access for all modules</p>
              </div>
              <a href="/dashboard/settings/permissions"
                className="flex items-center gap-1.5 px-3 h-8 rounded-md border border-[var(--color-border)] text-sm text-[var(--color-text-secondary)] hover:bg-[var(--color-bg-elevated)] transition-colors">
                Open <ChevronRight size={13} />
              </a>
            </div>
          </div>
        </div>
      )}

      {/* ── AUDIT TRAIL TAB ───────────────────────────────────────────────────── */}
      {tab === 'audit' && (
        <div className="space-y-3">
          <input value={auditFilter} onChange={e => setAuditFilter(e.target.value)}
            placeholder="Filter by table name or action…"
            className="w-full max-w-sm h-9 px-3 rounded-md border border-[var(--color-border)] bg-[var(--color-bg-elevated)] text-sm text-[var(--color-text-primary)] placeholder:text-[var(--color-text-muted)] focus:outline-none focus:border-[var(--color-accent)] focus:ring-1 focus:ring-[var(--color-accent)] transition-colors" />

          <div className="rounded-xl border border-[var(--color-border)] bg-[var(--color-bg-secondary)] overflow-hidden">
            <div className="grid grid-cols-12 gap-3 px-5 py-2.5 bg-[var(--color-bg-elevated)] border-b border-[var(--color-border)] text-xs font-semibold text-[var(--color-text-muted)] uppercase tracking-wider">
              <div className="col-span-2">Action</div>
              <div className="col-span-3">Table</div>
              <div className="col-span-4">Record ID</div>
              <div className="col-span-3 text-right">When</div>
            </div>

            {filteredAudit.length === 0 ? (
              <div className="p-12 text-center">
                <Activity size={28} className="text-[var(--color-text-muted)] opacity-30 mx-auto mb-2" />
                <p className="text-sm text-[var(--color-text-muted)]">No audit records found</p>
              </div>
            ) : (
              <div className="divide-y divide-[var(--color-border-subtle)] max-h-[600px] overflow-y-auto">
                {filteredAudit.map((row, idx) => (
                  <div key={row.id} className={cn('grid grid-cols-12 gap-3 px-5 py-3 items-center text-sm', idx % 2 === 1 && 'bg-[var(--color-bg-elevated)]/15')}>
                    <div className="col-span-2">
                      <span className={cn('text-xs px-2 py-0.5 rounded font-semibold', ACTION_COLOR[row.action] || 'text-[var(--color-text-muted)] bg-[var(--color-bg-elevated)]')}>
                        {row.action}
                      </span>
                    </div>
                    <div className="col-span-3 text-xs font-mono text-[var(--color-text-secondary)]">{row.table_name}</div>
                    <div className="col-span-4 text-xs font-mono text-[var(--color-text-muted)] truncate">{row.record_id}</div>
                    <div className="col-span-3 text-right text-xs text-[var(--color-text-muted)]">{formatDateTime(row.changed_at)}</div>
                  </div>
                ))}
              </div>
            )}
          </div>
          <p className="text-xs text-[var(--color-text-muted)] text-right">Showing last {filteredAudit.length} audit events</p>
        </div>
      )}
    </div>
  )
}
