'use client'
import { useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { Plus, Combine, Trash2 } from 'lucide-react'
import { cn } from '@/lib/utils/cn'
import { toast } from '@/components/ui/Toast'
import { ConfirmDialog } from '@/components/ui/Modal'

interface Member {
  id: string; job_id: string; ups_on_layout: number
  original_quantity: number | null; original_ups: number | null
  jobs?: { job_number: string; job_title: string; quantity: number } | null
}
interface Gang {
  id: string; gang_number: string; layout_ups: number; sheet_count: number
  status: string; notes: string | null; created_at: string
  sheet_width_in: number | null; sheet_height_in: number | null
  customers?: { name: string; customer_code: string } | null
  job_gang_members?: Member[]
}

const STATUS: Record<string, string> = {
  planned:     'text-[var(--color-text-secondary)] bg-[var(--color-bg-elevated)] border-[var(--color-border)]',
  in_progress: 'text-[var(--color-accent)] bg-[color:color-mix(in_srgb,var(--color-accent)_10%,transparent)] border-[color:color-mix(in_srgb,var(--color-accent)_25%,transparent)]',
  completed:   'text-[var(--color-success)] bg-[color:color-mix(in_srgb,var(--color-success)_10%,transparent)] border-[color:color-mix(in_srgb,var(--color-success)_25%,transparent)]',
  cancelled:   'text-[var(--color-text-muted)] bg-[var(--color-bg-elevated)] border-[var(--color-border)]',
}
const fmt = (v: unknown) => (Number(v) || 0).toLocaleString('en-PK')

export default function GangsClient({ initialGangs }: { initialGangs: Gang[] }) {
  const router = useRouter()
  const [gangs, setGangs] = useState(initialGangs)
  const [ungang, setUngang] = useState<Gang | null>(null)
  const [loading, setLoading] = useState(false)

  const confirmUngang = async (force = false) => {
    if (!ungang) return
    setLoading(true)
    try {
      const res = await fetch(`/api/v1/gangs/${ungang.id}${force ? '?force=1' : ''}`, { method: 'DELETE' })
      const json = await res.json().catch(() => ({}))
      if (res.status === 409) { toast.error(json?.error || 'This gang is already in production'); return }
      if (!res.ok) { toast.error(json?.error || 'Could not break up the gang'); return }
      for (const w of (json.warnings ?? [])) toast.error(w)
      toast.success(`${ungang.gang_number} broken up — ${json.restored} job(s) back to their own quantities`)
      setGangs(g => g.filter(x => x.id !== ungang.id))
      router.refresh()
    } catch { toast.error('Could not break up the gang') }
    finally { setLoading(false); setUngang(null) }
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold text-[var(--color-text-primary)]">Gang Runs</h1>
          <p className="text-sm text-[var(--color-text-muted)] mt-0.5">
            Two jobs on one sheet — one set of plates, one press setup.
          </p>
        </div>
        <Link href="/dashboard/gangs/new"
          className="flex items-center gap-1.5 px-4 h-11 md:h-9 rounded-md bg-[var(--color-accent)] text-[var(--color-on-accent)] text-sm font-medium hover:bg-[var(--color-accent-hover)] transition-colors">
          <Plus size={15} /> New Gang Run
        </Link>
      </div>

      {gangs.length === 0 ? (
        <div className="flex flex-col items-center py-16 rounded-xl border border-[var(--color-border)] bg-[var(--color-bg-secondary)]">
          <Combine size={32} className="text-[var(--color-text-muted)] opacity-30 mb-3" />
          <p className="text-sm font-medium text-[var(--color-text-primary)] mb-1">No gang runs yet</p>
          <p className="text-xs text-[var(--color-text-muted)] max-w-sm text-center">
            When two jobs for the same customer share a board and a sheet size, they can run together
            on one set of plates.
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {gangs.map(g => {
            const members = (g.job_gang_members ?? []).filter(Boolean)
            return (
              <div key={g.id} className="rounded-xl border border-[var(--color-border)] bg-[var(--color-bg-secondary)] p-4">
                <div className="flex items-start justify-between gap-3 flex-wrap">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-sm font-mono font-semibold text-[var(--color-accent)]">{g.gang_number}</span>
                      <span className={cn('text-xs px-2 py-0.5 rounded-full border font-medium capitalize', STATUS[g.status] || STATUS.planned)}>
                        {g.status.replace('_', ' ')}
                      </span>
                    </div>
                    <p className="text-sm text-[var(--color-text-secondary)] mt-1">
                      {g.customers?.name || '—'} · {fmt(g.sheet_count)} sheets · {g.layout_ups} ups
                      {g.sheet_width_in && g.sheet_height_in && ` · ${g.sheet_width_in} × ${g.sheet_height_in}`}
                    </p>
                  </div>
                  {g.status !== 'cancelled' && (
                    <button onClick={() => setUngang(g)}
                      className="flex items-center gap-1.5 px-3 h-9 rounded-md border border-[var(--color-border)] text-xs font-medium text-[var(--color-text-secondary)] hover:text-[var(--color-danger)] hover:border-[color:color-mix(in_srgb,var(--color-danger)_30%,transparent)] transition-colors">
                      <Trash2 size={13} /> Break up
                    </button>
                  )}
                </div>

                <div className="mt-3 rounded-lg border border-[var(--color-border)] overflow-hidden">
                  {members.map(m => (
                    <Link key={m.id} href={`/dashboard/jobs/${m.job_id}`}
                      className="flex items-center justify-between gap-3 px-3 py-2 border-b border-[var(--color-border)] last:border-0 hover:bg-[var(--color-bg-elevated)] transition-colors flex-wrap">
                      <span className="text-sm text-[var(--color-text-primary)]">
                        {m.jobs?.job_number} <span className="text-[var(--color-text-muted)]">· {m.ups_on_layout} ups</span>
                      </span>
                      <span className="text-sm text-[var(--color-text-secondary)]">
                        {m.original_quantity != null && Number(m.original_quantity) !== Number(m.jobs?.quantity) ? (
                          <>
                            {fmt(m.original_quantity)} → <strong className="text-[var(--color-text-primary)]">{fmt(m.jobs?.quantity)}</strong>
                          </>
                        ) : fmt(m.jobs?.quantity)}
                      </span>
                    </Link>
                  ))}
                </div>

                {g.notes && <p className="text-xs text-[var(--color-text-muted)] mt-2 italic">{g.notes}</p>}
              </div>
            )
          })}
        </div>
      )}

      <ConfirmDialog
        open={!!ungang}
        onClose={() => setUngang(null)}
        onConfirm={() => confirmUngang(false)}
        title={`Break up ${ungang?.gang_number ?? ''}?`}
        message="Every job goes back to the ups and the quantity it had before the gang, and their sales order lines with them. The press slot is released."
        confirmLabel="Break up"
        loading={loading}
      />
    </div>
  )
}

export { GangsClient }
