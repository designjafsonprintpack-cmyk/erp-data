import type { SupabaseClient } from '@supabase/supabase-js'
import { getUserTableId } from './getUserTableId'
import { hasPermission } from './requirePermission'

/**
 * Server-side twin of the `useCanSeeMoney()` hook — "may this user see rupee
 * amounts?", answered from the database rather than the browser.
 *
 * WHY THIS EXISTS SEPARATELY
 *   The client gate (components/ui/MoneyGate) covers everything rendered in
 *   the dashboard, but `src/app/print/*` are SERVER components that produce a
 *   commercial document — a priced Sales Order, an invoice — and they are
 *   reachable by URL, not only by the button that opens them. A client-side
 *   gate cannot touch them.
 *
 * Fails CLOSED, like its client twin: no session, no user row, or an RPC error
 * all mean no.
 *
 * Uses `has_permission()` (migration 005), which already short-circuits
 * superadmin and owner and does the user_roles → role_permissions join.
 */
export async function canSeeMoneyServer(supabase: SupabaseClient): Promise<boolean> {
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return false
  const userTableId = await getUserTableId(user, supabase)
  if (!userTableId) return false
  return hasPermission(userTableId, 'money', 'view', supabase)
}

export default canSeeMoneyServer
