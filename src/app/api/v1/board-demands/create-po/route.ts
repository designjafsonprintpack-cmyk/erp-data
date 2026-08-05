import { NextResponse, type NextRequest } from 'next/server'
import { createSupabaseServerClient } from '@/lib/supabase/server'
import { getCompanyId } from '@/lib/utils/getCompanyId'
import { getUserTableId } from '@/lib/utils/getUserTableId'
import { requirePermission } from '@/lib/utils/requirePermission'
import { withErrorHandling } from '@/lib/utils/apiHandler'
import { parseBody } from '@/lib/utils/validate'
import { boardDemandCreatePoSchema } from '@/lib/schemas/boardDemand'
import { DEMAND_SELECT, decorateDemands } from '@/lib/utils/boardDemandQuery'
import { createPurchaseOrder, type PoLineInput } from '@/lib/services/purchaseOrderCreate'

/**
 * "In demands ka PO bana do."
 *
 * Ye wo jagah hai jahan se sir khapai khatam hoti hai. Purchase sirf tick karta
 * hai; baqi sab yahan hota hai:
 *
 *  1. **Vendor khud chun jata hai** — pehle us stock row ka vendor jis par
 *     demand baithi hai, warna board type ka default vendor (Mehboob: "bleach
 *     board size koi bhi ho, aana ek hi vendor se hai").
 *  2. **Stock item na ho to bana diya jata hai.** Ye us purani kharabi ka ilaj
 *     hai jis mein MRP ka PO kisi stock row se juda hi nahi hota tha, is liye
 *     us ka maal receive hone par stock mein KABHI add nahi hota tha. Board
 *     hamesha job ke hisab se aata hai, is liye naya size/gsm rozmarra ki baat
 *     hai — koi insaan pehle se stock item banata rahe, ye ghalat design hai.
 *  3. **Sheets → PACKETS.** PO ki quantity packets mein hai. Ye tabdeeli ek hi
 *     jagah hai (`decorateDemands`), warna 40,000 sheets ka order 40,000 packet
 *     ka ban jata — 100 guna.
 *  4. **Rate pichhli khareed se bhar jata hai** (`board_inventory.unit_cost`,
 *     jo 117 ke mutabiq weighted average PER SHEET hai) aur PO draft rehti hai,
 *     taake kharidar sirf number theek kare aur bheje.
 *  5. **Har vendor ki apni PO**, aur usi shared service se jo saada PO banati
 *     hai — supplier ledger, rate basis, demand link, sab ek jaisa.
 */
export const POST = withErrorHandling(async function POST(req: NextRequest) {
  const supabase = createSupabaseServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const companyId = await getCompanyId(user, supabase)
  const userTableId = await getUserTableId(user, supabase)
  const denied = await requirePermission(userTableId, 'purchase', 'create', supabase)
  if (denied) return denied

  const parsed = await parseBody(req, boardDemandCreatePoSchema)
  if ('error' in parsed) return parsed.error
  const body = parsed.data
  const overrides = body.overrides ?? {}

  const { data: rawRows, error: loadErr } = await supabase.from('board_demands' as any)
    .select(DEMAND_SELECT)
    .eq('company_id', companyId)
    .in('id', body.demand_ids)
    .is('deleted_at', null)
    .in('status', ['open', 'partially_ordered'])
  if (loadErr) return NextResponse.json({ error: loadErr.message }, { status: 500 })

  const demands = await decorateDemands(supabase, companyId, (rawRows ?? []) as any[])
  if (!demands.length) {
    return NextResponse.json({ error: 'None of those demands still need to be ordered.' }, { status: 400 })
  }

  const warnings: string[] = []

  // ─── Vendor har demand ke liye tay karo ───────────────────────────────────
  const vendorOf = new Map<string, string>()
  const noVendor: string[] = []
  for (const d of demands) {
    const v = overrides[d.id]?.vendor_id ?? d.vendor_id
    if (v) vendorOf.set(d.id, v)
    else noVendor.push(label(d))
  }
  if (noVendor.length) {
    return NextResponse.json({
      error: `No vendor on file for ${noVendor.join(', ')}. Set a default vendor on the board type in Settings, or pick one for these lines.`,
      needs_vendor: noVendor,
    }, { status: 400 })
  }

  // ─── Jin ka stock item nahi, unka bana do ─────────────────────────────────
  // Ek hi batch mein do jobs ka board ek jaisa ho sakta hai — us soorat mein
  // dono ke liye EK hi stock row banni chahiye, warna wahi board do rows mein
  // bant jata aur available hamesha adha dikhta.
  const madeForSpec = new Map<string, string>()
  for (const d of demands) {
    if (d.board_item_id) continue
    const key = specKey(d, vendorOf.get(d.id)!)
    const already = madeForSpec.get(key)
    if (already) { d.board_item_id = already; continue }

    const { data: created, error: cErr } = await supabase.from('board_inventory' as any).insert({
      company_id:      companyId,
      board_type_id:   d.board_type_id ?? null,
      paper_type_id:   d.paper_type_id ?? null,
      description:     d.material_name,
      gsm:             d.gsm ?? null,
      sheet_width_in:  d.sheet_width_in ?? null,
      sheet_height_in: d.sheet_height_in ?? null,
      current_stock:   0,
      reserved_stock:  0,
      reorder_level:   0,
      unit_cost:       0,
      vendor_id:       vendorOf.get(d.id) ?? null,
      created_by:      userTableId,
      updated_by:      userTableId,
    }).select('id, sheets_per_packet, unit_cost').single()

    if (cErr || !created) {
      warnings.push(`${label(d)}: stock item could not be created — ${cErr?.message ?? 'unknown error'}`)
      continue
    }
    d.board_item_id      = (created as any).id
    d.sheets_per_packet  = Number((created as any).sheets_per_packet ?? 100) || 100
    d.board_inventory    = { ...(d.board_inventory ?? {}), unit_cost: 0, sheets_per_packet: d.sheets_per_packet }
    // Packets ab naye item ke sheets_per_packet par dobara nikaalo.
    d.packets_to_purchase = Math.ceil(Number(d.sheets_to_purchase ?? 0) / d.sheets_per_packet)
    madeForSpec.set(specKey(d, vendorOf.get(d.id)!), d.board_item_id as string)
  }

  // ─── Vendor ke hisab se PO ─────────────────────────────────────────────────
  const byVendor = new Map<string, PoLineInput[]>()
  const linkedDemands = new Map<string, string[]>()

  for (const d of demands) {
    if (!d.board_item_id) continue // upar warning ja chuki hai
    const o = overrides[d.id] ?? {}
    const packets = Number(o.packets ?? d.packets_to_purchase ?? 0)
    if (!(packets > 0)) {
      warnings.push(`${label(d)}: nothing left to order.`)
      continue
    }

    const vendorId = vendorOf.get(d.id)!
    // Pichhli khareed ka bhaao, per sheet (117) → per packet, kyunke line ki
    // maqdaar packets mein hai. Sifar ka matlab "maloom nahi" — kharidar bharega.
    const perSheet = Number(d.board_inventory?.unit_cost ?? 0)
    const rate = o.unit_price != null
      ? Number(o.unit_price)
      : Math.round(perSheet * Number(d.sheets_per_packet ?? 100) * 10000) / 10000

    if (!(rate > 0) && o.unit_price == null) {
      warnings.push(`${label(d)}: no previous rate on file — the PO line is at 0, please enter the rate before sending it.`)
    }

    const line: PoLineInput = {
      description:   d.material_name,
      specification: specText(d),
      quantity:      packets,
      unit_price:    rate,
      // 'packet' hi rehta hai kyunke rate bhi packet par nikala gaya. 'kg' tab
      // theek hai jab kharidar khud kilo ka bhaao daale — wo override se aata hai.
      rate_basis:    o.rate_basis ?? 'packet',
      board_item_id: d.board_item_id,
      job_id:        d.job_id ?? null,
      demand_id:     d.id,
    }

    if (!byVendor.has(vendorId)) { byVendor.set(vendorId, []); linkedDemands.set(vendorId, []) }
    byVendor.get(vendorId)!.push(line)
    linkedDemands.get(vendorId)!.push(d.id)
  }

  if (!byVendor.size) {
    return NextResponse.json({ error: warnings[0] ?? 'Nothing to order.', warnings }, { status: 400 })
  }

  const created: any[] = []
  for (const [vendorId, lines] of Array.from(byVendor.entries())) {
    const result = await createPurchaseOrder(supabase as any, companyId, userTableId, {
      vendor_id:     vendorId,
      expected_date: body.expected_date || null,
      notes:         body.notes || 'Board demands se banaya gaya',
    }, lines)

    if (result.error) { warnings.push(result.error); continue }
    created.push(result.po)
  }

  // Jis board type ka default vendor abhi tak khali hai, us par pehli khareed
  // ka vendor likh do. Ye Settings mein baithe baithe vendor bharne ka kaam
  // khatam kar deta hai — jo vendor se board waqai aaya, wohi likha jata hai.
  // Sirf khali khaana bharta hai, kisi ki chuni hui tarjeeh nahi badalta.
  const learned = new Set<string>()
  for (const d of demands) {
    const v = vendorOf.get(d.id)
    if (!v || !d.board_type_id || d.board_types?.default_vendor_id) continue
    // Jo vendor kharidar ne KHUD chuna, us se seekhna ghalat hai. Wo aksar ek
    // dafa ka faisla hota hai — "mamool wale ke paas nahi tha, is dafa doosre
    // se le liya" — aur usay board type ka mamool bana dena us ghair-mamooli
    // soorat ko hamesha ke liye qaida bana deta. Sirf us vendor se seekho jo
    // system ne khud nikala tha.
    if (overrides[d.id]?.vendor_id) continue
    if (learned.has(d.board_type_id)) continue
    learned.add(d.board_type_id)
    await supabase.from('board_types' as any)
      .update({ default_vendor_id: v })
      .eq('id', d.board_type_id).eq('company_id', companyId)
      .is('default_vendor_id', null)
  }

  if (!created.length) {
    return NextResponse.json({ error: warnings[0] ?? 'No purchase order could be created.', warnings }, { status: 500 })
  }

  return NextResponse.json({ data: created, warnings })
})

function label(d: any): string {
  return d.jobs?.job_number ? `${d.jobs.job_number} (${d.material_name})` : d.material_name
}

function specText(d: any): string {
  const bits = [
    d.gsm ? `${Number(d.gsm)} gsm` : null,
    d.sheet_width_in && d.sheet_height_in ? `${Number(d.sheet_width_in)} x ${Number(d.sheet_height_in)} in` : null,
    d.jobs?.job_number ? `for ${d.jobs.job_number}` : null,
  ].filter(Boolean)
  return bits.join(' · ')
}

/** Ek hi board ki do demands ek hi naye stock item par aani chahiyen. */
function specKey(d: any, vendorId: string): string {
  return [
    d.board_type_id ?? d.paper_type_id ?? d.material_name,
    d.gsm ?? '', d.sheet_width_in ?? '', d.sheet_height_in ?? '', vendorId,
  ].join('|')
}
