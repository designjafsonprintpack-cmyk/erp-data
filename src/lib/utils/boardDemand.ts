import { loadGangContext } from './jobGang'

/**
 * Har job ka board demand — khud ba khud.
 *
 * Mehboob ka usool: "hum board alag store nahi karte, job ke hisab se board
 * order karte hain." Stock ek target nahi, bacha hua maal hai. Is liye demand
 * job ke banate hi bin maange ban jati hai, apne aap dekhti hai ke us exact
 * board ka koi leftover para hai (gsm + sheet size, board type tarjeehan),
 * jitna para hai utna reserve kar leti hai, aur baqi Purchase ki list mein
 * chala deti hai. Koi button, koi form, koi yaad rakhne wala kaam nahi.
 *
 * Saara hisab `resolve_board_demand()` (135) mein hai taake reservation ka
 * jama-tafreeq atomic rahe — ek hi stock row par kai jobs ka hissa saath saath
 * baithta hai, aur har tabdeeli delta se hoti hai.
 *
 * Yahan sirf ek sawal ka jawab diya jata hai jo SQL ko dena mehnga parta:
 * **kitni sheets, aur kis job ke naam?** Gang run mein board ek hi dafa nikalta
 * hai (126) — poori run ka sheet count, lead job ke naam — bilkul waisay hi
 * jaisay MRN. Members ki apni demand cancel ho jati hai, warna do members ek
 * hi board ko do dafa maang lete: 4,000 sheets 8,000 ban jatin aur us ke baad
 * har stock figure ghalat.
 *
 * NEVER THROWS. Board demand kisi job ke save hone ki shart nahi hai — demand
 * na banne ka nuqsan ye hai ke Purchase ko ek line nazar nahi aayegi (jo insaan
 * dekh kar theek kar sakta hai), aur throw karne ka nuqsan ye hai ke job hi
 * save na ho.
 */
export async function syncBoardDemand(
  supabase: any,
  companyId: string,
  jobId: string,
  userId?: string | null,
): Promise<void> {
  try {
    const gang = await loadGangContext(supabase, companyId, jobId)

    if (gang && !gang.isLead) {
      // Board is run ke lead ke naam nikalta hai. Is member ki apni demand,
      // agar gang banne se pehle ban chuki thi, ab ghalat hai — chhor do.
      await callRelease(supabase, companyId, jobId, userId)
      await callResolve(supabase, companyId, gang.leadJobId, gang.sheetCount, userId)
      return
    }

    await callResolve(supabase, companyId, jobId, gang ? gang.sheetCount : null, userId)
  } catch (e: any) {
    console.error('[boardDemand] sync failed for job', jobId, e?.message ?? e)
  }
}

/**
 * Job cancel/delete ho gayi — jo board uske naam reserve tha wo wapas free
 * stock ban jata hai. Mehboob: "job cancel ho gaya to us ka board stock mein
 * aa gaya." Demand ki row cancelled rehti hai, mitti nahi.
 */
export async function releaseBoardDemand(
  supabase: any,
  companyId: string,
  jobId: string,
  userId?: string | null,
): Promise<void> {
  try {
    await callRelease(supabase, companyId, jobId, userId)
  } catch (e: any) {
    console.error('[boardDemand] release failed for job', jobId, e?.message ?? e)
  }
}

/**
 * Gang ke har member ka board dobara hisab karo — gang banne, badalne ya
 * khatam hone par. Lead ko run ka poora board milta hai, baqi ki demand cancel.
 * Gang toot jaye to har member wapas apni apni demand par aa jata hai, kyunke
 * tab loadGangContext null deta hai.
 */
export async function syncGangBoardDemands(
  supabase: any,
  companyId: string,
  jobIds: string[],
  userId?: string | null,
): Promise<void> {
  for (const id of Array.from(new Set(jobIds))) {
    await syncBoardDemand(supabase, companyId, id, userId)
  }
}

/**
 * Job ki wo columns jin ke badalne se board ki zaroorat badal jati hai. In ke
 * ilawa kuch bhi badle to demand chhedne ki zaroorat nahi.
 *
 * `sheet_qty` yahan hai kyunke wohi maqdaar hai; `quantity` aur `ups` nahi,
 * kyunke sheet_qty unhi se nikalta hai aur route pehle hi naya sheet_qty likh
 * chuka hota hai (§4: Sheet Qty = ceil(Box Qty / Ups)).
 */
export const BOARD_SPEC_FIELDS = [
  'board_type_id', 'paper_type_id', 'gsm',
  'sheet_width_in', 'sheet_height_in', 'sheet_qty',
] as const

/** Kya is patch mein board ki spec badli hai? */
export function touchesBoardSpec(patch: Record<string, any>): boolean {
  return BOARD_SPEC_FIELDS.some(f => f in patch)
}

async function callResolve(
  supabase: any,
  companyId: string,
  jobId: string,
  sheets: number | null,
  userId?: string | null,
) {
  const { error } = await supabase.rpc('resolve_board_demand', {
    p_company_id: companyId,
    p_job_id: jobId,
    p_sheets_required: sheets,
    p_user_id: userId ?? null,
  })
  if (error) console.error('[boardDemand] resolve_board_demand failed', error)
}

async function callRelease(
  supabase: any,
  companyId: string,
  jobId: string,
  userId?: string | null,
) {
  const { error } = await supabase.rpc('release_board_demand', {
    p_company_id: companyId,
    p_job_id: jobId,
    p_user_id: userId ?? null,
  })
  if (error) console.error('[boardDemand] release_board_demand failed', error)
}

export default syncBoardDemand
