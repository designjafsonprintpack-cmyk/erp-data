import { createSupabaseServerClient } from '@/lib/supabase/server'
import { getCompanyId } from '@/lib/utils/getCompanyId'
import NewJobClient from './NewJobClient'

export default async function NewJobPage() {
  const supabase = createSupabaseServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  const companyId = user ? await getCompanyId(user, supabase) : '00000000-0000-0000-0000-000000000001'

  const [customers, boardTypes, boxTypes, paperTypes, laminationTypes, foilTypes, coatingTypes, workflows, salesOrders, repeatableJobs, stockGsm] = await Promise.all([
    supabase.from('customers' as any).select('id,name,customer_code').eq('company_id', companyId).is('deleted_at', null).eq('is_active', true).order('name'),
    supabase.from('board_types' as any).select('id,name,gsm').eq('company_id', companyId).is('deleted_at', null).eq('is_active', true).order('name'),
    // workflow_template_id (migration 110) rides along so the form can move the
    // Production Workflow dropdown the moment a box type is picked, instead of
    // showing one workflow while the API silently resolves another.
    supabase.from('box_types' as any).select('id,name,workflow_template_id').eq('company_id', companyId).is('deleted_at', null).eq('is_active', true).order('sort_order').order('name'),
    supabase.from('paper_types' as any).select('id,name,gsm').eq('company_id', companyId).is('deleted_at', null).eq('is_active', true).order('name'),
    supabase.from('lamination_types' as any).select('id,name').eq('company_id', companyId).is('deleted_at', null).eq('is_active', true).order('name'),
    supabase.from('foil_types' as any).select('id,name').eq('company_id', companyId).is('deleted_at', null).eq('is_active', true).order('name'),
    // UV Coating options — a settings-managed master (Settings > Materials >
    // Coating Types), not a hardcoded list, so the shop can add or drop one
    // without a code change.
    supabase.from('coating_types' as any).select('id,name').eq('company_id', companyId).is('deleted_at', null).eq('is_active', true).order('name'),
    supabase.from('workflow_templates' as any).select('id,name,is_default').eq('company_id', companyId).is('deleted_at', null).order('name'),
    supabase.from('sales_orders' as any).select('id,so_number,customer_id,customers(name),sales_order_items(id,product_desc,size_l,size_w,size_h,quantity,no_of_colors,board_type_id,paper_type_id,gsm,repeat_of_job_id)').eq('company_id', companyId).eq('status','confirmed').is('deleted_at', null).order('created_at', { ascending: false }).limit(50),
    // First paint for the three job pickers (Repeat, Repeat with Changes, and
    // "Same spec as an old job?"). All three now search through
    // GET /api/v1/jobs/spec-search, which replaces this list within ~300ms —
    // the browser-side filter this used to feed could only ever see these 200
    // of 479 jobs, so 279 were unreachable no matter what was typed.
    //
    // `quoted_amount` is deliberately NOT selected here. It used to be, for
    // every role, which put the price of 200 jobs in the page HTML with only a
    // client-side MoneyGate between it and the screen. The search route returns
    // it instead, gated on canSeeMoneyServer().
    supabase.from('jobs' as any)
      .select('id,job_number,job_title,description,quantity,ups,no_of_colors,die_number,size_l,size_w,size_h,sheet_width_in,sheet_height_in,box_type_id,gsm,board_type_id,paper_type_id,lamination_type_id,foil_type_id,uv_coating,special_finishing,pasting,workflow_template_id,internal_remarks,customer_id,customers(name)')
      .eq('company_id', companyId).is('deleted_at', null)
      .order('created_at', { ascending: false })
      // The 478 legacy jobs share one backdated created_at, so without this the
      // 200 that arrive differ between renders.
      .order('id', { ascending: false })
      .limit(200),
    // Real GSMs that actually exist in stock, per board type. GSM is a property
    // of the STOCK ITEM (one board comes in many weights), not of the board
    // type — so the job's GSM options are sourced from here, never from
    // board_types.gsm.
    supabase.from('board_inventory' as any)
      .select('board_type_id,gsm').eq('company_id', companyId)
      .is('deleted_at', null).eq('is_active', true).not('gsm', 'is', null),
  ])

  const defaultWorkflow = ((workflows.data ?? []) as unknown as Array<{ id: string; is_default: boolean }>).find(w => w.is_default)?.id || ''
  const salesOrdersData = (salesOrders.data ?? []) as unknown as Array<{ id: string; so_number: string; customers: { name: string } | null }>

  return (
    <NewJobClient
      customers={(customers.data ?? []) as any[]}
      boardTypes={(boardTypes.data ?? []) as any[]}
      boxTypes={(boxTypes.data ?? []) as any[]}
      paperTypes={(paperTypes.data ?? []) as any[]}
      laminationTypes={(laminationTypes.data ?? []) as any[]}
      foilTypes={(foilTypes.data ?? []) as any[]}
      coatingTypes={(coatingTypes.data ?? []) as any[]}
      workflows={(workflows.data ?? []) as any[]}
      salesOrders={(salesOrders.data ?? []) as any[]}
      repeatableJobs={(repeatableJobs.data ?? []) as any[]}
      stockGsm={(stockGsm.data ?? []) as any[]}
      defaultWorkflowId={defaultWorkflow}
    />
  )
}
