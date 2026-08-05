import { createSupabaseServerClient } from '@/lib/supabase/server'
import { notFound } from 'next/navigation'
import SODetailClient from './SODetailClient'

export default async function SODetailPage({ params }: { params: { id: string } }) {
  const supabase = createSupabaseServerClient()
  const { data: rawData } = await supabase.from('sales_orders' as any)
    // jobs ka embed HINTED — 141 ke baad in do tables ke beech do rishte hain.
    .select('*, customers(name, customer_code, email, phone, mobile), sales_order_items(*, jobs!sales_order_items_repeat_of_job_id_fkey(job_number,job_title))')
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
