import { NextResponse, type NextRequest } from 'next/server'
import { createSupabaseServerClient } from '@/lib/supabase/server'
import { getCompanyId } from '@/lib/utils/getCompanyId'
import { getUserTableId } from '@/lib/utils/getUserTableId'
import { requirePermission } from '@/lib/utils/requirePermission'
import { escapeFilterValue } from '@/lib/utils/escapeFilterValue'
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

  let q = supabase.from('sales_orders' as any)
    .select('*, customers(name, customer_code)', { count: 'exact' })
    .eq('company_id', companyId)
    .is('deleted_at', null)
  if (status) q = q.eq('status', status)
  if (search) q = q.or(`so_number.ilike."%${escapeFilterValue(search)}%"`)

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
  const denied = await requirePermission(userTableId, 'sales_orders', 'create', supabase)
  if (denied) return denied

  const { items, ...body } = await req.json()

  const { data: soNumber } = await (supabase as any).rpc('get_next_sequence_number', {
    p_company_id: companyId, p_document_type: 'SO',
  })

  const { data: so, error } = await supabase.from('sales_orders' as any).insert({
    ...body, company_id: companyId, so_number: soNumber,
  }).select().single()
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  if (items?.length) {
    await supabase.from('sales_order_items' as any).insert(
      items.map((item: any, idx: number) => ({
        ...item, sales_order_id: (so as any).id, company_id: companyId,
        line_no: idx + 1, sort_order: idx + 1,
        subtotal: parseFloat(item.quantity || 0) * parseFloat(item.unit_price || 0),
      }))
    )
  }
  return NextResponse.json({ data: so })
})
