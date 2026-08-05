import { createSupabaseServerClient } from '@/lib/supabase/server'
import { getCompanyId } from '@/lib/utils/getCompanyId'
import { notFound } from 'next/navigation'
import JobDetailClient from './JobDetailClient'
import { getIssuedGsm } from '@/lib/utils/jobIssuedGsm'
import { loadJobBoardDemand } from '@/lib/utils/loadJobBoardDemand'

export default async function JobDetailPage({ params }: { params: { id: string } }) {
  const supabase = createSupabaseServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return null // dashboard/layout.tsx already redirects unauthenticated requests to /login

  const companyId = await getCompanyId(user, supabase)

  const [jobRes, stagesRes, eventsRes, delayReasonsRes, wastageReasonsRes, machinesRes, wastageRes, artworksRes, inkTypesRes, inkRes] = await Promise.all([
    supabase.from('jobs' as any)
      // box_types / board_types / paper_types / lamination_types / foil_types
      // are read by JobDetailClient's spec grid but were never joined here, so
      // every one of those five fields rendered "—" no matter what the job
      // actually had saved.
      // job_gang_members (126) rides along so the page can say "this job is
      // running with another one" — without it a ganged job looks like any
      // other and the shared board and plates make no sense to whoever opens it.
      .select('*, customers(name,customer_code,email,phone,mobile), workflow_templates(name), sales_orders(so_number), box_types(name), board_types(name), paper_types(name), lamination_types(name), foil_types(name), job_gang_members(ups_on_layout,original_quantity,original_ups,job_gangs(id,gang_number,layout_ups,sheet_count,status,job_gang_members(job_id,ups_on_layout,jobs(job_number,job_title))))')
      .eq('id', params.id).maybeSingle(),
    supabase.from('job_stage_progress' as any)
      .select('*, workflow_stages(name,is_optional,estimated_hours)')
      .eq('job_id', params.id).order('sequence_order'),
    supabase.from('job_stage_events' as any)
      .select('*, users(full_name)')
      .eq('job_id', params.id)
      .order('occurred_at', { ascending: false })
      .limit(50),
    supabase.from('delay_reasons' as any)
      .select('id,name,category').eq('company_id', companyId).is('deleted_at', null).order('name'),
    supabase.from('wastage_reasons' as any)
      .select('id,name,category').eq('company_id', companyId).is('deleted_at', null).order('name'),
    supabase.from('machines' as any)
      .select('id,name').eq('company_id', companyId).eq('is_active', true).order('name'),
    supabase.from('job_wastage' as any)
      .select('*, wastage_reasons(name,category), machines(name), users(full_name)')
      .eq('job_id', params.id).is('deleted_at', null).order('occurred_at', { ascending: false }),
    // Ordered by design first (migration 124) — a job can carry two separate
    // designs and the tab groups by design_no, so version-only ordering would
    // interleave the lid's v2 with the base's v3.
    supabase.from('job_artworks' as any)
      .select('*').eq('job_id', params.id).eq('company_id', companyId).is('deleted_at', null)
      .order('design_no', { ascending: true })
      .order('version', { ascending: false }),
    // Ink usage (migration 102) — same shape as the wastage pair above.
    supabase.from('ink_types' as any)
      .select('id,name,color_code').eq('company_id', companyId)
      .is('deleted_at', null).eq('is_active', true).order('name'),
    supabase.from('job_ink_usage' as any)
      .select('*, ink_types(name,color_code), machines(name), users(full_name)')
      .eq('job_id', params.id).is('deleted_at', null).order('occurred_at', { ascending: false }),
  ])

  if (!jobRes.data) notFound()

  // What the store actually issued, as opposed to what the job planned.
  const issuedGsm = await getIssuedGsm(supabase, companyId, params.id)

  // Every run of this carton — the original and each repeat (migration 132).
  // Server-side because both the header line ("Run 2 of 2") and the Runs tab
  // need it on first paint; a client fetch would flash the wrong count.
  //
  // A solo job returns exactly one row (itself), so this is never empty and the
  // tab never has to guess. Errors are not swallowed into [] — that would read
  // as "no history" on a job that has some.
  const { data: familyRows, error: familyErr } = await (supabase as any)
    .rpc('get_job_family', { p_company_id: companyId, p_job_id: params.id })
  if (familyErr) console.error('[job detail] family lookup failed:', familyErr.message)

  // Is job ka board (135) — kitna chahiye, kitna stock se mil gaya, kitna PO par
  // hai aur kitna abhi khareedna baqi hai. Gang mein board lead job ke naam
  // nikalta hai, is liye ye khud wahan tak jata hai.
  const boardDemand = await loadJobBoardDemand(supabase, companyId, params.id)

  return (
    <JobDetailClient
      job={jobRes.data as any}
      stages={(stagesRes.data ?? []) as any[]}
      events={(eventsRes.data ?? []) as any[]}
      delayReasons={(delayReasonsRes.data ?? []) as any[]}
      wastageReasons={(wastageReasonsRes.data ?? []) as any[]}
      machines={(machinesRes.data ?? []) as any[]}
      wastageEntries={(wastageRes.data ?? []) as any[]}
      companyId={companyId}
      artworks={(artworksRes.data ?? []) as any[]}
      inkTypes={(inkTypesRes.data ?? []) as any[]}
      inkEntries={(inkRes.data ?? []) as any[]}
      issuedGsm={issuedGsm}
      runs={(familyRows ?? []) as any[]}
      boardDemand={boardDemand}
    />
  )
}
