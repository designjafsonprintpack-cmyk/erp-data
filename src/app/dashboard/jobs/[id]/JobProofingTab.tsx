'use client'
import { useCallback, useEffect, useState } from 'react'
import Link from 'next/link'
import { Plus, Stamp, CheckCircle2, RotateCcw, Clock, ExternalLink, AlertTriangle } from 'lucide-react'
import { cn } from '@/lib/utils/cn'
import { toast } from '@/components/ui/Toast'
import { Modal } from '@/components/ui/Modal'
import { formatDateTime } from '@/lib/utils/format'

/**
 * Press proofing (migration 104).
 *
 * A proof run is a real job — 100–500 sheets on the actual press so the customer
 * can see the actual colour — tagged `job_kind = 'proofing'` and hanging off
 * this job via parent_job_id. So each row here links out to a full job page
 * where board issue, plates and printing happen exactly as they would anywhere
 * else. This tab is only the round-by-round record and the customer's verdict.
 */

export interface ProofRun {
  id: string
  job_number: string
  job_title: string
  status: string
  sheet_qty: number | null
  proof_round: number | null
  proof_result: 'pending' | 'approved' | 'changes_required' | null
  proof_notes: string | null
  proof_decided_at: string | null
  proof_artwork_id: string | null
  created_at: string
  job_artworks?: { version: number; file_name: string } | null
}

interface ArtworkOption { id: string; version: number; file_name: string }

const inputCls = 'w-full h-11 md:h-9 px-3 rounded-md border text-sm bg-[var(--color-bg-elevated)] text-[var(--color-text-primary)] border-[var(--color-border)] placeholder:text-[var(--color-text-muted)] focus:outline-none focus:border-[var(--color-accent)] focus:ring-1 focus:ring-[var(--color-accent)] transition-colors'

// Tints go through color-mix, never an opacity modifier on a var() colour —
// Tailwind v3 silently emits no rule at all for `bg-[var(--x)]/10`.
const RESULT_CONFIG: Record<string, { label: string; cls: string; icon: typeof Clock }> = {
  pending: {
    label: 'With customer',
    icon: Clock,
    cls: 'text-[var(--color-warning)] bg-[color:color-mix(in_srgb,var(--color-warning)_12%,transparent)] border-[color:color-mix(in_srgb,var(--color-warning)_30%,transparent)]',
  },
  approved: {
    label: 'Approved',
    icon: CheckCircle2,
    cls: 'text-[var(--color-success)] bg-[color:color-mix(in_srgb,var(--color-success)_12%,transparent)] border-[color:color-mix(in_srgb,var(--color-success)_30%,transparent)]',
  },
  changes_required: {
    label: 'Changes asked',
    icon: RotateCcw,
    cls: 'text-[var(--color-danger)] bg-[color:color-mix(in_srgb,var(--color-danger)_12%,transparent)] border-[color:color-mix(in_srgb,var(--color-danger)_30%,transparent)]',
  },
}

const PRESET_SHEETS = [100, 200, 500]

export function JobProofingTab({ jobId, artworks }: { jobId: string; artworks: ArtworkOption[] }) {
  const [runs, setRuns] = useState<ProofRun[]>([])
  const [loaded, setLoaded] = useState(false)
  const [loading, setLoading] = useState(false)

  const [newModal, setNewModal] = useState(false)
  const [sheets, setSheets] = useState('200')
  const [artworkId, setArtworkId] = useState('')
  const [newNotes, setNewNotes] = useState('')

  const [verdictModal, setVerdictModal] = useState<{ run: ProofRun; result: 'approved' | 'changes_required' } | null>(null)
  const [verdictNotes, setVerdictNotes] = useState('')

  const load = useCallback(async () => {
    try {
      const res = await fetch(`/api/v1/jobs/${jobId}/proofs`)
      if (!res.ok) return
      const { data } = await res.json()
      setRuns((data ?? []) as ProofRun[])
    } catch {
      // A failed load leaves the empty state — every other tab still works.
    } finally {
      setLoaded(true)
    }
  }, [jobId])

  useEffect(() => { load() }, [load])

  // Default the artwork picker to the newest version, which is what a proof is
  // pulled from in practice.
  useEffect(() => {
    if (!artworkId && artworks.length > 0) setArtworkId(artworks[0].id)
  }, [artworks, artworkId])

  const createRun = async () => {
    const n = Number(sheets)
    if (!Number.isFinite(n) || n <= 0) { toast.error('Enter how many sheets to print'); return }
    setLoading(true)
    try {
      const res = await fetch(`/api/v1/jobs/${jobId}/proofs`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sheet_qty: n, artwork_id: artworkId || null, notes: newNotes || null }),
      })
      const json = await res.json()
      if (!res.ok) throw new Error(json.error || 'Failed')
      toast.success(`${json.data.job_number} created — ${n} sheets`)
      setNewModal(false); setNewNotes('')
      await load()
    } catch (e: any) { toast.error(e.message || 'Failed') }
    finally { setLoading(false) }
  }

  const submitVerdict = async () => {
    if (!verdictModal) return
    setLoading(true)
    try {
      const res = await fetch(`/api/v1/jobs/${jobId}/proofs`, {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          proof_job_id: verdictModal.run.id,
          result: verdictModal.result,
          notes: verdictNotes || null,
        }),
      })
      const json = await res.json()
      if (!res.ok) throw new Error(json.error || 'Failed')
      toast.success(json.message || 'Recorded')
      setVerdictModal(null); setVerdictNotes('')
      await load()
    } catch (e: any) { toast.error(e.message || 'Failed') }
    finally { setLoading(false) }
  }

  const approved = runs.find(r => r.proof_result === 'approved')
  const latest = runs[0] // GET returns newest round first

  return (
    <div className="space-y-4">
      {/* Where the job actually stands, in one line — this is the thing that
          decides whether the main print run may start. */}
      {loaded && runs.length > 0 && (
        <div className={cn('rounded-xl border px-4 py-3 flex items-start gap-2.5 text-sm',
          approved
            ? 'text-[var(--color-success)] bg-[color:color-mix(in_srgb,var(--color-success)_10%,transparent)] border-[color:color-mix(in_srgb,var(--color-success)_25%,transparent)]'
            : 'text-[var(--color-warning)] bg-[color:color-mix(in_srgb,var(--color-warning)_10%,transparent)] border-[color:color-mix(in_srgb,var(--color-warning)_25%,transparent)]')}>
          {approved
            ? <CheckCircle2 size={16} className="flex-shrink-0 mt-0.5" />
            : <AlertTriangle size={16} className="flex-shrink-0 mt-0.5" />}
          <div>
            {approved ? (
              <>Proof <strong>{approved.job_number}</strong> approved — the main print run can start.</>
            ) : (
              <>No proof approved yet — <strong>Printing is blocked</strong> on this job
                {latest ? <> until {latest.job_number} is decided.</> : '.'}</>
            )}
          </div>
        </div>
      )}

      <div className="flex items-center justify-between gap-3">
        <div>
          <h3 className="text-sm font-semibold text-[var(--color-text-primary)]">Press Proofs</h3>
          <p className="text-xs text-[var(--color-text-muted)] mt-0.5">
            Sheets run on the press for the customer to check colour
          </p>
        </div>
        <button onClick={() => setNewModal(true)}
          className="flex items-center gap-1.5 px-3 h-11 md:h-9 rounded-md bg-[var(--color-accent)] text-[var(--color-on-accent)] text-sm font-medium hover:bg-[var(--color-accent-hover)] hover:text-[var(--color-on-accent-hover)] transition-colors flex-shrink-0">
          <Plus size={14} /> New Proof Run
        </button>
      </div>

      {!loaded ? (
        <div className="rounded-xl border border-[var(--color-border)] bg-[var(--color-bg-secondary)] p-12 text-center">
          <p className="text-sm text-[var(--color-text-muted)]">Loading…</p>
        </div>
      ) : runs.length === 0 ? (
        <div className="rounded-xl border border-[var(--color-border)] bg-[var(--color-bg-secondary)] p-12 text-center">
          <Stamp size={28} className="text-[var(--color-text-muted)] opacity-30 mx-auto mb-2" />
          <p className="text-sm text-[var(--color-text-muted)]">No press proof pulled for this job.</p>
          <p className="text-xs text-[var(--color-text-muted)] mt-1">
            Printing is not blocked until a proof run exists.
          </p>
        </div>
      ) : (
        <div className="rounded-xl border border-[var(--color-border)] bg-[var(--color-bg-secondary)] overflow-hidden divide-y divide-[var(--color-border-subtle)]">
          {runs.map(run => {
            const cfg = RESULT_CONFIG[run.proof_result || 'pending'] ?? RESULT_CONFIG.pending
            const Icon = cfg.icon
            return (
              <div key={run.id} className="p-4 flex flex-col md:flex-row md:items-center gap-3">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-sm font-semibold text-[var(--color-text-primary)]">
                      Round {run.proof_round}
                    </span>
                    <Link href={`/dashboard/jobs/${run.id}`}
                      className="text-sm text-[var(--color-accent)] hover:underline flex items-center gap-1">
                      {run.job_number}<ExternalLink size={11} />
                    </Link>
                    <span className={cn('inline-flex items-center gap-1 px-2 h-5 rounded-full border text-[11px] font-medium', cfg.cls)}>
                      <Icon size={10} />{cfg.label}
                    </span>
                  </div>
                  <div className="text-xs text-[var(--color-text-muted)] mt-1 flex items-center gap-2 flex-wrap">
                    <span>{run.sheet_qty ?? '—'} sheets</span>
                    <span>·</span>
                    {/* Which file was on the press — the one question a colour
                        dispute months later actually turns on. */}
                    <span>{run.job_artworks ? `Artwork v${run.job_artworks.version}` : 'No artwork recorded'}</span>
                    <span>·</span>
                    <span>{formatDateTime(run.created_at)}</span>
                  </div>
                  {run.proof_notes && (
                    <p className="text-xs text-[var(--color-text-secondary)] mt-1.5">{run.proof_notes}</p>
                  )}
                </div>

                {run.proof_result === 'pending' && (
                  <div className="flex items-center gap-2 flex-shrink-0">
                    <button onClick={() => { setVerdictModal({ run, result: 'approved' }); setVerdictNotes('') }}
                      className="flex items-center gap-1 px-3 h-9 rounded-md bg-[var(--color-success)] text-[var(--color-on-success)] text-xs font-medium hover:opacity-90 transition-opacity">
                      <CheckCircle2 size={12} /> Approved
                    </button>
                    <button onClick={() => { setVerdictModal({ run, result: 'changes_required' }); setVerdictNotes('') }}
                      className="flex items-center gap-1 px-3 h-9 rounded-md border border-[var(--color-border)] text-xs font-medium text-[var(--color-text-secondary)] hover:bg-[var(--color-bg-elevated)] transition-colors">
                      <RotateCcw size={12} /> Changes
                    </button>
                  </div>
                )}
              </div>
            )
          })}
        </div>
      )}

      {/* ─── New proof run ──────────────────────────────────────────────────── */}
      <Modal open={newModal} onClose={() => setNewModal(false)} title="New Proof Run" size="md">
        <div className="space-y-4">
          <div>
            <label className="block text-xs font-medium text-[var(--color-text-secondary)] mb-1.5">
              Sheets to print
            </label>
            <div className="flex items-center gap-2 mb-2">
              {PRESET_SHEETS.map(n => (
                <button key={n} type="button" onClick={() => setSheets(String(n))}
                  className={cn('px-3 h-9 rounded-md border text-sm transition-colors',
                    sheets === String(n)
                      ? 'border-[var(--color-accent)] text-[var(--color-accent)] bg-[color:color-mix(in_srgb,var(--color-accent)_10%,transparent)]'
                      : 'border-[var(--color-border)] text-[var(--color-text-secondary)] hover:bg-[var(--color-bg-elevated)]')}>
                  {n}
                </button>
              ))}
            </div>
            <input type="number" min={1} value={sheets} onChange={e => setSheets(e.target.value)} className={inputCls} />
            <p className="text-xs text-[var(--color-text-muted)] mt-1">
              Sheets, not boxes — this is what goes on the press.
            </p>
          </div>

          <div>
            <label className="block text-xs font-medium text-[var(--color-text-secondary)] mb-1.5">
              Artwork version on the press
            </label>
            {artworks.length === 0 ? (
              <p className="text-xs text-[var(--color-text-muted)]">
                No artwork uploaded for this job yet — the round will be recorded without one.
              </p>
            ) : (
              <select value={artworkId} onChange={e => setArtworkId(e.target.value)} className={inputCls}>
                <option value="">— none —</option>
                {artworks.map(a => (
                  <option key={a.id} value={a.id}>v{a.version} — {a.file_name}</option>
                ))}
              </select>
            )}
          </div>

          <div>
            <label className="block text-xs font-medium text-[var(--color-text-secondary)] mb-1.5">Notes</label>
            <textarea value={newNotes} onChange={e => setNewNotes(e.target.value)} rows={2}
              placeholder="Anything the press minder should know"
              className={cn(inputCls, 'h-auto py-2 resize-none')} />
          </div>

          <div className="flex items-center justify-end gap-2 pt-1">
            <button onClick={() => setNewModal(false)}
              className="px-4 h-11 md:h-9 rounded-md border border-[var(--color-border)] text-sm text-[var(--color-text-secondary)] hover:bg-[var(--color-bg-elevated)] transition-colors">
              Cancel
            </button>
            <button onClick={createRun} disabled={loading}
              className="px-4 h-11 md:h-9 rounded-md bg-[var(--color-accent)] text-[var(--color-on-accent)] text-sm font-medium hover:bg-[var(--color-accent-hover)] hover:text-[var(--color-on-accent-hover)] disabled:opacity-40 transition-colors">
              {loading ? 'Creating…' : 'Create Proof Run'}
            </button>
          </div>
        </div>
      </Modal>

      {/* ─── Customer verdict ───────────────────────────────────────────────── */}
      <Modal open={!!verdictModal} onClose={() => setVerdictModal(null)}
        title={verdictModal?.result === 'approved' ? 'Customer approved the proof' : 'Customer asked for changes'} size="md">
        {verdictModal && (
          <div className="space-y-4">
            <p className="text-sm text-[var(--color-text-secondary)]">
              {verdictModal.run.job_number} · Round {verdictModal.run.proof_round}
              {verdictModal.run.job_artworks ? ` · Artwork v${verdictModal.run.job_artworks.version}` : ''}
            </p>

            <div>
              <label className="block text-xs font-medium text-[var(--color-text-secondary)] mb-1.5">
                {verdictModal.result === 'approved' ? 'Notes (optional)' : 'What does the customer want changed?'}
              </label>
              <textarea value={verdictNotes} onChange={e => setVerdictNotes(e.target.value)} rows={3}
                placeholder={verdictModal.result === 'approved'
                  ? 'e.g. approved on WhatsApp by Mr. Ali'
                  : 'e.g. magenta too strong on the logo'}
                className={cn(inputCls, 'h-auto py-2 resize-none')} />
            </div>

            <p className="text-xs text-[var(--color-text-muted)]">
              {verdictModal.result === 'approved'
                ? 'This clears the main print run to start.'
                : 'Printing stays blocked. Pull another round once the changes are made.'}
            </p>

            <div className="flex items-center justify-end gap-2 pt-1">
              <button onClick={() => setVerdictModal(null)}
                className="px-4 h-11 md:h-9 rounded-md border border-[var(--color-border)] text-sm text-[var(--color-text-secondary)] hover:bg-[var(--color-bg-elevated)] transition-colors">
                Cancel
              </button>
              <button onClick={submitVerdict} disabled={loading}
                className={cn('px-4 h-11 md:h-9 rounded-md text-sm font-medium disabled:opacity-40 transition-opacity',
                  verdictModal.result === 'approved'
                    ? 'bg-[var(--color-success)] text-[var(--color-on-success)] hover:opacity-90'
                    : 'bg-[var(--color-warning)] text-[var(--color-on-warning)] hover:opacity-90')}>
                {loading ? 'Saving…' : 'Record'}
              </button>
            </div>
          </div>
        )}
      </Modal>
    </div>
  )
}

export default JobProofingTab
