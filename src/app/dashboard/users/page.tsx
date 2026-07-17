import { createSupabaseServerClient } from '@/lib/supabase/server'
import { getCompanyId } from '@/lib/utils/getCompanyId'
import UsersClient from './UsersClient'

export default async function UsersPage() {
  const supabase = createSupabaseServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return null // dashboard/layout.tsx already redirects unauthenticated requests to /login

  const companyId = await getCompanyId(user, supabase)

  const [usersRes, depsRes, rolesRes] = await Promise.all([
    supabase.from('users' as any)
      .select('id,full_name,email,employee_code,app_role:role,is_active,mobile:phone,created_at,departments(name)', { count: 'exact' })
      .eq('company_id', companyId).is('deleted_at', null).order('full_name'),
    supabase.from('departments' as any)
      .select('id,name').eq('company_id', companyId).eq('is_active', true).order('name'),
    supabase.from('roles' as any)
      .select('id,name,description').eq('company_id', companyId).eq('is_active', true).order('name'),
  ])

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-2xl font-bold text-[var(--color-text-primary)]">User Management</h1>
        <p className="text-sm text-[var(--color-text-muted)] mt-0.5">{usersRes.count ?? 0} users in your company</p>
      </div>
      <UsersClient
        initialUsers={(usersRes.data ?? []) as any[]}
        departments={(depsRes.data ?? []) as any[]}
        roles={(rolesRes.data ?? []) as any[]}
      />
    </div>
  )
}
