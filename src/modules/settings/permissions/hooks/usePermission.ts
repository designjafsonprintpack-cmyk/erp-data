'use client'
import { useEffect, useState } from 'react'
import { createSupabaseClient } from '@/lib/supabase/client'
import type { PermissionAction, ModuleKey } from '../types/permission.types'

function decodeJwtPayload(token: string): Record<string, any> | null {
  try {
    const payload = token.split('.')[1]
    if (!payload) return null
    const base64 = payload.replace(/-/g, '+').replace(/_/g, '/')
    return JSON.parse(atob(base64))
  } catch {
    return null
  }
}

// Cache permissions in memory for the session
let cachedPermissions: Set<string> | null = null
let cachedRole: string | null = null

async function loadPermissions(): Promise<{ perms: Set<string>; role: string }> {
  const supabase = createSupabaseClient()
  const { data: { session } } = await supabase.auth.getSession()
  if (!session) return { perms: new Set(), role: '' }

  const claims = session.access_token ? decodeJwtPayload(session.access_token) : null
  const role = (claims?.app_role || '') as string
  cachedRole = role

  // Superadmin/owner bypass — all permissions granted
  if (['superadmin', 'owner'].includes(role)) {
    cachedPermissions = new Set(['*'])
    return { perms: cachedPermissions, role }
  }

  if (cachedPermissions) return { perms: cachedPermissions, role }

  // BUG FIX: this query previously had no user filter and relied on RLS to
  // scope it. But the RLS policy on user_roles is COMPANY-scoped, not
  // user-scoped:
  //     CREATE POLICY user_roles_tenant ON user_roles
  //       USING (company_id = (auth.jwt() ->> 'company_id')::UUID);
  // so it returned every user's role assignments in the company, and this
  // function handed back the UNION of every role's permissions to everyone.
  // Client-side gating was therefore effectively a no-op.
  //
  // No security hole existed — server-side requirePermission() uses the
  // has_permission(p_user_id, ...) SQL function, which is correctly scoped —
  // but any UI built on this hook would have shown every user everything.
  //
  // The custom JWT hook already publishes `user_table_id` (migration 030), so
  // the fix needs no migration: filter explicitly by it.
  const userTableId = (claims?.user_table_id || '') as string
  if (!userTableId) { cachedPermissions = new Set(); return { perms: cachedPermissions, role } }

  const { data } = await supabase
    .from('user_roles' as any)
    .select('role_id')
    .eq('user_id', userTableId)
    .is('deleted_at', null)
    .eq('is_active', true)

  const roleIds = ((data ?? []) as unknown as Array<{ role_id: string }>).map(r => r.role_id)
  if (!roleIds.length) { cachedPermissions = new Set(); return { perms: cachedPermissions, role } }

  const { data: rp } = await supabase
    .from('role_permissions' as any)
    .select('permission_id')
    .in('role_id', roleIds)
    .is('deleted_at', null)
    .eq('is_active', true)

  const permIds = ((rp ?? []) as unknown as Array<{ permission_id: string }>).map(r => r.permission_id)
  if (!permIds.length) { cachedPermissions = new Set(); return { perms: cachedPermissions, role } }

  const { data: permsData } = await supabase
    .from('permissions' as any)
    .select('module, action')
    .in('id', permIds)

  const perms = new Set(
    ((permsData ?? []) as unknown as Array<{ module: string; action: string }>)
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

// ─────────────────────────────────────────────────────────────────────────────
// React hook for permission-aware navigation.
//
// FAIL-OPEN BY DESIGN: if the permission set comes back empty — no roles
// assigned to the user, permissions never seeded, or the request failed — the
// hook reports `canView() === true` for everything rather than hiding the
// whole navigation. A nav showing too much is a minor annoyance; a nav showing
// nothing locks the user out of the app entirely and looks like an outage.
// This is UI-only gating; every API route still enforces permissions
// server-side via requirePermission(), so failing open here grants no access.
// ─────────────────────────────────────────────────────────────────────────────
export function useNavPermissions() {
  const [state, setState] = useState<{ ready: boolean; perms: Set<string>; role: string }>(
    { ready: false, perms: new Set(), role: '' }
  )

  useEffect(() => {
    let cancelled = false
    loadPermissions()
      .then(({ perms, role }) => { if (!cancelled) setState({ ready: true, perms, role }) })
      .catch(() => { if (!cancelled) setState({ ready: true, perms: new Set(), role: '' }) })
    return () => { cancelled = true }
  }, [])

  const bypass = state.perms.has('*') || state.perms.size === 0

  return {
    /** False until permissions have loaded — render the full nav meanwhile. */
    ready: state.ready,
    role: state.role,
    canView: (module: string) => bypass || state.perms.has(`${module}::view`),
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// May this user see rupee amounts?
//
// FAIL-CLOSED, and deliberately the opposite of useNavPermissions above. That
// hook fails open because a nav showing nothing looks like an outage; this one
// fails closed because the whole point is that rates, cost and margin do not
// reach the shop floor. So while permissions are still loading, and if the
// permission set comes back empty for any reason, the answer is NO and amounts
// render masked. Masked → visible is a safe transition; visible → masked would
// flash the number first, which defeats it.
//
// Granted by migration 119 to superadmin / owner / ceo / gm / admin / accounts
// / production_manager. Everything else is a tick in
// Settings → Roles & Permissions → Money & Rates → View, so Mehboob can hand it
// to Sales or Purchase without a deploy.
//
// SCOPE — this is a DISPLAY gate, not a data gate. The API still returns the
// figures; this stops them being rendered. Stripping them server-side would
// mean editing ~30 routes and would break the very forms (quotation, PO,
// invoice) whose whole job is entering a rate.
// ─────────────────────────────────────────────────────────────────────────────
export const MONEY_MODULE = 'money'

export function useCanSeeMoney(): { ready: boolean; canSeeMoney: boolean } {
  const [state, setState] = useState<{ ready: boolean; allowed: boolean }>(
    { ready: false, allowed: false }
  )

  useEffect(() => {
    let cancelled = false
    loadPermissions()
      .then(({ perms }) => {
        if (cancelled) return
        setState({ ready: true, allowed: perms.has('*') || perms.has(`${MONEY_MODULE}::view`) })
      })
      .catch(() => { if (!cancelled) setState({ ready: true, allowed: false }) })
    return () => { cancelled = true }
  }, [])

  return { ready: state.ready, canSeeMoney: state.allowed }
}
