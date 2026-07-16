'use client'
import { createSupabaseClient } from '@/lib/supabase/client'
import type { PermissionAction, ModuleKey } from '../types/permission.types'

// Cache permissions in memory for the session
let cachedPermissions: Set<string> | null = null
let cachedRole: string | null = null

async function loadPermissions(): Promise<{ perms: Set<string>; role: string }> {
  const supabase = createSupabaseClient()
  const { data: { session } } = await supabase.auth.getSession()
  if (!session) return { perms: new Set(), role: '' }

  const role = (session.user.app_metadata?.role || session.user.user_metadata?.role || '') as string
  cachedRole = role

  // Superadmin/owner bypass — all permissions granted
  if (['superadmin', 'owner'].includes(role)) {
    cachedPermissions = new Set(['*'])
    return { perms: cachedPermissions, role }
  }

  if (cachedPermissions) return { perms: cachedPermissions, role }

  const { data } = await supabase
    .from('user_roles' as any)
    .select('role_id')
    .is('deleted_at', null)
    .eq('is_active', true)

  const roleIds = ((data ?? []) as Array<{ role_id: string }>).map(r => r.role_id)
  if (!roleIds.length) { cachedPermissions = new Set(); return { perms: cachedPermissions, role } }

  const { data: rp } = await supabase
    .from('role_permissions' as any)
    .select('permission_id')
    .in('role_id', roleIds)
    .is('deleted_at', null)
    .eq('is_active', true)

  const permIds = ((rp ?? []) as Array<{ permission_id: string }>).map(r => r.permission_id)
  if (!permIds.length) { cachedPermissions = new Set(); return { perms: cachedPermissions, role } }

  const { data: permsData } = await supabase
    .from('permissions' as any)
    .select('module, action')
    .in('id', permIds)

  const perms = new Set(
    ((permsData ?? []) as Array<{ module: string; action: string }>)
      .map(p => `${p.module}::${p.action}`)
  )
  cachedPermissions = perms
  return { perms, role }
}

export function clearPermissionCache() {
  cachedPermissions = null
  cachedRole = null
}

export async function checkPermission(module: ModuleKey, action: PermissionAction): Promise<boolean> {
  const { perms } = await loadPermissions()
  if (perms.has('*')) return true
  return perms.has(`${module}::${action}`)
}

// Synchronous check using cached role from JWT (for UI-only gating)
export function useRoleCheck(): string {
  return cachedRole || ''
}
