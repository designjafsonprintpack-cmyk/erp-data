import { NextResponse, type NextRequest } from 'next/server'
import { createSupabaseServerClient } from '@/lib/supabase/server'
import { getCompanyId } from '@/lib/utils/getCompanyId'
import { getUserTableId } from '@/lib/utils/getUserTableId'
import { requirePermission } from '@/lib/utils/requirePermission'
import { recordJobEvent } from '@/modules/jobs/services/jobEventService'
import { withErrorHandling } from '@/lib/utils/apiHandler'
import { loadFamilyPlates } from '@/lib/utils/familyPlates'

/**
 * "ISI CARTON KI PURANI PLATES IS RUN PAR LAGA DO" — ek click.
 *
 * Repeat par plate ka jawab pehle se database mein hota hai: wohi die, wohi
 * plates. Pehle bhi ye ho sakta tha, magar aik aik plate ke liye alag alag —
 * plate dhoondo, chuno, assign karo, phir agla rang. CMYK par chaar dafa. Ab
 * poora set aik dafa mein.
 *
 * Ye khud nahi chalta, dabaya jata hai — jaan bujh kar. `job_plates` ka wajood
 * hi printing ka darwaza kholta hai (§4: printing bagair active plate ke
 * hard-blocked hai). Job bante hi khud assign kar dena us darwaze ko be-maani
 * kar deta: kaghaz kehta "plate lag gayi" aur plate store mein rakhi hoti. Ye
 * button us aadmi ke haath mein hai jo plate waqai nikaal raha hai.
 *
 * Har plate wahi raasta leti hai jo aik aik kar ke lagane par leti — `plates`
 * ka status, `mark_plate_reused`, aur `job_plates.is_reused = true`. Kisi plate
 * par masla ho (kisi aur job par chaRhi hui, ya toot gayi) to baqi rukti nahi;
 * ginti wapas aati hai. Aadha kaam kar ke 500 dena sab se bura nateeja hota.
 */
export const POST = withErrorHandling(async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const supabase = createSupabaseServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const companyId = await getCompanyId(user, supabase)
  const userTableId = await getUserTableId(user, supabase)
  const denied = await requirePermission(userTableId, 'plates', 'create', supabase)
  if (denied) return denied

  const { data: job, error: jobErr } = await supabase.from('jobs' as any)
    .select('id, job_number').eq('id', params.id).eq('company_id', companyId).maybeSingle()
  if (jobErr) return NextResponse.json({ error: jobErr.message }, { status: 500 })
  if (!job) return NextResponse.json({ error: 'Job not found' }, { status: 404 })
  const j = job as any

  // Jo plate pehle se ISI job par lagi hui hai usay dobara na lagao — warna
  // dobara dabane par wohi plate do dafa chaRh jati.
  const { data: already } = await supabase.from('job_plates' as any)
    .select('plate_id').eq('job_id', j.id).eq('company_id', companyId)
    .is('deleted_at', null).is('returned_at', null)
  const onJob = new Set(((already ?? []) as any[]).map(r => r.plate_id))

  const family = await loadFamilyPlates(supabase, companyId, [{ job_id: j.id, job_number: j.job_number }])
  const candidates = family[j.id] ?? []
  if (!candidates.length) {
    // Dobara dabane par plates `mounted` ho chuki hoti hain, is liye tajweez
    // ki list khali aati hai. Aise mein "koi plate nahi mili" kehna jhoot hai —
    // plates isi job par lagi hui hain. Wajah sahi batao.
    const msg = onJob.size > 0
      ? `Is job par pehle se ${onJob.size} plate lagi hui hain.`
      : 'Is carton ke pichle run ki koi dobara lagne wali plate nahi mili.'
    return NextResponse.json({ error: msg }, { status: 409 })
  }

  const assigned: string[] = []
  const skipped: { plate: string; reason: string }[] = []

  for (const p of candidates) {
    const label = p.plate_code || p.color || 'plate'
    if (onJob.has(p.id)) { skipped.push({ plate: label, reason: 'pehle se isi job par lagi hai' }); continue }

    // Halat dobara parhi jati hai, list banne ke baad koi aur usay utha sakta
    // hai. Wohi shart jo aik-aik wale route par hai.
    const { data: fresh } = await supabase.from('plates' as any)
      .select('status').eq('id', p.id).eq('company_id', companyId).maybeSingle()
    const status = String((fresh as any)?.status)
    // Asli darje `plates_status_check` se — familyPlates.ts mein poori fehrist.
    if (status === 'mounted' || status === 'printing') {
      skipped.push({ plate: label, reason: 'abhi kisi press par chaRhi hui hai' }); continue
    }
    if (['damaged', 'disposed', 'lost', 'archived'].includes(status)) {
      skipped.push({ plate: label, reason: `plate ${status} hai` }); continue
    }

    const { error: rpcErr } = await (supabase as any).rpc('mark_plate_reused', { p_plate_id: p.id })
    if (rpcErr) { skipped.push({ plate: label, reason: rpcErr.message }); continue }

    const { error: insErr } = await supabase.from('job_plates' as any).insert({
      company_id: companyId,
      job_id: j.id,
      plate_id: p.id,
      is_reused: true,
      assigned_at: new Date().toISOString(),
      remarks: `${p.origin_job_number} se dobara lagayi gayi`,
      created_by: userTableId,
    })
    if (insErr) { skipped.push({ plate: label, reason: insErr.message }); continue }
    assigned.push(label)
  }

  if (assigned.length) {
    await recordJobEvent({
      company_id: companyId, job_id: j.id,
      event_type: 'plate_assigned',
      new_value: `${assigned.length} plate ${candidates[0].origin_job_number} se dobara lagayi gayin`,
      notes: assigned.join(', '),
      actor_id: userTableId,
    }, supabase).catch(() => null)
  }

  return NextResponse.json({ data: { assigned, skipped, from: candidates[0].origin_job_number } })
})
