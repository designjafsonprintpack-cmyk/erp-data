import { createSupabaseServerClient } from '@/lib/supabase/server'
import { getCompanyId } from '@/lib/utils/getCompanyId'
import QuotationsClient from './QuotationsClient'

export default async function QuotationsPage() {
  const supabase = createSupabaseServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  const companyId = user ? await getCompanyId(user, supabase) : '00000000-0000-0000-0000-000000000001'

  const { data, count } = await supabase.from('quotations' as any)
    .select('*, customers(name, customer_code)', { count: 'exact' })
    .eq('company_id', companyId).is('deleted_at', null)
    .order('created_at', { ascending: false }).range(0, 24)

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-[var(--color-text-primary)]">Quotations</h1>
          <p className="text-sm text-[var(--color-text-muted)] mt-0.5">{count ?? 0} total quotations</p>
        </div>
      </div>
      <QuotationsClient initialData={(data ?? []) as any[]} initialTotal={count ?? 0} />
    </div>
  )
}
