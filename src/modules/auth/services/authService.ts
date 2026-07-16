import { createSupabaseClient } from '@/lib/supabase/client'
import { AppError } from '@/types/shared'
import type { LoginCredentials } from '../types/auth.types'

export async function signIn({ email, password }: LoginCredentials) {
  const supabase = createSupabaseClient()
  const { data, error } = await supabase.auth.signInWithPassword({ email, password })
  if (error) throw new AppError('AUTH_FAILED', error.message)
  return data
}

export async function signOut() {
  const supabase = createSupabaseClient()
  const { error } = await supabase.auth.signOut()
  if (error) throw new AppError('SIGNOUT_FAILED', error.message)
}

export async function getCurrentUser() {
  const supabase = createSupabaseClient()
  const { data: { user }, error } = await supabase.auth.getUser()
  if (error || !user) return null
  return user
}
