import { createSupabaseServerClient } from '@/lib/supabase/server'
import { getCompanyId } from '@/lib/utils/getCompanyId'
import PlatesClient from './PlatesClient'

export default async function PlatesPage() {
  const supabase = createSupabaseServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return null // dashboard/layout.tsx already redirects unauthenticated requests to /login

  const companyId = await getCompanyId(user, supabase)

  const { data, count } = await supabase
    .from('plates' as any)
    .select('*, origin_job:jobs!plates_origin_job_id_fkey(job_number,job_title)', { count: 'exact' })
    .eq('company_id', companyId)
    .is('deleted_at', null)
    .eq('is_active', true)
    .order('created_at', { ascending: false })
    .limit(100)

  const { data: jobs } = await supabase
    .from('jobs' as any)
    .select('id,job_number,job_title,customers(name)')
    .eq('company_id', companyId)
    .is('deleted_at', null)
    .in('status', ['new', 'in_progress'])
    .order('created_at', { ascending: false })
    .limit(150)

  const { data: machines } = await supabase
    .from('machines' as any)
    .select('id,name,code,machine_type')
    .eq('company_id', companyId)
    .is('deleted_at', null)
    .eq('machine_type', 'printing')
    .order('name')

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-2xl font-bold text-[var(--color-text-primary)]">Plates</h1>
        <p className="text-sm text-[var(--color-text-muted)] mt-0.5">{count ?? 0} plates in registry</p>
      </div>
      <PlatesClient
        initialPlates={(data ?? []) as any[]}
        jobs={(jobs ?? []) as any[]}
        machines={(machines ?? []) as any[]}
      />
    </div>
  )
}
