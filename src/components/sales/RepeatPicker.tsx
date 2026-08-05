'use client'
import { useEffect, useRef, useState } from 'react'
import { RefreshCw, X, Search } from 'lucide-react'
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
  no_of_colors: number | null
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
 * "Ye carton pehle chala hai ya naya hai?" — Sales Order ki line par.
 *
 * Customer ki PO se naam likhte hi ye khud USI CUSTOMER ke purane carton
 * dhoondta hai (142). Mehboob ka apna tareeqa yehi hai — *"main phir doondu ga
 * ke mere paas Heaven 13w Bulb hai ke nahi, hai to repeat, nahi to new"* — bas
 * ab dhoondna use nahi parta, aur naam ka farq (`Hl` vs `Hl.`, `SP` vs `Sp.`)
 * usay chakma nahi de sakta.
 *
 * **Ye ek TABLE CELL hai, ek satr ka.** Pehla design ise description ke NEECHE
 * chipka deta tha, jis se sirf ek column do satron ka ho jata aur poori row ki
 * tarteeb bigar jati — Mehboob: *"kitna bura lag raha hai, koi professional
 * nahi lag raha."* Ab ye Unit Price ke baad apne column mein baithta hai aur
 * row ek hi satr ki rehti hai.
 *
 * **Faisla kabhi khud nahi karta.** Har candidate ke sath SIZE sab se numaya
 * likha hota hai, kyunke asal data mein wahi faisla-kun hai: `Aktive Chocolate
 * 24 SP` (200×125×70) aur `24 Sp.` (200×130×73) naam se 100% milte hain aur do
 * alag carton hain — Mehboob ne ek nazar mein pakar liya tha.
 */
export default function RepeatPicker({
  query, customerId, value, onChange, disabled,
}: {
  /** Line ki description — jo customer ki PO se likhi ja rahi hai. */
  query: string
  customerId: string
  value: RepeatLink | null
  /** Chunte waqt poora candidate bhi jata hai, taake line ke specs bhar jayen. */
  onChange: (link: RepeatLink | null, candidate?: RepeatCandidate) => void
  disabled?: boolean
}) {
  const [candidates, setCandidates] = useState<RepeatCandidate[]>([])
  const [open, setOpen] = useState(false)
  const [loading, setLoading] = useState(false)
  const reqId = useRef(0)

  // Har haraf par ek query na jaye — likhna ruk jane ka intezar.
  useEffect(() => {
    if (value || disabled || !customerId || query.trim().length < 3) { setCandidates([]); return }
    const mine = ++reqId.current
    const t = setTimeout(async () => {
      setLoading(true)
      try {
        const qs = new URLSearchParams({ q: query.trim(), customer_id: customerId })
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

  const cellBtn = 'h-8 w-full px-2 rounded-md border text-xs font-medium inline-flex items-center gap-1 cursor-pointer transition-colors duration-150 focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-accent)]'

  return (
    <>
      {/* ─── Cell: teen halaton mein se ek ─────────────────────────────────── */}
      {value ? (
        // Jur chuka hai.
        <div className="flex items-center gap-1 min-w-0">
          <button type="button" onClick={() => setOpen(true)} title={`${value.job_number} · ${value.job_title}`}
            className={cn(cellBtn, 'justify-start min-w-0',
              'text-[var(--color-info)] border-[color:color-mix(in_srgb,var(--color-info)_35%,transparent)] bg-[color:color-mix(in_srgb,var(--color-info)_10%,transparent)]',
              'hover:bg-[color:color-mix(in_srgb,var(--color-info)_18%,transparent)]')}>
            <RefreshCw size={11} className="flex-shrink-0" />
            <span className="truncate font-mono">{value.job_number}</span>
          </button>
          <button type="button" onClick={() => onChange(null)} aria-label="Repeat link hatao"
            className="w-6 h-8 flex items-center justify-center flex-shrink-0 rounded text-[var(--color-text-muted)] hover:text-[var(--color-danger)] transition-colors duration-150 cursor-pointer">
            <X size={12} />
          </button>
        </div>
      ) : candidates.length ? (
        // Milte julte carton mile — dekhna baqi hai.
        <button type="button" onClick={() => setOpen(true)} disabled={disabled}
          className={cn(cellBtn, 'justify-center',
            'text-[var(--color-warning)] border-[color:color-mix(in_srgb,var(--color-warning)_40%,transparent)] bg-[color:color-mix(in_srgb,var(--color-warning)_10%,transparent)]',
            'hover:bg-[color:color-mix(in_srgb,var(--color-warning)_18%,transparent)]')}>
          <Search size={11} /> {candidates.length} mile
        </button>
      ) : (
        // Kuch nahi mila — magar haath se dhoondna hamesha mumkin rahe.
        <button type="button" onClick={() => setOpen(true)}
          disabled={disabled || !customerId || query.trim().length < 3}
          title={!customerId ? 'Pehle customer chunein' : 'Purane carton mein dhoondein'}
          className={cn(cellBtn, 'justify-center',
            'text-[var(--color-text-muted)] border-[var(--color-border)] bg-transparent',
            'hover:text-[var(--color-text-primary)] hover:bg-[var(--color-bg-elevated)]',
            'disabled:opacity-40 disabled:cursor-not-allowed')}>
          {loading ? '…' : <><Search size={11} /> New</>}
        </button>
      )}

      {/* ─── Chunne ka modal ───────────────────────────────────────────────── */}
      <Modal open={open} onClose={() => setOpen(false)} size="lg"
        title="Ye carton pehle chala hai?"
        footer={
          <button onClick={() => { onChange(null); setOpen(false) }}
            className="px-4 h-11 md:h-9 rounded-md border border-[var(--color-border)] text-sm text-[var(--color-text-secondary)] hover:bg-[var(--color-bg-elevated)] transition-colors duration-150 cursor-pointer">
            Koi nahi — naya carton hai
          </button>
        }>
        <div className="space-y-3">
          <p className="text-xs text-[var(--color-text-muted)]">
            <span className="font-medium text-[var(--color-text-secondary)]">&ldquo;{query}&rdquo;</span>
            {' '}se milte julte carton, isi customer ke.
            <br />
            <span className="text-[var(--color-warning)]">Naam milna kaafi nahi</span> — size zaroor mila lein.
            Ek hi naam ke do carton alag size ke ho sakte hain.
          </p>

          {!candidates.length ? (
            <p className="py-8 text-center text-sm text-[var(--color-text-muted)]">
              {loading ? 'Dhoond raha hoon…' : 'Is customer ka aisa koi carton nahi mila — naya hai.'}
            </p>
          ) : (
            <div className="space-y-2">
              {candidates.map(c => (
                <button key={c.job_id} type="button"
                  onClick={() => {
                    onChange({ job_id: c.job_id, job_number: c.job_number, job_title: c.job_title }, c)
                    setOpen(false)
                  }}
                  className={cn(
                    'w-full text-left rounded-lg border p-3 cursor-pointer',
                    'border-[var(--color-border)] bg-[var(--color-bg-secondary)]',
                    'transition-colors duration-150',
                    'hover:border-[var(--color-accent)] hover:bg-[color:color-mix(in_srgb,var(--color-accent)_6%,transparent)]',
                    'focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-accent)]'
                  )}>
                  <p className="text-sm font-medium text-[var(--color-text-primary)]">
                    <span className="font-mono text-[var(--color-accent)]">{c.job_number}</span>
                    {' · '}{c.job_title}
                    {c.run_count > 1 && (
                      <span className="ml-1.5 text-[10px] text-[var(--color-text-muted)]">({c.run_count} runs)</span>
                    )}
                  </p>
                  {/* SIZE sab se pehle aur bold — yehi faisla-kun cheez hai. */}
                  <p className="text-sm mt-0.5 tabular-nums">
                    {sizeText(c)
                      ? <span className="font-semibold text-[var(--color-text-primary)]">{sizeText(c)}</span>
                      : <span className="text-[var(--color-text-muted)] italic">size darj nahi</span>}
                  </p>
                  <p className="text-[11px] text-[var(--color-text-muted)] mt-0.5 tabular-nums">
                    {[
                      c.no_of_colors ? `${c.no_of_colors} colour${c.no_of_colors > 1 ? 's' : ''}` : null,
                      c.ups ? `${c.ups} ups` : null,
                      c.gsm ? `${Number(c.gsm)} gsm` : null,
                      c.board_name,
                      c.die_number ? `die ${c.die_number}` : null,
                    ].filter(Boolean).join(' · ') || '—'}
                  </p>
                  <p className="text-[11px] text-[var(--color-text-muted)] tabular-nums">
                    aakhri run: {c.last_run_date ?? '—'} · {num(c.last_quantity)}
                  </p>
                </button>
              ))}
            </div>
          )}
        </div>
      </Modal>
    </>
  )
}

export { RepeatPicker }
