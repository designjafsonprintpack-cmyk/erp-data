import { createSupabaseServerClient } from '@/lib/supabase/server'
import { getCompanyId } from '@/lib/utils/getCompanyId'
import { getAppRole } from '@/lib/utils/getAppRole'
import { getUserTableId } from '@/lib/utils/getUserTableId'
import { hasPermission } from '@/lib/utils/requirePermission'
import UsersClient from './UsersClient'

export default async function UsersPage() {
  const supabase = createSupabaseServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return null // dashboard/layout.tsx already redirects unauthenticated requests to /login

  const companyId = await getCompanyId(user, supabase)
  // Resetting another user's password is superadmin-only (same bar as job
  // edit/delete) — the API enforces it; this only decides whether the button
  // is rendered at all.
  const isSuperadmin = (await getAppRole(user, supabase)) === 'superadmin'

  // Delete goes through the normal permission matrix (users → delete), so the
  // owner and anyone Mehboob grants it to can delete; GM deliberately cannot,
  // per migration 095. The API re-checks — this only hides the button.
  const currentUserId = await getUserTableId(user, supabase)
  const canDelete = await hasPermission(currentUserId, 'users', 'delete', supabase)

  const [usersRes, depsRes, rolesRes] = await Promise.all([
    supabase.from('users' as any)
      .select('id,full_name,email,employee_code,app_role:role,is_active,mobile:phone,created_at,department_id,departments(name)', { count: 'exact' })
      .eq('company_id', companyId).is('deleted_at', null).order('full_name'),
    supabase.from('departments' as any)
      .select('id,name').eq('company_id', companyId).eq('is_active', true).order('name'),
    // `slug` is what users.role actually stores — the Role dropdown is built
    // from these rows so a role added in Settings (GM, CEO, or anything added
    // later) appears with no code change.
    supabase.from('roles' as any)
      .select('id,name,slug,description').eq('company_id', companyId)
      .eq('is_active', true).is('deleted_at', null).order('name'),
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
        isSuperadmin={isSuperadmin}
        canDelete={canDelete}
        currentUserId={currentUserId}
      />
    </div>
  )
}
