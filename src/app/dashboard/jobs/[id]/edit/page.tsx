import { notFound, redirect } from 'next/navigation'
import { createSupabaseServerClient } from '@/lib/supabase/server'
import { getCompanyId } from '@/lib/utils/getCompanyId'
import { getAppRole } from '@/lib/utils/getAppRole'
import EditJobClient from './EditJobClient'

export default async function EditJobPage({ params }: { params: { id: string } }) {
  const supabase = createSupabaseServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) redirect('/login')
  const companyId = await getCompanyId(user, supabase)

  // Job edit is superadmin-only — enforced here (not just by hiding the
  // button on the detail page) so navigating straight to this URL doesn't
  // bypass it.
  const role = await getAppRole(user, supabase)
  if (role !== 'superadmin') redirect(`/dashboard/jobs/${params.id}`)

  const [jobRes, customers, boardTypes, paperTypes, laminationTypes, foilTypes, workflows, salesOrders] = await Promise.all([
    supabase.from('jobs' as any).select('*, customers(name,customer_code), sales_orders(so_number)').eq('id', params.id).eq('company_id', companyId).single(),
    supabase.from('customers' as any).select('id,name,customer_code').eq('company_id', companyId).is('deleted_at', null).eq('is_active', true).order('name'),
    supabase.from('board_types' as any).select('id,name').eq('company_id', companyId).is('deleted_at', null).eq('is_active', true).order('name'),
    supabase.from('paper_types' as any).select('id,name').eq('company_id', companyId).is('deleted_at', null).eq('is_active', true).order('name'),
    supabase.from('lamination_types' as any).select('id,name').eq('company_id', companyId).is('deleted_at', null).eq('is_active', true).order('name'),
    supabase.from('foil_types' as any).select('id,name').eq('company_id', companyId).is('deleted_at', null).eq('is_active', true).order('name'),
    supabase.from('workflow_templates' as any).select('id,name,is_default').eq('company_id', companyId).is('deleted_at', null).order('name'),
    supabase.from('sales_orders' as any).select('id,so_number,customers(name)').eq('company_id', companyId).eq('status','confirmed').is('deleted_at', null).order('created_at', { ascending: false }).limit(50),
  ])

  if (jobRes.error || !jobRes.data) notFound()

  return (
    <EditJobClient
      job={jobRes.data as any}
      customers={(customers.data ?? []) as any[]}
      boardTypes={(boardTypes.data ?? []) as any[]}
      paperTypes={(paperTypes.data ?? []) as any[]}
      laminationTypes={(laminationTypes.data ?? []) as any[]}
      foilTypes={(foilTypes.data ?? []) as any[]}
      workflows={(workflows.data ?? []) as any[]}
      salesOrders={(salesOrders.data ?? []) as any[]}
    />
  )
}
