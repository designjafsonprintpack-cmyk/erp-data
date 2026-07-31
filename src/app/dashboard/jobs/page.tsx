import { createSupabaseServerClient } from '@/lib/supabase/server'
import { getCompanyId } from '@/lib/utils/getCompanyId'
import JobsClient from './JobsClient'
import { withCurrentStageNames } from '@/lib/utils/currentStageNames'

export default async function JobsPage() {
  const supabase = createSupabaseServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  const companyId = user ? await getCompanyId(user, supabase) : '00000000-0000-0000-0000-000000000001'

  const { data, count } = await supabase
    .from('jobs' as any)
    .select('id,job_number,job_title,status,priority,quantity,required_date,order_date,is_on_hold,is_repeat,created_at,current_stage_id,size_l,size_w,size_h,sheet_width_in,sheet_height_in,customers(name,customer_code),workflow_templates(name)', { count: 'exact' })
    .eq('company_id', companyId)
    .is('deleted_at', null)
    .eq('is_active', true)
    // Press proof runs (migration 104) are real jobs, so without this they
    // would sit in the main list between the jobs they belong to. They belong
    // under their parent instead — Job Detail shows them, and the list can ask
    // for them explicitly via ?kind=proofing on GET /api/v1/jobs.
    .eq('job_kind', 'production')
    .order('created_at', { ascending: false })
    // Tiebreaker, not decoration: all 478 legacy jobs share one backdated
    // created_at, and Postgres does not promise a stable order among ties —
    // so without this, page 2 re-served rows page 1 had already shown and
    // silently dropped others. Must match the ORDER BY in GET /api/v1/jobs.
    .order('id', { ascending: false })
    // Matches PAGE_SIZE in JobsClient so page 2 starts exactly where this ends.
    .range(0, 49)

  // "Yeh job abhi kis stage par hai" as a real column in the list, instead of
  // having to open each job to find out.
  const jobs = await withCurrentStageNames(supabase, companyId, (data ?? []) as any[])

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-[var(--color-text-primary)]">Jobs</h1>
          <p className="text-sm text-[var(--color-text-muted)] mt-0.5">{count ?? 0} total jobs</p>
        </div>
      </div>
      <JobsClient initialJobs={jobs as any[]} initialTotal={count ?? 0} />
    </div>
  )
}
