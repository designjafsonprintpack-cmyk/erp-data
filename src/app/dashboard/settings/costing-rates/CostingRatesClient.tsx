'use client'
import { useState } from 'react'
import { Save } from 'lucide-react'
import { toast } from '@/components/ui/Toast'

const FIELDS: { key: string; label: string; suffix: string; help: string }[] = [
  { key: 'costing_plate_rate_per_color',      label: 'Plate Rate per Color',        suffix: 'PKR',  help: 'Cost of one printing plate for one color' },
  { key: 'costing_printing_rate_per_1000',    label: 'Printing Rate',               suffix: 'PKR / 1000 sheets', help: 'Press run cost per 1000 sheets printed' },
  { key: 'costing_die_cutting_rate_per_1000', label: 'Die-Cutting Rate',            suffix: 'PKR / 1000 sheets', help: 'Die-cutting cost per 1000 sheets' },
  { key: 'costing_pasting_rate_per_1000',     label: 'Pasting / Gluing Rate',       suffix: 'PKR / 1000 sheets', help: 'Pasting cost per 1000 sheets' },
  { key: 'costing_foiling_rate_per_sheet',      label: 'Foiling Rate',              suffix: 'PKR / sheet', help: 'Foiling cost per sheet' },
  { key: 'costing_embossing_rate_per_1000',     label: 'Embossing Rate',            suffix: 'PKR / 1000 sheets', help: 'Embossing cost per 1000 sheets' },
  { key: 'costing_die_making_rate_per_ups',     label: 'Die Making Rate',           suffix: 'PKR / ups', help: 'One-time die block cost per ups (not per sheet)' },
  { key: 'costing_breaking_rate_per_1000',      label: 'Breaking Rate',             suffix: 'PKR / 1000 sheets', help: 'Cost to separate sheets into individual boxes' },
  { key: 'costing_packing_rate_per_1000_boxes', label: 'Packing Rate',              suffix: 'PKR / 1000 boxes', help: 'Packing cost per 1000 finished boxes' },
  { key: 'costing_cartage_rate_per_1000_boxes', label: 'Cartage / Delivery Rate',   suffix: 'PKR / 1000 boxes', help: 'Delivery/cartage cost per 1000 finished boxes' },
  { key: 'costing_default_wastage_percent',   label: 'Default Wastage',             suffix: '%',    help: 'Extra sheets added to every run to cover spoilage' },
  { key: 'costing_default_overhead_percent',  label: 'Default Overhead',            suffix: '%',    help: 'Applied on top of direct cost' },
  { key: 'costing_default_margin_percent',    label: 'Default Target Margin',       suffix: '%',    help: 'Gross margin the suggested selling price is built to hit' },
]

const inputCls = 'w-32 h-9 px-3 rounded-md border text-sm text-right bg-[var(--color-bg-elevated)] text-[var(--color-text-primary)] border-[var(--color-border)] focus:outline-none focus:border-[var(--color-accent)] focus:ring-1 focus:ring-[var(--color-accent)] transition-colors'

export default function CostingRatesClient({ initialRates }: { initialRates: Record<string, string> }) {
  const [rates, setRates] = useState<Record<string, string>>(initialRates)
  const [loading, setLoading] = useState(false)

  const save = async () => {
    setLoading(true)
    try {
      const res = await fetch('/api/v1/settings/costing-rates', {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(rates),
      })
      if (!res.ok) { const e = await res.json(); throw new Error(e.error) }
      toast.success('Costing rates updated')
    } catch (e: any) { toast.error(e.message || 'Failed to save') }
    finally { setLoading(false) }
  }

  return (
    <div className="rounded-xl border border-[var(--color-border)] bg-[var(--color-bg-secondary)] overflow-hidden">
      <div className="divide-y divide-[var(--color-border-subtle)]">
        {FIELDS.map(f => (
          <div key={f.key} className="flex items-center justify-between px-5 py-4">
            <div>
              <p className="text-sm font-medium text-[var(--color-text-primary)]">{f.label}</p>
              <p className="text-xs text-[var(--color-text-muted)] mt-0.5">{f.help}</p>
            </div>
            <div className="flex items-center gap-2">
              <input
                type="number"
                className={inputCls}
                value={rates[f.key] ?? ''}
                onChange={e => setRates(prev => ({ ...prev, [f.key]: e.target.value }))}
              />
              <span className="text-xs text-[var(--color-text-muted)] w-32">{f.suffix}</span>
            </div>
          </div>
        ))}
      </div>
      <div className="px-5 py-4 border-t border-[var(--color-border)] bg-[var(--color-bg-elevated)]/50 flex justify-end">
        <button onClick={save} disabled={loading}
          className="flex items-center gap-2 px-4 h-9 rounded-md bg-[var(--color-accent)] text-white text-sm font-medium hover:bg-[var(--color-accent-hover)] disabled:opacity-50 transition-colors">
          <Save size={15} /> {loading ? 'Saving…' : 'Save Rates'}
        </button>
      </div>
    </div>
  )
}
