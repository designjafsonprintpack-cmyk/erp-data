import { createSupabaseServerClient } from '@/lib/supabase/server'
import { getCompanyId } from '@/lib/utils/getCompanyId'
import DispatchClient from './DispatchClient'

export default async function DispatchPage() {
  const supabase = createSupabaseServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  const companyId = user ? await getCompanyId(user, supabase) : '00000000-0000-0000-0000-000000000001'

  const [dispatchRes, customersRes, jobsRes] = await Promise.all([
    supabase.from('dispatch_orders' as any)
      .select('*, customers(name,customer_code), dispatch_items(id,job_id,quantity_dispatched,jobs(job_number,job_title)), proof_of_delivery(id,received_by,condition)', { count: 'exact' })
      .eq('company_id', companyId).is('deleted_at', null)
      .order('created_at', { ascending: false }).limit(50),
    supabase.from('customers' as any)
      .select('id,name,customer_code,address,phone,mobile')
      .eq('company_id', companyId).is('deleted_at', null).order('name'),
    supabase.from('jobs' as any)
      .select('id,job_number,job_title,quantity,customers(name)')
      .eq('company_id', companyId).is('deleted_at', null)
      .in('status', ['completed','in_progress']).order('job_number').limit(100),
  ])

  const dispatched  = (dispatchRes.data ?? []).filter((d: any) => d.status === 'dispatched').length
  const delivered   = (dispatchRes.data ?? []).filter((d: any) => d.status === 'delivered').length
  const pending     = (dispatchRes.data ?? []).filter((d: any) => d.status === 'pending').length

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
        customers={(customersRes.data ?? []) as any[]}
        readyJobs={(jobsRes.data ?? []) as any[]}
      />
    </div>
  )
}
