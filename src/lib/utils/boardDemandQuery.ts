/**
 * Ek hi SELECT aur ek hi sajawat, har us jagah ke liye jahan board demand
 * dikhti hai — Purchase ki Demands list, Job Detail ka board line, aur demand se
 * PO banane wala raasta. Teen jagah alag alag select likhte to ek jagah vendor
 * ya sheets_per_packet reh jata aur wahi ek jagah chup chaap ghalat PO banati.
 */

/**
 * `board_types` do dafa nahi juri: demand par apna `board_type_id` hai AUR
 * `board_inventory` par bhi ek hai, is liye dono ko alag alag hint chahiye
 * warna PostgREST embed hi refuse kar deta hai (wahi bimari jo 104 ne
 * jobs ↔ job_artworks par paida ki thi).
 */
export const DEMAND_SELECT =
  'id, job_id, board_type_id, paper_type_id, material_name, gsm, ' +
  'sheet_width_in, sheet_height_in, sheets_required, board_item_id, ' +
  'sheets_from_stock, sheets_ordered, sheets_received, sheets_to_purchase, ' +
  'status, notes, created_at, ' +
  'jobs(job_number, job_title, priority, required_date, customers(name)), ' +
  'board_types!board_demands_board_type_id_fkey(name, default_vendor_id), ' +
  'paper_types(name), ' +
  'board_inventory(id, description, current_stock, reserved_stock, sheets_per_packet, unit_cost, vendor_id)'

export interface DecoratedDemand {
  id: string
  vendor_id: string | null
  vendor_name: string | null
  /** PACKETS — jitne packet khareedne hain (sheets ko upar ki taraf gol kiya). */
  packets_to_purchase: number
  [k: string]: any
}

/**
 * Har demand ke sath wo do cheezein laga deta hai jo insaan ko chahiye aur jo
 * ek query se nahi milti:
 *
 *  - **vendor** — pehle us stock row ka vendor jis par ye demand baithi hai,
 *    warna board type ka default vendor. Mehboob ka usool: "bleach board size
 *    koi bhi ho, aana ek hi vendor se hai" — yani vendor board ke TYPE ke sath
 *    juda hai, size ke sath nahi.
 *  - **packets** — PO ki quantity hamesha PACKETS mein hoti hai aur demand
 *    SHEETS mein. Ye tabdeeli ek hi jagah honi chahiye, warna 40,000 sheets ka
 *    order 40,000 PACKET ka ban jata hai — theek wohi 100 guna ghalti jo purane
 *    MRP page ka "Create PO" button karta tha.
 */
export async function decorateDemands(
  supabase: any,
  companyId: string,
  rows: any[],
): Promise<DecoratedDemand[]> {
  if (!rows.length) return []

  const vendorIds = new Set<string>()
  for (const r of rows) {
    const v = r.board_inventory?.vendor_id ?? r.board_types?.default_vendor_id
    if (v) vendorIds.add(v)
  }

  const vendorNames = new Map<string, string>()
  if (vendorIds.size) {
    const { data: vendors } = await supabase.from('vendors' as any)
      .select('id, name').eq('company_id', companyId).in('id', Array.from(vendorIds))
    for (const v of ((vendors ?? []) as any[])) vendorNames.set(v.id, v.name)
  }

  return rows.map(r => {
    const vendorId = r.board_inventory?.vendor_id ?? r.board_types?.default_vendor_id ?? null
    const perPacket = Number(r.board_inventory?.sheets_per_packet ?? 100) || 100
    const toBuy = Number(r.sheets_to_purchase ?? 0)
    return {
      ...r,
      vendor_id: vendorId,
      vendor_name: vendorId ? (vendorNames.get(vendorId) ?? null) : null,
      // Adha packet koi nahi bechta — upar hi jayega.
      packets_to_purchase: toBuy > 0 ? Math.ceil(toBuy / perPacket) : 0,
      sheets_per_packet: perPacket,
    }
  })
}

export default decorateDemands
