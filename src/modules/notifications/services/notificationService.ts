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

/**
 * Fetch unread count for the current user (client-side).
 */
export async function getUnreadCount(): Promise<number> {
  const supabase = createSupabaseClient()
  const { count } = await supabase
    .from('notifications' as any)
    .select('*', { count: 'exact', head: true })
    .eq('is_read', false)
    .is('deleted_at', null)
  return count ?? 0
}

/**
 * Mark notifications as read.
 */
export async function markAsRead(ids: string[]): Promise<void> {
  const supabase = createSupabaseClient()
  await supabase.from('notifications' as any)
    .update({ is_read: true })
    .in('id', ids)
}

/**
 * Mark ALL notifications as read for current user.
 */
export async function markAllAsRead(): Promise<void> {
  const supabase = createSupabaseClient()
  await supabase.from('notifications' as any)
    .update({ is_read: true })
    .eq('is_read', false)
}
