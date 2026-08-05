import { createSupabaseServerClient } from '@/lib/supabase/server'
import { notFound } from 'next/navigation'
import QuotationDetailClient from './QuotationDetailClient'

export default async function QuotationDetailPage({ params }: { params: { id: string } }) {
  const supabase = createSupabaseServerClient()
  const { data: rawData, error } = await supabase.from('quotations' as any)
    // jobs UNHINTED theek hai: quotation_items aur jobs ke beech sirf EK rishta
    // hai (repeat_of_job_id). sales_order_items par do hain, is liye wahan hint
    // lazmi hai — dono ko ek jaisa mat samajhna.
    .select('*, customers(name, customer_code, email, phone), quotation_items(*, jobs(job_number,job_title))')
    .eq('id', params.id).single()

  if (error || !rawData) notFound()
  const data = rawData as unknown as Record<string, any>
  const qt = { ...data, quotation_items: Array.isArray((data as any).quotation_items) ? [...(data as any).quotation_items].sort((a: any, b: any) => a.sort_order - b.sort_order) : [] }

  return <QuotationDetailClient quotation={qt as any} />
}
