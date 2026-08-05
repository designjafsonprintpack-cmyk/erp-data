'use client'
import { useEffect, useRef, useState } from 'react'
import { RefreshCw, Sparkles, X, Search } from 'lucide-react'
import { cn } from '@/lib/utils/cn'
import { Modal } from '@/components/ui/Modal'

export interface RepeatCandidate {
  job_id: string
  job_number: string
  job_title: string
  customer_name: string | null
  same_customer: boolean
  size_l: number | null
  size_w: number | null
  size_h: number | null
  ups: number | null
  gsm: number | null
  board_name: string | null
  die_number: string | null
  last_run_date: string | null
  last_quantity: number | null
  run_count: number
  score: number
}

/** Jo cheez SO ki line par mehfooz hoti hai. */
export interface RepeatLink {
  job_id: string
  job_number: string
  job_title: string
}

const sizeText = (c: { size_l: number | null; size_w: number | null; size_h: number | null }) =>
  c.size_l && c.size_w && c.size_h
    ? `${Number(c.size_l)} × ${Number(c.size_w)} × ${Number(c.size_h)} mm`
    : null

const num = (n: any) => n == null ? '—' : Number(n).toLocaleString('en-PK')

/**
 * "Ye carton pehle chala hai ya naya hai?" — SO ki line par.
 *
 * Customer ki PO se naam likhte hi ye khud purane carton dhoondta hai. Mehboob
 * ka apna tareeqa yehi hai — *"main phir doondu ga ke mere paas Heaven 13w Bulb
 * hai ke nahi, hai to repeat, nahi to new"* — bas ab dhoondna use nahi parta,
 * aur naam ka farq (`Hl` vs `Hl.`, `SP` vs `Sp.`) usay chakma nahi de sakta.
 *
 * **Ye kabhi khud faisla nahi karta.** Har candidate ke sath SIZE sab se numaya
 * likha hota hai, kyunke asal data mein wahi faisla-kun hai: `Aktive Chocolate
 * 24 SP` (200×125×70) aur `24 Sp.` (200×130×73) naam se 100% milte hain aur do
 * alag carton hain — Mehboob ne ek nazar mein pakar liya tha. Aur
 * `Peraq Led Zone 12 Watt` vs `12.5 Watt` ka mel 0.93 hai. Auto-link in donon
 * par ghalat hota.
 */
export default function RepeatPicker({
  query, customerId, value, onChange, disabled,
}: {
  /** Line ki description — jo customer ki PO se likhi ja rahi hai. */
  query: string
  customerId: string
  value: RepeatLink | null
  onChange: (link: RepeatLink | null) => void
  disabled?: boolean
}) {
  const [candidates, setCandidates] = useState<RepeatCandidate[]>([])
  const [open, setOpen] = useState(false)
  const [loading, setLoading] = useState(false)
  const reqId = useRef(0)

  // Har haraf par ek query na jaye — likhna ruk jane ka intezar.
  useEffect(() => {
    if (value || disabled || query.trim().length < 3) { setCandidates([]); return }
    const mine = ++reqId.current
    const t = setTimeout(async () => {
      setLoading(true)
      try {
        const qs = new URLSearchParams({ q: query.trim() })
        if (customerId) qs.set('customer_id', customerId)
        const res = await fetch(`/api/v1/jobs/repeat-candidates?${qs}`)
        const json = await res.json()
        if (mine !== reqId.current) return          // naya sawal aa chuka
        setCandidates(res.ok ? (json.data ?? []) : [])
      } catch {
        if (mine === reqId.current) setCandidates([])
      } finally {
        if (mine === reqId.current) setLoading(false)
      }
    }, 400)
    return () => clearTimeout(t)
  }, [query, customerId, value, disabled])

  if (disabled) return null

  // ─── Chun liya gaya: REPEAT ───────────────────────────────────────────────
  if (value) {
    return (
      <div className="flex items-center gap-1.5 mt-1 min-w-0">
        <span className="inline-flex items-center gap-1 text-[11px] px-1.5 py-0.5 rounded border font-medium flex-shrink-0
          text-[var(--color-info)]
          bg-[color:color-mix(in_srgb,var(--color-info)_10%,transparent)]
          border-[color:color-mix(in_srgb,var(--color-info)_30%,transparent)]">
          <RefreshCw size={9} /> Repeat
        </span>
        <span className="text-[11px] text-[var(--color-text-muted)] truncate">
          {value.job_number} · {value.job_title}
        </span>
        <button type="button" onClick={() => onChange(null)} aria-label="Repeat link hatao"
          className="flex-shrink-0 text-[var(--color-text-muted)] hover:text-[var(--color-danger)] transition-colors">
          <X size={11} />
        </button>
      </div>
    )
  }

  // ─── Kuch mila hi nahi, ya abhi likha ja raha hai ────────────────────────
  if (!candidates.length) {
    return query.trim().length >= 3 && !loading ? (
      <div className="flex items-center gap-1.5 mt-1">
        <span className="inline-flex items-center gap-1 text-[11px] px-1.5 py-0.5 rounded border font-medium
          text-[var(--color-text-muted)] bg-[var(--color-bg-elevated)] border-[var(--color-border)]">
          <Sparkles size={9} /> Naya carton
        </span>
      </div>
    ) : null
  }

  // ─── Milte julte carton mile ─────────────────────────────────────────────
  return (
    <>
      <button type="button" onClick={() => setOpen(true)}
        className="flex items-center gap-1 mt-1 text-[11px] font-medium text-[var(--color-warning)] hover:underline">
        <Search size={10} />
        {candidates.length} milta julta carton mila — dekhein
      </button>

      <Modal open={open} onClose={() => setOpen(false)} size="lg"
        title="Ye carton pehle chala hai?"
        footer={
          <button onClick={() => { onChange(null); setOpen(false) }}
            className="px-4 h-11 md:h-9 rounded-md border border-[var(--color-border)] text-sm text-[var(--color-text-secondary)] hover:bg-[var(--color-bg-elevated)] transition-colors">
            Koi nahi — naya carton hai
          </button>
        }>
        <div className="space-y-3">
          <p className="text-xs text-[var(--color-text-muted)]">
            <span className="font-medium text-[var(--color-text-secondary)]">&ldquo;{query}&rdquo;</span> se milte julte purane carton.
            <br />
            <span className="text-[var(--color-warning)]">Naam milna kaafi nahi</span> — size zaroor mila lein. Ek hi naam ke do carton
            alag size ke ho sakte hain.
          </p>

          <div className="space-y-2">
            {candidates.map(c => (
              <button key={c.job_id} type="button"
                onClick={() => {
                  onChange({ job_id: c.job_id, job_number: c.job_number, job_title: c.job_title })
                  setOpen(false)
                }}
                className={cn(
                  'w-full text-left rounded-lg border p-3 transition-colors',
                  'hover:border-[var(--color-accent)] hover:bg-[color:color-mix(in_srgb,var(--color-accent)_5%,transparent)]',
                  c.same_customer
                    ? 'border-[var(--color-border)] bg-[var(--color-bg-secondary)]'
                    // Doosre customer ka carton — ek hi naam do customers ke paas
                    // ho sakta hai aur wo DO ALAG carton hote hain (alag artwork,
                    // alag die). Dikhta hai, magar saaf nishan-zada.
                    : 'border-dashed border-[var(--color-border)] bg-transparent opacity-80'
                )}>
                <div className="flex items-start justify-between gap-3 flex-wrap">
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-[var(--color-text-primary)]">
                      <span className="font-mono text-[var(--color-accent)]">{c.job_number}</span>
                      {' · '}{c.job_title}
                      {c.run_count > 1 && (
                        <span className="ml-1.5 text-[10px] text-[var(--color-text-muted)]">
                          ({c.run_count} runs)
                        </span>
                      )}
                    </p>
                    {/* SIZE sab se pehle aur bold — yehi faisla-kun cheez hai. */}
                    <p className="text-sm mt-0.5">
                      {sizeText(c)
                        ? <span className="font-semibold text-[var(--color-text-primary)]">{sizeText(c)}</span>
                        : <span className="text-[var(--color-text-muted)] italic">size darj nahi</span>}
                    </p>
                    <p className="text-[11px] text-[var(--color-text-muted)] mt-0.5">
                      {[
                        c.ups ? `${c.ups} ups` : null,
                        c.gsm ? `${Number(c.gsm)} gsm` : null,
                        c.board_name,
                        c.die_number ? `die ${c.die_number}` : null,
                      ].filter(Boolean).join(' · ') || '—'}
                    </p>
                    <p className="text-[11px] text-[var(--color-text-muted)]">
                      aakhri run: {c.last_run_date ?? '—'} · {num(c.last_quantity)}
                    </p>
                  </div>
                  {!c.same_customer && (
                    <span className="text-[10px] px-1.5 py-0.5 rounded border flex-shrink-0
                      text-[var(--color-warning)]
                      bg-[color:color-mix(in_srgb,var(--color-warning)_10%,transparent)]
                      border-[color:color-mix(in_srgb,var(--color-warning)_30%,transparent)]">
                      doosra customer: {c.customer_name ?? '—'}
                    </span>
                  )}
                </div>
              </button>
            ))}
          </div>
        </div>
      </Modal>
    </>
  )
}

export { RepeatPicker }
