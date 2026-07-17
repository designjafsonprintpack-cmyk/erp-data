import type { SupabaseClient } from '@supabase/supabase-js'
import { NextResponse } from 'next/server'

/**
 * Check whether a user (by their public.users.id — see getUserTableId) has a
 * given module/action permission. Wraps the has_permission() DB function
 * (migration 005), which already handles the superadmin/owner bypass and the
 * user_roles -> role_permissions -> permissions join.
 */
export async function hasPermission(
  userTableId: string | null,
  module: string,
  action: string,
  supabase: SupabaseClient
): Promise<boolean> {
  if (!userTableId) return false
  const { data, error } = await (supabase as any).rpc('has_permission', {
    p_user_id: userTableId,
    p_module: module,
    p_action: action,
  })
  if (error) return false
  return data === true
}

/**
 * Convenience wrapper for API routes: returns a 403 NextResponse if the user
 * lacks the permission, or null if they have it (so the caller can continue).
 *
 * Usage:
 *   const denied = await requirePermission(userTableId, 'users', 'delete', supabase)
 *   if (denied) return denied
 */
export async function requirePermission(
  userTableId: string | null,
  module: string,
  action: string,
  supabase: SupabaseClient
): Promise<NextResponse | null> {
  const allowed = await hasPermission(userTableId, module, action, supabase)
  if (!allowed) {
    return NextResponse.json(
      { error: `You do not have permission to ${action} ${module}.` },
      { status: 403 }
    )
  }
  return null
}
