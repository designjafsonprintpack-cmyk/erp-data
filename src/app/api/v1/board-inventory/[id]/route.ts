import { NextResponse, type NextRequest } from 'next/server'
import { createSupabaseServerClient } from '@/lib/supabase/server'
import { getCompanyId } from '@/lib/utils/getCompanyId'
import { getUserTableId } from '@/lib/utils/getUserTableId'
import { requirePermission } from '@/lib/utils/requirePermission'
import { withErrorHandling } from '@/lib/utils/apiHandler'
import { parseBody } from '@/lib/utils/validate'
import { boardInventoryUpdateSchema } from '@/lib/schemas/inventory'
import { weightedUnitCost } from '@/lib/utils/boardUnitCost'

export const GET = withErrorHandling(async function GET(_: NextRequest, { params }: { params: { id: string } }) {
  const supabase = createSupabaseServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const companyId = await getCompanyId(user, supabase)

  const [itemRes, movementsRes] = await Promise.all([
    supabase.from('board_inventory' as any).select('*, board_types(name), paper_types(name)').eq('id', params.id).eq('company_id', companyId).single(),
    supabase.from('board_inventory_movements' as any).select('*').eq('board_item_id', params.id).eq('company_id', companyId)
      .order('occurred_at', { ascending: false }).limit(50),
  ])

  if (itemRes.error) return NextResponse.json({ error: 'Not found' }, { status: 404 })
  return NextResponse.json({ item: itemRes.data, movements: movementsRes.data ?? [] })
})

export const PATCH = withErrorHandling(async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  const supabase = createSupabaseServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const companyId = await getCompanyId(user, supabase)
  const userTableId = await getUserTableId(user, supabase)
  const denied = await requirePermission(userTableId, 'store', 'edit', supabase)
  if (denied) return denied
  const parsed = await parseBody(req, boardInventoryUpdateSchema)
  if ('error' in parsed) return parsed.error
  const body = parsed.data

  // Stock movement actions. 'return' is board coming BACK from the floor —
  // physically an 'in', reported in its own column by get_board_stock_report
  // (114) via reference_type = 'production_return'.
  if (body.action && ['in', 'out', 'adjustment', 'return'].includes(body.action)) {
    const { data: current } = await supabase.from('board_inventory' as any)
      .select('current_stock, unit_cost').eq('id', params.id).eq('company_id', companyId).single()
    if (!current) return NextResponse.json({ error: 'Not found' }, { status: 404 })

    const qty = parseFloat(String(body.quantity ?? '0'))
    const currentStock = (current as any).current_stock
    const isReturn = body.action === 'return'
    // A return is an 'in' as far as the ledger is concerned; only the
    // reference_type tells them apart.
    const movementType = isReturn ? 'in' : body.action
    let newStock: number

    if (body.action === 'in' || isReturn) newStock = currentStock + qty
    else if (body.action === 'out')       newStock = Math.max(0, currentStock - qty)
    else                                  newStock = qty  // adjustment = set to exact value

    // A priced purchase re-averages the item's per-sheet cost. `unit_cost`
    // is PER SHEET (see boardUnitCost.ts) and the client converts the packet
    // price it asked for before sending, so nothing is converted twice here.
    //
    // Only a real purchase moves the average: a RETURN is stock already
    // costed at this item's own rate coming back, and an adjustment is a
    // recount, not a purchase. Without this the item stayed at unit_cost 0
    // forever and every job booked its board at zero.
    const receiptPerSheet = body.action === 'in'
      ? (body.unit_cost != null && String(body.unit_cost) !== '' ? parseFloat(String(body.unit_cost)) : null)
      : null
    const newUnitCost = body.action === 'in'
      ? weightedUnitCost({
          stockBefore: Number(currentStock), oldUnitCost: (current as any).unit_cost,
          sheetsIn: qty, receiptPerSheet,
        })
      : null

    const stockUpdate: Record<string, unknown> = { current_stock: newStock }
    if (newUnitCost != null) stockUpdate.unit_cost = newUnitCost

    const { data, error } = await supabase.from('board_inventory' as any)
      .update(stockUpdate).eq('id', params.id).eq('company_id', companyId).select().single()
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })

    const refType = isReturn ? 'production_return' : (body.reference_type || 'manual')

    // quantity is a POSITIVE MAGNITUDE — the direction is in movement_type
    // (114). This route used to write -qty for 'out' while store/[id] and
    // qc/reprint wrote +qty for the same thing, so any report that summed
    // quantity would have been wrong once both paths were used. 'adjustment'
    // keeps its signed delta, which is what an adjustment means.
    const { error: movErr } = await supabase.from('board_inventory_movements' as any).insert({
      company_id:    companyId,
      board_item_id: params.id,
      movement_type: movementType,
      quantity:      body.action === 'adjustment' ? newStock - currentStock : qty,
      balance_after: newStock,
      reference_type: refType,
      reference_id:  body.reference_id || null,
      job_id:        body.job_id || null,
      notes:         body.notes || null,
      moved_by:      userTableId,
    })
    // The stock number has already moved by this point, so this cannot fail the
    // request — but a lost ledger row makes every later report wrong, so it must
    // not be invisible either.
    if (movErr) console.error('[Board stock] movement insert failed', movErr)

    // Lot tracking — a Stock In creates a new lot (traceable to this
    // specific receipt); a Stock Out draws down existing lots FIFO. See
    // migration 055 for why MRN/wastage consumption isn't wired here too.
    if (body.action === 'in' || isReturn) {
      // A return gets a lot too. It is not a purchase, but issuing drew the
      // lots down via FIFO, so without one sum(quantity_remaining) would drift
      // permanently below current_stock. Its reference_type marks it as a
      // return, and it carries the item's own unit_cost rather than a new price.
      const { error: lotErr } = await supabase.from('board_inventory_lots' as any).insert({
        company_id:         companyId,
        board_item_id:      params.id,
        lot_number:         body.lot_number || `${isReturn ? 'RET' : 'LOT'}-${Date.now()}`,
        vendor_id:          body.vendor_id || null,
        reference_type:     refType,
        reference_id:       body.reference_id || null,
        // Which job this board came in FOR (a plain Stock In) or came back
        // OFF (a return). Both are the same question from opposite ends, and
        // both belong on the lot — the PO path has written it since 113, but a
        // manual Stock In used to force it null and silently lose the link.
        job_id:             body.job_id || null,
        quantity_received:  qty,
        quantity_remaining: qty,
        // Per SHEET, matching quantity_received — a per-packet figure here
        // against a sheet quantity is the 100× error 113 was written to stop.
        // A purchase carries its own rate; a return carries the item's.
        unit_cost:          isReturn
          ? (Number((current as any).unit_cost ?? 0) || null)
          : receiptPerSheet,
        notes:              body.notes || null,
        created_by:         userTableId,
      })
      if (lotErr) console.error('[Board stock] lot insert failed', lotErr)
    } else if (body.action === 'out') {
      const { error: fifoErr } = await (supabase as any).rpc('consume_board_lots_fifo', {
        p_company_id: companyId, p_board_item_id: params.id, p_quantity: qty,
      })
      if (fifoErr) console.error('[Board stock] consume_board_lots_fifo failed', fifoErr)
    }

    return NextResponse.json({ data })
  }

  // Generic field update. board_type_id and paper_type_id are mutually
  // exclusive (115), and `.update()` only touches the keys it is handed — so
  // switching an item from board to paper has to clear the old one explicitly.
  // Without this the row would claim to be both and the CHECK would 500 on
  // save, which reads to the user as "the type cannot be changed".
  const patch: Record<string, unknown> = { ...body }
  if ('board_type_id' in body || 'paper_type_id' in body) {
    patch.board_type_id = body.board_type_id || null
    patch.paper_type_id = body.board_type_id ? null : (body.paper_type_id || null)
  }

  const { data, error } = await supabase.from('board_inventory' as any)
    .update(patch).eq('id', params.id).eq('company_id', companyId).select().single()
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ data })
})

export const DELETE = withErrorHandling(async function DELETE(_: NextRequest, { params }: { params: { id: string } }) {
  const supabase = createSupabaseServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const companyId = await getCompanyId(user, supabase)
  const userTableId = await getUserTableId(user, supabase)
  const denied = await requirePermission(userTableId, 'store', 'delete', supabase)
  if (denied) return denied

  const { error } = await supabase.from('board_inventory' as any)
    .update({ deleted_at: new Date().toISOString(), is_active: false }).eq('id', params.id).eq('company_id', companyId)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ success: true })
})
