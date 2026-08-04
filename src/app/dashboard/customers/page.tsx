import { createSupabaseServerClient } from '@/lib/supabase/server'
import { LIST_PAGE_SIZE } from '@/lib/constants/pagination'
import { getCompanyId } from '@/lib/utils/getCompanyId'
import CustomersClient from './CustomersClient'

export default async function CustomersPage() {
  const supabase = createSupabaseServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return null // dashboard/layout.tsx already redirects unauthenticated requests to /login

  const companyId = await getCompanyId(user, supabase)

  // jobs(count) is an embedded aggregate — one query instead of a per-customer
  // round trip. Safe without a deleted_at filter because jobs are hard deleted
  // in this schema (CLAUDE.md §3), which the live data confirms.
  const { data, count } = await supabase.from('customers' as any)
    .select('*, jobs(count)', { count: 'exact' })
    .eq('company_id', companyId)
    .is('deleted_at', null)
    .eq('is_active', true)
    .order('name')
    // Tiebreaker so paging is stable when two customers share a name — must
    // match the ORDER BY in GET /api/v1/customers.
    .order('id')
    // Matches PAGE_SIZE in CustomersClient so "Load More" can ask for page 2 cleanly.
    .range(0, LIST_PAGE_SIZE - 1)

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
