import { createSupabaseServerClient } from '@/lib/supabase/server'
import { notFound } from 'next/navigation'
import SODetailClient from './SODetailClient'

export default async function SODetailPage({ params }: { params: { id: string } }) {
  const supabase = createSupabaseServerClient()
  const { data: rawData } = await supabase.from('sales_orders' as any)
    .select('*, customers(name, customer_code, email, phone, mobile), sales_order_items(*)')
    .eq('id', params.id).single()
  if (!rawData) notFound()
  const data = rawData as unknown as Record<string, any>
  const so = {
    ...data,
    sales_order_items: Array.isArray((data as any).sales_order_items)
      ? [...(data as any).sales_order_items].sort((a: any, b: any) => a.sort_order - b.sort_order) : [],
  }
  return <SODetailClient so={so as any} />
}
