'use client'
import { AlertTriangle } from 'lucide-react'
import { cn } from '@/lib/utils/cn'

/**
 * REPEAT KA LAYOUT — chup chaap naqal karne ke bajaye poochho.
 *
 * Mehboob: "JOB-00401-R2 ki die 20 ups ki hay … lakin is bar hum screen
 * printing say spot uv ker rahy hain us ki waja say hum isay 10 ya 12 ups main
 * print kery gy, us k hisab say sheet size b change ho jaey ga … next repeat per
 * pochy yah sahi hy."
 *
 * Die carton ki pehchan hai aur wo nahi badalti — `ups` aur sheet size RUN ki
 * apni cheez hain. Exact Repeat inhein parent se seedha naqal kar leta tha, is
 * liye ek istisna (spot UV ke liye kam ups) khamoshi se agle run ka DEFAULT ban
 * jata. Ab form ye dono poochhta hai, aur khandaan ke baqi run apne layout ke
 * sath saamne rakh deta hai taake "kaunsa sahi hai" nazar aa jaye.
 *
 * `sheet_qty` yahan sirf DIKHAYA jata hai; asal hisab server par hota hai
 * (§4: `ceil(quantity / ups)`), warna do jagah ek formula rakhna parta.
 */

export interface RepeatLayoutValue {
  ups: string
  sheet_width_in: string
  sheet_height_in: string
}

/** `get_job_family()` ki row jitni is form ko chahiye (132 + 149). */
export interface FamilyRunLayout {
  id: string
  job_number: string
  ups: number | null
  sheet_width_in: number | string | null
  sheet_height_in: number | string | null
}

const inputCls = 'w-full h-11 md:h-9 px-3 rounded-md border text-sm bg-[var(--color-bg-elevated)] text-[var(--color-text-primary)] border-[var(--color-border)] placeholder:text-[var(--color-text-muted)] focus:outline-none focus:border-[var(--color-accent)] focus:ring-1 focus:ring-[var(--color-accent)] transition-colors'

const num = (v: unknown) => {
  if (v === null || v === undefined || v === '') return null
  const n = Number(v)
  return Number.isFinite(n) ? n : null
}

/** "18 ups · 20 × 27.5 in" — ek run ka poora layout, ek satr mein. */
export function layoutText(r: { ups?: number | null; sheet_width_in?: number | string | null; sheet_height_in?: number | string | null }) {
  const w = num(r.sheet_width_in), h = num(r.sheet_height_in)
  const bits: string[] = []
  bits.push(r.ups ? `${r.ups} ups` : 'ups —')
  if (w != null && h != null) bits.push(`${w} × ${h} in`)
  return bits.join(' · ')
}

/** Do run ek hi layout par hain ya nahi — warning isi se banti hai. */
const layoutKey = (r: FamilyRunLayout) => `${r.ups ?? ''}|${num(r.sheet_width_in) ?? ''}x${num(r.sheet_height_in) ?? ''}`

export function RepeatLayoutFields({
  value, onChange, quantity, runs, idPrefix = 'repeat-layout',
}: {
  value: RepeatLayoutValue
  onChange: (patch: Partial<RepeatLayoutValue>) => void
  /** Naye run ki miqdaar — sirf Sheet Qty dikhane ke liye. */
  quantity: string | number | null
  /** Is carton ke saare run (khali ho to sirf khane dikhte hain). */
  runs: FamilyRunLayout[]
  idPrefix?: string
}) {
  const ups = num(value.ups)
  const qty = num(quantity)
  const sheetQty = ups && ups > 0 && qty && qty > 0 ? Math.ceil(qty / ups) : null

  // Warning sirf tab jab khandaan mein sach much do alag layout chal chuke hon.
  // Har repeat par ek zard patti dikhana usay shor bana deta hai, aur shor ko
  // log parhna chhoR dete hain.
  const withLayout = runs.filter(r => r.ups != null || num(r.sheet_width_in) != null)
  const distinct = new Set(withLayout.map(layoutKey))
  const mixed = distinct.size > 1

  return (
    <div className="space-y-3">
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <div className="space-y-1.5">
          <label htmlFor={`${idPrefix}-ups`} className="text-sm font-medium text-[var(--color-text-primary)]">Ups</label>
          <input id={`${idPrefix}-ups`} type="number" min="1" className={inputCls}
            value={value.ups} onChange={e => onChange({ ups: e.target.value })} placeholder="e.g. 12" />
        </div>
        <div className="space-y-1.5">
          <label htmlFor={`${idPrefix}-w`} className="text-sm font-medium text-[var(--color-text-primary)]">Sheet W (in)</label>
          <input id={`${idPrefix}-w`} type="number" step="0.25" className={inputCls}
            value={value.sheet_width_in} onChange={e => onChange({ sheet_width_in: e.target.value })} placeholder="e.g. 15.5" />
        </div>
        <div className="space-y-1.5">
          <label htmlFor={`${idPrefix}-h`} className="text-sm font-medium text-[var(--color-text-primary)]">Sheet H (in)</label>
          <input id={`${idPrefix}-h`} type="number" step="0.25" className={inputCls}
            value={value.sheet_height_in} onChange={e => onChange({ sheet_height_in: e.target.value })} placeholder="e.g. 27.5" />
        </div>
        <div className="space-y-1.5">
          <span className="text-sm font-medium text-[var(--color-text-primary)] block">Sheet Qty</span>
          <div className="h-11 md:h-9 flex items-center text-sm font-semibold text-[var(--color-text-primary)] tabular-nums">
            {sheetQty != null ? sheetQty.toLocaleString() : '—'}
          </div>
        </div>
      </div>

      <p className="text-xs text-[var(--color-text-muted)]">
        Die wohi purani rehti hai — sirf ye layout is run ka apna hai. Spot UV,
        screen printing ya doosre board par ups aur sheet size badal jate hain.
      </p>

      {withLayout.length > 0 && (
        <div className={cn(
          'rounded-lg border p-3 space-y-2',
          mixed
            ? 'border-[color:color-mix(in_srgb,var(--color-warning)_40%,transparent)] bg-[color:color-mix(in_srgb,var(--color-warning)_10%,transparent)]'
            : 'border-[var(--color-border)] bg-[color:color-mix(in_srgb,var(--color-bg-elevated)_50%,transparent)]'
        )}>
          <p className="text-xs font-medium text-[var(--color-text-primary)] flex items-center gap-1.5">
            {mixed && <AlertTriangle size={12} className="text-[var(--color-warning)] flex-shrink-0" />}
            {mixed
              ? 'Is carton ke run alag alag layout par chale hain — dekh kar chunein'
              : 'Is carton ke pichhle run'}
          </p>
          <div className="space-y-1">
            {withLayout.map(r => {
              const w = num(r.sheet_width_in), h = num(r.sheet_height_in)
              const isCurrent = String(r.ups ?? '') === String(value.ups)
                && String(w ?? '') === String(num(value.sheet_width_in) ?? '')
                && String(h ?? '') === String(num(value.sheet_height_in) ?? '')
              return (
                <div key={r.id} className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs">
                  <span className="font-mono text-[var(--color-text-secondary)]">{r.job_number}</span>
                  <span className="text-[var(--color-text-muted)]">{layoutText(r)}</span>
                  {isCurrent ? (
                    <span className="text-[var(--color-success)]">✓ yehi bhara hai</span>
                  ) : (
                    <button type="button"
                      onClick={() => onChange({
                        ups: r.ups != null ? String(r.ups) : '',
                        sheet_width_in: w != null ? String(w) : '',
                        sheet_height_in: h != null ? String(h) : '',
                      })}
                      className="text-[var(--color-accent)] hover:underline">
                      Ye layout lo
                    </button>
                  )}
                </div>
              )
            })}
          </div>
        </div>
      )}
    </div>
  )
}

export default RepeatLayoutFields
