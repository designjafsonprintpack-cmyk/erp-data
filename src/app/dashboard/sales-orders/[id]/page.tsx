import { createSupabaseServerClient } from '@/lib/supabase/server'
import { notFound } from 'next/navigation'
import SODetailClient from './SODetailClient'

export default async function SODetailPage({ params }: { params: { id: string } }) {
  const supabase = createSupabaseServerClient()
  const { data: rawData } = await supabase.from('sales_orders' as any)
    // `jobs` ke DO rishte hain in tables ke beech, is liye dono embed HINTED
    // hain — bagair hint ke PostgREST poora query rad kar deta hai:
    //   repeat_of_job_id → wo PURANI job jis ka ye carton repeat hai (141)
    //   sales_order_item_id → wo job jo IS line se BANI (confirm par khud banti)
    // Doosre ke bagair SO se ye dekha hi nahi ja sakta tha ke kis line ki job
    // ban chuki hai — saat line wali SO par ye bhoolna bohot asaan tha.
    .select('*, customers(name, customer_code, email, phone, mobile), '
      + 'sales_order_items(*, '
      + 'jobs!sales_order_items_repeat_of_job_id_fkey(job_number,job_title), '
      + 'created_jobs:jobs!jobs_sales_order_item_id_fkey(id,job_number,status,deleted_at))')
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
