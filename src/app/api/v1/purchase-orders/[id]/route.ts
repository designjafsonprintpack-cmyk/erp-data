import { NextResponse, type NextRequest } from 'next/server'
import { createSupabaseServerClient } from '@/lib/supabase/server'
import { getCompanyId } from '@/lib/utils/getCompanyId'
import { getUserTableId } from '@/lib/utils/getUserTableId'
import { requirePermission } from '@/lib/utils/requirePermission'
import { withErrorHandling } from '@/lib/utils/apiHandler'
import { parseBody } from '@/lib/utils/validate'
import { updatePurchaseOrderSchema } from '@/lib/schemas/purchaseOrder'
import { perSheetFromKgRate, perSheetFromPacket, weightedUnitCost } from '@/lib/utils/boardUnitCost'

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
    // rate_basis and unit_price come from the PO row too, not the request:
    // what the vendor charged is a recorded fact, and letting a receive call
    // restate the price would make the cost forgeable (118).
    const { data: lineRows, error: lineErr } = await supabase.from('purchase_order_items' as any)
      .select('id, job_id, board_item_id, rate_basis, unit_price, quantity_received, demand_id')
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
      const line = lineById.get(item.id)
      const boardItemId = line?.board_item_id ?? null

      // JAMA, na ke barabar. Modal baqi maanda maqdaar bharta hai ("Ordered 30,
      // previously received 10" → 20), aur stock ka credit neeche pehle se isay
      // DELTA hi samajhta hai. Ye line usay ABSOLUTE likh rahi thi, is liye 30
      // ki PO do qiston mein aane par quantity_received 30 ke bajaye 20 par ruk
      // jati — stock durust, PO hamesha ke liye "Partially Received", aur
      // three-way match uska peecha karta rehta. Dono ab delta hain.
      await supabase.from('purchase_order_items' as any)
        .update({ quantity_received: Number(line?.quantity_received ?? 0) + packetsReceived })
        .eq('id', item.id).eq('company_id', companyId)

      // If the line is linked to a board stock item, credit stock — in SHEETS.
      if (boardItemId && packetsReceived > 0) {
        const { data: inv, error: invErr } = await supabase.from('board_inventory' as any)
          .select('current_stock, sheets_per_packet, unit_cost, sheet_width_in, sheet_height_in, gsm')
          .eq('id', boardItemId).eq('company_id', companyId).single()
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

          // The PO line's rate has to cross the same boundary the quantity just
          // did, because unit_cost — on the item and on the lot — is per SHEET.
          // It didn't: the raw rate was written straight onto a sheet quantity,
          // i.e. 100× too high (500× on a paper ream). Nothing has spent that
          // number yet (all lot costs are NULL on live), so there was no history
          // to correct — but it was a live trap.
          //
          // Board is bought BY THE KILO, so 'kg' is the normal basis and the
          // conversion goes through the estimator's own weight formula — that
          // is what makes quoted cost and actual cost comparable at all. The
          // basis is read off the PO row (118), never from the request body.
          const lineRate = line?.unit_price != null ? parseFloat(String(line.unit_price)) : null
          const receiptPerSheet = line?.rate_basis === 'kg'
            ? perSheetFromKgRate(lineRate, (inv as any).sheet_width_in, (inv as any).sheet_height_in, (inv as any).gsm)
            : perSheetFromPacket(lineRate, perPacket)
          // A per-kg line on an item with no size or GSM has no derivable cost.
          // Stock is still credited — the board physically arrived — but the
          // rate is surfaced as a warning rather than stored as a silent 0.
          if (line?.rate_basis === 'kg' && lineRate != null && lineRate > 0 && receiptPerSheet == null) {
            warnings.push(`Stock was credited, but the per-kg rate on ${poNumber} could not be costed: the stock item has no sheet size or GSM. Set them in Board Inventory, then correct the cost with Edit.`)
          }
          // Re-average the item's cost so job costing stops booking board at
          // zero. See boardUnitCost.ts for why 0 counts as unknown, not free.
          const newUnitCost = weightedUnitCost({
            stockBefore: Number((inv as any).current_stock), oldUnitCost: (inv as any).unit_cost,
            sheetsIn: sheetsReceived, receiptPerSheet,
          })

          const stockUpdate: Record<string, unknown> = { current_stock: newStock }
          if (newUnitCost != null) stockUpdate.unit_cost = newUnitCost
          await supabase.from('board_inventory' as any)
            .update(stockUpdate).eq('id', boardItemId).eq('company_id', companyId)
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
            // Per sheet, to match quantity_received on the same row.
            unit_cost:          receiptPerSheet,
            created_by:         userTableId,
          })
          if (lotErr) {
            console.error('[PO receive] lot insert failed', lotErr)
            warnings.push(`Lot record for ${poNumber} failed: ${lotErr.message}`)
          }

          // Maal aa gaya: demand ka 'ordered' utna kam, 'received' utna zyada,
          // aur wapas resolve — jo sheets abhi abhi current_stock mein aayi hain
          // wo isi job ke naam reserve ho jati hain, warna doosri koi demand
          // unhein utha le jati. Isi liye 'received' koi alag status nahi:
          // maal aana matlab demand 'ready'.
          if (line?.demand_id) {
            const { error: demErr } = await (supabase as any).rpc('apply_po_to_demand', {
              p_company_id:     companyId,
              p_demand_id:      line.demand_id,
              p_ordered_delta:  0,
              p_received_delta: sheetsReceived,
              p_board_item_id:  boardItemId,
            })
            if (demErr) {
              console.error('[PO receive] apply_po_to_demand failed', demErr)
              warnings.push(`Stock received, but the board demand for ${poNumber} was not updated: ${demErr.message}`)
            }
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

  // PO cancel hui to jo board is par "on order" tha wo demand par wapas
  // "khareedna baqi" ban jana chahiye — warna demand hamesha ke liye 'ordered'
  // par atki rehti hai aur To Buy list mein kabhi laut kar nahi aati, yani wo
  // board kabhi khareeda hi nahi jata aur kisi ko pata bhi nahi chalta.
  if (body.status === 'cancelled') await releaseDemandsOfPo(supabase, companyId, params.id)

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

  // Cancel ki tarah — mita hua PO bhi demand ko "on order" par nahi chhor sakta.
  await releaseDemandsOfPo(supabase, companyId, params.id)

  return NextResponse.json({ success: true })
})

/**
 * Is PO ki har line ka "on order" hissa uski demand se wapas le lo.
 *
 * Jo maal PEHLE HI AA CHUKA hai wo chhera nahi jata: `sheets_ordered` receive ke
 * waqt hi ghata diya jata hai aur wo sheets ab `sheets_from_stock` mein reserve
 * hain. Yani sirf wo hissa wapas jata hai jo abhi raaste mein tha.
 */
async function releaseDemandsOfPo(supabase: any, companyId: string, poId: string) {
  const { data: lines } = await supabase.from('purchase_order_items' as any)
    .select('demand_id, quantity, quantity_received, board_inventory(sheets_per_packet)')
    .eq('po_id', poId).eq('company_id', companyId)

  for (const l of ((lines ?? []) as any[])) {
    if (!l.demand_id) continue
    const perPacket = Number(l.board_inventory?.sheets_per_packet ?? 100) || 100
    const outstanding = (Number(l.quantity ?? 0) - Number(l.quantity_received ?? 0)) * perPacket
    if (!(outstanding > 0)) continue
    const { error } = await supabase.rpc('apply_po_to_demand', {
      p_company_id:     companyId,
      p_demand_id:      l.demand_id,
      p_ordered_delta:  -outstanding,
      p_received_delta: 0,
      p_board_item_id:  null,
    })
    if (error) console.error('[PO cancel] apply_po_to_demand failed', error)
  }
}
