'use client'
import { useState, useEffect, useCallback } from 'react'
import { toast } from '@/components/ui/Toast'

export interface QueueEntry {
  stage_progress_id: string
  job_id: string
  job_number: string
  job_title: string
  customer_name: string | null
  priority: string
  required_date: string | null
  stage_name: string
  started_at: string | null
  planned_date: string | null
  department_name: string | null
  blocked_reason?: string
}

export type QueueAction = 'start' | 'complete' | 'skip'

/**
 * Fetch + act for any work queue (department queue, per-stage pages). Owns the
 * three lists, the loading flag, and the PATCH to the one workflow endpoint —
 * so every queue in the system goes through the same gate checks and shows the
 * same warnings (short board stock, plates missing) the Job Detail page does.
 *
 * `url` may be null while the caller has nothing to fetch yet; the hook then
 * just sits idle instead of firing a bad request.
 */
export function useStageQueue(url: string | null) {
  const [ready, setReady] = useState<QueueEntry[]>([])
  const [blocked, setBlocked] = useState<QueueEntry[]>([])
  const [inProgress, setInProgress] = useState<QueueEntry[]>([])
  const [loading, setLoading] = useState(true)
  const [actingOn, setActingOn] = useState<string | null>(null)

  const reload = useCallback(async () => {
    if (!url) { setLoading(false); return }
    setLoading(true)
    try {
      const res = await fetch(url)
      const { data, error } = await res.json()
      if (!res.ok) throw new Error(error || 'Failed to load queue')
      setReady(data.ready ?? [])
      setBlocked(data.blocked ?? [])
      setInProgress(data.in_progress ?? [])
    } catch (e: any) {
      toast.error(e.message || 'Failed to load queue')
    } finally {
      setLoading(false)
    }
  }, [url])

  useEffect(() => { reload() }, [reload])

  // The floor refreshes on the same erp:refresh event AutoRefresh dispatches,
  // since router.refresh() can't reach a client-side fetch like this one.
  useEffect(() => {
    const onRefresh = () => { reload() }
    window.addEventListener('erp:refresh', onRefresh)
    return () => window.removeEventListener('erp:refresh', onRefresh)
  }, [reload])

  const act = useCallback(async (entry: QueueEntry, action: QueueAction) => {
    setActingOn(entry.stage_progress_id)
    try {
      const res = await fetch(`/api/v1/jobs/${entry.job_id}/workflow`, {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ stage_progress_id: entry.stage_progress_id, action }),
      })
      const json = await res.json()
      if (!res.ok) throw new Error(json.error || 'Failed')
      toast.success(action === 'start' ? 'Stage started' : action === 'complete' ? 'Stage completed' : 'Stage skipped')
      if (Array.isArray(json.warnings)) json.warnings.forEach((w: string) => toast.warning(w))
      await reload()
    } catch (e: any) {
      toast.error(e.message || 'Failed')
    } finally {
      setActingOn(null)
    }
  }, [reload])

  return { ready, blocked, inProgress, loading, actingOn, reload, act }
}

export default useStageQueue
