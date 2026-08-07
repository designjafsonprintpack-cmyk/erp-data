import { recordJobEvent, initializeJobWorkflow } from '@/modules/jobs/services/jobEventService'
import { resolveWorkflowTemplateId } from '@/lib/utils/resolveWorkflowTemplate'
import { autoStartArtworkStage } from '@/lib/utils/autoStartArtworkStage'
import { nextRunNumber } from '@/lib/utils/jobRunNumber'
import { syncBoardDemand } from '@/lib/utils/boardDemand'

/**
 * EK CARTON KA AGLA RUN BANANA — sirf yahan.
 *
 * Ye poora kaam `POST /api/v1/jobs/[id]/repeat` ke andar likha hua tha. Ab Sales
 * Order confirm hone par bhi wohi run banta hai, aur CLAUDE.md §5 ka saaf hukm
 * hai: **PAANCH raaste ek job ke specs naqal karte hain aur har ek ki apni
 * fehrist hai** — `internal_remarks` paanchon se ghayab tha, jo live par 104
 * jobs ka layout rakhta hai. Chhati fehrist likhne ke bajaye wohi ek yahan rakh
 * di gayi hai, aur dono raaste isay bulate hain. Naya spec column aaye to yahan
 * lagega, do jagah nahi.
 *
 * Jo baat is function ne route se BADLI hai: `sales_order_id` ab dalili
 * (parameter) hai. Repeat tab se aaya run jaan bujh kar SO se nahi juRta — wo
 * "purani job dobara chalao" hai. SO confirm se aaya run juRta hai, warna us
 * line ka koi hisab hi nahi rehta ke uski job ban chuki.
 */
export interface CreateRepeatRunInput {
  companyId: string
  /** Jis job ka agla run banana hai. */
  parentJobId: string
  userTableId: string | null
  /** Nayi miqdaar. Na di jaye to parent wali. */
  quantity?: number | string | null
  requiredDate?: string | null
  /** Parent ki manzoor shuda artwork naye run par le aao. */
  sameArtwork?: boolean
  /** Parent ke event par likhne ka note. */
  notes?: string | null
  /**
   * Is RUN ka apna layout. Die carton ki pehchan hai aur wo nahi badalti, magar
   * ek run kam ups par chal sakta hai — screen printing wala spot UV, ya doosri
   * qism ka board — aur us ke sath sheet size bhi badalta hai. Live par ye ho
   * chuka hai: JOB-00401 12 ups par 15.5 × 27.5, JOB-00401-R2 18 ups par
   * 20 × 27.5, die 28 dono par wohi.
   *
   * Na diya jaye to parent ka layout hi chalta hai — SO confirm isi par hai.
   */
  ups?: number | string | null
  sheetWidthIn?: number | string | null
  sheetHeightIn?: number | string | null
  /** SO se aaya ho to uska link — warna null. */
  salesOrderId?: string | null
  salesOrderItemId?: string | null
}

export interface CreateRepeatRunResult {
  job?: any
  error?: string
}

export async function createRepeatRun(
  supabase: any,
  input: CreateRepeatRunInput,
): Promise<CreateRepeatRunResult> {
  const {
    companyId, parentJobId, userTableId,
    quantity, requiredDate, sameArtwork, notes,
    ups, sheetWidthIn, sheetHeightIn,
    salesOrderId = null, salesOrderItemId = null,
  } = input

  /** '' aur null dono ka matlab "kuch nahi bheja" — parent wali qeemat chalegi. */
  const num = (v: unknown) => {
    if (v === undefined || v === null || v === '') return null
    const n = Number(v)
    return Number.isFinite(n) ? n : null
  }

  const { data: original, error: origErr } = await supabase.from('jobs' as any)
    .select('*').eq('id', parentJobId).eq('company_id', companyId).single()

  if (origErr || !original) return { error: 'Job not found' }
  const orig = original as any

  // Run carries the ORIGINAL's number with the run on the end — JOB-00408 →
  // JOB-00408-R2 — so one carton keeps one number. It deliberately does not
  // call get_next_sequence_number: a reorder is not a new job in the JOB
  // series, and every repeat used to burn a number that looked like a gap.
  const { jobNumber, runNo } = await nextRunNumber(supabase, companyId, parentJobId, orig.job_number)

  // Sheet Qty = ceil(Box Qty / Ups), so it is recomputed rather than copied —
  // the run may carry a different quantity than the parent.
  const newQty = quantity ? parseFloat(String(quantity)) : orig.quantity

  // Layout: jo bheja gaya wo, warna parent wala. `sheet_qty` hamesha CHALTE
  // HUE ups se banti hai — §4 ka `ceil(quantity / ups)` — warna 12-up run par
  // 18-up wali sheet count chali jati aur board ka poora hisab ghalat hota.
  const runUps    = num(ups) ?? orig.ups
  const runWidth  = num(sheetWidthIn)  ?? orig.sheet_width_in
  const runHeight = num(sheetHeightIn) ?? orig.sheet_height_in

  // The parent's template first, but copying it blindly was the bug: all 478
  // legacy jobs carry workflow_template_id = NULL by design, and a repeat of one
  // came out with no stages and never surfaced in any department queue. Falling
  // through to the box type's mapping (110) lands it on the right template.
  const repeatTemplateId = await resolveWorkflowTemplateId(supabase, companyId, {
    explicitId: orig.workflow_template_id,
    boxTypeId:  orig.box_type_id,
  })

  const { data: newJob, error: createErr } = await supabase.from('jobs' as any).insert({
    company_id:           companyId,
    job_number:           jobNumber,
    parent_job_id:        parentJobId,
    is_repeat:            true,
    // The same number the job_number carries, so badge and number agree.
    repeat_sequence:      runNo,
    // EXACT repeat path — every spec copied, only quantity/date may differ. A
    // repeat whose printed content changed goes through POST /api/v1/jobs with
    // parent_job_id instead (migration 097).
    repeat_kind:          'exact',
    customer_id:          orig.customer_id,
    sales_order_id:       salesOrderId,
    sales_order_item_id:  salesOrderItemId,
    // The title no longer repeats what the number already says — "… (Repeat 2)"
    // is how one carton came to look like two unrelated jobs (133).
    job_title:            orig.job_title,
    description:          orig.description,
    size_l:               orig.size_l,
    size_w:               orig.size_w,
    size_h:               orig.size_h,
    sheet_width_in:       runWidth,
    sheet_height_in:      runHeight,
    box_type_id:          orig.box_type_id,
    grain_direction:      orig.grain_direction,
    gsm:                  orig.gsm,
    quantity:             newQty,
    ups:                  runUps,
    sheet_qty:            runUps && runUps > 0 ? Math.ceil(newQty / runUps) : null,
    no_of_colors:         orig.no_of_colors,
    die_number:           orig.die_number,
    board_type_id:        orig.board_type_id,
    paper_type_id:        orig.paper_type_id,
    lamination_type_id:   orig.lamination_type_id,
    uv_coating:           orig.uv_coating,
    foil_type_id:         orig.foil_type_id,
    special_finishing:    orig.special_finishing,
    pasting:              orig.pasting,
    // Internal Remarks is part of the SPEC, not a note about one order. On live
    // it holds what the floor cannot work without — "INNER 10_UP & OUTTER 1_UP
    // / INNER SIZE 58 x 21 x 90 …" — and a run that loses it arrives at the
    // press missing the layout. Money (quoted_amount) is deliberately NOT
    // copied: a reorder is priced again.
    internal_remarks:     orig.internal_remarks,
    workflow_template_id: repeatTemplateId,
    priority:             'normal',
    required_date:        requiredDate || null,
    status:               'new',
  }).select().single()

  if (createErr) return { error: createErr.message }
  const newJobData = newJob as any

  if (repeatTemplateId) {
    await initializeJobWorkflow(newJobData.id, repeatTemplateId, companyId, supabase)
  }

  // Ek repeat naya RUN hai (§4) — plate aur artwork bhale purane ho, board naya
  // chahiye. Demand yahin ban jati hai, warna repeat ka board Board Issue tak
  // kisi ko nazar hi nahi aata.
  await syncBoardDemand(supabase, companyId, newJobData.id, userTableId)

  // ─── Parent ki artwork naye run par ──────────────────────────────────────
  // "Same artwork" pehle SIRF neeche wali reference row likhta tha — ek note,
  // jise koi nahi parhta. Workflow ka artwork gate IS job ki `job_artworks`
  // parhta hai, to run bagair artwork ke paida hota tha aur "Artwork & Customer
  // Approval" kabhi mukammal nahi ho sakti thi. Live par JOB-2026-00008/09/10
  // teenon isi tarah phanse the.
  //
  // FILE SHARE hoti hai, naqal nahi: do rows ek hi storage object par ishara kar
  // sakti hain, aur retention sweep har LIVE row ke path ko rakhta hai — parent
  // ki artwork delete hone se run ki file nahi jaati.
  if (sameArtwork) {
    await supabase.from('job_artwork_references' as any).insert({
      company_id: companyId,
      job_id: newJobData.id,
      reference_job_id: parentJobId,
      artwork_version: 1,
      notes: 'Artwork reused from original job',
    })

    const { data: parentArt, error: artErr } = await supabase.from('job_artworks' as any)
      .select('design_no, design_label, version, file_name, file_url, thumb_url, file_size, file_type, designer_notes, approved_at, approved_by')
      .eq('job_id', parentJobId)
      .eq('company_id', companyId)
      .eq('status', 'approved')
      .is('deleted_at', null)
      .order('design_no', { ascending: true })
      .order('version', { ascending: false })

    // Never swallowed: "parent has no approved artwork" and "the read broke"
    // look identical from here, and the second silently recreates the bug above.
    if (artErr) {
      console.error('[repeat-run] parent artwork read failed:', artErr.message)
    } else {
      // Latest approved version of EVERY design (124) — a lid and a base are two
      // designs and the gate wants both.
      const latestPerDesign = new Map<number, any>()
      for (const a of (parentArt ?? []) as any[]) {
        const d = Number(a.design_no) || 1
        if (!latestPerDesign.has(d)) latestPerDesign.set(d, a)
      }

      if (latestPerDesign.size > 0) {
        const rows = Array.from(latestPerDesign.entries()).map(([designNo, a]) => ({
          company_id:   companyId,
          job_id:       newJobData.id,
          design_no:    designNo,
          design_label: a.design_label ?? null,
          // v1 of THIS run's own history, not the parent's version number.
          version:      1,
          file_name:    a.file_name,
          file_url:     a.file_url,
          thumb_url:    a.thumb_url ?? null,
          file_size:    a.file_size ?? null,
          file_type:    a.file_type ?? null,
          designer_notes: `Carried over from ${orig.job_number} (design ${designNo} v${a.version})`,
          status: 'approved',
          is_production_ready: true,
          // The parent's approval is the real one — the customer signed this
          // design off then, not now. Stamping today would invent it.
          approved_at: a.approved_at ?? new Date().toISOString(),
          approved_by: a.approved_by ?? null,
          created_by: userTableId,
        }))

        const { error: copyErr } = await supabase.from('job_artworks' as any).insert(rows)
        if (copyErr) {
          // Not fatal — the run exists and artwork can be uploaded by hand.
          // Logged, because a silent failure here puts the job back into the
          // wall described above.
          console.error('[repeat-run] artwork carry-over failed:', copyErr.message)
        } else {
          await recordJobEvent({
            company_id: companyId, job_id: newJobData.id,
            event_type: 'artwork_uploaded',
            new_value: `${rows.length} design${rows.length === 1 ? '' : 's'} carried over from ${orig.job_number}`,
            notes: 'Exact repeat — same artwork, already approved on the original job',
            actor_id: userTableId,
          }, supabase)

          // Same as an upload: artwork is real on this job now, so its stage
          // starts by itself. It deliberately does not COMPLETE.
          await autoStartArtworkStage(
            supabase, companyId, newJobData.id, userTableId,
            `Auto-started — artwork carried over from ${orig.job_number}`,
          )
        }
      }
    }
  }

  // Layout parent se alag ho to wo baat isi event mein likh do. Naya event type
  // NAHI banaya — `job_stage_events` par CHECK hai aur usay barhaye bagair naya
  // type khamoshi se reject ho jata hai (§5, 104 ki galti).
  const layoutChanged = runUps !== orig.ups || runWidth !== orig.sheet_width_in || runHeight !== orig.sheet_height_in
  const layoutNote = layoutChanged
    ? ` — layout badla: ${orig.ups ?? '—'} ups / ${orig.sheet_width_in ?? '—'} × ${orig.sheet_height_in ?? '—'} se ${runUps ?? '—'} ups / ${runWidth ?? '—'} × ${runHeight ?? '—'}`
    : ''

  await recordJobEvent({
    company_id: companyId, job_id: newJobData.id,
    event_type: 'created', new_value: newJobData.job_number,
    notes: `Repeat job created from ${orig.job_number}${layoutNote}`,
  }, supabase)

  await recordJobEvent({
    company_id: companyId, job_id: parentJobId,
    event_type: 'repeat_created', new_value: newJobData.job_number,
    notes: notes || `Repeat job ${newJobData.job_number} created`,
  }, supabase)

  return { job: newJobData }
}

export default createRepeatRun
