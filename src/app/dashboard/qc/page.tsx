import { createSupabaseServerClient } from '@/lib/supabase/server'
import { getCompanyId } from '@/lib/utils/getCompanyId'
import QCClient from './QCClient'

export default async function QCPage() {
  const supabase = createSupabaseServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  const companyId = user ? await getCompanyId(user, supabase) : '00000000-0000-0000-0000-000000000001'

  const [inspectionsRes, defectsRes, reprintsRes, templatesRes, jobsRes] = await Promise.all([
    supabase.from('qc_inspections' as any)
      .select('*, jobs(job_number,job_title,customers(name)), qc_templates(name), qc_defects(id,severity,resolved)', { count: 'exact' })
      .eq('company_id', companyId).is('deleted_at', null)
      .order('created_at', { ascending: false }).limit(40),
    supabase.from('qc_defects' as any)
      .select('*, jobs(job_number,job_title)', { count: 'exact' })
      .eq('company_id', companyId).is('deleted_at', null).eq('resolved', false)
      .order('created_at', { ascending: false }).limit(30),
    supabase.from('reprint_requests' as any)
      .select('*, jobs!reprint_requests_original_job_id_fkey(job_number,job_title,customers(name))', { count: 'exact' })
      .eq('company_id', companyId).is('deleted_at', null)
      .order('created_at', { ascending: false }).limit(30),
    supabase.from('qc_templates' as any)
      .select('*, qc_template_items(*)').eq('company_id', companyId).is('deleted_at', null).order('name'),
    supabase.from('jobs' as any)
      .select('id,job_number,job_title,quantity,customers(name)')
      .eq('company_id', companyId).is('deleted_at', null)
      .in('status', ['in_progress','completed']).order('job_number').limit(100),
  ])

  const passCount = (inspectionsRes.data ?? []).filter((i: any) => i.result === 'pass').length
  const failCount = (inspectionsRes.data ?? []).filter((i: any) => i.result === 'fail').length

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-2xl font-bold text-[var(--color-text-primary)]">Quality Control</h1>
        <p className="text-sm text-[var(--color-text-muted)] mt-0.5">
          {inspectionsRes.count ?? 0} inspections · {passCount} passed · {failCount} failed · {defectsRes.count ?? 0} open defects
        </p>
      </div>
      <QCClient
        initialInspections={(inspectionsRes.data ?? []) as any[]}
        openDefects={(defectsRes.data ?? []) as any[]}
        reprintRequests={(reprintsRes.data ?? []) as any[]}
        templates={(templatesRes.data ?? []) as any[]}
        jobs={(jobsRes.data ?? []) as any[]}
      />
    </div>
  )
}
