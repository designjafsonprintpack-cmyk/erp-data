import type { SupabaseClient, User } from '@supabase/supabase-js'

/**
 * Decode the payload of a JWT without verifying its signature.
 * Safe to use here because the token has already been issued/validated by
 * Supabase Auth for this request — we're only reading claims out of it.
 */
function decodeJwtPayload(token: string): Record<string, any> | null {
  try {
    const payload = token.split('.')[1]
    if (!payload) return null
    const base64 = payload.replace(/-/g, '+').replace(/_/g, '/')
    const json =
      typeof atob === 'function'
        ? decodeURIComponent(
            atob(base64)
              .split('')
              .map((c) => '%' + c.charCodeAt(0).toString(16).padStart(2, '0'))
              .join('')
          )
        : Buffer.from(base64, 'base64').toString('utf-8')
    return JSON.parse(json)
  } catch {
    return null
  }
}

/**
 * Resolve the current user's company_id.
 *
 * IMPORTANT: `custom_access_token_hook` (supabase/migrations/002_auth_users.sql)
 * writes company_id onto the TOP LEVEL of the JWT claims object. It does NOT write
 * to user.app_metadata / user.user_metadata — those are separate fields on the
 * Supabase Auth user record that the hook never touches. So the only reliable way
 * to read it server-side is to decode the actual access token.
 *
 * This function never silently defaults to a hardcoded company. If company_id
 * genuinely cannot be resolved, it throws — callers should let this surface as an
 * error response rather than guessing a tenant.
 */
export async function getCompanyId(user: User, supabase: SupabaseClient): Promise<string> {
  // 1. Decode the live JWT — this is where the Auth Hook actually writes company_id
  const {
    data: { session },
  } = await supabase.auth.getSession()

  const claims = session?.access_token ? decodeJwtPayload(session.access_token) : null
  if (claims?.company_id) return claims.company_id as string

  // 2. Fallback: look up the app's own users row.
  //    NOTE: match on auth_user_id, not id — public.users.id is the app's own
  //    generated primary key; user.id here is the Supabase auth.users id, which
  //    is stored on public.users.auth_user_id.
  const { data: dbUser } = await supabase
    .from('users' as any)
    .select('company_id')
    .eq('auth_user_id', user.id)
    .maybeSingle()

  if ((dbUser as any)?.company_id) return (dbUser as any).company_id

  // 3. Genuinely unresolvable — do not guess. Previously this silently returned
  //    a hardcoded seed company_id, which meant every unresolvable request was
  //    attributed to that company's tenant regardless of who the user actually was.
  throw new Error(
    'Unable to resolve company_id for this user. Verify that the custom_access_token_hook ' +
      'is registered in Supabase Auth settings (Authentication → Hooks) and that a matching ' +
      'row exists in public.users for this auth user.'
  )
}
