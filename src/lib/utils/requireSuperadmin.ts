import type { SupabaseClient, User } from '@supabase/supabase-js'
import { NextResponse } from 'next/server'
import { getAppRole } from './getAppRole'

/**
 * Stricter than requirePermission()/has_permission() — those bypass for
 * BOTH 'superadmin' and 'owner'. This is deliberately superadmin-ONLY,
 * for actions (currently: job edit/delete) where even the owner role
 * shouldn't be able to act, per explicit requirement.
 *
 * Usage:
 *   const denied = await requireSuperadmin(user, supabase)
 *   if (denied) return denied
 */
export async function requireSuperadmin(user: User, supabase: SupabaseClient): Promise<NextResponse | null> {
  const role = await getAppRole(user, supabase)
  if (role !== 'superadmin') {
    return NextResponse.json({ error: 'Only a superadmin can perform this action.' }, { status: 403 })
  }
  return null
}
