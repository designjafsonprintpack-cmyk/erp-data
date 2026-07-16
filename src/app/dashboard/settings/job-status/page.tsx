import { createSupabaseServerClient } from '@/lib/supabase/server'
import { getCompanyId } from '@/lib/utils/getCompanyId'
import JobStatusClient from './JobStatusClient'

export default async function JobStatusPage() {
  const supabase = createSupabaseServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  const companyId = user ? await getCompanyId(user, supabase) : '00000000-0000-0000-0000-000000000001'

  const [statusRes, delayRes] = await Promise.all([
    supabase.from('job_statuses' as any).select('*').eq('company_id', companyId).is('deleted_at', null).order('sort_order'),
    supabase.from('delay_reasons' as any).select('*').eq('company_id', companyId).is('deleted_at', null).order('category').order('name'),
  ])

  return (
    <div className="space-y-6 max-w-4xl">
      <div>
        <h1 className="text-2xl font-bold text-[var(--color-text-primary)]">Job Status & Delay Reasons</h1>
        <p className="text-sm text-[var(--color-text-muted)] mt-0.5">Configure job statuses and mandatory delay reason list</p>
      </div>
      <JobStatusClient
        initialStatuses={(statusRes.data ?? []) as any[]}
        initialDelayReasons={(delayRes.data ?? []) as any[]}
      />
    </div>
  )
}
