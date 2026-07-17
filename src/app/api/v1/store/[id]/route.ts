import { NextResponse, type NextRequest } from 'next/server'
import { createSupabaseServerClient } from '@/lib/supabase/server'
import { getCompanyId } from '@/lib/utils/getCompanyId'
import { getUserTableId } from '@/lib/utils/getUserTableId'
import { checkLowStockAndNotify } from '@/lib/utils/checkLowStock'

export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  const supabase = createSupabaseServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const companyId = await getCompanyId(user, supabase)
  const userTableId = await getUserTableId(user, supabase)
  const body = await req.json()

  // Approve action
  if (body.action === 'approve') {
    const { data, error } = await supabase.from('material_requisitions' as any)
      .update({ status: 'approved', approved_by: userTableId }).eq('id', params.id).select().single()
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json({ data })
  }

  // Issue items action — update issued quantities and auto-consume any
  // items linked to a specific board_inventory row.
  if (body.action === 'issue' && body.items) {
    // Need the MRN's job_id for the movement record, and each item's
    // current quantity_issued/board_item_id to compute how much is newly
    // being issued this time (a single MRN can be issued in partial batches).
    const { data: mrnRow } = await supabase.from('material_requisitions' as any)
      .select('job_id').eq('id', params.id).single()
    const jobId = (mrnRow as any)?.job_id ?? null

    const { data: currentItems } = await supabase.from('material_requisition_items' as any)
      .select('id, quantity_issued, board_item_id').eq('requisition_id', params.id)
    const currentById = new Map(((currentItems ?? []) as any[]).map(i => [i.id, i]))

    for (const item of body.items) {
      const newQtyIssued = parseFloat(item.quantity_issued || '0')
      const current = currentById.get(item.id)
      const boardItemId = item.board_item_id || current?.board_item_id || null
      const delta = newQtyIssued - (current?.quantity_issued ?? 0)

      if (boardItemId && delta > 0) {
        const { data: boardItem } = await supabase.from('board_inventory' as any)
          .select('current_stock').eq('id', boardItemId).single()

        const stockBefore = Number((boardItem as any)?.current_stock ?? 0)
        if (stockBefore < delta) {
          return NextResponse.json({
            error: `Cannot issue ${delta} — only ${stockBefore} in stock for the linked inventory item.`,
          }, { status: 400 })
        }

        const stockAfter = stockBefore - delta
        await supabase.from('board_inventory' as any)
          .update({ current_stock: stockAfter }).eq('id', boardItemId)

        await checkLowStockAndNotify(supabase, companyId, boardItemId, stockAfter)

        await supabase.from('board_inventory_movements' as any).insert({
          company_id:     companyId,
          board_item_id:  boardItemId,
          movement_type:  'out',
          quantity:       delta,
          balance_after:  stockAfter,
          reference_type: 'mrn',
          reference_id:   params.id,
          job_id:         jobId,
          moved_by:       userTableId,
        })
      }

      await supabase.from('material_requisition_items' as any)
        .update({ quantity_issued: newQtyIssued, board_item_id: boardItemId })
        .eq('id', item.id)
    }

    // Recalculate MRN status
    const { data: allItems } = await supabase.from('material_requisition_items' as any)
      .select('quantity_required, quantity_issued').eq('requisition_id', params.id)

    const items = (allItems ?? []) as any[]
    const allIssued = items.every(i => i.quantity_issued >= i.quantity_required)
    const anyIssued = items.some(i => i.quantity_issued > 0)
    const newStatus = allIssued ? 'issued' : anyIssued ? 'partially_issued' : 'approved'

    const { data, error } = await supabase.from('material_requisitions' as any)
      .update({ status: newStatus }).eq('id', params.id).select().single()
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json({ data })
  }

  // Generic PATCH
  const { data, error } = await supabase.from('material_requisitions' as any)
    .update(body).eq('id', params.id).select().single()
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ data })
}
