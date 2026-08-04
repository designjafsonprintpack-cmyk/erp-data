import { NextResponse, type NextRequest } from 'next/server'
import { createSupabaseServerClient } from '@/lib/supabase/server'
import { getCompanyId } from '@/lib/utils/getCompanyId'
import { getUserTableId } from '@/lib/utils/getUserTableId'
import { requirePermission } from '@/lib/utils/requirePermission'
import { recordJobEvent, initializeJobWorkflow } from '@/modules/jobs/services/jobEventService'
import { withErrorHandling } from '@/lib/utils/apiHandler'
import { parseBody } from '@/lib/utils/validate'
import { proofCreateSchema, proofVerdictSchema } from '@/lib/schemas/jobActions'

/**
 * Press proofing — migration 104.
 *
 * A proof run is a JOB, not a child record: the shop prints 100–500 sheets on
 * the real press to show the customer the real colour, and that consumes board,
 * plates and press time exactly like any other job. Modelling it as a job
 * tagged `job_kind = 'proofing'` means board issue, MRNs, plates, machine
 * assignment, wastage, ink and costing all work on it with no new machinery —
 * the same parent_job_id pattern repeat jobs already use.
 *
 * Numbering is derived from the parent (JOB-0123-P1, -P2) and deliberately does
 * NOT draw from the JOB sequence, so the live counter keeps meaning what it
 * always meant. Same reasoning as the JOB-OLD legacy series in 093.
 */

const PROOF_TEMPLATE = 'Proofing Run'

/** GET — every proof round for this job, newest round first. */
export const GET = withErrorHandling(async function GET(_req: NextRequest, { params }: { params: { id: string } }) {
  const supabase = createSupabaseServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const companyId = await getCompanyId(user, supabase)

  const { data, error } = await supabase.from('jobs' as any)
    .select('id,job_number,job_title,status,sheet_qty,proof_round,proof_result,proof_notes,proof_decided_at,proof_artwork_id,created_at,job_artworks!jobs_proof_artwork_id_fkey(version,file_name)')
    .eq('parent_job_id', params.id)
    .eq('company_id', companyId)
    .eq('job_kind', 'proofing')
    .is('deleted_at', null)
    .order('proof_round', { ascending: false })

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ data: data ?? [] })
})

/** POST — pull a new proof round for this job. */
export const POST = withErrorHandling(async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const supabase = createSupabaseServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const companyId = await getCompanyId(user, supabase)
  const userTableId = await getUserTableId(user, supabase)
  const denied = await requirePermission(userTableId, 'jobs', 'create', supabase)
  if (denied) return denied

  const parsed = await parseBody(req, proofCreateSchema)
  if ('error' in parsed) return parsed.error
  const { sheet_qty, artwork_id, notes } = parsed.data

  const sheets = Math.floor(Number(sheet_qty))
  if (!Number.isFinite(sheets) || sheets <= 0) {
    return NextResponse.json({ error: 'Proof sheets must be a positive number' }, { status: 400 })
  }

  const { data: original, error: origErr } = await supabase.from('jobs' as any)
    .select('*').eq('id', params.id).eq('company_id', companyId).is('deleted_at', null).single()
  if (origErr || !original) return NextResponse.json({ error: 'Job not found' }, { status: 404 })
  const orig = original as any

  // A proof of a proof is meaningless — rounds hang off the production job.
  if (orig.job_kind === 'proofing') {
    return NextResponse.json(
      { error: `${orig.job_number} is itself a proof run. Add the next round from the main job instead.` },
      { status: 400 }
    )
  }

  // The artwork, if named, must belong to THIS job — otherwise the record that
  // is supposed to settle a dispute could point at another job's file.
  if (artwork_id) {
    const { data: art } = await supabase.from('job_artworks' as any)
      .select('id').eq('id', artwork_id).eq('job_id', params.id).eq('company_id', companyId)
      .is('deleted_at', null).maybeSingle()
    if (!art) return NextResponse.json({ error: 'That artwork version does not belong to this job' }, { status: 400 })
  }

  const { data: tpl } = await supabase.from('workflow_templates' as any)
    .select('id').eq('company_id', companyId).eq('name', PROOF_TEMPLATE)
    .is('deleted_at', null).maybeSingle()
  if (!tpl) {
    return NextResponse.json(
      { error: `The "${PROOF_TEMPLATE}" workflow is missing — migration 104 has not been run on this database yet.` },
      { status: 500 }
    )
  }

  // Round number counts every proof ever pulled for this job, including any
  // that were rejected — round 3 must stay round 3 in the record.
  const { count: existing } = await supabase.from('jobs' as any)
    .select('id', { count: 'exact', head: true })
    .eq('parent_job_id', params.id).eq('company_id', companyId)
    .eq('job_kind', 'proofing').is('deleted_at', null)
  const round = (existing ?? 0) + 1

  const { data: newJob, error: createErr } = await supabase.from('jobs' as any).insert({
    company_id:           companyId,
    job_number:           `${orig.job_number}-P${round}`,
    parent_job_id:        params.id,
    job_kind:             'proofing',
    proof_round:          round,
    proof_result:         'pending',
    proof_notes:          notes || null,
    proof_artwork_id:     artwork_id || null,
    customer_id:          orig.customer_id,
    job_title:            `${orig.job_title} — Proof ${round}`,
    description:          orig.description,
    // Specs are copied wholesale: a proof is only worth pulling if it runs the
    // same board, same colours and same finishing as the real job will.
    size_l:               orig.size_l,
    size_w:               orig.size_w,
    size_h:               orig.size_h,
    sheet_width_in:       orig.sheet_width_in,
    sheet_height_in:      orig.sheet_height_in,
    box_type_id:          orig.box_type_id,
    gsm:                  orig.gsm,
    ups:                  orig.ups,
    // Sheets, not boxes — see the sheet_qty COMMENT in migration 104. The
    // locked Sheet Qty = ceil(Box Qty / Ups) rule runs the other way and does
    // not apply: nobody derives a proof run from a box count.
    sheet_qty:            sheets,
    quantity:             0,
    no_of_colors:         orig.no_of_colors,
    die_number:           orig.die_number,
    board_type_id:        orig.board_type_id,
    paper_type_id:        orig.paper_type_id,
    lamination_type_id:   orig.lamination_type_id,
    uv_coating:           orig.uv_coating,
    foil_type_id:         orig.foil_type_id,
    special_finishing:    orig.special_finishing,
    pasting:              orig.pasting,
    // A proof is the parent job pulled on the real press, so it runs off the
    // same layout note the parent carries.
    internal_remarks:     orig.internal_remarks,
    workflow_template_id: (tpl as any).id,
    priority:             orig.priority || 'normal',
    status:               'new',
  }).select().single()

  if (createErr) return NextResponse.json({ error: createErr.message }, { status: 500 })
  const proof = newJob as any

  // Board Issue → Printing only. A proof never goes to die cutting, packing,
  // QC or dispatch, so it must not carry the parent's full template.
  await initializeJobWorkflow(proof.id, (tpl as any).id, companyId, supabase)

  await recordJobEvent({
    company_id: companyId, job_id: proof.id,
    event_type: 'created', new_value: proof.job_number,
    notes: `Press proof round ${round} for ${orig.job_number} — ${sheets} sheets`,
  }, supabase)

  await recordJobEvent({
    company_id: companyId, job_id: params.id,
    event_type: 'proof_created', new_value: proof.job_number,
    notes: notes || `Press proof round ${round} (${sheets} sheets) created`,
  }, supabase)

  return NextResponse.json({ data: proof })
})

/** PATCH — record what the customer said about a proof round. */
export const PATCH = withErrorHandling(async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  const supabase = createSupabaseServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const companyId = await getCompanyId(user, supabase)
  const userTableId = await getUserTableId(user, supabase)
  const denied = await requirePermission(userTableId, 'jobs', 'update', supabase)
  if (denied) return denied

  const parsed = await parseBody(req, proofVerdictSchema)
  if ('error' in parsed) return parsed.error
  const { proof_job_id, result, notes } = parsed.data

  // Scoped to this parent AND this company — a verdict must never be written
  // onto a proof belonging to another job.
  const { data: proof } = await supabase.from('jobs' as any)
    .select('id, job_number, proof_round, proof_result')
    .eq('id', proof_job_id).eq('parent_job_id', params.id)
    .eq('company_id', companyId).eq('job_kind', 'proofing')
    .is('deleted_at', null).maybeSingle()
  if (!proof) return NextResponse.json({ error: 'Proof run not found for this job' }, { status: 404 })

  const { error: updErr } = await supabase.from('jobs' as any).update({
    proof_result:     result,
    proof_notes:      notes || null,
    proof_decided_at: new Date().toISOString(),
    proof_decided_by: userTableId,
    updated_by:       userTableId,
  }).eq('id', proof_job_id).eq('company_id', companyId)

  if (updErr) return NextResponse.json({ error: updErr.message }, { status: 500 })

  const label = result === 'approved' ? 'approved' : 'sent back for changes'
  await recordJobEvent({
    company_id: companyId, job_id: params.id,
    event_type: 'proof_decided',
    old_value: (proof as any).proof_result,
    new_value: result,
    notes: `${(proof as any).job_number} (round ${(proof as any).proof_round}) ${label}${notes ? ` — ${notes}` : ''}`,
  }, supabase)

  return NextResponse.json({
    data: { id: proof_job_id, proof_result: result },
    message: result === 'approved'
      ? 'Proof approved — the main print run can now start.'
      : 'Recorded. Pull another proof round once the changes are made.',
  })
})
