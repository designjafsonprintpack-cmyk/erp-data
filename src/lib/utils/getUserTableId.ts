import type { SupabaseClient, User } from '@supabase/supabase-js'

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
 * Resolve the current user's public.users.id — the app-level primary key that
 * ~26 FK columns across the schema (completed_by, actor_id, approved_by,
 * inspector_id, recorded_by, etc.) actually reference.
 *
 * IMPORTANT: this is NOT the same UUID as `user.id` from
 * supabase.auth.getUser() — that's the Supabase Auth id, stored separately on
 * public.users.auth_user_id. Passing user.id directly into any users(id) FK
 * column will fail a foreign key constraint for any user whose public.users
 * row wasn't (incorrectly) created with id === auth_user_id.
 *
 * custom_access_token_hook (migration 002) already puts the correct value on
 * the JWT as the `user_table_id` claim, so this reads that first and only
 * falls back to a DB lookup if the claim is somehow missing.
 */
export async function getUserTableId(user: User, supabase: SupabaseClient): Promise<string | null> {
  const { data: { session } } = await supabase.auth.getSession()
  const claims = session?.access_token ? decodeJwtPayload(session.access_token) : null
  if (claims?.user_table_id) return claims.user_table_id as string

  const { data } = await supabase
    .from('users' as any)
    .select('id')
    .eq('auth_user_id', user.id)
    .maybeSingle()

  return (data as any)?.id ?? null
}
