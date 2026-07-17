import { NextResponse, type NextRequest } from 'next/server'
import { createSupabaseServerClient } from '@/lib/supabase/server'
import { getCompanyId } from '@/lib/utils/getCompanyId'
import { getUserTableId } from '@/lib/utils/getUserTableId'

export async function GET(_: NextRequest, { params }: { params: { id: string } }) {
  const supabase = createSupabaseServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const [itemRes, movementsRes] = await Promise.all([
    supabase.from('board_inventory' as any).select('*, board_types(name)').eq('id', params.id).single(),
    supabase.from('board_inventory_movements' as any).select('*').eq('board_item_id', params.id)
      .order('occurred_at', { ascending: false }).limit(50),
  ])

  if (itemRes.error) return NextResponse.json({ error: 'Not found' }, { status: 404 })
  return NextResponse.json({ item: itemRes.data, movements: movementsRes.data ?? [] })
}

export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  const supabase = createSupabaseServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const companyId = await getCompanyId(user, supabase)
  const userTableId = await getUserTableId(user, supabase)
  const body = await req.json()

  // Stock movement actions
  if (body.action && ['in', 'out', 'adjustment'].includes(body.action)) {
    const { data: current } = await supabase.from('board_inventory' as any)
      .select('current_stock').eq('id', params.id).single()
    if (!current) return NextResponse.json({ error: 'Not found' }, { status: 404 })

    const qty = parseFloat(body.quantity || '0')
    const currentStock = (current as any).current_stock
    let newStock: number

    if (body.action === 'in')         newStock = currentStock + qty
    else if (body.action === 'out')   newStock = Math.max(0, currentStock - qty)
    else                              newStock = qty  // adjustment = set to exact value

    const { data, error } = await supabase.from('board_inventory' as any)
      .update({ current_stock: newStock }).eq('id', params.id).select().single()
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })

    await supabase.from('board_inventory_movements' as any).insert({
      company_id:    companyId,
      board_item_id: params.id,
      movement_type: body.action,
      quantity:      body.action === 'adjustment' ? newStock - currentStock : (body.action === 'out' ? -qty : qty),
      balance_after: newStock,
      reference_type: body.reference_type || 'manual',
      reference_id:  body.reference_id || null,
      job_id:        body.job_id || null,
      notes:         body.notes || null,
      moved_by:      userTableId,
    })

    return NextResponse.json({ data })
  }

  // Generic field update
  const { data, error } = await supabase.from('board_inventory' as any)
    .update(body).eq('id', params.id).select().single()
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ data })
}

export async function DELETE(_: NextRequest, { params }: { params: { id: string } }) {
  const supabase = createSupabaseServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { error } = await supabase.from('board_inventory' as any)
    .update({ deleted_at: new Date().toISOString(), is_active: false }).eq('id', params.id)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ success: true })
}
