import type { SupabaseClient, User } from '@supabase/supabase-js'

const SEED_COMPANY_ID = '00000000-0000-0000-0000-000000000001'

/**
 * Safely get company_id from JWT claims or fallback to DB lookup.
 * This handles the case where Auth Hook is not yet registered.
 */
export async function getCompanyId(user: User, supabase: SupabaseClient): Promise<string> {
  // 1. Try JWT app_metadata (set by Auth Hook)
  const fromJWT =
    user.app_metadata?.company_id ||
    user.user_metadata?.company_id ||
    (user.app_metadata as any)?.claims?.company_id

  if (fromJWT) return fromJWT

  // 2. Fallback: lookup from users table
  const { data: dbUser } = await supabase
    .from('users' as any)
    .select('company_id')
    .eq('id', user.id)
    .maybeSingle()

  if ((dbUser as any)?.company_id) return (dbUser as any).company_id

  // 3. Final fallback: seed company
  return SEED_COMPANY_ID
}
