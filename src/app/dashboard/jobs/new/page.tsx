import { createSupabaseServerClient } from '@/lib/supabase/server'
import { getCompanyId } from '@/lib/utils/getCompanyId'
import NewJobClient from './NewJobClient'

export default async function NewJobPage() {
  const supabase = createSupabaseServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  const companyId = user ? await getCompanyId(user, supabase) : '00000000-0000-0000-0000-000000000001'

  const [customers, boardTypes, paperTypes, laminationTypes, foilTypes, workflows, salesOrders] = await Promise.all([
    supabase.from('customers' as any).select('id,name,customer_code').eq('company_id', companyId).is('deleted_at', null).eq('is_active', true).order('name'),
    supabase.from('board_types' as any).select('id,name').eq('company_id', companyId).is('deleted_at', null).eq('is_active', true).order('name'),
    supabase.from('paper_types' as any).select('id,name').eq('company_id', companyId).is('deleted_at', null).eq('is_active', true).order('name'),
    supabase.from('lamination_types' as any).select('id,name').eq('company_id', companyId).is('deleted_at', null).eq('is_active', true).order('name'),
    supabase.from('foil_types' as any).select('id,name').eq('company_id', companyId).is('deleted_at', null).eq('is_active', true).order('name'),
    supabase.from('workflow_templates' as any).select('id,name,is_default').eq('company_id', companyId).is('deleted_at', null).order('name'),
    supabase.from('sales_orders' as any).select('id,so_number,customer_id,customers(name),sales_order_items(id,product_desc,size_l,size_w,size_h,quantity,no_of_colors,board_type_id)').eq('company_id', companyId).eq('status','confirmed').is('deleted_at', null).order('created_at', { ascending: false }).limit(50),
  ])

  const defaultWorkflow = ((workflows.data ?? []) as unknown as Array<{ id: string; is_default: boolean }>).find(w => w.is_default)?.id || ''
  const salesOrdersData = (salesOrders.data ?? []) as unknown as Array<{ id: string; so_number: string; customers: { name: string } | null }>

  return (
    <NewJobClient
      customers={(customers.data ?? []) as any[]}
      boardTypes={(boardTypes.data ?? []) as any[]}
      paperTypes={(paperTypes.data ?? []) as any[]}
      laminationTypes={(laminationTypes.data ?? []) as any[]}
      foilTypes={(foilTypes.data ?? []) as any[]}
      workflows={(workflows.data ?? []) as any[]}
      salesOrders={(salesOrders.data ?? []) as any[]}
      defaultWorkflowId={defaultWorkflow}
    />
  )
}
