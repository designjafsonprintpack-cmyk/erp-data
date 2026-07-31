'use client'
import { Lock, Zap, ArrowDown, CheckCircle2 } from 'lucide-react'
import { cn } from '@/lib/utils/cn'
import { JOURNEY, JOURNEY_PHASES, type JourneyStep, type JourneyPhase } from '@/lib/help/content'

/**
 * "Job ka naqsha" — the whole journey as a picture, above the written steps.
 *
 * WHY IT IS DRAWN IN HTML/CSS AND NOT AS AN <svg>
 *   An SVG needs fixed coordinates and a viewBox. On a 360px phone that means
 *   either illegible 6px text or a sideways scroll — and §6's rule here is
 *   that when something goes "bahir", it has to FIT, not get a scrollbar. Flex
 *   wrapping reflows on its own at every width, inherits the theme variables
 *   directly instead of needing them re-declared inside the SVG, and keeps the
 *   labels as real selectable text a screen reader can read.
 *
 * WHY IT IS BUILT FROM `JOURNEY` AND HAS NO CONTENT OF ITS OWN
 *   A hand-drawn diagram is a second copy of the workflow that starts lying the
 *   day a stage moves — and this workflow HAS moved (Lamination and Hot Foil
 *   were taken out of Standard Carton by hand; 110 changed which template a job
 *   even gets). Every chip, its number, its band, its owner and its lock come
 *   off the same array the written list below is rendered from, so the two can
 *   never disagree.
 *
 * A chip shows a LOCK when the step has a `gate` — something that stops the job
 * until it is satisfied. That is derived, not a second flag to keep in sync.
 */

interface JourneyMapProps {
  /** The viewer's role slug, so their own steps are picked out. */
  slug: string
  className?: string
}

/** Per-band accent, so the four bands read apart at a glance. */
const PHASE_TINT: Record<JourneyPhase, string> = {
  sales:      'var(--color-success)',
  job:        'var(--color-accent)',
  production: 'var(--color-info)',
  money:      'var(--color-warning)',
}

/**
 * `color-mix` and not an opacity modifier. `bg-[var(--color-info)]/10` emits NO
 * RULE AT ALL in Tailwind v3 — it cannot inject alpha into a var() — which is
 * how 573 utilities across 64 files ended up silently doing nothing. These are
 * runtime values anyway, so they go through inline styles.
 */
const tintBg = (c: string, pct: number) => `color-mix(in srgb, ${c} ${pct}%, transparent)`

function Chip({ step, mine }: { step: JourneyStep; mine: boolean }) {
  const tint = PHASE_TINT[step.phase]
  return (
    <li
      className={cn(
        'relative flex items-center gap-1.5 rounded-lg border px-2 py-1.5',
        'min-w-0 max-w-full',
        mine && 'shadow-sm'
      )}
      style={{
        borderColor: mine ? 'var(--color-accent)' : tintBg(tint, 35),
        background: mine ? tintBg('var(--color-accent)', 12) : tintBg(tint, 7),
      }}
      title={`${step.title} — ${step.whoLabel}`}
    >
      <span
        className="flex-shrink-0 w-5 h-5 rounded-full text-[10px] font-bold flex items-center justify-center tabular-nums"
        style={{
          background: mine ? 'var(--color-accent)' : tintBg(tint, 22),
          color: mine ? 'var(--color-on-accent)' : 'var(--color-text-secondary)',
        }}
      >
        {step.n}
      </span>
      <span className="min-w-0">
        <span className="block text-[11px] font-semibold leading-tight text-[var(--color-text-primary)] truncate">
          {step.short}
        </span>
        <span className="block text-[9px] leading-tight text-[var(--color-text-muted)] truncate">
          {step.whoLabel}
        </span>
      </span>
      {/* A lock means: this step will not let the job past until it is done. */}
      {step.gate && (
        <Lock
          size={11}
          className="flex-shrink-0 text-[var(--color-warning)]"
          aria-label="Rukawat"
        />
      )}
    </li>
  )
}

function Band({ phase, steps, slug }: { phase: typeof JOURNEY_PHASES[number]; steps: JourneyStep[]; slug: string }) {
  const tint = PHASE_TINT[phase.key]
  return (
    <div
      className="rounded-xl border p-3"
      style={{ borderColor: tintBg(tint, 30), background: tintBg(tint, 4) }}
    >
      <div className="flex flex-wrap items-baseline gap-x-2 mb-2">
        <span
          className="text-[10px] font-bold uppercase tracking-wider"
          style={{ color: tint }}
        >
          {phase.label}
        </span>
        <span className="text-[10px] text-[var(--color-text-muted)]">{phase.hint}</span>
        <span className="text-[10px] text-[var(--color-text-muted)] ml-auto tabular-nums">
          {steps.length} step{steps.length === 1 ? '' : 's'}
        </span>
      </div>
      {/* Wrapping flex, not a grid: a grid column count would have to come from
          a runtime number, and Tailwind purges `grid-cols-N` built that way. */}
      <ul className="flex flex-wrap gap-1.5">
        {steps.map(s => <Chip key={s.n} step={s} mine={s.who.includes(slug)} />)}
      </ul>
    </div>
  )
}

export function JourneyMap({ slug, className }: JourneyMapProps) {
  const mineCount = JOURNEY.filter(s => s.who.includes(slug)).length

  return (
    <div className={cn('rounded-xl border border-[var(--color-border)] bg-[var(--color-bg-secondary)] p-4', className)}>
      <h3 className="text-base font-semibold text-[var(--color-text-primary)]">Job ka naqsha</h3>
      <p className="text-sm text-[var(--color-text-muted)] mt-1">
        Poora rasta ek nazar mein. {mineCount > 0
          ? <>Neele nishan wale <strong className="text-[var(--color-accent)]">aap ke {mineCount} step</strong> hain.</>
          : <>Is rastay mein aap ka koi step nahi — aap ka kaam saath chalta hai.</>}
      </p>

      <div className="mt-3 space-y-1.5">
        {JOURNEY_PHASES.map((phase, i) => {
          const steps = JOURNEY.filter(s => s.phase === phase.key)
          if (!steps.length) return null
          return (
            <div key={phase.key} className="space-y-1.5">
              <Band phase={phase} steps={steps} slug={slug} />
              {i < JOURNEY_PHASES.length - 1 && (
                <div className="flex justify-center" aria-hidden="true">
                  <ArrowDown size={14} className="text-[var(--color-text-muted)]" />
                </div>
              )}
            </div>
          )
        })}
      </div>

      {/* Two things the chips cannot say for themselves. Both are real rules,
          not decoration: the first is the only automatic status change in the
          system, the second is the one step that is not a stage at all. */}
      <div className="mt-3 space-y-1.5">
        <p className="flex gap-2 items-start">
          <CheckCircle2 size={13} className="flex-shrink-0 mt-0.5 text-[var(--color-success)]" />
          <span className="text-xs text-[var(--color-text-muted)] leading-relaxed">
            Dispatch complete hote hi job <strong className="text-[var(--color-text-secondary)]">khud completed</strong> ho
            jaati hai. Koi aur cheez job ko band nahi karti.
          </span>
        </p>
        <p className="flex gap-2 items-start">
          <Zap size={13} className="flex-shrink-0 mt-0.5 text-[var(--color-info)]" />
          <span className="text-xs text-[var(--color-text-muted)] leading-relaxed">
            <strong className="text-[var(--color-text-secondary)]">Plates stage nahi hai</strong> — wo alag se banti hain,
            magar unke baghair Printing bilkul start nahi hoti.
          </span>
        </p>
      </div>

      {/* Legend */}
      <div className="mt-3 pt-3 border-t border-[var(--color-border-subtle)] flex flex-wrap items-center gap-x-4 gap-y-1.5">
        <span className="flex items-center gap-1.5">
          <Lock size={11} className="text-[var(--color-warning)]" />
          <span className="text-[10px] text-[var(--color-text-muted)]">Rukawat — poora hue baghair job aage nahi jaati</span>
        </span>
        <span className="flex items-center gap-1.5">
          <span
            className="w-3 h-3 rounded border"
            style={{ borderColor: 'var(--color-accent)', background: tintBg('var(--color-accent)', 12) }}
          />
          <span className="text-[10px] text-[var(--color-text-muted)]">Aap ka kaam</span>
        </span>
        <span className="text-[10px] text-[var(--color-text-muted)]">
          Yeh Standard Carton ka rasta hai — HL, Label aur Proofing ke raste neeche likhe hain.
        </span>
      </div>
    </div>
  )
}

export default JourneyMap
