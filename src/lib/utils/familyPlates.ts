import type { SupabaseClient } from '@supabase/supabase-js'

export interface ReusablePlate {
  id: string
  plate_code: string | null
  color: string | null
  plate_size: string | null
  status: string | null
  reuse_count: number | null
  /** Kis job ke liye banayi gayi thi — operator isi se pehchanta hai. */
  origin_job_number: string | null
}

/**
 * "IS CARTON KI PURANI PLATES KAHAN HAIN" — ek run ke liye wo plates jo pehle
 * hi is carton ke kisi run par ban chuki hain aur dobara lagayi ja sakti hain.
 *
 * Repeat ka poora matlab yehi hai: wohi die, wohi plates, store se nikaal kar
 * dobara press par. Aaj tak Plates page par repeat aur naye carton mein koi
 * farq nahi tha — dono par plate ka poora form haath se bharna parta tha,
 * halanke repeat par jawab pehle se database mein maujood hota hai.
 *
 * CARTON KI PEHCHAN — number ka STEM, `parent_job_id` ka aik qadam nahi.
 *   `JOB-00408`, `-R2`, `-R3` sab aik hi carton hain. R3 ka parent root bhi ho
 *   sakta hai aur R2 bhi (dono raaste code mein mojood hain), is liye ek qadam
 *   peeche dekhna kaafi nahi. Stem dono soorat mein sahi jawab deta hai — wohi
 *   qaida jo jobs list (144) aur search palette istemal karte hain.
 *
 * KAUN SI PLATE "dobara lagayi ja sakti hai"
 *   `plates.status` ke asli darje ye hain (CHECK constraint se parhe gaye, yaad
 *   se nahi): created · mounted · printing · removed · in_storage · damaged ·
 *   remade · reused · archived · disposed · lost.
 *
 *   Bahar: `damaged`, `disposed`, `lost`, `archived` — ye plate ab rahi hi
 *   nahi. Aur `mounted` / `printing` bhi bahar, kyunki wo abhi kisi press par
 *   chaRhi hui hai (`mark_plate_reused()` lagane par status `mounted` hi karta
 *   hai). Baqi — created, in_storage, removed, reused, remade — store mein
 *   hain aur dobara lag sakti hain.
 *
 *   NOTE: `POST /api/v1/jobs/[id]/plates` `status === 'in_use'` par rad karta
 *   hai, aur `in_use` is CHECK mein hai hi nahi — yani wo shart kabhi nahi
 *   chalti. Wo alag bug hai, yahan theek nahi kiya gaya.
 *
 * Ye sirf BATATA hai — lagata nahi. Plate uthana jismani kaam hai aur
 * `job_plates` ka wajood hi printing ka darwaza kholta hai (§4). Khud assign
 * kar dena us darwaze ko jhoot bana deta: kaghaz kehta "plate lag gayi" aur
 * store mein wo apni jagah rakhi hoti.
 */
export async function loadFamilyPlates(
  supabase: SupabaseClient,
  companyId: string,
  jobs: { job_id: string; job_number: string }[],
): Promise<Record<string, ReusablePlate[]>> {
  const out: Record<string, ReusablePlate[]> = {}
  if (!jobs.length) return out

  const stemOf = (n: string) => (n ?? '').replace(/-(?:R|P)\d+$/, '')

  // Sirf un jobs ke liye poochho jo kisi carton ka doosra ya aage ka run hain.
  // Bilkul naye carton ki koi purani plate ho hi nahi sakti.
  const runs = jobs.filter(j => j.job_number !== stemOf(j.job_number))
  if (!runs.length) return out

  const stems = Array.from(new Set(runs.map(j => stemOf(j.job_number))))

  // Poore khandaan ke members — ek query, stem par. `like` isi liye kaam karta
  // hai ke har run ka number apne stem se shuru hota hai.
  const { data: family, error: famErr } = await supabase.from('jobs' as any)
    .select('id, job_number')
    .eq('company_id', companyId)
    .is('deleted_at', null)
    .or(stems.map(s => `job_number.like.${s}%`).join(','))
  if (famErr || !family) return out

  const membersByStem = new Map<string, { id: string; job_number: string }[]>()
  for (const m of (family as any[])) {
    const s = stemOf(m.job_number)
    if (!stems.includes(s)) continue
    const list = membersByStem.get(s) ?? []
    list.push(m)
    membersByStem.set(s, list)
  }

  const allMemberIds = Array.from(membersByStem.values()).flat().map(m => m.id)
  if (!allMemberIds.length) return out

  // Khandaan ke kisi bhi member ke liye banayi gayi plates.
  const { data: plates, error: plErr } = await supabase.from('plates' as any)
    .select('id, plate_code, color, plate_size, status, reuse_count, origin_job_id')
    .eq('company_id', companyId)
    .is('deleted_at', null)
    .eq('is_active', true)
    .in('origin_job_id', allMemberIds)
  if (plErr || !plates) return out

  const numberById = new Map<string, string>()
  for (const m of Array.from(membersByStem.values()).flat()) numberById.set(m.id, m.job_number)

  // Khatam ho chuki, ya abhi kisi press par chaRhi hui. Baqi sab store mein.
  const UNUSABLE = new Set(['damaged', 'disposed', 'lost', 'archived', 'mounted', 'printing'])
  const byStem = new Map<string, ReusablePlate[]>()
  for (const p of (plates as any[])) {
    if (UNUSABLE.has(String(p.status))) continue
    const originNumber = numberById.get(p.origin_job_id)
    if (!originNumber) continue
    const s = stemOf(originNumber)
    const list = byStem.get(s) ?? []
    list.push({
      id: p.id,
      plate_code: p.plate_code ?? null,
      color: p.color ?? null,
      plate_size: p.plate_size ?? null,
      status: p.status ?? null,
      reuse_count: p.reuse_count ?? null,
      origin_job_number: originNumber,
    })
    byStem.set(s, list)
  }

  for (const j of runs) {
    const list = byStem.get(stemOf(j.job_number))
    if (list?.length) out[j.job_id] = list
  }
  return out
}

export default loadFamilyPlates
