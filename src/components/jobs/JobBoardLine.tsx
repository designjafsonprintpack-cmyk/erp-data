'use client'
import Link from 'next/link'
import { Package, AlertTriangle, Truck, CheckCircle2 } from 'lucide-react'

export interface JobBoardDemand {
  id: string
  material_name: string
  gsm: number | null
  sheet_width_in: number | null
  sheet_height_in: number | null
  sheets_required: number
  sheets_from_stock: number
  sheets_ordered: number
  sheets_to_purchase: number
  status: string
  /** Gang run mein board lead job ke naam nikalta hai — kis ke, ye batana parta hai. */
  owner_job_number?: string | null
  po_numbers?: string[]
  expected_date?: string | null
}

const fmt = (n: any) => Number(n || 0).toLocaleString('en-PK', { maximumFractionDigits: 0 })

/**
 * POORI class strings, banayi hui nahi.
 *
 * Tailwind source ko TEXT ki tarah parhta hai, is liye `--color-${tone}` jaisi
 * class kabhi build hi nahi hoti — bilkul waisay hi jaisay `col-span-${n}` nahi
 * hoti. Aur alpha bhi `color-mix()` se hi lagta hai: `var()` par `/10` likhne se
 * Tailwind v3 koi rule hi nahi likhta aur border Preflight ke safaid par chala
 * jata hai (573 utilities isi tarah gayi thin).
 */
const TONE = {
  success: {
    box:  'bg-[color:color-mix(in_srgb,var(--color-success)_8%,transparent)] border-[color:color-mix(in_srgb,var(--color-success)_30%,transparent)]',
    icon: 'text-[var(--color-success)]',
  },
  danger: {
    box:  'bg-[color:color-mix(in_srgb,var(--color-danger)_8%,transparent)] border-[color:color-mix(in_srgb,var(--color-danger)_30%,transparent)]',
    icon: 'text-[var(--color-danger)]',
  },
  info: {
    box:  'bg-[color:color-mix(in_srgb,var(--color-info)_8%,transparent)] border-[color:color-mix(in_srgb,var(--color-info)_30%,transparent)]',
    icon: 'text-[var(--color-info)]',
  },
} as const

/**
 * Job ka board ek nazar mein — "12,000 sheets · 3,000 stock se · 9,000 PO par".
 *
 * Ye us purani soorat-e-haal ka jawab hai jahan board ka pata sirf Printing
 * shuru karte waqt chalta tha, aur wo bhi ek narm warning ki soorat mein. Ab job
 * ke pehle din se yahan likha hota hai.
 */
export default function JobBoardLine({ demand }: { demand: JobBoardDemand | null }) {
  if (!demand) return null

  const required = Number(demand.sheets_required || 0)
  const stock    = Number(demand.sheets_from_stock || 0)
  const ordered  = Number(demand.sheets_ordered || 0)
  const toBuy    = Number(demand.sheets_to_purchase || 0)

  const ready = demand.status === 'ready'
  const short = toBuy > 0

  // Teen halaten, teen rang: board hath mein (sabz), PO par (neela), abhi
  // khareedna baqi (surkh). Chauthi koi nahi.
  const tone: keyof typeof TONE = ready ? 'success' : short ? 'danger' : 'info'
  const Icon = ready ? CheckCircle2 : short ? AlertTriangle : Truck

  return (
    <div className={`col-span-full rounded-xl border p-4 ${TONE[tone].box}`}>
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div className="min-w-0 flex items-start gap-2.5">
          <Icon size={16} className={`${TONE[tone].icon} flex-shrink-0 mt-0.5`} />
          <div className="min-w-0">
            <p className="text-sm font-semibold text-[var(--color-text-primary)]">
              {ready ? 'Board ready' : short ? 'Board short' : 'Board on order'}
              {demand.owner_job_number && (
                <span className="font-normal text-[var(--color-text-muted)]">
                  {' '}— run ke sath, {demand.owner_job_number} ke naam
                </span>
              )}
            </p>
            <p className="text-sm text-[var(--color-text-secondary)] mt-1">
              <strong>{fmt(required)}</strong> sheets chahiyen
              {' — '}
              {demand.material_name}
              {demand.gsm ? ` ${Number(demand.gsm)} gsm` : ''}
              {demand.sheet_width_in && demand.sheet_height_in
                ? ` ${Number(demand.sheet_width_in)} × ${Number(demand.sheet_height_in)}`
                : ''}
            </p>
            <p className="text-xs text-[var(--color-text-muted)] mt-1">
              {stock > 0 && <span className="text-[var(--color-success)]">{fmt(stock)} stock se</span>}
              {stock > 0 && (ordered > 0 || toBuy > 0) && ' · '}
              {ordered > 0 && (
                <span className="text-[var(--color-info)]">
                  {fmt(ordered)} PO par
                  {demand.po_numbers?.length ? ` (${demand.po_numbers.join(', ')})` : ''}
                  {demand.expected_date ? ` · expected ${demand.expected_date}` : ''}
                </span>
              )}
              {ordered > 0 && toBuy > 0 && ' · '}
              {toBuy > 0 && <span className="text-[var(--color-danger)]">{fmt(toBuy)} abhi khareedna hai</span>}
            </p>
          </div>
        </div>
        {short && (
          <Link href="/dashboard/purchase"
            className="px-3 h-9 flex items-center gap-1.5 rounded-md border border-[var(--color-border)] text-xs font-medium text-[var(--color-text-secondary)] hover:border-[var(--color-accent)] hover:text-[var(--color-accent)] transition-colors whitespace-nowrap">
            <Package size={13} /> Purchase
          </Link>
        )}
      </div>
    </div>
  )
}

export { JobBoardLine }
