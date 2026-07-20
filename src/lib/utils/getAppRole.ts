import type { SupabaseClient, User } from '@supabase/supabase-js'

/**
 * Decode the payload of a JWT without verifying its signature.
 * Safe to use here because the token has already been issued/validated by
 * Supabase Auth for this request — we're only reading claims out of it.
 * (Same helper as getCompanyId.ts/getUserTableId.ts — kept local rather than
 * shared to avoid a cross-import for a five-line function.)
 */
function decodeJwtPayload(token: string): Record<string, any> | null {
  try {
    const payload = token.split('.')[1]
    if (!payload) return null
    const base64 = payload.replace(/-/g, '+').replace(/_/g, '/')
    return JSON.parse(Buffer.from(base64, 'base64').toString('utf-8'))
  } catch {
    return null
  }
}

/**
 * Resolve the current user's app_role ('superadmin', 'owner', or whatever
 * slug their assigned role has) — see custom_access_token_hook (migration
 * 002), which writes it as the top-level 'app_role' JWT claim from
 * public.users.role. Falls back to a direct table read if the claim is
 * somehow missing. Returns '' (never null/throws) if it genuinely can't be
 * resolved, so callers can safely compare with === 'superadmin'.
 */
export async function getAppRole(user: User, supabase: SupabaseClient): Promise<string> {
  const { data: { session } } = await supabase.auth.getSession()
  const claims = session?.access_token ? decodeJwtPayload(session.access_token) : null
  if (claims?.app_role) return claims.app_role as string

  const { data } = await supabase
    .from('users' as any)
    .select('role')
    .eq('auth_user_id', user.id)
    .maybeSingle()

  return (data as any)?.role || ''
}
