import type { SupabaseClient } from '@supabase/supabase-js'
import { getPlannedDates } from './plannedDates'

export interface JobAwaitingDispatch {
  job_id: string
  job_number: string
  job_title: string
  customer_id: string | null
  customer_name: string | null
  priority: string
  quantity: number | null
  planned_date: string | null
  required_date: string | null
  /** 'pending' — dispatch hasn't been started; 'in_progress' — it has. */
  stage_status: string
}

/**
 * "Kaun sa job bhejne ke liye tayyar hai" — every live job standing at the
 * Dispatch stage that isn't already on a dispatch order.
 *
 * The Dispatch page listed dispatch orders and offered a dropdown of every
 * job with status completed or in_progress — a hundred rows, most of them
 * nowhere near ready. This is the actual answer: packing is done, the workflow
 * is at Dispatch, and nobody has raised the paperwork yet. A job leaves the
 * list the moment it appears on a dispatch order.
 */
export async function loadJobsAwaitingDispatch(
  supabase: SupabaseClient,
  companyId: string
): Promise<JobAwaitingDispatch[]> {
  const { data: stageRows } = await supabase.from('job_stage_progress' as any)
    .select('job_id, status, workflow_stages!inner(name, stage_type), jobs!inner(job_number, job_title, priority, quantity, required_date, status, deleted_at, customer_id, customers(name))')
    .eq('company_id', companyId)
    .in('status', ['pending', 'in_progress'])
    .eq('is_active', true)

  const candidates = ((stageRows ?? []) as any[]).filter(r => {
    if (!r.jobs || r.jobs.deleted_at) return false
    // 'completed' counts here: the job's own workflow closes as soon as the
    // last stage is done, but a job can also legitimately be marked complete
    // while Dispatch itself is still open.
    if (!['new', 'in_progress', 'completed'].includes(r.jobs.status)) return false
    const type = r.workflow_stages?.stage_type
    const name = (r.workflow_stages?.name ?? '').trim().toLowerCase()
    return type === 'dispatch' || name === 'dispatch'
  })

  if (candidates.length === 0) return []

  const jobIds = Array.from(new Set(candidates.map(r => r.job_id)))

  // Already on a dispatch order? Then Dispatch has it in hand. A cancelled
  // order doesn't count — that job needs raising again.
  const { data: itemRows } = await supabase.from('dispatch_items' as any)
    .select('job_id, dispatch_orders!inner(status, deleted_at)')
    .eq('company_id', companyId)
    .in('job_id', jobIds)

  const onOrder = new Set(
    ((itemRows ?? []) as any[])
      .filter(r => r.dispatch_orders && !r.dispatch_orders.deleted_at && r.dispatch_orders.status !== 'cancelled')
      .map(r => r.job_id)
  )

  const pending = candidates.filter(r => !onOrder.has(r.job_id))
  if (pending.length === 0) return []

  const plannedDates = await getPlannedDates(supabase, companyId, pending.map(r => r.job_id))

  const rows: JobAwaitingDispatch[] = pending.map(r => ({
    job_id: r.job_id,
    job_number: r.jobs.job_number,
    job_title: r.jobs.job_title,
    customer_id: r.jobs.customer_id ?? null,
    customer_name: r.jobs.customers?.name ?? null,
    priority: r.jobs.priority,
    quantity: r.jobs.quantity ?? null,
    planned_date: plannedDates.get(r.job_id) ?? null,
    required_date: r.jobs.required_date ?? null,
    stage_status: r.status,
  }))

  // Whatever the customer is waiting on longest goes first.
  const key = (r: JobAwaitingDispatch) => r.required_date ?? r.planned_date ?? '9999-12-31'
  rows.sort((a, b) => key(a).localeCompare(key(b)))

  return rows
}

export default loadJobsAwaitingDispatch
