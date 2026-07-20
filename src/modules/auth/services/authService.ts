import { createSupabaseClient } from '@/lib/supabase/client'
import { AppError } from '@/types/shared'
import { clearPermissionCache } from '@/modules/settings/permissions/hooks/usePermission'
import type { LoginCredentials } from '../types/auth.types'

export async function signIn({ email, password }: LoginCredentials) {
  // Goes through our own API route (not supabase.auth.signInWithPassword
  // directly) so failed attempts can be counted and an account locked after
  // repeated failures — see /api/v1/auth/login. On success the route sets
  // the session cookies itself; nothing further to do here except let the
  // browser client pick up the now-cookie-backed session.
  const res = await fetch('/api/v1/auth/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password }),
  })
  const json = await res.json()
  if (!res.ok) throw new AppError('AUTH_FAILED', json.error || 'Sign in failed')

  // Best-effort — never let a logging failure block a successful login.
  fetch('/api/v1/auth/login-event', { method: 'POST' }).catch(() => {})

  return json
}

export async function signOut() {
  const supabase = createSupabaseClient()
  const { error } = await supabase.auth.signOut()
  // Clear cached role/permissions regardless of outcome so a shared device
  // never carries the previous user's permissions into the next session.
  clearPermissionCache()
  if (error) throw new AppError('SIGNOUT_FAILED', error.message)
}

export async function getCurrentUser() {
  const supabase = createSupabaseClient()
  const { data: { user }, error } = await supabase.auth.getUser()
  if (error || !user) return null
  return user
}
