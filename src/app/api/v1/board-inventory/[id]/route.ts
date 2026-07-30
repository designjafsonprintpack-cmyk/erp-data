import { NextResponse, type NextRequest } from 'next/server'
import { createSupabaseServerClient } from '@/lib/supabase/server'
import { getCompanyId } from '@/lib/utils/getCompanyId'
import { getUserTableId } from '@/lib/utils/getUserTableId'
import { requirePermission } from '@/lib/utils/requirePermission'
import { withErrorHandling } from '@/lib/utils/apiHandler'
import { parseBody } from '@/lib/utils/validate'
import { boardInventoryUpdateSchema } from '@/lib/schemas/inventory'

export const GET = withErrorHandling(async function GET(_: NextRequest, { params }: { params: { id: string } }) {
  const supabase = createSupabaseServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const companyId = await getCompanyId(user, supabase)

  const [itemRes, movementsRes] = await Promise.all([
    supabase.from('board_inventory' as any).select('*, board_types(name)').eq('id', params.id).eq('company_id', companyId).single(),
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

    const { data, error } = await supabase.from('board_inventory' as any)
      .update({ current_stock: newStock }).eq('id', params.id).eq('company_id', companyId).select().single()
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
        job_id:             isReturn ? (body.job_id || null) : null,
        quantity_received:  qty,
        quantity_remaining: qty,
        unit_cost:          body.unit_cost
          ? parseFloat(String(body.unit_cost))
          : (isReturn ? Number((current as any).unit_cost ?? 0) || null : null),
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

  // Generic field update
  const { data, error } = await supabase.from('board_inventory' as any)
    .update(body).eq('id', params.id).eq('company_id', companyId).select().single()
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
