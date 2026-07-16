'use client'
import { useEffect, useState } from 'react'
import { createSupabaseClient } from '@/lib/supabase/client'

interface Notification {
  id: string; title: string; message: string | null
  type: string; is_read: boolean; link_url: string | null; created_at: string
}

export function useNotifications() {
  const [notifications, setNotifications] = useState<Notification[]>([])
  const [unreadCount, setUnreadCount] = useState(0)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const supabase = createSupabaseClient()

    const fetchNotifications = async () => {
      const { data } = await supabase
        .from('notifications' as any)
        .select('*')
        .is('deleted_at', null)
        .order('created_at', { ascending: false })
        .limit(50)
      const items = (data ?? []) as Notification[]
      setNotifications(items)
      setUnreadCount(items.filter(n => !n.is_read).length)
      setLoading(false)
    }

    fetchNotifications()

    // Realtime subscription
    const channel = supabase
      .channel('notifications-realtime')
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'notifications' }, payload => {
        setNotifications(prev => [payload.new as Notification, ...prev])
        setUnreadCount(c => c + 1)
      })
      .subscribe()

    return () => { supabase.removeChannel(channel) }
  }, [])

  const markRead = async (id: string) => {
    const supabase = createSupabaseClient()
    await supabase.from('notifications' as any).update({ is_read: true }).eq('id', id)
    setNotifications(prev => prev.map(n => n.id === id ? { ...n, is_read: true } : n))
    setUnreadCount(c => Math.max(0, c - 1))
  }

  const markAllRead = async () => {
    const supabase = createSupabaseClient()
    await supabase.from('notifications' as any).update({ is_read: true }).eq('is_read', false)
    setNotifications(prev => prev.map(n => ({ ...n, is_read: true })))
    setUnreadCount(0)
  }

  return { notifications, unreadCount, loading, markRead, markAllRead }
}
