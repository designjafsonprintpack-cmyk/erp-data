'use client'
import { useState, useEffect, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { ArrowLeft, Combine, Search, AlertTriangle, Check } from 'lucide-react'
import { cn } from '@/lib/utils/cn'
import { toast } from '@/components/ui/Toast'
import { gangScenario, separateScenario, suggestSplit, type GangMemberInput } from '@/lib/utils/gangCalc'

const inputCls = 'w-full h-11 md:h-9 px-3 rounded-md border text-sm bg-[var(--color-bg-elevated)] text-[var(--color-text-primary)] border-[var(--color-border)] placeholder:text-[var(--color-text-muted)] focus:outline-none focus:border-[var(--color-accent)] focus:ring-1 focus:ring-[var(--color-accent)] transition-colors'

interface Job {
  id: string; job_number: string; job_title: string; quantity: number; ups: number
  die_number?: string | null; no_of_colors?: number | null
  sheet_width_in?: number | null; sheet_height_in?: number | null
  customers?: { name: string } | null
  board_types?: { name: string } | null
}

const n = (v: unknown) => Number(v) || 0
const fmt = (v: number) => v.toLocaleString('en-PK')

export default function NewGangClient({ initialJobId }: { initialJobId: string }) {
  const router = useRouter()

  const [jobSearch, setJobSearch] = useState('')
  const [jobResults, setJobResults] = useState<Job[]>([])
  const [baseJob, setBaseJob] = useState<Job | null>(null)
  const [candidates, setCandidates] = useState<Job[]>([])
  const [picked, setPicked] = useState<string[]>([])

  /** How many ups the DIE holds. Typed, never guessed — the ERP has no die master. */
  const [layoutUps, setLayoutUps] = useState('')
  /** jobId → ups. Seeded from suggestSplit(), then the planner's to overwrite. */
  const [ups, setUps] = useState<Record<string, number>>({})
  const [touchedSplit, setTouchedSplit] = useState(false)

  const [agreed, setAgreed] = useState(false)
  const [notes, setNotes] = useState('')
  const [loading, setLoading] = useState(false)

  // ─── Pick the first job ───────────────────────────────────────────────────
  useEffect(() => {
    if (!jobSearch.trim() || baseJob) { setJobResults([]); return }
    let cancelled = false
    const t = setTimeout(async () => {
      try {
        const res = await fetch(`/api/v1/jobs?search=${encodeURIComponent(jobSearch.trim())}&limit=15`)
        const json = await res.json()
        if (!cancelled) setJobResults((json.data ?? []) as Job[])
      } catch { /* leave the last list */ }
    }, 300)
    return () => { cancelled = true; clearTimeout(t) }
  }, [jobSearch, baseJob])

  // ─── Load who could share this sheet ──────────────────────────────────────
  const loadCandidates = useCallback(async (jobId: string) => {
    setLoading(true)
    try {
      const res = await fetch(`/api/v1/gangs/candidates?job_id=${jobId}`)
      const json = await res.json()
      if (!res.ok) { toast.error(json?.error || 'Could not load jobs'); return }
      setBaseJob(json.job)
      setCandidates(json.candidates ?? [])
      if (!(json.candidates ?? []).length) {
        toast.error('No other job matches this one’s customer, board and sheet size.')
      }
    } catch { toast.error('Could not load jobs') }
    finally { setLoading(false) }
  }, [])

  useEffect(() => { if (initialJobId) loadCandidates(initialJobId) }, [initialJobId, loadCandidates])

  const members: GangMemberInput[] = baseJob
    ? [baseJob, ...candidates.filter(c => picked.includes(c.id))].map(j => ({
        jobId: j.id, jobNumber: j.job_number, jobTitle: j.job_title,
        orderedQty: n(j.quantity), ownUps: n(j.ups),
      }))
    : []

  // Re-suggest while the planner has not typed a split of their own. Once they
  // touch a box, the suggestion never overwrites them again.
  useEffect(() => {
    const L = parseInt(layoutUps)
    if (!touchedSplit && L > 0 && members.length >= 2) setUps(suggestSplit(L, members))
    // eslint-disable-next-line react-hooks/exhaustive-deps -- keyed on the inputs that change the suggestion
  }, [layoutUps, picked.join(','), touchedSplit])

  const L = parseInt(layoutUps) || 0
  const gang = members.length >= 2 && L > 0 ? gangScenario(L, members, ups) : null
  const separate = members.length >= 2 ? separateScenario(members) : null
  const overaged = gang?.lines.filter(l => l.overage > 0) ?? []

  const create = async () => {
    if (!gang?.valid) return
    setLoading(true)
    try {
      const res = await fetch('/api/v1/gangs', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          layout_ups: L,
          members: members.map(m => ({ job_id: m.jobId, ups_on_layout: ups[m.jobId] })),
          notes: notes || null,
          overage_agreed: overaged.length ? agreed : undefined,
        }),
      })
      const json = await res.json()
      if (!res.ok) { toast.error(json?.error || 'Could not create the gang'); return }
      for (const w of (json.warnings ?? [])) toast.error(w)
      toast.success(`${json.data.gang_number} created`)
      router.push('/dashboard/gangs')
    } catch { toast.error('Could not create the gang') }
    finally { setLoading(false) }
  }

  return (
    <div className="max-w-4xl space-y-5">
      <div className="flex items-center gap-3">
        <Link href="/dashboard/gangs" className="w-8 h-8 flex items-center justify-center rounded-md border border-[var(--color-border)] text-[var(--color-text-muted)] hover:bg-[var(--color-bg-elevated)] transition-colors">
          <ArrowLeft size={15} />
        </Link>
        <div>
          <h1 className="text-2xl font-bold text-[var(--color-text-primary)]">Gang Two Jobs</h1>
          <p className="text-sm text-[var(--color-text-muted)] mt-0.5">
            One sheet, one set of plates, one press setup.
          </p>
        </div>
      </div>

      {/* ─── 1. The jobs ─────────────────────────────────────────────────── */}
      <Section title="1 · Which jobs">
        {!baseJob ? (
          <div className="space-y-2">
            <label className="text-sm font-medium text-[var(--color-text-primary)]">Start from a job</label>
            <div className="relative">
              <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-[var(--color-text-muted)] pointer-events-none" />
              <input className={cn(inputCls, 'pl-9')} value={jobSearch} onChange={e => setJobSearch(e.target.value)}
                placeholder="Search by job number, title, or size (190x100x45)…" />
            </div>
            <div className="space-y-1">
              {jobResults.map(j => (
                <button key={j.id} type="button" onClick={() => loadCandidates(j.id)}
                  className="w-full text-left px-3 py-2 rounded-md border border-[var(--color-border)] hover:border-[var(--color-accent)] transition-colors">
                  <span className="text-sm font-medium text-[var(--color-text-primary)]">{j.job_number} — {j.job_title}</span>
                  <span className="block text-xs text-[var(--color-text-muted)]">
                    {j.customers?.name} · {fmt(n(j.quantity))} · {n(j.ups)} ups
                  </span>
                </button>
              ))}
            </div>
          </div>
        ) : (
          <div className="space-y-3">
            <JobRow job={baseJob} fixed />
            {candidates.length === 0 ? (
              <p className="text-sm text-[var(--color-text-muted)]">
                No other job shares this one&apos;s customer, board type and sheet size — those three have to match
                before two jobs can go on one sheet.
              </p>
            ) : (
              <>
                <p className="text-xs text-[var(--color-text-muted)]">
                  Same customer, same board, same sheet size:
                </p>
                {candidates.map(c => (
                  <label key={c.id} className="flex items-start gap-2.5 cursor-pointer">
                    <input type="checkbox" className="mt-3 w-4 h-4 accent-[var(--color-accent)] flex-shrink-0"
                      checked={picked.includes(c.id)}
                      onChange={e => {
                        setTouchedSplit(false)
                        setPicked(p => e.target.checked ? [...p, c.id] : p.filter(x => x !== c.id))
                      }} />
                    <span className="flex-1 min-w-0"><JobRow job={c} /></span>
                  </label>
                ))}
              </>
            )}
            <button type="button" onClick={() => { setBaseJob(null); setCandidates([]); setPicked([]) }}
              className="text-xs text-[var(--color-accent)] hover:underline">Start from a different job</button>
          </div>
        )}
      </Section>

      {/* ─── 2. The die ──────────────────────────────────────────────────── */}
      {members.length >= 2 && (
        <Section title="2 · The die">
          <div className="space-y-1.5 max-w-xs">
            <label htmlFor="layout-ups" className="text-sm font-medium text-[var(--color-text-primary)]">
              How many ups does the die hold? <span className="text-[var(--color-danger)]">*</span>
            </label>
            <input id="layout-ups" type="number" min={2} className={inputCls} value={layoutUps}
              onChange={e => { setLayoutUps(e.target.value); setTouchedSplit(false) }} placeholder="e.g. 8" />
            <p className="text-xs text-[var(--color-text-muted)]">
              The layout is limited by the die you already have — adding ups changes the sheet size and needs a new die.
            </p>
          </div>
        </Section>
      )}

      {/* ─── 3. The split, and the comparison ────────────────────────────── */}
      {gang && separate && (
        <Section title="3 · The split">
          <div className="space-y-4">
            <div className="space-y-2">
              {members.map(m => (
                <div key={m.jobId} className="flex items-center gap-3 flex-wrap">
                  <span className="text-sm text-[var(--color-text-primary)] w-40 flex-shrink-0 truncate">{m.jobNumber}</span>
                  <input type="number" min={1} className={cn(inputCls, 'w-24')}
                    value={ups[m.jobId] ?? ''}
                    onChange={e => { setTouchedSplit(true); setUps(u => ({ ...u, [m.jobId]: parseInt(e.target.value) || 0 })) }} />
                  <span className="text-xs text-[var(--color-text-muted)]">ups</span>
                  <span className="text-xs text-[var(--color-text-secondary)]">
                    ordered {fmt(m.orderedQty)}
                  </span>
                </div>
              ))}
              <p className="text-xs text-[var(--color-text-muted)]">
                {gang.totalUps} of {L} ups used.
                {!touchedSplit && ' This is a starting point — change it to match your die.'}
              </p>
            </div>

            {gang.problems.length > 0 ? (
              <div className="rounded-lg border p-3 space-y-1
                bg-[color:color-mix(in_srgb,var(--color-danger)_10%,transparent)]
                border-[color:color-mix(in_srgb,var(--color-danger)_25%,transparent)]">
                {gang.problems.map((p, i) => (
                  <p key={i} className="text-sm text-[var(--color-text-primary)] flex items-start gap-2">
                    <AlertTriangle size={14} className="text-[var(--color-danger)] flex-shrink-0 mt-0.5" />{p}
                  </p>
                ))}
              </div>
            ) : (
              <>
                {/* The comparison. This is the decision, so both sides are shown. */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div className="rounded-lg border border-[var(--color-border)] p-3">
                    <p className="text-xs text-[var(--color-text-muted)] uppercase tracking-wide">Run separately</p>
                    <p className="text-xl font-bold text-[var(--color-text-primary)] mt-1">{fmt(separate.totalSheets)} sheets</p>
                    <p className="text-xs text-[var(--color-text-secondary)] mt-0.5">
                      {separate.setups} press setups · {separate.setups} plate sets
                    </p>
                  </div>
                  <div className="rounded-lg border p-3
                    bg-[color:color-mix(in_srgb,var(--color-accent)_8%,transparent)]
                    border-[color:color-mix(in_srgb,var(--color-accent)_30%,transparent)]">
                    <p className="text-xs text-[var(--color-text-muted)] uppercase tracking-wide">Gang them</p>
                    <p className="text-xl font-bold text-[var(--color-text-primary)] mt-1">{fmt(gang.sheets)} sheets</p>
                    <p className="text-xs text-[var(--color-text-secondary)] mt-0.5">
                      1 press setup · 1 plate set
                      {gang.extraSheets !== 0 && ` · ${gang.extraSheets > 0 ? '+' : ''}${fmt(gang.extraSheets)} sheets`}
                    </p>
                  </div>
                </div>

                <div className="rounded-lg border border-[var(--color-border)] overflow-hidden">
                  {gang.lines.map(l => (
                    <div key={l.jobId} className="flex items-center justify-between gap-3 px-3 py-2 border-b border-[var(--color-border)] last:border-0 flex-wrap">
                      <span className="text-sm text-[var(--color-text-primary)]">
                        {l.jobNumber} <span className="text-[var(--color-text-muted)]">· {l.ups} ups</span>
                      </span>
                      <span className="text-sm text-[var(--color-text-secondary)]">
                        {fmt(l.orderedQty)} → <strong className="text-[var(--color-text-primary)]">{fmt(l.produced)}</strong>
                        {l.overage > 0 && (
                          <span className="text-[var(--color-warning)]"> (+{fmt(l.overage)}, +{l.overagePct}%)</span>
                        )}
                      </span>
                    </div>
                  ))}
                </div>

                {overaged.length > 0 && (
                  <label className="flex items-start gap-2.5 rounded-lg border p-3 cursor-pointer
                    bg-[color:color-mix(in_srgb,var(--color-warning)_10%,transparent)]
                    border-[color:color-mix(in_srgb,var(--color-warning)_30%,transparent)]">
                    <input type="checkbox" className="mt-0.5 w-4 h-4 accent-[var(--color-accent)] flex-shrink-0"
                      checked={agreed} onChange={e => setAgreed(e.target.checked)} />
                    <span className="text-sm text-[var(--color-text-primary)]">
                      The customer has agreed to the extra quantity.
                      <span className="block text-xs text-[var(--color-text-secondary)] mt-0.5">
                        Confirming changes the Sales Order to the new quantity, so dispatch and invoicing
                        both work to it. The original figure stays on the quotation.
                      </span>
                    </span>
                  </label>
                )}

                <div className="space-y-1.5">
                  <label htmlFor="gang-notes" className="text-sm font-medium text-[var(--color-text-primary)]">Notes</label>
                  <input id="gang-notes" className={inputCls} value={notes} onChange={e => setNotes(e.target.value)}
                    placeholder="Optional — die number, who agreed the extra quantity…" />
                </div>
              </>
            )}
          </div>
        </Section>
      )}

      {gang?.valid && (
        <div className="flex justify-end gap-2">
          <Link href="/dashboard/gangs" className="px-4 h-11 md:h-9 flex items-center rounded-md border border-[var(--color-border)] text-sm text-[var(--color-text-secondary)] hover:bg-[var(--color-bg-elevated)] transition-colors">Cancel</Link>
          <button onClick={create} disabled={loading || (overaged.length > 0 && !agreed)}
            className="flex items-center gap-2 px-5 h-11 md:h-9 rounded-md bg-[var(--color-accent)] text-[var(--color-on-accent)] text-sm font-medium hover:bg-[var(--color-accent-hover)] disabled:opacity-50 transition-colors">
            <Combine size={15} /> {loading ? 'Creating…' : 'Create Gang Run'}
          </button>
        </div>
      )}
    </div>
  )
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="rounded-xl border border-[var(--color-border)] bg-[var(--color-bg-secondary)] overflow-hidden">
      <div className="px-5 py-3.5 border-b border-[var(--color-border)] bg-[var(--color-bg-elevated)]">
        <h2 className="text-sm font-semibold text-[var(--color-text-primary)]">{title}</h2>
      </div>
      <div className="p-5">{children}</div>
    </div>
  )
}

function JobRow({ job, fixed }: { job: Job; fixed?: boolean }) {
  return (
    <span className="block py-1">
      <span className="text-sm font-medium text-[var(--color-text-primary)]">
        {job.job_number} — {job.job_title}
        {fixed && <Check size={13} className="inline ml-1.5 text-[var(--color-success)]" />}
      </span>
      <span className="block text-xs text-[var(--color-text-muted)]">
        {fmt(n(job.quantity))} pcs · {n(job.ups)} ups on its own
        {job.die_number && ` · die ${job.die_number}`}
        {job.board_types?.name && ` · ${job.board_types.name}`}
        {job.sheet_width_in && job.sheet_height_in && ` · ${job.sheet_width_in} × ${job.sheet_height_in}`}
      </span>
    </span>
  )
}

export { NewGangClient }
