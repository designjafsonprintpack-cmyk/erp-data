import { createSupabaseServerClient } from '@/lib/supabase/server'
import { getCompanyId } from '@/lib/utils/getCompanyId'
import JobsClient from './JobsClient'

export default async function JobsPage() {
  const supabase = createSupabaseServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  const companyId = user ? await getCompanyId(user, supabase) : '00000000-0000-0000-0000-000000000001'

  const { data, count } = await supabase
    .from('jobs' as any)
    .select('id,job_number,job_title,status,priority,quantity,required_date,order_date,is_on_hold,is_repeat,created_at,customers(name,customer_code),workflow_templates(name)', { count: 'exact' })
    .eq('company_id', companyId)
    .is('deleted_at', null)
    .eq('is_active', true)
    .order('created_at', { ascending: false })
    .range(0, 24)

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-[var(--color-text-primary)]">Jobs</h1>
          <p className="text-sm text-[var(--color-text-muted)] mt-0.5">{count ?? 0} total jobs</p>
        </div>
      </div>
      <JobsClient initialJobs={(data ?? []) as any[]} initialTotal={count ?? 0} />
    </div>
  )
}
