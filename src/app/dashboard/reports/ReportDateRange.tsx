'use client'
import { useState } from 'react'
import { useRouter, usePathname } from 'next/navigation'
import { CalendarRange } from 'lucide-react'
import { cn } from '@/lib/utils/cn'
import { ScrollRow } from '@/components/ui/ScrollRow'

const inputCls = 'h-11 md:h-8 px-2.5 rounded-md border text-sm bg-[var(--color-bg-elevated)] text-[var(--color-text-primary)] border-[var(--color-border)] focus:outline-none focus:border-[var(--color-accent)] focus:ring-1 focus:ring-[var(--color-accent)] transition-colors'

const iso = (d: Date) => {
  // Local date, not UTC. toISOString() shifts backwards for PKT (+05), which
  // would make "Today" start yesterday for anyone in Lahore.
  const off = d.getTimezoneOffset() * 60000
  return new Date(d.getTime() - off).toISOString().slice(0, 10)
}

/** Presets resolved fresh on click, so a tab left open overnight isn't stale. */
export const RANGE_PRESETS: { key: string; label: string; resolve: () => [string, string] }[] = [
  { key: 'today', label: 'Today', resolve: () => { const t = new Date(); return [iso(t), iso(t)] } },
  { key: '7d', label: 'Last 7 days', resolve: () => { const t = new Date(); const f = new Date(); f.setDate(f.getDate() - 6); return [iso(f), iso(t)] } },
  { key: '30d', label: 'Last 30 days', resolve: () => { const t = new Date(); const f = new Date(); f.setDate(f.getDate() - 29); return [iso(f), iso(t)] } },
  { key: 'month', label: 'This month', resolve: () => { const t = new Date(); return [iso(new Date(t.getFullYear(), t.getMonth(), 1)), iso(t)] } },
  { key: 'lastmonth', label: 'Last month', resolve: () => { const t = new Date(); return [iso(new Date(t.getFullYear(), t.getMonth() - 1, 1)), iso(new Date(t.getFullYear(), t.getMonth(), 0))] } },
  { key: 'quarter', label: 'This quarter', resolve: () => { const t = new Date(); return [iso(new Date(t.getFullYear(), Math.floor(t.getMonth() / 3) * 3, 1)), iso(t)] } },
  { key: 'year', label: 'This year', resolve: () => { const t = new Date(); return [iso(new Date(t.getFullYear(), 0, 1)), iso(t)] } },
  { key: 'lastyear', label: 'Last year', resolve: () => { const t = new Date(); return [iso(new Date(t.getFullYear() - 1, 0, 1)), iso(new Date(t.getFullYear() - 1, 11, 31))] } },
]

/**
 * Drives the whole Reports page off the URL (?from=&to=) rather than local
 * state: the page is a server component that refetches on searchParams change,
 * so the range survives a refresh and a report can be shared as a link.
 */
export function ReportDateRange({ from, to }: { from: string; to: string }) {
  const router = useRouter()
  const pathname = usePathname()
  const [custom, setCustom] = useState({ from, to })

  const apply = (f: string, t: string) => {
    if (f > t) { [f, t] = [t, f] }   // picked backwards — just swap, don't scold
    setCustom({ from: f, to: t })
    router.push(`${pathname}?from=${f}&to=${t}`)
  }

  // A preset is "active" when its dates match what's applied, so the highlight
  // stays correct after a reload — there is no separate preset key in the URL.
  const activeKey = RANGE_PRESETS.find(p => {
    const [f, t] = p.resolve()
    return f === from && t === to
  })?.key

  return (
    <div className="space-y-2.5">
      <ScrollRow contentClassName="gap-1 -mx-1 px-1" activeSelector="[data-range-active='true']" activeKey={activeKey ?? 'custom'}>
        {RANGE_PRESETS.map(p => {
          const on = activeKey === p.key
          return (
            <button key={p.key} onClick={() => apply(...p.resolve())} data-range-active={on}
              className={cn('px-3 h-11 md:h-8 rounded-md text-sm font-medium border transition-colors flex-shrink-0 whitespace-nowrap',
                on
                  ? 'bg-[var(--color-accent)] text-[var(--color-on-accent)] border-transparent'
                  : 'border-[var(--color-border)] text-[var(--color-text-secondary)] hover:text-[var(--color-text-primary)]')}>
              {p.label}
            </button>
          )
        })}
      </ScrollRow>

      <div className="flex flex-wrap items-center gap-2">
        <CalendarRange size={14} className="text-[var(--color-text-muted)] flex-shrink-0" />
        <label htmlFor="rpt-from" className="text-xs text-[var(--color-text-muted)]">From</label>
        <input id="rpt-from" type="date" className={inputCls} value={custom.from}
          onChange={e => setCustom(p => ({ ...p, from: e.target.value }))} />
        <label htmlFor="rpt-to" className="text-xs text-[var(--color-text-muted)]">To</label>
        <input id="rpt-to" type="date" className={inputCls} value={custom.to}
          onChange={e => setCustom(p => ({ ...p, to: e.target.value }))} />
        <button onClick={() => apply(custom.from, custom.to)}
          disabled={!custom.from || !custom.to || (custom.from === from && custom.to === to)}
          className="px-3 h-11 md:h-8 rounded-md bg-[var(--color-accent)] text-[var(--color-on-accent)] text-sm font-medium hover:bg-[var(--color-accent-hover)] disabled:opacity-50 transition-colors">
          Apply
        </button>
      </div>
    </div>
  )
}

export default ReportDateRange
