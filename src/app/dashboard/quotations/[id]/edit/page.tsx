import { createSupabaseServerClient } from '@/lib/supabase/server'
import { getCompanyId } from '@/lib/utils/getCompanyId'
import { notFound } from 'next/navigation'
import QuotationFormClient from '../../QuotationFormClient'

export default async function EditQuotationPage({ params }: { params: { id: string } }) {
  const supabase = createSupabaseServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  const companyId = user ? await getCompanyId(user, supabase) : '00000000-0000-0000-0000-000000000001'

  const [qtRes, customersRes, boardTypesRes] = await Promise.all([
    supabase.from('quotations' as any).select('*, quotation_items(*)').eq('id', params.id).single(),
    supabase.from('customers' as any).select('id, name, customer_code').eq('company_id', companyId).is('deleted_at', null).order('name'),
    supabase.from('board_types' as any).select('id, name').eq('company_id', companyId).is('deleted_at', null),
  ])
  if (!qtRes.data) notFound()
  const qt = { ...qtRes.data, quotation_items: Array.isArray((qtRes.data as any).quotation_items) ? [...(qtRes.data as any).quotation_items].sort((a: any, b: any) => a.sort_order - b.sort_order) : [] }
  return <QuotationFormClient mode="edit" customers={(customersRes.data ?? []) as any[]} boardTypes={(boardTypesRes.data ?? []) as any[]} initialData={qt as any} />
}
