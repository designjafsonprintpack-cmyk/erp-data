import { NextResponse, type NextRequest } from 'next/server'
import { createSupabaseServerClient } from '@/lib/supabase/server'
import { getCompanyId } from '@/lib/utils/getCompanyId'
import { getUserTableId } from '@/lib/utils/getUserTableId'
import { requirePermission } from '@/lib/utils/requirePermission'
import { withErrorHandling } from '@/lib/utils/apiHandler'
import { parseBody } from '@/lib/utils/validate'
import { updatePurchaseOrderSchema } from '@/lib/schemas/purchaseOrder'

export const GET = withErrorHandling(async function GET(_: NextRequest, { params }: { params: { id: string } }) {
  const supabase = createSupabaseServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const companyId = await getCompanyId(user, supabase)

  const { data, error } = await supabase.from('purchase_orders' as any)
    .select('*, vendors(*), purchase_order_items(*, units(name,symbol))')
    .eq('id', params.id).eq('company_id', companyId).single()
  if (error) return NextResponse.json({ error: 'Not found' }, { status: 404 })
  return NextResponse.json({ data })
})

export const PATCH = withErrorHandling(async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  const supabase = createSupabaseServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const companyId = await getCompanyId(user, supabase)
  const userTableId = await getUserTableId(user, supabase)
  const denied = await requirePermission(userTableId, 'purchase', 'edit', supabase)
  if (denied) return denied

  const parsed = await parseBody(req, updatePurchaseOrderSchema)
  if ('error' in parsed) return parsed.error
  const body = parsed.data

  // Receive goods — update received quantities + auto-update board inventory
  if (body.action === 'receive' && body.items) {
    const { data: poRow } = await supabase.from('purchase_orders' as any)
      .select('vendor_id, po_number').eq('id', params.id).eq('company_id', companyId).single()
    const vendorId = (poRow as any)?.vendor_id ?? null
    const poNumber = (poRow as any)?.po_number ?? params.id

    for (const item of body.items) {
      const qtyReceived = parseFloat(String(item.quantity_received ?? '0'))
      await supabase.from('purchase_order_items' as any)
        .update({ quantity_received: qtyReceived }).eq('id', item.id).eq('company_id', companyId)

      // If linked to board inventory, add stock
      if (item.board_item_id && qtyReceived > 0) {
        const { data: inv } = await supabase.from('board_inventory' as any)
          .select('current_stock').eq('id', item.board_item_id).eq('company_id', companyId).single()
        if (inv) {
          const newStock = (inv as any).current_stock + qtyReceived
          await supabase.from('board_inventory' as any)
            .update({ current_stock: newStock }).eq('id', item.board_item_id).eq('company_id', companyId)
          await supabase.from('board_inventory_movements' as any).insert({
            company_id:    companyId,
            board_item_id: item.board_item_id,
            movement_type: 'in',
            quantity:      qtyReceived,
            balance_after: newStock,
            reference_type: 'purchase_order',
            reference_id:  params.id,
            notes:         `Received via PO`,
            moved_by:      userTableId,
          })
          // Each PO receipt is its own traceable lot — vendor, cost, and
          // receipt date, so a later quality issue can be traced back to
          // which delivery it came from.
          await supabase.from('board_inventory_lots' as any).insert({
            company_id:         companyId,
            board_item_id:      item.board_item_id,
            lot_number:         `${poNumber}-${item.id.slice(0, 8)}`,
            vendor_id:          vendorId,
            reference_type:     'purchase_order',
            reference_id:       params.id,
            quantity_received:  qtyReceived,
            quantity_remaining: qtyReceived,
            unit_cost:          item.unit_price ? parseFloat(String(item.unit_price)) : null,
            created_by:         userTableId,
          })
        }
      }
    }

    // Recalculate PO status
    const { data: allItems } = await supabase.from('purchase_order_items' as any)
      .select('quantity, quantity_received').eq('po_id', params.id).eq('company_id', companyId)
    const items = (allItems ?? []) as any[]
    const allReceived = items.every(i => i.quantity_received >= i.quantity)
    const anyReceived = items.some(i => i.quantity_received > 0)
    const newStatus = allReceived ? 'received' : anyReceived ? 'partially_received' : 'confirmed'

    const { data, error } = await supabase.from('purchase_orders' as any)
      .update({ status: newStatus }).eq('id', params.id).eq('company_id', companyId).select().single()
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json({ data })
  }

  const { data, error } = await supabase.from('purchase_orders' as any)
    .update(body).eq('id', params.id).eq('company_id', companyId).select().single()
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ data })
})

export const DELETE = withErrorHandling(async function DELETE(_: NextRequest, { params }: { params: { id: string } }) {
  const supabase = createSupabaseServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const companyId = await getCompanyId(user, supabase)

  const { error } = await supabase.from('purchase_orders' as any)
    .update({ deleted_at: new Date().toISOString(), is_active: false }).eq('id', params.id).eq('company_id', companyId)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ success: true })
})
