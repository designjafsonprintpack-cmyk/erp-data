import { createSupabaseServerClient } from '@/lib/supabase/server'
import { notFound } from 'next/navigation'
import CustomerDetailClient from './CustomerDetailClient'

export default async function CustomerDetailPage({ params }: { params: { id: string } }) {
  const supabase = createSupabaseServerClient()
  const [customerRes, contactsRes, addressesRes] = await Promise.all([
    supabase.from('customers' as any).select('*').eq('id', params.id).maybeSingle(),
    supabase.from('customer_contacts' as any).select('*').eq('customer_id', params.id).is('deleted_at', null).order('is_primary', { ascending: false }),
    supabase.from('customer_addresses' as any).select('*').eq('customer_id', params.id).is('deleted_at', null),
  ])
  if (!customerRes.data) notFound()
  return (
    <CustomerDetailClient
      customer={customerRes.data as any}
      contacts={(contactsRes.data ?? []) as any[]}
      addresses={(addressesRes.data ?? []) as any[]}
    />
  )
}
