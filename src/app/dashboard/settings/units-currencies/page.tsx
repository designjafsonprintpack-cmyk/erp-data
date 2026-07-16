import { createSupabaseServerClient } from '@/lib/supabase/server'
import { getCompanyId } from '@/lib/utils/getCompanyId'
import UnitsCurrenciesClient from './UnitsCurrenciesClient'

export default async function UnitsCurrenciesPage() {
  const supabase = createSupabaseServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  const companyId = user ? await getCompanyId(user, supabase) : '00000000-0000-0000-0000-000000000001'

  const [units, currencies, taxes] = await Promise.all([
    supabase.from('units' as any).select('*').eq('company_id', companyId).is('deleted_at', null).order('unit_type').order('name'),
    supabase.from('currencies' as any).select('*').eq('company_id', companyId).is('deleted_at', null).order('code'),
    supabase.from('taxes' as any).select('*').eq('company_id', companyId).is('deleted_at', null).order('name'),
  ])

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-[var(--color-text-primary)]">Units, Currencies & Taxes</h1>
        <p className="text-sm text-[var(--color-text-muted)] mt-0.5">Configure measurement units, currencies and tax rates</p>
      </div>
      <UnitsCurrenciesClient
        initialUnits={(units.data ?? []) as any[]}
        initialCurrencies={(currencies.data ?? []) as any[]}
        initialTaxes={(taxes.data ?? []) as any[]}
      />
    </div>
  )
}
