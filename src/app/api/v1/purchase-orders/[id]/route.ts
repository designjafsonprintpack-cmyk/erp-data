import { NextResponse, type NextRequest } from 'next/server'
import { createSupabaseServerClient } from '@/lib/supabase/server'
import { getCompanyId } from '@/lib/utils/getCompanyId'

export async function GET(_: NextRequest, { params }: { params: { id: string } }) {
  const supabase = createSupabaseServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { data, error } = await supabase.from('purchase_orders' as any)
    .select('*, vendors(*), purchase_order_items(*, units(name,symbol))')
    .eq('id', params.id).single()
  if (error) return NextResponse.json({ error: 'Not found' }, { status: 404 })
  return NextResponse.json({ data })
}

export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  const supabase = createSupabaseServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const companyId = await getCompanyId(user, supabase)
  const body = await req.json()

  // Receive goods — update received quantities + auto-update board inventory
  if (body.action === 'receive' && body.items) {
    for (const item of body.items) {
      const qtyReceived = parseFloat(item.quantity_received || '0')
      await supabase.from('purchase_order_items' as any)
        .update({ quantity_received: qtyReceived }).eq('id', item.id)

      // If linked to board inventory, add stock
      if (item.board_item_id && qtyReceived > 0) {
        const { data: inv } = await supabase.from('board_inventory' as any)
          .select('current_stock').eq('id', item.board_item_id).single()
        if (inv) {
          const newStock = (inv as any).current_stock + qtyReceived
          await supabase.from('board_inventory' as any)
            .update({ current_stock: newStock }).eq('id', item.board_item_id)
          await supabase.from('board_inventory_movements' as any).insert({
            company_id:    companyId,
            board_item_id: item.board_item_id,
            movement_type: 'in',
            quantity:      qtyReceived,
            balance_after: newStock,
            reference_type: 'purchase_order',
            reference_id:  params.id,
            notes:         `Received via PO`,
            moved_by:      user.id,
          })
        }
      }
    }

    // Recalculate PO status
    const { data: allItems } = await supabase.from('purchase_order_items' as any)
      .select('quantity, quantity_received').eq('po_id', params.id)
    const items = (allItems ?? []) as any[]
    const allReceived = items.every(i => i.quantity_received >= i.quantity)
    const anyReceived = items.some(i => i.quantity_received > 0)
    const newStatus = allReceived ? 'received' : anyReceived ? 'partially_received' : 'confirmed'

    const { data, error } = await supabase.from('purchase_orders' as any)
      .update({ status: newStatus }).eq('id', params.id).select().single()
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json({ data })
  }

  const { data, error } = await supabase.from('purchase_orders' as any)
    .update(body).eq('id', params.id).select().single()
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ data })
}

export async function DELETE(_: NextRequest, { params }: { params: { id: string } }) {
  const supabase = createSupabaseServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { error } = await supabase.from('purchase_orders' as any)
    .update({ deleted_at: new Date().toISOString(), is_active: false }).eq('id', params.id)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ success: true })
}
