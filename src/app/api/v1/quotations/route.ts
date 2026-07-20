import { NextResponse, type NextRequest } from 'next/server'
import { createSupabaseServerClient } from '@/lib/supabase/server'
import { getCompanyId } from '@/lib/utils/getCompanyId'
import { getUserTableId } from '@/lib/utils/getUserTableId'
import { requirePermission } from '@/lib/utils/requirePermission'
import { withErrorHandling } from '@/lib/utils/apiHandler'

export const GET = withErrorHandling(async function GET(req: NextRequest) {
  const supabase = createSupabaseServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const companyId = await getCompanyId(user, supabase)
  const { searchParams } = new URL(req.url)
  const search = searchParams.get('search') || ''
  const status = searchParams.get('status') || ''
  const page = parseInt(searchParams.get('page') || '1')
  const limit = 25; const offset = (page - 1) * limit

  let q = supabase.from('quotations' as any)
    .select('*, customers(name, customer_code)', { count: 'exact' })
    .eq('company_id', companyId)
    .is('deleted_at', null)
  if (status) q = q.eq('status', status)
  if (search) q = q.ilike('quotation_number', `%${search}%`)

  const { data, error, count } = await q.order('created_at', { ascending: false }).range(offset, offset + limit - 1)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ data: data ?? [], total: count ?? 0, page, limit })
})

export const POST = withErrorHandling(async function POST(req: NextRequest) {
  const supabase = createSupabaseServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const companyId = await getCompanyId(user, supabase)
  const userTableId = await getUserTableId(user, supabase)
  const denied = await requirePermission(userTableId, 'quotations', 'create', supabase)
  if (denied) return denied

  const { items, ...body } = await req.json()

  const { data: seqData } = await (supabase as any).rpc('get_next_sequence_number', {
    p_company_id: companyId, p_document_type: 'QT',
  })

  const { data: qt, error } = await supabase.from('quotations' as any).insert({
    ...body, company_id: companyId, quotation_number: seqData,
  }).select().single()
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  if (items?.length) {
    const lineItems = items.map((item: any, idx: number) => {
      const { cost_lines, ...itemFields } = item
      return {
        ...itemFields, quotation_id: (qt as any).id, company_id: companyId,
        line_no: idx + 1, sort_order: idx + 1,
        subtotal: parseFloat(item.quantity || 0) * parseFloat(item.unit_price || 0),
      }
    })
    const { data: insertedItems, error: itemsError } = await supabase.from('quotation_items' as any).insert(lineItems).select('id')
    if (itemsError) return NextResponse.json({ error: itemsError.message }, { status: 500 })

    // Cost lines are a child of each item — insert them once we have the
    // real quotation_item ids back (they don't exist until the item does).
    const costLineRows = (insertedItems ?? []).flatMap((inserted: any, idx: number) =>
      (items[idx].cost_lines || []).map((line: any, li: number) => ({
        company_id: companyId,
        quotation_item_id: inserted.id,
        cost_item_type_id: line.cost_item_type_id || null,
        name: line.name,
        unit_basis: line.unit_basis,
        rate: line.rate,
        quantity: line.quantity,
        amount: line.amount,
        sort_order: li + 1,
      }))
    )
    if (costLineRows.length) await supabase.from('quotation_item_cost_lines' as any).insert(costLineRows)
  }
  return NextResponse.json({ data: qt })
})
