import type { SupabaseClient } from '@supabase/supabase-js'

export interface IssuedGsmEntry {
  gsm: number
  quantity: number
}

/**
 * The GSM(s) actually issued to a job, derived from its material requisitions.
 *
 * Nothing types this in — it is a fact that already exists in the data. A
 * requisition line points at a board_inventory row via board_item_id, and that
 * stock row carries the real GSM. So once the store issues board, the system
 * already knows what weight went out; this just surfaces it.
 *
 * Deliberately separate from jobs.gsm, which is the PLANNED value. When the
 * shop substitutes 290 for a planned 300 to save cost, both numbers matter:
 * the plan is what the customer approved and what was quoted, the issued value
 * is what actually ran. Overwriting one with the other would destroy the
 * variance that makes the substitution auditable.
 *
 * Returns one entry per distinct GSM, heaviest usage first — a job issued in
 * two batches from different stock can legitimately have more than one.
 */
export async function getIssuedGsm(
  supabase: SupabaseClient,
  companyId: string,
  jobId: string,
): Promise<IssuedGsmEntry[]> {
  const { data } = await supabase
    .from('material_requisitions' as any)
    .select('id, material_requisition_items(quantity_issued, board_inventory(gsm))')
    .eq('company_id', companyId)
    .eq('job_id', jobId)
    .is('deleted_at', null)

  const totals = new Map<number, number>()
  for (const mrn of ((data ?? []) as any[])) {
    for (const item of ((mrn.material_requisition_items ?? []) as any[])) {
      const gsm = Number(item.board_inventory?.gsm ?? 0)
      const qty = Number(item.quantity_issued ?? 0)
      if (gsm > 0 && qty > 0) totals.set(gsm, (totals.get(gsm) ?? 0) + qty)
    }
  }

  return Array.from(totals, ([gsm, quantity]) => ({ gsm, quantity }))
    .sort((a, b) => b.quantity - a.quantity)
}

/** "290" for a single weight, "290 + 300" when a job drew from two stocks. */
export function formatIssuedGsm(entries: IssuedGsmEntry[]): string {
  if (!entries.length) return ''
  return entries.map(e => String(e.gsm)).join(' + ')
}

/** True when anything was issued at a weight other than the planned one. */
export function hasGsmVariance(planned: number | null | undefined, entries: IssuedGsmEntry[]): boolean {
  if (!planned || !entries.length) return false
  return entries.some(e => e.gsm !== Number(planned))
}
