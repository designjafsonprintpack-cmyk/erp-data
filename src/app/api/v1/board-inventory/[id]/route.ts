import { NextResponse, type NextRequest } from 'next/server'
import { createSupabaseServerClient } from '@/lib/supabase/server'
import { getCompanyId } from '@/lib/utils/getCompanyId'
import { getUserTableId } from '@/lib/utils/getUserTableId'
import { requirePermission } from '@/lib/utils/requirePermission'
import { withErrorHandling } from '@/lib/utils/apiHandler'

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
  const body = await req.json()

  // Stock movement actions
  if (body.action && ['in', 'out', 'adjustment'].includes(body.action)) {
    const { data: current } = await supabase.from('board_inventory' as any)
      .select('current_stock').eq('id', params.id).eq('company_id', companyId).single()
    if (!current) return NextResponse.json({ error: 'Not found' }, { status: 404 })

    const qty = parseFloat(body.quantity || '0')
    const currentStock = (current as any).current_stock
    let newStock: number

    if (body.action === 'in')         newStock = currentStock + qty
    else if (body.action === 'out')   newStock = Math.max(0, currentStock - qty)
    else                              newStock = qty  // adjustment = set to exact value

    const { data, error } = await supabase.from('board_inventory' as any)
      .update({ current_stock: newStock }).eq('id', params.id).eq('company_id', companyId).select().single()
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

    // Lot tracking — a Stock In creates a new lot (traceable to this
    // specific receipt); a Stock Out draws down existing lots FIFO. See
    // migration 055 for why MRN/wastage consumption isn't wired here too.
    if (body.action === 'in') {
      await supabase.from('board_inventory_lots' as any).insert({
        company_id:         companyId,
        board_item_id:      params.id,
        lot_number:         body.lot_number || `LOT-${Date.now()}`,
        vendor_id:          body.vendor_id || null,
        reference_type:     body.reference_type || 'manual',
        reference_id:       body.reference_id || null,
        quantity_received:  qty,
        quantity_remaining: qty,
        unit_cost:          body.unit_cost ? parseFloat(body.unit_cost) : null,
        notes:              body.notes || null,
        created_by:         userTableId,
      })
    } else if (body.action === 'out') {
      await (supabase as any).rpc('consume_board_lots_fifo', {
        p_company_id: companyId, p_board_item_id: params.id, p_quantity: qty,
      })
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
