import { createSupabaseServerClient } from '@/lib/supabase/server'
import { getCompanyId } from '@/lib/utils/getCompanyId'
import PurchaseClient from './PurchaseClient'

export default async function PurchasePage() {
  const supabase = createSupabaseServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  const companyId = user ? await getCompanyId(user, supabase) : '00000000-0000-0000-0000-000000000001'

  const [posRes, vendorsRes] = await Promise.all([
    supabase.from('purchase_orders' as any)
      .select('*, vendors(name,vendor_code), purchase_order_items(*)', { count: 'exact' })
      .eq('company_id', companyId).is('deleted_at', null)
      // First page only — PurchaseClient pages the rest from
      // /api/v1/purchase-orders, which filters server-side.
      .order('created_at', { ascending: false }).order('id', { ascending: false })
      .range(0, 49),
    supabase.from('vendors' as any).select('id,name,vendor_code')
      .eq('company_id', companyId).is('deleted_at', null).order('name'),
  ])

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-2xl font-bold text-[var(--color-text-primary)]">Purchase Orders</h1>
        <p className="text-sm text-[var(--color-text-muted)] mt-0.5">{posRes.count ?? 0} purchase orders</p>
      </div>
      <PurchaseClient initialPOs={(posRes.data ?? []) as any[]} initialTotal={posRes.count ?? 0} vendors={(vendorsRes.data ?? []) as any[]} />
    </div>
  )
}
