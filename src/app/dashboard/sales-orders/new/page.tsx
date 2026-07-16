import { createSupabaseServerClient } from '@/lib/supabase/server'
import { getCompanyId } from '@/lib/utils/getCompanyId'
import SOFormClient from '../SOFormClient'

export default async function NewSOPage() {
  const supabase = createSupabaseServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  const companyId = user ? await getCompanyId(user, supabase) : '00000000-0000-0000-0000-000000000001'

  const [customersRes, boardTypesRes] = await Promise.all([
    supabase.from('customers' as any).select('id, name, customer_code').eq('company_id', companyId).is('deleted_at', null).eq('is_active', true).order('name'),
    supabase.from('board_types' as any).select('id, name').eq('company_id', companyId).is('deleted_at', null),
  ])

  return <SOFormClient mode="new" customers={(customersRes.data ?? []) as any[]} boardTypes={(boardTypesRes.data ?? []) as any[]} />
}
