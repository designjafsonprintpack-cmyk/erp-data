import { NextResponse, type NextRequest } from 'next/server'
import { createSupabaseServerClient } from '@/lib/supabase/server'
import { getCompanyId } from '@/lib/utils/getCompanyId'
import { getUserTableId } from '@/lib/utils/getUserTableId'
import { requirePermission } from '@/lib/utils/requirePermission'
import { recordJobEvent, initializeJobWorkflow } from '@/modules/jobs/services/jobEventService'
import { resolveWorkflowTemplateId } from '@/lib/utils/resolveWorkflowTemplate'
import { autoStartArtworkStage } from '@/lib/utils/autoStartArtworkStage'
import { nextRunNumber } from '@/lib/utils/jobRunNumber'
import { withErrorHandling } from '@/lib/utils/apiHandler'
import { parseBody } from '@/lib/utils/validate'
import { jobRepeatSchema } from '@/lib/schemas/jobActions'

export const POST = withErrorHandling(async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const supabase = createSupabaseServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const companyId = await getCompanyId(user, supabase)
  const userTableId = await getUserTableId(user, supabase)
  const denied = await requirePermission(userTableId, 'jobs', 'create', supabase)
  if (denied) return denied

  const parsed = await parseBody(req, jobRepeatSchema)
  if ('error' in parsed) return parsed.error
  const { quantity, required_date, notes, same_artwork } = parsed.data

  // Fetch original job
  const { data: original, error: origErr } = await supabase.from('jobs' as any)
    .select('*').eq('id', params.id).eq('company_id', companyId).single()

  if (origErr || !original) return NextResponse.json({ error: 'Job not found' }, { status: 404 })

  const orig = original as any

  // The repeat carries the ORIGINAL's number with the run on the end —
  // JOB-00408 → JOB-00408-R2 — so one carton keeps one number.
  // See jobRunNumber.ts for why, and for why the row is still separate.
  //
  // It deliberately no longer calls get_next_sequence_number: a reorder is not
  // a new job in the JOB series, and every repeat used to burn a number that
  // then looked like a gap.
  const { jobNumber, runNo } = await nextRunNumber(supabase, companyId, params.id, orig.job_number)

  // Resolved up front because sheet_qty is derived from it (Sheet Qty =
  // ceil(Box Qty / Ups)) — the repeat may carry a different quantity than
  // the parent, so the parent's stored sheet_qty can't just be copied.
  const newQty = quantity ? parseFloat(String(quantity)) : orig.quantity

  // The parent's template is the first choice, but copying it blindly was the
  // bug: all 478 legacy jobs carry workflow_template_id = NULL by design, and a
  // repeat of one came out with no stages and never surfaced in any department
  // queue. Falling through to the box type's mapping (migration 110) means a
  // reorder of an old carton lands on Standard Carton, an old HL on HL, and so
  // on — without touching the legacy job itself.
  const repeatTemplateId = await resolveWorkflowTemplateId(supabase, companyId, {
    explicitId: orig.workflow_template_id,
    boxTypeId:  orig.box_type_id,
  })

  // Create repeat job — copy all specs from original
  const { data: newJob, error: createErr } = await supabase.from('jobs' as any).insert({
    company_id:           companyId,
    job_number:           jobNumber,
    parent_job_id:        params.id,
    is_repeat:            true,
    // The same number the job_number carries, so the badge and the number agree.
    repeat_sequence:      runNo,
    // This route is the EXACT repeat path — every spec is copied and only
    // quantity/date can differ. A repeat whose printed content changed goes
    // through POST /api/v1/jobs with parent_job_id instead (migration 097).
    repeat_kind:          'exact',
    customer_id:          orig.customer_id,
    sales_order_id:       null, // Repeat jobs start fresh
    // The title no longer repeats what the number already says. It used to read
    // "… (Repeat 2)" on a job numbered JOB-2026-00010, which is how one carton
    // came to look like two unrelated jobs in the list and in search.
    job_title:            orig.job_title,
    description:          orig.description,
    size_l:               orig.size_l,
    size_w:               orig.size_w,
    size_h:               orig.size_h,
    sheet_width_in:       orig.sheet_width_in,
    sheet_height_in:      orig.sheet_height_in,
    box_type_id:          orig.box_type_id,
    grain_direction:      orig.grain_direction,
    gsm:                  orig.gsm,
    quantity:             newQty,
    ups:                  orig.ups,
    sheet_qty:            orig.ups && orig.ups > 0 ? Math.ceil(newQty / orig.ups) : null,
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
    // it holds the things the floor cannot work without — "INNER 10_UP &
    // OUTTER 1_UP / INNER SIZE 58 x 21 x 90 / OUTTER SIZE 92 x 42 x 295" — and
    // an exact repeat that loses it arrives at the press missing the layout.
    // 104 of 488 jobs carry one. Money (quoted_amount) is deliberately NOT
    // copied: a reorder is priced again.
    internal_remarks:     orig.internal_remarks,
    workflow_template_id: repeatTemplateId,
    priority:             'normal',
    required_date:        required_date || null,
    status:               'new',
  }).select().single()

  if (createErr) return NextResponse.json({ error: createErr.message }, { status: 500 })

  const newJobData = newJob as any

  // Initialize workflow
  if (repeatTemplateId) {
    await initializeJobWorkflow(newJobData.id, repeatTemplateId, companyId, supabase)
  }

  // ─── Carry the original's artwork onto the repeat ───────────────────────────
  // The checkbox says "same artwork, no new artwork needed" and it used to write
  // ONLY the reference row below — a note, pointing at the parent. Nothing else
  // reads it. The workflow's artwork gate reads `job_artworks` for THIS job, so
  // an exact repeat with the box ticked came out with zero artwork rows and
  // could never complete Artwork & Customer Approval:
  //
  //     Cannot complete "Artwork & Customer Approval"
  //     — no approved artwork version exists for this job yet.
  //
  // Found on live: JOB-2026-00008/09/10 all had a reference row and no artwork,
  // and the files ended up uploaded onto the COMPLETED parents instead — where
  // there is no workflow at all, so the auto-start silently did nothing either.
  // Both of Mehboob's symptoms, one cause.
  //
  // THE FILE IS SHARED, NOT COPIED.
  //   Two rows may point at one storage object: the retention sweep builds its
  //   keep-set from every LIVE row's file_url and explicitly lets "keep" beat
  //   "expired" (see artworkRetention.ts), so deleting the parent's artwork
  //   cannot take the repeat's file with it. Copying the object would double
  //   the storage and add a failure mode for no gain.
  //
  // ONLY EXACT REPEATS. "Repeat with Changes" goes through POST /api/v1/jobs and
  // is left alone on purpose — its printed content changed, so its artwork must
  // be a fresh round (097 already refuses to let that job SKIP artwork).
  if (same_artwork) {
    await supabase.from('job_artwork_references' as any).insert({
      company_id: companyId,
      job_id: newJobData.id,
      reference_job_id: params.id,
      artwork_version: 1,
      notes: 'Artwork reused from original job',
    })

    const { data: parentArt, error: artErr } = await supabase.from('job_artworks' as any)
      .select('design_no, design_label, version, file_name, file_url, thumb_url, file_size, file_type, designer_notes, approved_at, approved_by')
      .eq('job_id', params.id)
      .eq('company_id', companyId)
      .eq('status', 'approved')
      .is('deleted_at', null)
      .order('design_no', { ascending: true })
      .order('version', { ascending: false })

    // Never swallowed: "the parent has no approved artwork" and "the read broke"
    // look identical from here, and the second one silently recreates the exact
    // bug this block exists to fix.
    if (artErr) {
      console.error('[repeat] parent artwork read failed:', artErr.message)
    } else {
      // Latest approved version of EVERY design (migration 124) — a lid and a
      // base are two designs, and the gate wants both. The ORDER BY puts each
      // design's highest version first, so the first row per design wins.
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
          // v1 of the REPEAT's own history, not the parent's version number.
          // This job's revisions start here; where it came from is in the note.
          version:      1,
          file_name:    a.file_name,
          file_url:     a.file_url,
          // Shared like the original — the retention sweep keeps every path a
          // live row points at, so neither job can take the other's files.
          thumb_url:    a.thumb_url ?? null,
          file_size:    a.file_size ?? null,
          file_type:    a.file_type ?? null,
          designer_notes: `Carried over from ${orig.job_number} (design ${designNo} v${a.version})`,
          status: 'approved',
          is_production_ready: true,
          // The parent's approval is the real one — the customer signed this
          // design off then, not now. Stamping today's date would invent it.
          approved_at: a.approved_at ?? new Date().toISOString(),
          approved_by: a.approved_by ?? null,
          created_by: userTableId,
        }))

        const { error: copyErr } = await supabase.from('job_artworks' as any).insert(rows)
        if (copyErr) {
          // Not fatal — the repeat job itself is created and the artwork can be
          // uploaded by hand. Logged, because a silent failure here puts the job
          // straight back into the wall described above.
          console.error('[repeat] artwork carry-over failed:', copyErr.message)
        } else {
          await recordJobEvent({
            company_id: companyId, job_id: newJobData.id,
            event_type: 'artwork_uploaded',
            new_value: `${rows.length} design${rows.length === 1 ? '' : 's'} carried over from ${orig.job_number}`,
            notes: 'Exact repeat — same artwork, already approved on the original job',
            actor_id: userTableId,
          }, supabase)

          // Same as an upload: artwork is real on this job now, so its stage
          // starts by itself. It deliberately does not COMPLETE — see
          // autoStartArtworkStage() for why that stays a human act.
          await autoStartArtworkStage(
            supabase, companyId, newJobData.id, userTableId,
            `Auto-started — artwork carried over from ${orig.job_number}`,
          )
        }
      }
    }
  }

  // Record events on both jobs
  await recordJobEvent({
    company_id: companyId, job_id: newJobData.id,
    event_type: 'created', new_value: newJobData.job_number,
    notes: `Repeat job created from ${orig.job_number}`,
  }, supabase)

  await recordJobEvent({
    company_id: companyId, job_id: params.id,
    event_type: 'repeat_created', new_value: newJobData.job_number,
    notes: notes || `Repeat job ${newJobData.job_number} created`,
  }, supabase)

  return NextResponse.json({ data: newJobData })
})
