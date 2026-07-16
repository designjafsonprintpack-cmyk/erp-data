'use client'
import { useEffect, useState } from 'react'
import { cn } from '@/lib/utils/cn'
import { CheckCircle, XCircle, AlertTriangle, Info, X } from 'lucide-react'

type ToastType = 'success' | 'error' | 'warning' | 'info'

interface ToastItem {
  id: string
  type: ToastType
  title: string
  message?: string
}

const icons = {
  success: <CheckCircle size={16} className="text-[var(--color-success)]" />,
  error: <XCircle size={16} className="text-[var(--color-danger)]" />,
  warning: <AlertTriangle size={16} className="text-[var(--color-warning)]" />,
  info: <Info size={16} className="text-[var(--color-info)]" />,
}

const bgStyles: Record<ToastType, string> = {
  success: 'border-[var(--color-success)]/30',
  error: 'border-[var(--color-danger)]/30',
  warning: 'border-[var(--color-warning)]/30',
  info: 'border-[var(--color-info)]/30',
}

// Global toast store (simple without external library)
type ToastListener = (toasts: ToastItem[]) => void
const listeners: ToastListener[] = []
let toasts: ToastItem[] = []

function notify(listeners: ToastListener[]) {
  listeners.forEach(l => l([...toasts]))
}

export const toast = {
  success: (title: string, message?: string) => {
    const id = Math.random().toString(36).slice(2)
    toasts = [...toasts, { id, type: 'success', title, message }]
    notify(listeners)
    setTimeout(() => {
      toasts = toasts.filter(t => t.id !== id)
      notify(listeners)
    }, 4000)
  },
  error: (title: string, message?: string) => {
    const id = Math.random().toString(36).slice(2)
    toasts = [...toasts, { id, type: 'error', title, message }]
    notify(listeners)
    setTimeout(() => {
      toasts = toasts.filter(t => t.id !== id)
      notify(listeners)
    }, 5000)
  },
  warning: (title: string, message?: string) => {
    const id = Math.random().toString(36).slice(2)
    toasts = [...toasts, { id, type: 'warning', title, message }]
    notify(listeners)
    setTimeout(() => {
      toasts = toasts.filter(t => t.id !== id)
      notify(listeners)
    }, 4000)
  },
  info: (title: string, message?: string) => {
    const id = Math.random().toString(36).slice(2)
    toasts = [...toasts, { id, type: 'info', title, message }]
    notify(listeners)
    setTimeout(() => {
      toasts = toasts.filter(t => t.id !== id)
      notify(listeners)
    }, 4000)
  },
}

export function ToastContainer() {
  const [items, setItems] = useState<ToastItem[]>([])

  useEffect(() => {
    const listener: ToastListener = (t) => setItems(t)
    listeners.push(listener)
    return () => {
      const idx = listeners.indexOf(listener)
      if (idx > -1) listeners.splice(idx, 1)
    }
  }, [])

  const dismiss = (id: string) => {
    toasts = toasts.filter(t => t.id !== id)
    notify(listeners)
  }

  if (!items.length) return null

  return (
    <div className="fixed bottom-4 right-4 z-50 flex flex-col gap-2 max-w-sm w-full">
      {items.map(item => (
        <div
          key={item.id}
          className={cn(
            'flex items-start gap-3 p-3 rounded-lg border shadow-lg animate-slide-in',
            'bg-[var(--color-bg-elevated)]',
            bgStyles[item.type]
          )}
        >
          <div className="flex-shrink-0 mt-0.5">{icons[item.type]}</div>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-medium text-[var(--color-text-primary)]">{item.title}</p>
            {item.message && <p className="text-xs text-[var(--color-text-secondary)] mt-0.5">{item.message}</p>}
          </div>
          <button onClick={() => dismiss(item.id)} className="flex-shrink-0 text-[var(--color-text-muted)] hover:text-[var(--color-text-primary)]">
            <X size={14} />
          </button>
        </div>
      ))}
    </div>
  )
}
