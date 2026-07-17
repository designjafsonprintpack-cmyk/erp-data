import { NextResponse, type NextRequest } from 'next/server'
import { createSupabaseServerClient } from '@/lib/supabase/server'
import { getCompanyId } from '@/lib/utils/getCompanyId'

export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const supabase = createSupabaseServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const companyId = await getCompanyId(user, supabase)
  const body = await req.json()

  // Fetch quotation with items
  const { data: qt, error: qtErr } = await supabase.from('quotations' as any)
    .select('*, quotation_items(*)').eq('id', params.id).single()
  if (qtErr || !qt) return NextResponse.json({ error: 'Quotation not found' }, { status: 404 })
  if ((qt as any).status === 'converted') return NextResponse.json({ error: 'Already converted' }, { status: 400 })
  if ((qt as any).status !== 'approved') {
    return NextResponse.json(
      { error: `Only an approved quotation can be converted to a Sales Order (current status: "${(qt as any).status}").` },
      { status: 400 }
    )
  }

  // Generate SO number
  const { data: soNumber } = await (supabase as any).rpc('get_next_sequence_number', {
    p_company_id: companyId, p_document_type: 'SO',
  })

  // Create SO
  const { data: so, error: soErr } = await supabase.from('sales_orders' as any).insert({
    company_id: companyId,
    so_number: soNumber,
    quotation_id: params.id,
    customer_id: (qt as any).customer_id,
    customer_contact_id: (qt as any).customer_contact_id,
    currency_id: (qt as any).currency_id,
    tax_id: (qt as any).tax_id,
    discount_percent: (qt as any).discount_percent,
    subtotal: (qt as any).subtotal,
    tax_amount: (qt as any).tax_amount,
    discount_amount: (qt as any).discount_amount,
    total_amount: (qt as any).total_amount,
    required_date: body.required_date || null,
    special_instructions: body.special_instructions || null,
  }).select().single()
  if (soErr) return NextResponse.json({ error: soErr.message }, { status: 500 })

  // Copy line items to SO
  const items = Array.isArray((qt as any).quotation_items) ? (qt as any).quotation_items : []
  if (items.length) {
    await supabase.from('sales_order_items' as any).insert(
      items.map((item: any) => ({
        company_id: companyId,
        sales_order_id: (so as any).id,
        quotation_item_id: item.id,
        line_no: item.line_no,
        product_desc: item.product_desc,
        size_l: item.size_l, size_w: item.size_w, size_h: item.size_h,
        quantity: item.quantity, unit_id: item.unit_id,
        board_type_id: item.board_type_id,
        no_of_colors: item.no_of_colors,
        lamination_type_id: item.lamination_type_id,
        unit_price: item.unit_price, subtotal: item.subtotal,
        notes: item.notes, sort_order: item.sort_order,
      }))
    )
  }

  // Mark quotation as converted
  await supabase.from('quotations' as any).update({ status: 'converted' }).eq('id', params.id)

  return NextResponse.json({ data: so })
}
