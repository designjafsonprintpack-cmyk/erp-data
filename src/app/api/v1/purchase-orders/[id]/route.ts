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
    // jobs is embedded unhinted on purpose: 113 added the FIRST and only
    // relationship between purchase_order_items and jobs, so PostgREST has
    // nothing to be ambiguous about. If a second one is ever added, this needs
    // an explicit hint — that is exactly what broke every artwork embed in 104.
    .select('*, vendors(*), purchase_order_items(*, units(name,symbol), jobs(job_number,job_title))')
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

    // The lines as the DATABASE has them — which board item, and which job.
    //
    // board_item_id used to be taken from the request body, and the receive
    // modal never sent it, so `if (item.board_item_id …)` was ALWAYS false:
    // receiving a PO never once added board to stock, never wrote an 'in'
    // movement and never created a lot, while the modal told the user "Board
    // inventory will be updated automatically". Both facts now come from the
    // PO itself, which is where they were recorded.
    const { data: lineRows, error: lineErr } = await supabase.from('purchase_order_items' as any)
      .select('id, job_id, board_item_id')
      .eq('po_id', params.id)
      .eq('company_id', companyId)
    if (lineErr) return NextResponse.json({ error: lineErr.message }, { status: 500 })
    const lineById = new Map(((lineRows ?? []) as any[]).map(r => [r.id, r]))

    // A failed ledger/lot insert used to be invisible: current_stock moved and
    // the movement row silently didn't arrive, which would make every stock
    // report quietly wrong. Collected and returned as warnings rather than
    // thrown, because the stock update has already happened by then.
    const warnings: string[] = []

    for (const item of body.items) {
      // PACKETS — the PO document's unit, and what the store counts. A
      // fractional value is real: 44.68 = 44 packets + 68 loose sheets.
      const packetsReceived = parseFloat(String(item.quantity_received ?? '0'))
      await supabase.from('purchase_order_items' as any)
        .update({ quantity_received: packetsReceived }).eq('id', item.id).eq('company_id', companyId)

      const line = lineById.get(item.id)
      const boardItemId = line?.board_item_id ?? null

      // If the line is linked to a board stock item, credit stock — in SHEETS.
      if (boardItemId && packetsReceived > 0) {
        const { data: inv, error: invErr } = await supabase.from('board_inventory' as any)
          .select('current_stock, sheets_per_packet').eq('id', boardItemId).eq('company_id', companyId).single()
        if (invErr) {
          console.error('[PO receive] board item lookup failed', invErr)
          warnings.push(`Could not read stock for a line on ${poNumber}: ${invErr.message}`)
        }
        if (inv) {
          // The unit boundary. Stock, the ledger and lots are all in sheets
          // because the job side is (jobs.sheet_qty, the auto-MRN, every
          // movement). Adding packets here would be wrong by 100×.
          const perPacket = Number((inv as any).sheets_per_packet ?? 100)
          const sheetsReceived = packetsReceived * perPacket
          const newStock = Number((inv as any).current_stock) + sheetsReceived
          await supabase.from('board_inventory' as any)
            .update({ current_stock: newStock }).eq('id', boardItemId).eq('company_id', companyId)
          // job_id is what finally answers "kon sa board kis job ke liye aaya".
          // NULL is a real answer — board bought for general stock, not a job.
          const lineJobId = line?.job_id ?? null

          const { error: movErr } = await supabase.from('board_inventory_movements' as any).insert({
            company_id:    companyId,
            board_item_id: boardItemId,
            movement_type: 'in',
            quantity:      sheetsReceived,
            balance_after: newStock,
            reference_type: 'purchase_order',
            reference_id:  params.id,
            job_id:        lineJobId,
            notes:         `Received via ${poNumber} — ${packetsReceived} packet(s)`,
            moved_by:      userTableId,
          })
          if (movErr) {
            console.error('[PO receive] stock ledger insert failed', movErr)
            warnings.push(`Stock moved but the ledger entry for ${poNumber} failed: ${movErr.message}`)
          }

          // Each PO receipt is its own traceable lot — vendor, cost, and
          // receipt date, so a later quality issue can be traced back to
          // which delivery it came from, and now to the job it was bought for.
          const { error: lotErr } = await supabase.from('board_inventory_lots' as any).insert({
            company_id:         companyId,
            board_item_id:      boardItemId,
            lot_number:         `${poNumber}-${item.id.slice(0, 8)}`,
            vendor_id:          vendorId,
            reference_type:     'purchase_order',
            reference_id:       params.id,
            job_id:             lineJobId,
            // Sheets, like every other stock number. FIFO consumption reads
            // these against movement quantities, so the units must match.
            quantity_received:  sheetsReceived,
            quantity_remaining: sheetsReceived,
            unit_cost:          item.unit_price ? parseFloat(String(item.unit_price)) : null,
            created_by:         userTableId,
          })
          if (lotErr) {
            console.error('[PO receive] lot insert failed', lotErr)
            warnings.push(`Lot record for ${poNumber} failed: ${lotErr.message}`)
          }
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
    return NextResponse.json(warnings.length ? { data, warnings } : { data })
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
