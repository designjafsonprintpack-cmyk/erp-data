// Board is bought by the kilo — the same weight formula the estimator uses.
import { sheetWeightKg } from '@/lib/costing/sheetWeight'

/**
 * Ek purchase order banane ka WAHID raasta.
 *
 * Ye pehle `POST /api/v1/purchase-orders` ke andar hi likha tha. Ab Demands se
 * "PO bana do" wala raasta bhi yahi chalata hai, is liye ise bahar nikala gaya:
 * do jagah copy hoti to ek jagah ka rate-basis, supplier ledger, ya demand link
 * doosri se chup chaap alag ho jata — aur PO ke paise ka farq wo cheez hai jo
 * mahine baad bill milne par pakri jati.
 *
 * Kuch bhi throw nahi karti: khata `error` mein wapas aata hai taake har caller
 * apne andaz mein jawab de sake.
 */

export interface PoLineInput {
  description: string
  specification?: string | null
  /** Hamesha PACKETS — jo asal mein pohanchta hai, rate chahe kisi bhi bunyaad par ho. */
  quantity?: string | number
  unit_price?: string | number
  rate_basis?: 'kg' | 'packet' | 'unit'
  unit_id?: string | null
  board_item_id?: string | null
  job_id?: string | null
  demand_id?: string | null
  notes?: string | null
}

export interface PoHeaderInput {
  vendor_id: string
  order_date?: string
  expected_date?: string | null
  notes?: string | null
  terms?: string | null
  tax_rate?: string | number
}

export interface CreatePoResult {
  po?: any
  /** Insaan ko dikhane wala paighaam. */
  error?: string
  status?: number
}

export async function createPurchaseOrder(
  supabase: any,
  companyId: string,
  userTableId: string | null,
  header: PoHeaderInput,
  items: PoLineInput[] | undefined,
): Promise<CreatePoResult> {
  const { data: poNumber } = await supabase.rpc('get_next_sequence_number', {
    p_company_id: companyId, p_document_type: 'PO',
  })

  // A per-kg line is priced on WEIGHT, and weight comes from the linked stock
  // item's sheet size and GSM — so those have to be read from the database.
  // Pricing stays server-side: the client shows the same figure, but what gets
  // stored is never taken from the request.
  // Har linked stock item, sirf kg wale nahi — `sheets_per_packet` demand ke
  // hisab ke liye bhi chahiye: PO ki quantity PACKETS mein hai aur demand
  // SHEETS mein, aur do ke darmiyan yahi column hai.
  const boardIds = Array.from(new Set(((items || []) as any[])
    .filter(i => i.board_item_id)
    .map(i => i.board_item_id as string)))
  const boardById = new Map<string, any>()
  if (boardIds.length) {
    const { data: boards, error: boardErr } = await supabase.from('board_inventory' as any)
      .select('id, description, sheet_width_in, sheet_height_in, gsm, sheets_per_packet')
      .eq('company_id', companyId).in('id', boardIds)
    if (boardErr) return { error: boardErr.message, status: 500 }
    for (const b of (boards ?? []) as any[]) boardById.set(b.id, b)
  }

  // Compute totals from items
  const lineItems = (items || []).map((item: any, idx: number) => {
    const qtyPackets = parseFloat(String(item.quantity ?? '0'))
    const rate = parseFloat(String(item.unit_price ?? '0'))
    let subtotal: number
    if (item.rate_basis === 'kg') {
      const b = item.board_item_id ? boardById.get(item.board_item_id) : null
      // Same formula the estimator costs board with (118), so a PO total and a
      // quotation's board cost are comparable on the same board.
      const kgPerSheet = b ? sheetWeightKg(Number(b.sheet_width_in ?? 0), Number(b.sheet_height_in ?? 0), Number(b.gsm ?? 0)) : 0
      subtotal = kgPerSheet * qtyPackets * Number(b?.sheets_per_packet ?? 100) * rate
    } else {
      subtotal = qtyPackets * rate
    }
    return { ...item, line_no: idx + 1, sort_order: idx + 1, subtotal }
  })

  // A per-kg line whose board can't be weighed would silently total zero, and
  // a purchase order that understates what is owed is worse than a refusal.
  const unweighable = lineItems.find((l: any) =>
    l.rate_basis === 'kg' && parseFloat(String(l.unit_price ?? '0')) > 0 && l.subtotal <= 0)
  if (unweighable) {
    return {
      error: `"${unweighable.description || 'A line'}" is priced per kg, but its weight cannot be worked out — link it to a board stock item that has a sheet size and a GSM, or price the line per packet.`,
      status: 400,
    }
  }

  const subtotal = lineItems.reduce((s: number, i: any) => s + i.subtotal, 0)
  const taxRate  = parseFloat(String(header.tax_rate ?? '0')) / 100
  const taxAmt   = subtotal * taxRate

  const { data: po, error } = await supabase.from('purchase_orders' as any).insert({
    company_id:    companyId,
    po_number:     poNumber,
    vendor_id:     header.vendor_id,
    order_date:    header.order_date || new Date().toISOString().slice(0, 10),
    expected_date: header.expected_date || null,
    notes:         header.notes || null,
    terms:         header.terms || null,
    subtotal,
    tax_amount:    taxAmt,
    total_amount:  subtotal + taxAmt,
    status:        'draft',
  }).select().single()

  if (error) return { error: error.message, status: 500 }
  const poRow = po as any

  // Post the corresponding credit to the supplier ledger (PO increases AP).
  //
  // NOT `.catch()`. A Supabase query/rpc builder only `implements PromiseLike` —
  // it has `then()` and NOTHING else, so `.rpc(…).catch(…)` throws
  // "catch is not a function" SYNCHRONOUSLY, before the request is even sent,
  // and withErrorHandling turns that into a 500. Creating a purchase order
  // therefore failed 100% of the time, which is why purchase_orders sat at 0
  // rows — not because nobody tried. Found by walking the real route.
  // Errors are reported the way the builder actually reports them: in `error`.
  const { error: ledgerErr } = await supabase.rpc('record_supplier_ledger_entry', {
    p_company_id: companyId,
    p_vendor_id: header.vendor_id,
    p_entry_type: 'purchase_order',
    p_description: `PO ${poRow.po_number}`,
    p_debit: 0,
    p_credit: poRow.total_amount,
    p_reference_type: 'purchase_order',
    p_reference_id: poRow.id,
    p_entry_date: poRow.order_date,
    p_created_by: userTableId,
  })
  // Still non-blocking — a PO must not fail because the ledger hiccuped — but
  // no longer silent, so a real failure is findable (108's precedent).
  if (ledgerErr) console.error('[PO create] supplier ledger entry failed', ledgerErr)

  if (lineItems.length) {
    // The error IS checked now. It was not, so when the zod schema silently
    // stripped `description` (a NOT NULL column) this insert failed and the
    // route still returned 200 with a header-only PO. A purchase order with no
    // lines is not a success.
    const { error: itemsErr } = await supabase.from('purchase_order_items' as any).insert(
      lineItems.map((item: any) => ({
        company_id:  companyId,
        po_id:       poRow.id,
        line_no:     item.line_no,
        description: item.description,
        specification: item.specification || null,
        quantity:    parseFloat(item.quantity || '1'),
        unit_id:     item.unit_id || null,
        unit_price:  parseFloat(item.unit_price || '0'),
        // What that rate is PER (118). Board comes per kg; 'packet' is the
        // fallback because it reproduces the old quantity x rate arithmetic.
        rate_basis:  item.rate_basis || 'packet',
        subtotal:    item.subtotal,
        board_item_id: item.board_item_id || null,
        // Which job this line is being bought for (113). Blank means general
        // stock, which is a legitimate purchase — not a missing field.
        job_id:      item.job_id || null,
        // Kaunsi board demand ye line poori kar rahi hai (135).
        demand_id:   item.demand_id || null,
        notes:       item.notes || null,
        sort_order:  item.sort_order,
      }))
    )
    if (itemsErr) return { error: `Purchase order lines could not be saved: ${itemsErr.message}`, status: 500 }

    // Demand ko bata do ke uska board ab PO par hai. PACKETS → SHEETS, kyunke
    // demand ka saara hisab sheets mein hai (jaisa receive bhi karta hai) —
    // packets seedha jama karna 100 guna ghalat hota. Yahi wo ghalti hai jo MRP
    // page ka purana "Create PO" button karta tha.
    for (const item of lineItems as any[]) {
      if (!item.demand_id) continue
      const perPacket = Number(boardById.get(item.board_item_id)?.sheets_per_packet ?? 100)
      const { error: demErr } = await supabase.rpc('apply_po_to_demand', {
        p_company_id:     companyId,
        p_demand_id:      item.demand_id,
        p_ordered_delta:  parseFloat(item.quantity || '0') * perPacket,
        p_received_delta: 0,
        p_board_item_id:  item.board_item_id || null,
      })
      if (demErr) console.error('[PO create] apply_po_to_demand failed', demErr)
    }
  }

  return { po }
}

export default createPurchaseOrder
