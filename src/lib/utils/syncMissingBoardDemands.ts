/**
 * Jo job kisi bhi wajah se chhoot gayi, usay yahan pakar lo.
 *
 * Demand job banate hi ban jati hai — magar sirf UN raaston se jin par hook
 * laga hai. §5 ka apna sabaq yaad rahe: jobs banane ke PAANCH raaste hain, aur
 * har dafa koi naya field kisi ek par lagana bhool gaya hai. Ek bhoola hua hook
 * yahan khamoshi se ye karta hai — us job ka board Purchase ki list mein kabhi
 * nahi aata, aur kisi ko pata us din chalta hai jab press khali khari hoti hai.
 *
 * Aur ek waqti soorat bhi hai: backfill (137) chalne ke BAAD, naya code deploy
 * hone se PEHLE jo jobs bani (live par JOB-00471-R2 aisi hi ek thi) unka koi
 * demand nahi.
 *
 * Is liye Purchase ka "To Buy" page aur uska API dono kholte waqt ye jhaaru
 * chalate hain. Mamool mein sifar rows — sirf ek index scan.
 *
 * Kabhi throw nahi karti: page ka khulna is par nahi ruk sakta.
 */
export async function syncMissingBoardDemands(
  supabase: any,
  companyId: string,
): Promise<number> {
  try {
    const { data, error } = await supabase.rpc('sync_missing_board_demands', {
      p_company_id: companyId,
    })
    if (error) { console.error('[boardDemand] sweep failed', error.message); return 0 }
    const n = Number(data ?? 0)
    if (n > 0) console.log(`[boardDemand] ${n} job(s) had no board demand — created`)
    return n
  } catch (e: any) {
    console.error('[boardDemand] sweep threw', e?.message ?? e)
    return 0
  }
}

export default syncMissingBoardDemands
