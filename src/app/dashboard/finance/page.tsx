import { createSupabaseServerClient } from '@/lib/supabase/server'
import { getCompanyId } from '@/lib/utils/getCompanyId'
import FinanceClient from './FinanceClient'

export default async function FinancePage() {
  const supabase = createSupabaseServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return null // dashboard/layout.tsx already redirects unauthenticated requests to /login

  const companyId = await getCompanyId(user, supabase)

  const [invRes, payRes, customersRes, jobsRes, taxesRes] = await Promise.all([
    supabase.from('invoices' as any)
      .select('*, customers(name,customer_code), invoice_items(id), payments(id,amount)', { count: 'exact' })
      .eq('company_id', companyId).is('deleted_at', null)
      .order('invoice_date', { ascending: false }).limit(50),
    supabase.from('payments' as any)
      .select('amount,payment_date').eq('company_id', companyId).is('deleted_at', null)
      .gte('payment_date', new Date(Date.now() - 30 * 86400000).toISOString().slice(0, 10)),
    supabase.from('customers' as any).select('id,name,customer_code')
      .eq('company_id', companyId).is('deleted_at', null).order('name'),
    supabase.from('jobs' as any)
      .select('id,job_number,job_title,quoted_amount,customers(name)')
      .eq('company_id', companyId).is('deleted_at', null)
      .in('status', ['completed','dispatched']).order('job_number').limit(100),
    supabase.from('taxes' as any).select('id,name,rate_percent')
      .eq('company_id', companyId).eq('is_active', true).order('name'),
  ])

  const invoices = invRes.data ?? []
  const totalBilled   = invoices.reduce((s: number, i: any) => s + (i.total_amount || 0), 0)
  const totalReceived = invoices.reduce((s: number, i: any) => s + (i.paid_amount || 0), 0)
  const totalOverdue  = invoices.filter((i: any) => i.status === 'overdue' || (i.due_date && new Date(i.due_date) < new Date() && i.balance_due > 0)).reduce((s: number, i: any) => s + (i.balance_due || 0), 0)
  const monthlyCollected = (payRes.data ?? []).reduce((s: number, p: any) => s + (p.amount || 0), 0)

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-2xl font-bold text-[var(--color-text-primary)]">Finance</h1>
        <p className="text-sm text-[var(--color-text-muted)] mt-0.5">Invoices, payments & job costing</p>
      </div>
      <FinanceClient
        initialInvoices={invoices as any[]}
        customers={(customersRes.data ?? []) as any[]}
        completedJobs={(jobsRes.data ?? []) as any[]}
        taxes={(taxesRes.data ?? []) as any[]}
        stats={{ totalBilled, totalReceived, totalOverdue, monthlyCollected }}
      />
    </div>
  )
}
