import { createSupabaseServerClient } from '@/lib/supabase/server'
import { createSupabaseClient } from '@/lib/supabase/client'
import { AppError } from '@/types/shared'

export interface NotificationPayload {
  user_id: string
  company_id: string
  title: string
  message?: string
  type?: 'info' | 'success' | 'warning' | 'error'
  link_url?: string
}

/**
 * Send an in-app notification. Called server-side from any module.
 */
export async function notify(payload: NotificationPayload): Promise<void> {
  const supabase = createSupabaseServerClient()
  const { error } = await supabase.from('notifications' as any).insert(payload)
  if (error) throw new AppError('NOTIFY_FAILED', error.message)
}

// Browser-safe JWT payload decode (same approach as usePermission.ts) — the
// user_table_id claim (set by custom_access_token_hook) holds the current
// user's public.users.id, which notifications.user_id is a FK to. auth.uid()
// is a different UUID (the Supabase auth id) and must never be used here.
function decodeJwtPayload(token: string): Record<string, any> | null {
  try {
    const payload = token.split('.')[1]
    if (!payload) return null
    const base64 = payload.replace(/-/g, '+').replace(/_/g, '/')
    const json = decodeURIComponent(
      atob(base64)
        .split('')
        .map((c) => '%' + c.charCodeAt(0).toString(16).padStart(2, '0'))
        .join('')
    )
    return JSON.parse(json)
  } catch {
    return null
  }
}

async function getCurrentUserTableId(supabase: ReturnType<typeof createSupabaseClient>): Promise<string | null> {
  const { data: { session } } = await supabase.auth.getSession()
  if (!session?.access_token) return null
  return decodeJwtPayload(session.access_token)?.user_table_id ?? null
}

/**
 * Fetch unread count for the current user (client-side).
 */
export async function getUnreadCount(): Promise<number> {
  const supabase = createSupabaseClient()
  const userTableId = await getCurrentUserTableId(supabase)
  if (!userTableId) return 0
  const { count } = await supabase
    .from('notifications' as any)
    .select('*', { count: 'exact', head: true })
    .eq('user_id', userTableId)
    .eq('is_read', false)
    .is('deleted_at', null)
  return count ?? 0
}

/**
 * Mark notifications as read.
 */
export async function markAsRead(ids: string[]): Promise<void> {
  const supabase = createSupabaseClient()
  const userTableId = await getCurrentUserTableId(supabase)
  if (!userTableId) return
  await supabase.from('notifications' as any)
    .update({ is_read: true })
    .eq('user_id', userTableId)
    .in('id', ids)
}

/**
 * Mark ALL notifications as read for current user.
 */
export async function markAllAsRead(): Promise<void> {
  const supabase = createSupabaseClient()
  const userTableId = await getCurrentUserTableId(supabase)
  if (!userTableId) return
  await supabase.from('notifications' as any)
    .update({ is_read: true })
    .eq('user_id', userTableId)
    .eq('is_read', false)
}
