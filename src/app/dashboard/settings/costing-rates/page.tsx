import { createSupabaseServerClient } from '@/lib/supabase/server'
import { getCompanyId } from '@/lib/utils/getCompanyId'
import CostingRatesClient from './CostingRatesClient'

export default async function CostingRatesPage() {
  const supabase = createSupabaseServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return null

  const companyId = await getCompanyId(user, supabase)
  const { data } = await supabase.from('system_settings' as any)
    .select('key, value').eq('company_id', companyId).eq('category', 'costing')

  const rates: Record<string, string> = {}
  for (const row of ((data ?? []) as any[])) rates[row.key] = row.value

  return (
    <div className="space-y-6 max-w-3xl">
      <div>
        <h1 className="text-2xl font-bold text-[var(--color-text-primary)]">Costing Rates</h1>
        <p className="text-sm text-[var(--color-text-muted)] mt-0.5">
          Default rate card used by the Quotation Costing Engine to suggest a selling price.
          Board sheet size/rate and lamination rate live under Material Types instead, since
          those vary by material.
        </p>
      </div>
      <CostingRatesClient initialRates={rates} />
    </div>
  )
}
