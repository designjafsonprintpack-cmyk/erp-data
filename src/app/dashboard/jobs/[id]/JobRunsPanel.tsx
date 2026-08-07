'use client'
import Link from 'next/link'
import { RefreshCw, Package, CheckCircle2 } from 'lucide-react'
import { cn } from '@/lib/utils/cn'
import { formatDate } from '@/lib/utils/format'
import { JOB_STATUS_CONFIG, type JobStatus } from '@/modules/jobs/types/job.types'

/**
 * "Yeh job ab tak kitni baar chala, kab chala, kitna chala."
 *
 * WHY THIS SCREEN EXISTS
 *   Mehboob, on seeing a repeat appear as its own row: "job hamesha aik hi
 *   rehna chahiye … lekin history bhi ho, pata bhi chale ke job kab chala kitna
 *   chala." He is right that a carton is ONE thing; what the schema stores is
 *   each RUN of it. Both facts have to be true on screen at once, and merging
 *   the rows would destroy the very history he asked to keep — a job row holds
 *   its own quantity, stages, MRN, costing, dispatch and invoice.
 *
 *   So the fix is a view, not a merge: every run of this carton in one list,
 *   with the totals across all of them. `jobs.parent_job_id` already linked
 *   them; migration 132's get_job_family() is what reads the whole chain.
 *
 * WHY NO CHART
 *   Deliberate. Two runs is not a trend, and the charting guidance is explicit
 *   that under four points a stat beats a graph. Totals as figures, runs as a
 *   table — both readable at a glance from across a desk, which is how this
 *   ERP is actually used.
 */

export interface JobRun {
  id: string
  job_number: string
  job_title: string
  status: JobStatus
  quantity: number | null
  sheet_qty: number | null
  ups: number | null
  /** Is run ka apna sheet size (149) — ek hi carton ke do run alag layout par
   *  chal sakte hain, die wohi rehti hai. */
  sheet_width_in: number | string | null
  sheet_height_in: number | string | null
  order_date: string | null
  required_date: string | null
  completed_date: string | null
  is_repeat: boolean
  repeat_kind: string | null
  run_no: number
  is_root: boolean
}

const num = (n: number | null | undefined) =>
  n == null ? '—' : Number(n).toLocaleString('en-PK')

function Stat({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div className="rounded-lg border border-[var(--color-border)] bg-[var(--color-bg-secondary)] px-3 py-2.5">
      <p className="text-xs text-[var(--color-text-muted)]">{label}</p>
      {/* tabular-nums so the three figures line up instead of jittering by digit width */}
      <p className="text-lg font-bold text-[var(--color-text-primary)] tabular-nums leading-tight mt-0.5">{value}</p>
      {sub && <p className="text-[11px] text-[var(--color-text-muted)] mt-0.5">{sub}</p>}
    </div>
  )
}

export function JobRunsPanel({ runs, currentJobId }: { runs: JobRun[]; currentJobId: string }) {
  // A job with no repeats still has one run — itself. Saying so is more useful
  // than an empty panel, and it is the state most jobs are in.
  const totalQty    = runs.reduce((s, r) => s + Number(r.quantity ?? 0), 0)
  const totalSheets = runs.reduce((s, r) => s + Number(r.sheet_qty ?? 0), 0)
  const done        = runs.filter(r => ['completed', 'dispatched'].includes(r.status)).length

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 md:grid-cols-4 gap-2.5">
        <Stat label="Total runs" value={String(runs.length)} sub={done > 0 ? `${done} completed` : undefined} />
        <Stat label="Boxes made / ordered" value={num(totalQty)} sub="across every run" />
        <Stat label="Sheets" value={num(totalSheets)} sub="across every run" />
        <Stat
          label="First run"
          value={runs[0]?.order_date ? formatDate(runs[0].order_date, { month: 'short', year: 'numeric' }) : '—'}
          sub={runs[0]?.job_number}
        />
      </div>

      {/* Desktop: a table, because these five figures are meant to be compared
          down the column. Mobile: the same rows as cards — a five-column table
          at 375px is the "bahir ja raha hai" mistake. */}
      <div className="hidden md:block rounded-xl border border-[var(--color-border)] overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="bg-[var(--color-bg-secondary)] border-b border-[var(--color-border)]">
              <th scope="col" className="text-left font-medium text-xs text-[var(--color-text-muted)] px-3 py-2 w-16">Run</th>
              <th scope="col" className="text-left font-medium text-xs text-[var(--color-text-muted)] px-3 py-2">Job</th>
              <th scope="col" className="text-right font-medium text-xs text-[var(--color-text-muted)] px-3 py-2">Quantity</th>
              <th scope="col" className="text-right font-medium text-xs text-[var(--color-text-muted)] px-3 py-2">Sheets</th>
              <th scope="col" className="text-left font-medium text-xs text-[var(--color-text-muted)] px-3 py-2">Ordered</th>
              <th scope="col" className="text-left font-medium text-xs text-[var(--color-text-muted)] px-3 py-2">Finished</th>
              <th scope="col" className="text-left font-medium text-xs text-[var(--color-text-muted)] px-3 py-2">Status</th>
            </tr>
          </thead>
          <tbody>
            {runs.map(r => {
              const isCurrent = r.id === currentJobId
              const cfg = JOB_STATUS_CONFIG[r.status]
              return (
                <tr key={r.id}
                  className={cn('border-b border-[var(--color-border)] last:border-b-0',
                    isCurrent && 'bg-[color:color-mix(in_srgb,var(--color-accent)_8%,transparent)]')}>
                  <td className="px-3 py-2.5">
                    <span className="inline-flex items-center gap-1 text-xs font-semibold text-[var(--color-text-secondary)] tabular-nums">
                      {r.is_root ? <Package size={12} /> : <RefreshCw size={12} />}
                      {r.run_no}
                    </span>
                  </td>
                  <td className="px-3 py-2.5">
                    {isCurrent ? (
                      // The row you are already on is not a link — a link that
                      // reloads the same page reads as broken.
                      <span className="font-medium text-[var(--color-text-primary)]">
                        {r.job_number}
                        <span className="ml-2 text-[10px] font-semibold uppercase tracking-wide text-[var(--color-accent)]">this one</span>
                      </span>
                    ) : (
                      <Link href={`/dashboard/jobs/${r.id}`}
                        className="font-medium text-[var(--color-accent)] hover:underline">
                        {r.job_number}
                      </Link>
                    )}
                    {r.is_root && <span className="ml-2 text-[11px] text-[var(--color-text-muted)]">original</span>}
                    {r.repeat_kind === 'changed' && (
                      <span className="ml-2 text-[11px] text-[var(--color-warning)]">changed</span>
                    )}
                  </td>
                  <td className="px-3 py-2.5 text-right tabular-nums text-[var(--color-text-secondary)]">{num(r.quantity)}</td>
                  <td className="px-3 py-2.5 text-right tabular-nums text-[var(--color-text-secondary)]">{num(r.sheet_qty)}</td>
                  <td className="px-3 py-2.5 text-[var(--color-text-secondary)]">
                    {r.order_date ? formatDate(r.order_date, { day: 'numeric', month: 'short', year: 'numeric' }) : '—'}
                  </td>
                  <td className="px-3 py-2.5 text-[var(--color-text-secondary)]">
                    {r.completed_date
                      ? formatDate(r.completed_date, { day: 'numeric', month: 'short', year: 'numeric' })
                      : <span className="text-[var(--color-text-muted)]">—</span>}
                  </td>
                  <td className="px-3 py-2.5">
                    {/* Colour is never the only signal — the label is always there too. */}
                    <span className={cn('inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded-full border', cfg?.color)}>
                      {['completed', 'dispatched'].includes(r.status) && <CheckCircle2 size={11} />}
                      {cfg?.label ?? r.status}
                    </span>
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>

      <div className="md:hidden space-y-2">
        {runs.map(r => {
          const isCurrent = r.id === currentJobId
          const cfg = JOB_STATUS_CONFIG[r.status]
          const body = (
            <>
              <div className="flex items-center justify-between gap-2">
                <span className="flex items-center gap-1.5 font-medium text-[var(--color-text-primary)]">
                  {r.is_root ? <Package size={13} /> : <RefreshCw size={13} />}
                  Run {r.run_no} — {r.job_number}
                </span>
                <span className={cn('text-xs px-2 py-0.5 rounded-full border flex-shrink-0', cfg?.color)}>
                  {cfg?.label ?? r.status}
                </span>
              </div>
              <div className="grid grid-cols-2 gap-x-3 gap-y-1 mt-2 text-xs">
                <span className="text-[var(--color-text-muted)]">Quantity</span>
                <span className="text-right tabular-nums text-[var(--color-text-secondary)]">{num(r.quantity)}</span>
                <span className="text-[var(--color-text-muted)]">Sheets</span>
                <span className="text-right tabular-nums text-[var(--color-text-secondary)]">{num(r.sheet_qty)}</span>
                <span className="text-[var(--color-text-muted)]">Ordered</span>
                <span className="text-right text-[var(--color-text-secondary)]">
                  {r.order_date ? formatDate(r.order_date, { day: 'numeric', month: 'short', year: 'numeric' }) : '—'}
                </span>
                <span className="text-[var(--color-text-muted)]">Finished</span>
                <span className="text-right text-[var(--color-text-secondary)]">
                  {r.completed_date ? formatDate(r.completed_date, { day: 'numeric', month: 'short', year: 'numeric' }) : '—'}
                </span>
              </div>
            </>
          )
          const box = cn(
            'block rounded-lg border px-3 py-2.5 min-h-14',
            isCurrent
              ? 'border-[var(--color-accent)] bg-[color:color-mix(in_srgb,var(--color-accent)_8%,transparent)]'
              : 'border-[var(--color-border)] bg-[var(--color-bg-secondary)]'
          )
          return isCurrent
            ? <div key={r.id} className={box}>{body}</div>
            : <Link key={r.id} href={`/dashboard/jobs/${r.id}`} className={box}>{body}</Link>
        })}
      </div>

      <p className="text-xs text-[var(--color-text-muted)]">
        Har run apna alag job hai — apni quantity, apna board issue, apni costing aur apna
        invoice. Yeh list un sab ko ek hi cheez ke run ki tarah dikhati hai.
        {runs.length === 1 && ' Is job ka abhi tak sirf ek run hua hai.'}
      </p>
    </div>
  )
}

export default JobRunsPanel
