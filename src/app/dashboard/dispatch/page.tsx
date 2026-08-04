import { createSupabaseServerClient } from '@/lib/supabase/server'
import { LIST_PAGE_SIZE } from '@/lib/constants/pagination'
import { getCompanyId } from '@/lib/utils/getCompanyId'
import DispatchClient from './DispatchClient'
import { loadJobsAwaitingDispatch } from '@/lib/utils/jobsAwaitingDispatch'

export default async function DispatchPage() {
  const supabase = createSupabaseServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  const companyId = user ? await getCompanyId(user, supabase) : '00000000-0000-0000-0000-000000000001'

  const [dispatchRes, customersRes, jobsRes] = await Promise.all([
    supabase.from('dispatch_orders' as any)
      .select('*, customers(name,customer_code), dispatch_items(id,job_id,quantity_dispatched,jobs(job_number,job_title)), proof_of_delivery(id,received_by,condition)', { count: 'exact' })
      .eq('company_id', companyId).is('deleted_at', null)
      // First page only — DispatchClient pages the rest from /api/v1/dispatch,
      // which filters server-side, so nothing is unreachable any more.
      // Must match LIST_PAGE_SIZE, or page 2 overlaps page 1.
      .order('created_at', { ascending: false }).order('id', { ascending: false })
      .range(0, LIST_PAGE_SIZE - 1),
    supabase.from('customers' as any)
      .select('id,name,customer_code,address,phone,mobile')
      .eq('company_id', companyId).is('deleted_at', null).order('name'),
    supabase.from('jobs' as any)
      .select('id,job_number,job_title,quantity,customers(name)')
      .eq('company_id', companyId).is('deleted_at', null)
      .in('status', ['completed','in_progress']).order('job_number').limit(100),
  ])

  // Jobs whose workflow has reached Dispatch and which aren't on an order yet
  // — the list this page was missing.
  const awaitingDispatch = await loadJobsAwaitingDispatch(supabase, companyId)

  // Counted in the database, not by filtering the page of rows above — that
  // array is 50 long, so those three numbers used to be "of the newest 50".
  const countByStatus = (status: string) =>
    supabase.from('dispatch_orders' as any)
      .select('id', { count: 'exact', head: true })
      .eq('company_id', companyId).is('deleted_at', null).eq('status', status)

  const [dispatchedRes, deliveredRes, pendingRes] = await Promise.all([
    countByStatus('dispatched'), countByStatus('delivered'), countByStatus('pending'),
  ])
  const dispatched = dispatchedRes.count ?? 0
  const delivered  = deliveredRes.count ?? 0
  const pending    = pendingRes.count ?? 0

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-2xl font-bold text-[var(--color-text-primary)]">Dispatch & Delivery</h1>
        <p className="text-sm text-[var(--color-text-muted)] mt-0.5">
          {pending} pending · {dispatched} in transit · {delivered} delivered
        </p>
      </div>
      <DispatchClient
        initialDispatches={(dispatchRes.data ?? []) as any[]}
        initialTotal={dispatchRes.count ?? 0}
        customers={(customersRes.data ?? []) as any[]}
        readyJobs={(jobsRes.data ?? []) as any[]}
        awaitingDispatch={awaitingDispatch}
      />
    </div>
  )
}
