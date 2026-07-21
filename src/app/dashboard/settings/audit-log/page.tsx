import { createSupabaseServerClient } from '@/lib/supabase/server'
import { formatDateTime } from '@/lib/utils/format'

// updated_at changes on literally every UPDATE regardless of what the user
// actually changed — including it in the diff would add a noise line to
// every single row and hide the fields that actually matter.
const DIFF_NOISE_FIELDS = new Set(['updated_at'])

function formatDiffValue(value: unknown): string {
  if (value === null || value === undefined) return '—'
  if (typeof value === 'object') return JSON.stringify(value)
  return String(value)
}

/**
 * Computes the field-level diff between an audit_log row's old_values and
 * new_values JSONB columns — both already captured by the log_audit_event()
 * trigger (migration 003) on every UPDATE, just never surfaced in the UI
 * until now. Returns only fields whose value actually changed.
 */
function getFieldDiff(oldValues: Record<string, any> | null, newValues: Record<string, any> | null) {
  if (!oldValues || !newValues) return []
  const keys = Array.from(new Set(Object.keys(oldValues).concat(Object.keys(newValues))))
  const diff: { field: string; oldValue: string; newValue: string }[] = []
  for (const key of keys) {
    if (DIFF_NOISE_FIELDS.has(key)) continue
    const oldVal = oldValues[key]
    const newVal = newValues[key]
    if (JSON.stringify(oldVal) === JSON.stringify(newVal)) continue
    diff.push({ field: key, oldValue: formatDiffValue(oldVal), newValue: formatDiffValue(newVal) })
  }
  return diff
}

export default async function AuditLogPage() {
  const supabase = createSupabaseServerClient()
  const { data } = await supabase
    .from('audit_log' as any)
    .select('*')
    .order('changed_at', { ascending: false })
    .limit(100)

  const logs = (data ?? []) as any[]

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-[var(--color-text-primary)]">Audit Log</h1>
        <p className="text-sm text-[var(--color-text-muted)] mt-0.5">Immutable record of all data changes in the system</p>
      </div>
      <div className="rounded-xl border border-[var(--color-border)] bg-[var(--color-bg-secondary)] overflow-hidden">
        <div className="grid grid-cols-12 gap-3 px-5 py-2.5 bg-[var(--color-bg-elevated)] border-b border-[var(--color-border)] text-xs font-semibold text-[var(--color-text-muted)] uppercase tracking-wider">
          <div className="col-span-2">Time</div>
          <div className="col-span-2">Table</div>
          <div className="col-span-1">Action</div>
          <div className="col-span-7">Details</div>
        </div>
        <div className="divide-y divide-[var(--color-border-subtle)]">
          {logs.map((log, idx) => {
            const diff = log.action === 'UPDATE' ? getFieldDiff(log.old_values, log.new_values) : []
            return (
              <div key={log.id} className={`grid grid-cols-12 gap-3 px-5 py-3 text-sm items-start ${idx % 2 === 1 ? 'bg-[var(--color-bg-elevated)]/20' : ''}`}>
                <div className="col-span-2 text-xs text-[var(--color-text-muted)] font-mono">{formatDateTime(log.changed_at)}</div>
                <div className="col-span-2 text-[var(--color-text-primary)] font-mono text-xs">{log.table_name}</div>
                <div className="col-span-1">
                  <span className={`text-xs px-1.5 py-0.5 rounded font-medium ${
                    log.action === 'INSERT' ? 'bg-[var(--color-success)]/15 text-[var(--color-success)]'
                    : log.action === 'UPDATE' ? 'bg-[var(--color-warning)]/15 text-[var(--color-warning)]'
                    : 'bg-[var(--color-danger)]/15 text-[var(--color-danger)]'
                  }`}>{log.action}</span>
                </div>
                <div className="col-span-7 text-xs">
                  <div className="text-[var(--color-text-muted)] font-mono mb-1">{log.record_id?.slice(0, 8)}…</div>
                  {log.action === 'UPDATE' && (
                    diff.length > 0 ? (
                      <div className="space-y-0.5">
                        {diff.map(d => (
                          <div key={d.field} className="font-mono">
                            <span className="text-[var(--color-text-secondary)]">{d.field}</span>
                            <span className="text-[var(--color-text-muted)]">: </span>
                            <span className="text-[var(--color-danger)] line-through opacity-70">{d.oldValue}</span>
                            <span className="text-[var(--color-text-muted)]"> → </span>
                            <span className="text-[var(--color-success)]">{d.newValue}</span>
                          </div>
                        ))}
                      </div>
                    ) : (
                      <div className="text-[var(--color-text-muted)] italic">No field changes detected</div>
                    )
                  )}
                </div>
              </div>
            )
          })}
          {logs.length === 0 && <div className="px-5 py-10 text-center text-sm text-[var(--color-text-muted)]">No audit log entries yet.</div>}
        </div>
      </div>
    </div>
  )
}

