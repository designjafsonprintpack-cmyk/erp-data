import { createSupabaseServerClient } from '@/lib/supabase/server'
import { getCompanyId } from '@/lib/utils/getCompanyId'
import { notFound } from 'next/navigation'
import SOFormClient from '../../SOFormClient'

export default async function EditSOPage({ params }: { params: { id: string } }) {
  const supabase = createSupabaseServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  const companyId = user ? await getCompanyId(user, supabase) : '00000000-0000-0000-0000-000000000001'

  const [soRes, customersRes, boardTypesRes] = await Promise.all([
    supabase.from('sales_orders' as any).select('*, sales_order_items(*)').eq('id', params.id).single(),
    supabase.from('customers' as any).select('id, name, customer_code').eq('company_id', companyId).is('deleted_at', null).order('name'),
    supabase.from('board_types' as any).select('id, name').eq('company_id', companyId).is('deleted_at', null),
  ])
  if (!soRes.data) notFound()
  const so = { ...soRes.data, sales_order_items: Array.isArray((soRes.data as any).sales_order_items) ? [...(soRes.data as any).sales_order_items].sort((a: any, b: any) => a.sort_order - b.sort_order) : [] }
  return <SOFormClient mode="edit" customers={(customersRes.data ?? []) as any[]} boardTypes={(boardTypesRes.data ?? []) as any[]} initialData={so as any} />
}
