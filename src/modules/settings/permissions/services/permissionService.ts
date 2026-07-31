import { createSupabaseServerClient } from '@/lib/supabase/server'
import { AppError } from '@/types/shared'
import { fetchAllRows } from '@/lib/utils/fetchAllRows'
import type { Role, Permission, PermissionMatrix } from '../types/permission.types'

export async function getRoles(): Promise<Role[]> {
  const supabase = createSupabaseServerClient()
  const { data, error } = await supabase
    .from('roles' as any)
    .select('*')
    .is('deleted_at', null)
    .eq('is_active', true)
    .order('name')
  if (error) throw new AppError('FETCH_ROLES_FAILED', error.message)
  return (data ?? []) as unknown as Role[]
}

export async function getPermissions(): Promise<Permission[]> {
  const supabase = createSupabaseServerClient()
  const { data, error } = await supabase
    .from('permissions' as any)
    .select('*')
    .is('deleted_at', null)
    .eq('is_active', true)
    .order('module')
  if (error) throw new AppError('FETCH_PERMISSIONS_FAILED', error.message)
  return (data ?? []) as unknown as Permission[]
}

export async function getRolePermissions(roleId: string): Promise<string[]> {
  const supabase = createSupabaseServerClient()
  const { data, error } = await supabase
    .from('role_permissions' as any)
    .select('permission_id')
    .eq('role_id', roleId)
    .is('deleted_at', null)
    .eq('is_active', true)
  if (error) throw new AppError('FETCH_ROLE_PERMISSIONS_FAILED', error.message)
  return ((data ?? []) as unknown as Array<{ permission_id: string }>).map(r => r.permission_id)
}

export async function buildPermissionMatrix(
  roles: Role[],
  permissions: Permission[]
): Promise<PermissionMatrix> {
  const supabase = createSupabaseServerClient()

  // PAGED, and ordered. This select used to be a plain one-shot read, and once
  // every role had a real permission set `role_permissions` went past 1613
  // rows — so PostgREST returned the first 1000 with no error and the matrix
  // rendered **every role after that as completely unticked**, while the
  // grants sat in the database untouched. With no `.order()` either, which
  // rows vanished changed between renders.
  //
  // The matrix genuinely needs all 9 actions across all 31 modules for all 17
  // roles, so it cannot be narrowed the way the Help page narrows to `view`.
  // (role_id, permission_id) is unique per the table's own constraint, so
  // ordering on both gives a total order and pages cannot repeat or skip.
  let rows: Array<{ role_id: string; permission_id: string }>
  try {
    rows = await fetchAllRows<{ role_id: string; permission_id: string }>(
      (from, to) => supabase
        .from('role_permissions' as any)
        .select('role_id, permission_id')
        .is('deleted_at', null)
        .eq('is_active', true)
        .order('role_id')
        .order('permission_id')
        .range(from, to) as any,
      'permission matrix',
    )
  } catch (e: any) {
    throw new AppError('FETCH_MATRIX_FAILED', e?.message ?? 'Failed to read role permissions')
  }

  const granted = new Set(rows.map(r => `${r.role_id}::${r.permission_id}`))

  const matrix: PermissionMatrix = {}
  for (const role of roles) {
    matrix[role.id] = {}
    for (const perm of permissions) {
      if (!matrix[role.id][perm.module]) matrix[role.id][perm.module] = {}
      matrix[role.id][perm.module][perm.action] = granted.has(`${role.id}::${perm.id}`)
    }
  }
  return matrix
}

export async function togglePermission(
  roleId: string,
  permissionId: string,
  companyId: string,
  grant: boolean
): Promise<void> {
  const supabase = createSupabaseServerClient()
  if (grant) {
    const { error } = await supabase
      .from('role_permissions' as any)
      .upsert({ company_id: companyId, role_id: roleId, permission_id: permissionId, is_active: true, deleted_at: null },
               { onConflict: 'company_id,role_id,permission_id' })
    if (error) throw new AppError('GRANT_PERMISSION_FAILED', error.message)
  } else {
    const { error } = await supabase
      .from('role_permissions' as any)
      .update({ is_active: false, deleted_at: new Date().toISOString() })
      .eq('role_id', roleId)
      .eq('permission_id', permissionId)
    if (error) throw new AppError('REVOKE_PERMISSION_FAILED', error.message)
  }
}
