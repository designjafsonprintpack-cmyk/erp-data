import { createSupabaseServerClient } from '@/lib/supabase/server'
import { LIST_PAGE_SIZE } from '@/lib/constants/pagination'
import { getCompanyId } from '@/lib/utils/getCompanyId'
import JobsClient from './JobsClient'
import { withCurrentStageNames } from '@/lib/utils/currentStageNames'

export default async function JobsPage() {
  const supabase = createSupabaseServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  const companyId = user ? await getCompanyId(user, supabase) : '00000000-0000-0000-0000-000000000001'

  // The heading's "N total jobs" means every job the list can show, so it is
  // its own exact count — never the length of the fetched page, and never the
  // filtered count below (§5: count with head:true, don't total an array).
  // `is_superseded` isi liye yahan bhi lagta hai: heading 492 kahe aur list 485
  // dikhaye to farq kabhi samajh nahi aayega.
  const { count: allJobsCount } = await supabase
    .from('jobs' as any)
    .select('*', { count: 'exact', head: true })
    .eq('company_id', companyId)
    .is('deleted_at', null)
    .eq('is_active', true)
    .eq('job_kind', 'production')
    .eq('is_superseded', false)

  const { data, count } = await supabase
    .from('jobs' as any)
    .select('id,job_number,job_title,status,priority,quantity,required_date,order_date,is_on_hold,is_repeat,repeat_kind,job_kind,created_at,current_stage_id,size_l,size_w,size_h,sheet_width_in,sheet_height_in,customers(name,customer_code),workflow_templates(name)', { count: 'exact' })
    .eq('company_id', companyId)
    .is('deleted_at', null)
    .eq('is_active', true)
    // Press proof runs (migration 104) are real jobs, so without this they
    // would sit in the main list between the jobs they belong to. They belong
    // under their parent instead — Job Detail shows them, and the list can ask
    // for them explicitly via ?kind=proofing on GET /api/v1/jobs.
    .eq('job_kind', 'production')
    // AIK CARTON = AIK ROW (144). Khatam ho chuke run jinke baad naya run aa
    // chuka hai wo yahan nahi aate — row poori maujood hai, Job Detail ki Runs
    // tab mein aur "All runs" toggle par. Chalta hua kaam kabhi nahi chhupta.
    // GET /api/v1/jobs ke default se milta hua rehna zaroori hai, warna pehla
    // paint aur pehli filter do alag ginti dikhayenge.
    .eq('is_superseded', false)
    // No status filter: the list opens on ALL, and this must keep matching
    // JobsClient's DEFAULT_STATUS_TAB. If the two ever disagree the first paint
    // shows one tab's rows under another tab's heading, and the client then
    // throws them away for a second request.
    .order('created_at', { ascending: false })
    // Tiebreaker, not decoration: all 478 legacy jobs share one backdated
    // created_at, and Postgres does not promise a stable order among ties —
    // so without this, page 2 re-served rows page 1 had already shown and
    // silently dropped others. Must match the ORDER BY in GET /api/v1/jobs.
    .order('id', { ascending: false })
    .range(0, LIST_PAGE_SIZE - 1)

  // "Yeh job abhi kis stage par hai" as a real column in the list, instead of
  // having to open each job to find out.
  const jobs = await withCurrentStageNames(supabase, companyId, (data ?? []) as any[])

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-[var(--color-text-primary)]">Jobs</h1>
          <p className="text-sm text-[var(--color-text-muted)] mt-0.5">{allJobsCount ?? 0} total jobs</p>
        </div>
      </div>
      <JobsClient initialJobs={jobs as any[]} initialTotal={count ?? 0} />
    </div>
  )
}
