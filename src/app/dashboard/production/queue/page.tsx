import { createSupabaseServerClient } from '@/lib/supabase/server'
import { getCompanyId } from '@/lib/utils/getCompanyId'
import DepartmentQueueClient from './DepartmentQueueClient'

export default async function DepartmentQueuePage() {
  const supabase = createSupabaseServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return null

  const companyId = await getCompanyId(user, supabase)

  const { data: departments } = await supabase.from('departments' as any)
    .select('id, name, code')
    .eq('company_id', companyId)
    .is('deleted_at', null)
    .eq('is_active', true)
    .order('name')

  const { data: profile } = await supabase.from('users' as any)
    .select('department_id').eq('company_id', companyId).eq('auth_user_id', user.id).maybeSingle()

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-2xl font-bold text-[var(--color-text-primary)]">Department Queue</h1>
        <p className="text-sm text-[var(--color-text-muted)] mt-0.5">Jobs waiting, ready, or in progress for a department&apos;s stages</p>
      </div>
      <DepartmentQueueClient
        departments={(departments ?? []) as any[]}
        initialDepartmentId={(profile as any)?.department_id || ''}
      />
    </div>
  )
}
