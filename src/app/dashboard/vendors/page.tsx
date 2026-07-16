import { createSupabaseServerClient } from '@/lib/supabase/server'
import { getCompanyId } from '@/lib/utils/getCompanyId'
import VendorsClient from './VendorsClient'

export default async function VendorsPage() {
  const supabase = createSupabaseServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  const companyId = user ? await getCompanyId(user, supabase) : '00000000-0000-0000-0000-000000000001'

  const { data, count } = await supabase
    .from('vendors' as any)
    .select('*', { count: 'exact' })
    .eq('company_id', companyId)
    .is('deleted_at', null)
    .order('name')

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-2xl font-bold text-[var(--color-text-primary)]">Vendors</h1>
        <p className="text-sm text-[var(--color-text-muted)] mt-0.5">{count ?? 0} vendors</p>
      </div>
      <VendorsClient initialVendors={(data ?? []) as any[]} />
    </div>
  )
}
