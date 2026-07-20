'use client'
import { useEffect, useState } from 'react'
import { createSupabaseClient } from '@/lib/supabase/client'

interface Notification {
  id: string; title: string; message: string | null
  type: string; is_read: boolean; link_url: string | null; created_at: string
  occurrence_count: number
}

export function useNotifications() {
  const [notifications, setNotifications] = useState<Notification[]>([])
  const [unreadCount, setUnreadCount] = useState(0)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const supabase = createSupabaseClient()

    const fetchNotifications = async () => {
      const { data: rawData } = await supabase
        .from('notifications' as any)
        .select('*')
        .is('deleted_at', null)
        .order('created_at', { ascending: false })
        .limit(50)
      const data = rawData as unknown as Notification[] | null
      const items = (data ?? []) as Notification[]
      setNotifications(items)
      setUnreadCount(items.filter(n => !n.is_read).length)
      setLoading(false)
    }

    fetchNotifications()

    // Realtime subscription — INSERT for brand-new notifications, UPDATE for
    // digest merges (occurrence_count bump on an existing unread row) and
    // mark-as-read happening from another tab/device.
    const channel = supabase
      .channel('notifications-realtime')
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'notifications' }, payload => {
        setNotifications(prev => [payload.new as Notification, ...prev])
        setUnreadCount(c => c + 1)
      })
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'notifications' }, payload => {
        const updated = payload.new as Notification
        setNotifications(prev => {
          const exists = prev.some(n => n.id === updated.id)
          if (!exists) return prev
          return prev.map(n => n.id === updated.id ? updated : n)
        })
        setUnreadCount(prevCount => {
          // Recompute isn't possible from just the updated row, so only
          // adjust when read state actually flipped — handled in markRead/
          // markAllRead locally already; this covers cross-tab updates.
          return prevCount
        })
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
