import { createSupabaseServerClient } from '@/lib/supabase/server'
import { notFound } from 'next/navigation'
import QuotationDetailClient from './QuotationDetailClient'

export default async function QuotationDetailPage({ params }: { params: { id: string } }) {
  const supabase = createSupabaseServerClient()
  const { data: rawData, error } = await supabase.from('quotations' as any)
    .select('*, customers(name, customer_code, email, phone), quotation_items(*)')
    .eq('id', params.id).single()

  if (error || !rawData) notFound()
  const data = rawData as unknown as Record<string, any>
  const qt = { ...data, quotation_items: Array.isArray((data as any).quotation_items) ? [...(data as any).quotation_items].sort((a: any, b: any) => a.sort_order - b.sort_order) : [] }

  return <QuotationDetailClient quotation={qt as any} />
}
