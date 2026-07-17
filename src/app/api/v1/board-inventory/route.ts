import { NextResponse, type NextRequest } from 'next/server'
import { createSupabaseServerClient } from '@/lib/supabase/server'
import { getCompanyId } from '@/lib/utils/getCompanyId'
import { getUserTableId } from '@/lib/utils/getUserTableId'

export async function GET(req: NextRequest) {
  const supabase = createSupabaseServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { searchParams } = new URL(req.url)
  const search   = searchParams.get('search') || ''
  const lowStock = searchParams.get('low_stock') === 'true'

  let q = supabase.from('board_inventory' as any)
    .select('*, board_types(name)', { count: 'exact' })
    .is('deleted_at', null).eq('is_active', true)

  if (search) q = q.ilike('description', `%${search}%`)
  if (lowStock) q = q.lte('current_stock', supabase.rpc as any)  // simplified — client filters

  const { data, error, count } = await q.order('description')
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  const filtered = lowStock
    ? (data ?? []).filter((i: any) => i.current_stock <= i.reorder_level)
    : (data ?? [])

  return NextResponse.json({ data: filtered, total: count ?? 0 })
}

export async function POST(req: NextRequest) {
  const supabase = createSupabaseServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const companyId = await getCompanyId(user, supabase)
  const userTableId = await getUserTableId(user, supabase)
  const body = await req.json()

  const { data, error } = await supabase.from('board_inventory' as any).insert({
    company_id:    companyId,
    board_type_id: body.board_type_id || null,
    description:   body.description,
    size_l:        body.size_l ? parseFloat(body.size_l) : null,
    size_w:        body.size_w ? parseFloat(body.size_w) : null,
    gsm:           body.gsm ? parseFloat(body.gsm) : null,
    current_stock: parseFloat(body.current_stock || '0'),
    reserved_stock: 0,
    reorder_level: parseFloat(body.reorder_level || '0'),
    unit_id:       body.unit_id || null,
    unit_cost:     body.unit_cost ? parseFloat(body.unit_cost) : 0,
    location:      body.location || null,
  }).select().single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  // Record initial movement if stock > 0
  if (parseFloat(body.current_stock || '0') > 0) {
    await supabase.from('board_inventory_movements' as any).insert({
      company_id:    companyId,
      board_item_id: (data as any).id,
      movement_type: 'in',
      quantity:      parseFloat(body.current_stock),
      balance_after: parseFloat(body.current_stock),
      reference_type: 'manual',
      notes:         'Opening stock',
      moved_by:      userTableId,
    })
  }

  return NextResponse.json({ data })
}
