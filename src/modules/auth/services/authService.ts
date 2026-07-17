import { createSupabaseClient } from '@/lib/supabase/client'
import { AppError } from '@/types/shared'
import { clearPermissionCache } from '@/modules/settings/permissions/hooks/usePermission'
import type { LoginCredentials } from '../types/auth.types'

export async function signIn({ email, password }: LoginCredentials) {
  const supabase = createSupabaseClient()
  const { data, error } = await supabase.auth.signInWithPassword({ email, password })
  if (error) throw new AppError('AUTH_FAILED', error.message)

  // Best-effort — never let a logging failure block a successful login.
  fetch('/api/v1/auth/login-event', { method: 'POST' }).catch(() => {})

  return data
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
