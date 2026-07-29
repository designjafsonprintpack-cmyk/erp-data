import { createSupabaseServerClient } from '@/lib/supabase/server'
import { getCompanyId } from '@/lib/utils/getCompanyId'
import QCClient from './QCClient'
import { loadJobsAwaitingQC } from '@/lib/utils/jobsAwaitingQC'

export default async function QCPage() {
  const supabase = createSupabaseServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return null // dashboard/layout.tsx already redirects unauthenticated requests to /login

  const companyId = await getCompanyId(user, supabase)

  // Pass/fail are counted by Postgres, not by filtering the array below —
  // that array is capped at 200 rows, so deriving the stat cards from it made
  // them "pass rate of the last 200 inspections" and stopped being true on
  // inspection 201. head:true fetches no rows at all, just the number.
  const countInspections = (result: string) =>
    supabase.from('qc_inspections' as any)
      .select('id', { count: 'exact', head: true })
      .eq('company_id', companyId).is('deleted_at', null)
      .eq('result', result)

  const [inspectionsRes, defectsRes, reprintsRes, templatesRes, jobsRes, boardInventoryRes, passRes, failRes] = await Promise.all([
    supabase.from('qc_inspections' as any)
      .select('*, jobs(job_number,job_title,customers(name)), qc_templates(name), qc_defects(id,severity,resolved)', { count: 'exact' })
      .eq('company_id', companyId).is('deleted_at', null)
      // The LIST only — the stat cards no longer read this array.
      .order('created_at', { ascending: false }).limit(200),
    supabase.from('qc_defects' as any)
      .select('*, jobs(job_number,job_title)', { count: 'exact' })
      .eq('company_id', companyId).is('deleted_at', null).eq('resolved', false)
      .order('created_at', { ascending: false }).limit(200),
    supabase.from('reprint_requests' as any)
      .select('*, jobs!reprint_requests_original_job_id_fkey(job_number,job_title,customers(name))', { count: 'exact' })
      .eq('company_id', companyId).is('deleted_at', null)
      .order('created_at', { ascending: false }).limit(200),
    supabase.from('qc_templates' as any)
      .select('*, qc_template_items(*)').eq('company_id', companyId).is('deleted_at', null).order('name'),
    supabase.from('jobs' as any)
      .select('id,job_number,job_title,quantity,customers(name)')
      .eq('company_id', companyId).is('deleted_at', null)
      .in('status', ['in_progress','completed']).order('job_number').limit(100),
    supabase.from('board_inventory' as any)
      .select('id,description,current_stock').eq('company_id', companyId)
      .is('deleted_at', null).eq('is_active', true).order('description'),
    countInspections('pass'),
    countInspections('fail'),
  ])

  const counts = {
    inspections: inspectionsRes.count ?? 0,
    pass:        passRes.count ?? 0,
    fail:        failRes.count ?? 0,
    openDefects: defectsRes.count ?? 0,
  }

  // Jobs standing at the QC stage with no passing inspection — the work QC
  // owns right now. Migration 092 made QC a real stage; this surfaces it.
  const awaitingQC = await loadJobsAwaitingQC(supabase, companyId)

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-2xl font-bold text-[var(--color-text-primary)]">Quality Control</h1>
        <p className="text-sm text-[var(--color-text-muted)] mt-0.5">
          {counts.inspections} inspections · {counts.pass} passed · {counts.fail} failed · {counts.openDefects} open defects
        </p>
      </div>
      <QCClient
        initialInspections={(inspectionsRes.data ?? []) as any[]}
        openDefects={(defectsRes.data ?? []) as any[]}
        reprintRequests={(reprintsRes.data ?? []) as any[]}
        templates={(templatesRes.data ?? []) as any[]}
        jobs={(jobsRes.data ?? []) as any[]}
        awaitingQC={awaitingQC}
        counts={counts}
        boardInventory={(boardInventoryRes.data ?? []) as any[]}
        companyId={companyId}
      />
    </div>
  )
}
