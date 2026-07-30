import { createSupabaseServerClient } from '@/lib/supabase/server'
import { getCompanyId } from '@/lib/utils/getCompanyId'
import QuotationFormClient from '../QuotationFormClient'

export default async function NewQuotationPage() {
  const supabase = createSupabaseServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  const companyId = user ? await getCompanyId(user, supabase) : '00000000-0000-0000-0000-000000000001'

  const [customersRes, boardTypesRes, paperTypesRes, boxTypesRes, costItemTypesRes, taxesRes] = await Promise.all([
    supabase.from('customers' as any).select('id, name, customer_code').eq('company_id', companyId).is('deleted_at', null).eq('is_active', true).order('name'),
    supabase.from('board_types' as any).select('id, name, sheet_width_in, sheet_height_in, rate_per_sheet, rate_per_kg, gsm').eq('company_id', companyId).is('deleted_at', null).eq('is_active', true),
    // The other half of the Board / Paper dropdown (116).
    supabase.from('paper_types' as any).select('id, name, gsm').eq('company_id', companyId).is('deleted_at', null).eq('is_active', true).order('name'),
    supabase.from('box_types' as any).select('id, name').eq('company_id', companyId).is('deleted_at', null).eq('is_active', true).order('sort_order').order('name'),
    supabase.from('cost_item_types' as any).select('id, name, unit_basis, default_rate').eq('company_id', companyId).is('deleted_at', null).eq('is_active', true).order('sort_order').order('name'),
    supabase.from('taxes' as any).select('id, name, rate_percent').eq('company_id', companyId).is('deleted_at', null).eq('is_active', true).order('name'),
  ])

  return (
    <QuotationFormClient
      mode="new"
      customers={(customersRes.data ?? []) as any[]}
      boardTypes={(boardTypesRes.data ?? []) as any[]}
      paperTypes={(paperTypesRes.data ?? []) as any[]}
      boxTypes={(boxTypesRes.data ?? []) as any[]}
      costItemTypes={(costItemTypesRes.data ?? []) as any[]}
      taxes={(taxesRes.data ?? []) as any[]}
    />
  )
}
