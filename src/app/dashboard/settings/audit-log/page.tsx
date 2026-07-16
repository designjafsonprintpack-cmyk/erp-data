import { createSupabaseServerClient } from '@/lib/supabase/server'
import { formatDateTime } from '@/lib/utils/format'

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
          {logs.map((log, idx) => (
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
              <div className="col-span-7 text-xs text-[var(--color-text-muted)] font-mono truncate">
                {log.record_id?.slice(0, 8)}…
              </div>
            </div>
          ))}
          {logs.length === 0 && <div className="px-5 py-10 text-center text-sm text-[var(--color-text-muted)]">No audit log entries yet.</div>}
        </div>
      </div>
    </div>
  )
}
