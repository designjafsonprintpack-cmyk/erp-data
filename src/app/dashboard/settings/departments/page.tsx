import { createSupabaseServerClient } from '@/lib/supabase/server'
import { getCompanyId } from '@/lib/utils/getCompanyId'
import DepartmentsClient from './DepartmentsClient'

export default async function DepartmentsPage() {
  const supabase = createSupabaseServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  const companyId = user ? await getCompanyId(user, supabase) : '00000000-0000-0000-0000-000000000001'

  const { data } = await supabase
    .from('departments' as any).select('*').eq('company_id', companyId)
    .is('deleted_at', null).order('name')

  return (
    <div className="space-y-6 max-w-3xl">
      <div>
        <h1 className="text-2xl font-bold text-[var(--color-text-primary)]">Departments</h1>
        <p className="text-sm text-[var(--color-text-muted)] mt-0.5">Manage your company departments</p>
      </div>
      <DepartmentsClient initialDepartments={(data ?? []) as any[]} />
    </div>
  )
}
