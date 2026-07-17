import { createSupabaseServerClient } from '@/lib/supabase/server'
import { getCompanyId } from '@/lib/utils/getCompanyId'
import CustomersClient from './CustomersClient'

export default async function CustomersPage() {
  const supabase = createSupabaseServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return null // dashboard/layout.tsx already redirects unauthenticated requests to /login

  const companyId = await getCompanyId(user, supabase)

  const { data, count } = await supabase.from('customers' as any)
    .select('*', { count: 'exact' })
    .eq('company_id', companyId)
    .is('deleted_at', null)
    .eq('is_active', true)
    .order('name')
    .range(0, 24)

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-[var(--color-text-primary)]">Customers</h1>
          <p className="text-sm text-[var(--color-text-muted)] mt-0.5">{count ?? 0} total customers</p>
        </div>
      </div>
      <CustomersClient initialCustomers={(data ?? []) as any[]} initialTotal={count ?? 0} />
    </div>
  )
}
