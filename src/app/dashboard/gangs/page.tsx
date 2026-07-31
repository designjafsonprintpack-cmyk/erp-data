import { createSupabaseServerClient } from '@/lib/supabase/server'
import { getCompanyId } from '@/lib/utils/getCompanyId'
import GangsClient from './GangsClient'

export default async function GangsPage() {
  const supabase = createSupabaseServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  const companyId = user ? await getCompanyId(user, supabase) : '00000000-0000-0000-0000-000000000001'

  // 50 to match every other list page. `.order('id')` is the paging tiebreaker
  // §6 records — gangs created in the same second would otherwise have no
  // guaranteed order.
  const { data } = await supabase.from('job_gangs' as any)
    .select('*, customers(name,customer_code), job_gang_members(id,job_id,ups_on_layout,original_quantity,original_ups,jobs(job_number,job_title,quantity))')
    .eq('company_id', companyId)
    .is('deleted_at', null)
    .order('created_at', { ascending: false })
    .order('id', { ascending: false })
    .range(0, 49)

  return <GangsClient initialGangs={(data ?? []) as any[]} />
}
