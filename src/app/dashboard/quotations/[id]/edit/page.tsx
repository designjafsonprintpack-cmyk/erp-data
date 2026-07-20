import { createSupabaseServerClient } from '@/lib/supabase/server'
import { getCompanyId } from '@/lib/utils/getCompanyId'
import { notFound } from 'next/navigation'
import QuotationFormClient from '../../QuotationFormClient'

export default async function EditQuotationPage({ params }: { params: { id: string } }) {
  const supabase = createSupabaseServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  const companyId = user ? await getCompanyId(user, supabase) : '00000000-0000-0000-0000-000000000001'

  const [qtRes, customersRes, boardTypesRes, costItemTypesRes, taxesRes] = await Promise.all([
    supabase.from('quotations' as any).select('*, quotation_items(*, quotation_item_cost_lines(*))').eq('id', params.id).single(),
    supabase.from('customers' as any).select('id, name, customer_code').eq('company_id', companyId).is('deleted_at', null).order('name'),
    supabase.from('board_types' as any).select('id, name, sheet_length_in, sheet_width_in, rate_per_sheet, rate_per_kg, gsm').eq('company_id', companyId).is('deleted_at', null),
    supabase.from('cost_item_types' as any).select('id, name, unit_basis, default_rate').eq('company_id', companyId).is('deleted_at', null).order('name'),
    supabase.from('taxes' as any).select('id, name, rate_percent').eq('company_id', companyId).is('deleted_at', null).eq('is_active', true).order('name'),
  ])
  if (!qtRes.data) notFound()
  const qtData = qtRes.data as unknown as Record<string, any>
  const qt = { ...qtData, quotation_items: Array.isArray((qtData as any).quotation_items) ? [...(qtData as any).quotation_items].sort((a: any, b: any) => a.sort_order - b.sort_order) : [] }
  return <QuotationFormClient mode="edit" customers={(customersRes.data ?? []) as any[]} boardTypes={(boardTypesRes.data ?? []) as any[]} costItemTypes={(costItemTypesRes.data ?? []) as any[]} taxes={(taxesRes.data ?? []) as any[]} initialData={qt as any} />
}
