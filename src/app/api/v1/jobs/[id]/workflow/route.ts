import { NextResponse, type NextRequest } from 'next/server'
import { createSupabaseServerClient } from '@/lib/supabase/server'
import { getCompanyId } from '@/lib/utils/getCompanyId'
import { getUserTableId } from '@/lib/utils/getUserTableId'
import { requirePermission } from '@/lib/utils/requirePermission'
import { recordJobEvent } from '@/modules/jobs/services/jobEventService'
import { withErrorHandling } from '@/lib/utils/apiHandler'
import { parseBody } from '@/lib/utils/validate'
import { jobWorkflowActionSchema } from '@/lib/schemas/jobActions'
import { checkStageGate } from '@/lib/utils/jobStageGate'
import { syncJobCurrentStage } from '@/lib/utils/syncJobCurrentStage'
import { closeJobIfWorkflowDone } from '@/lib/utils/closeJobIfWorkflowDone'
import { notifyDepartment } from '@/lib/utils/notifyDepartment'

// After a stage completes, some previously-blocked stages may now be
// unblocked (either because this was their last blocking sequential
// predecessor, or because they explicitly depend on this exact stage).
// Re-checks every still-pending stage in the job and notifies the
// department attached to any that just became startable — the
// "auto-notify the next department" half of Feature 4. Event-triggered,
// not polled, so no dedupe bookkeeping needed: this only ever runs once
// per completion action.
async function notifyNewlyUnblockedStages(
  supabase: ReturnType<typeof createSupabaseServerClient>,
  companyId: string, jobId: string
) {
  const { data: job } = await supabase.from('jobs' as any)
    .select('job_number, job_title').eq('id', jobId).eq('company_id', companyId).maybeSingle()
  if (!job) return

  const { data: pendingStages } = await supabase.from('job_stage_progress' as any)
    .select('id, workflow_stage_id, sequence_order, status, workflow_stages(name, department_id)')
    .eq('job_id', jobId).eq('company_id', companyId)
    .eq('status', 'pending')

  for (const stage of ((pendingStages ?? []) as any[])) {
    const gate = await checkStageGate(supabase, companyId, jobId, stage.workflow_stage_id, stage.sequence_order, stage.workflow_stages?.name || 'Stage')
    if (gate.blocked) continue

    const departmentId = stage.workflow_stages?.department_id ?? null
    await notifyDepartment(supabase, {
      companyId, departmentId,
      title: `${stage.workflow_stages?.name || 'Next stage'} ready to start`,
      message: `${(job as any).job_number} — ${(job as any).job_title} is ready for ${stage.workflow_stages?.name || 'the next stage'}.`,
      linkUrl: `/dashboard/jobs/${jobId}`,
      groupKey: `stage_ready:${stage.id}`,
    }).catch(() => null)
  }
}

// PATCH — advance a stage (start / complete / skip)
export const PATCH = withErrorHandling(async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  const supabase = createSupabaseServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const companyId = await getCompanyId(user, supabase)
  const userTableId = await getUserTableId(user, supabase)
  const denied = await requirePermission(userTableId, 'jobs', 'edit', supabase)
  if (denied) return denied

  const parsed = await parseBody(req, jobWorkflowActionSchema)
  if ('error' in parsed) return parsed.error
  const { stage_progress_id, action, notes } = parsed.data
  // action: 'start' | 'complete' | 'skip'

  // Load the stage being acted on — needed for the gate/artwork checks below.
  const { data: targetStage, error: targetErr } = await supabase
    .from('job_stage_progress' as any)
    .select('id, job_id, sequence_order, workflow_stage_id, workflow_stages(name, stage_type)')
    .eq('id', stage_progress_id)
    .eq('company_id', companyId)
    .single()

  if (targetErr || !targetStage) {
    return NextResponse.json({ error: 'Stage not found' }, { status: 404 })
  }

  const targetStageName = (targetStage as any).workflow_stages?.name || 'Stage'
  const targetStageType = (targetStage as any).workflow_stages?.stage_type || null
  const sequenceOrder = (targetStage as any).sequence_order
  const workflowStageId = (targetStage as any).workflow_stage_id
  const jobId = (targetStage as any).job_id

  // ─── Dependency gate (Feature 4) ────────────────────────────────────────────
  // Explicit workflow_stage_dependencies rows if configured, otherwise the
  // original hard-sequential rule — see jobStageGate.ts for the full rule.
  const gate = await checkStageGate(supabase, companyId, jobId, workflowStageId, sequenceOrder, targetStageName)
  if (gate.blocked) {
    return NextResponse.json({ error: gate.reason }, { status: 400 })
  }

  // ─── Artwork approval gate ──────────────────────────────────────────────────
  // The artwork stage cannot be marked complete until a version of this job's
  // artwork has status = 'approved'. Matches on workflow_stages.stage_type
  // ('artwork'), not the stage's display name.
  // 'artwork_approval' is the merged Artwork + Customer Approval stage added in
  // migration 086; 'artwork' is still carried by older stages and running jobs.
  if (action === 'complete' && (targetStageType === 'artwork' || targetStageType === 'artwork_approval')) {
    // EVERY design must be approved, not just one row somewhere on the job
    // (migration 124). A job can carry two separate designs — an HL lid and
    // base, a carton and its insert — and the old check asked only for "any
    // approved row", so approving the lid opened the gate for the base too and
    // the shop could print a design the customer had never signed off.
    const { data: artworks, error: artErr } = await supabase
      .from('job_artworks' as any)
      .select('design_no, design_label, status')
      .eq('job_id', jobId)
      .eq('company_id', companyId)
      .is('deleted_at', null)

    // A failed read must not read as "no artwork" — that would block a job
    // whose artwork is fine, with a message blaming the designer.
    if (artErr) return NextResponse.json({ error: artErr.message }, { status: 500 })

    const rows = (artworks ?? []) as any[]
    if (rows.length === 0) {
      return NextResponse.json(
        { error: `Cannot complete "${targetStageName}" — no approved artwork version exists for this job yet.` },
        { status: 400 }
      )
    }

    // Group by design, then ask each group whether ANY of its versions is
    // approved — a design is signed off once one of its revisions is.
    const approvedByDesign = new Map<number, boolean>()
    const labelByDesign = new Map<number, string | null>()
    for (const a of rows) {
      const d = Number(a.design_no) || 1
      approvedByDesign.set(d, (approvedByDesign.get(d) ?? false) || a.status === 'approved')
      if (a.design_label && !labelByDesign.get(d)) labelByDesign.set(d, a.design_label)
    }

    const unapproved = Array.from(approvedByDesign.entries())
      .filter(([, approved]) => !approved)
      .map(([d]) => {
        const label = labelByDesign.get(d)
        return label ? `Design ${d} (${label})` : `Design ${d}`
      })

    if (unapproved.length) {
      const total = approvedByDesign.size
      return NextResponse.json({
        error: total === 1
          ? `Cannot complete "${targetStageName}" — no approved artwork version exists for this job yet.`
          : `Cannot complete "${targetStageName}" — this job has ${total} designs and ${unapproved.join(', ')} ${unapproved.length === 1 ? 'is' : 'are'} not approved yet.`,
      }, { status: 400 })
    }
  }

  // ─── Changed-repeat gates (migration 097) ───────────────────────────────────
  // A "Repeat with Changes" job looks exactly like a repeat to whoever is
  // working it, which is how the old plate gets mounted and the wrong expiry
  // reaches a full lot. 097 added the warnings; these are the two teeth.
  //
  // Loaded once and reused by both checks below.
  const needsChangedRepeatCheck =
    (action === 'skip' && (targetStageType === 'artwork' || targetStageType === 'artwork_approval')) ||
    (action === 'start' && targetStageType === 'printing')

  let changedJob: any = null
  // The same row also answers "is this a proof run?" for the press-proof gate
  // below, so it is kept whatever repeat_kind turns out to be.
  let jobForChecks: any = null
  if (needsChangedRepeatCheck) {
    const { data } = await supabase.from('jobs' as any)
      .select('repeat_kind, changed_aspects, change_note, parent_job_id, job_kind')
      .eq('id', jobId).eq('company_id', companyId).maybeSingle()
    jobForChecks = data
    if ((data as any)?.repeat_kind === 'changed') changedJob = data
  }

  // (a) Artwork cannot be SKIPPED when the printed content changed — HARD.
  //     Completing it still runs through the normal approved-artwork gate
  //     below; this only closes the "skip it, it's a repeat" shortcut.
  //
  //     Not every change touches the printed image though. A heavier board or
  //     a different lamination leaves the artwork identical, so those alone
  //     don't force a fresh round — blocking them would train people to tick
  //     boxes that don't matter. Anything else does, including 'other',
  //     because an unnamed change is not a safe one.
  if (changedJob && action === 'skip') {
    const ARTWORK_SAFE = new Set(['board_gsm', 'finishing'])
    const aspects: string[] = (changedJob.changed_aspects ?? []) as string[]
    const touchesArtwork = aspects.length === 0 || aspects.some(a => !ARTWORK_SAFE.has(a))
    if (touchesArtwork) {
      return NextResponse.json(
        {
          error: `Cannot skip "${targetStageName}" — this is a repeat whose printed content changed`
            + (aspects.length ? ` (${aspects.join(', ')})` : '')
            + `. The new artwork has to be approved before it runs.`,
        },
        { status: 400 }
      )
    }
  }

  // ─── QC gate (migration 092) ────────────────────────────────────────────────
  // The QC stage cannot be marked complete until this job has an inspection on
  // record that passed. 'conditional_pass' counts — the shop legitimately
  // releases a lot with a noted reservation — but a 'fail' or no inspection at
  // all does not. Same shape as the artwork and MRN gates above: QC used to be
  // a document someone had to remember, and a job could reach Dispatch with
  // nothing inspected.
  if (action === 'complete' && targetStageType === 'qc') {
    const { data: inspections } = await supabase
      .from('qc_inspections' as any)
      .select('result')
      .eq('job_id', jobId)
      .eq('company_id', companyId)
      .is('deleted_at', null)

    const rows = (inspections ?? []) as any[]
    const passed = rows.some(i => i.result === 'pass' || i.result === 'conditional_pass')

    if (!passed) {
      return NextResponse.json(
        {
          error: rows.length === 0
            ? `Cannot complete "${targetStageName}" — no QC inspection has been recorded for this job yet.`
            : `Cannot complete "${targetStageName}" — this job's QC inspection did not pass. Record a passing inspection, or raise a reprint.`,
        },
        { status: 400 }
      )
    }
  }

  // ─── Plates / Board checks (Feature 4) — Printing stage only, on start ─────
  // Plates: HARD block — printing genuinely cannot happen without plates
  // physically issued to the job (job_plates row with no returned_at yet).
  // Board: SOFT warning only, per Mehboob's explicit call — real shop
  // practice sometimes runs a larger board in an emergency, sometimes
  // starts short and tops up mid-run, so this never blocks; it only
  // surfaces a heads-up in the response for whoever's approving the start.
  const warnings: string[] = []
  if (action === 'start' && targetStageType === 'printing') {
    const { data: activePlates } = await supabase.from('job_plates' as any)
      .select('id').eq('job_id', jobId).eq('company_id', companyId)
      .is('deleted_at', null).is('returned_at', null).limit(1)

    if (!activePlates || activePlates.length === 0) {
      return NextResponse.json(
        { error: `Cannot start "${targetStageName}" — no plates have been issued to this job yet. Add plates first.` },
        { status: 400 }
      )
    }

    // (a2) Press proof — HARD block (migration 104). If this job has proof
    //      runs, the customer must have approved one before the main run
    //      starts; that approval IS the go-ahead. A job with no proof runs is
    //      completely unaffected — proofing is per-job, not mandatory, because
    //      an unchanged repeat legitimately needs no proof.
    //
    //      Scoped to production jobs: a proof run's OWN Printing stage is how
    //      the proof gets printed in the first place, so it must never be
    //      blocked by the absence of an approved proof of itself.
    if (jobForChecks?.job_kind !== 'proofing') {
      const { data: proofRuns } = await supabase.from('jobs' as any)
        .select('job_number, proof_round, proof_result')
        .eq('parent_job_id', jobId).eq('company_id', companyId)
        .eq('job_kind', 'proofing').is('deleted_at', null)

      const runs = (proofRuns ?? []) as any[]
      if (runs.length > 0 && !runs.some(r => r.proof_result === 'approved')) {
        const latest = runs.reduce((a, b) => ((b.proof_round ?? 0) > (a.proof_round ?? 0) ? b : a))
        const state = latest.proof_result === 'changes_required'
          ? 'is waiting on changes'
          : 'is still with the customer'
        return NextResponse.json(
          {
            error: `Cannot start "${targetStageName}" — no press proof has been approved yet. `
              + `${latest.job_number} (round ${latest.proof_round}) ${state}.`,
          },
          { status: 400 }
        )
      }
    }

    // (b) Reused plates on a changed repeat — SOFT, per the precedent set by
    //     the board-shortfall check right below: warn, record, don't block.
    //     Often only one plate actually changed (the black text plate carrying
    //     the expiry), so the rest are legitimately reused and a hard block
    //     would be wrong. The operator just has to be told.
    if (changedJob) {
      const { data: assigned } = await supabase.from('job_plates' as any)
        .select('is_reused, plates(plate_code, color, origin_job_id)')
        .eq('job_id', jobId).eq('company_id', companyId)
        .is('deleted_at', null).is('returned_at', null)

      const reused = ((assigned ?? []) as any[]).filter(p =>
        p.is_reused === true ||
        (changedJob.parent_job_id && p.plates?.origin_job_id === changedJob.parent_job_id))

      if (reused.length > 0) {
        const which = reused.map(p => p.plates?.plate_code || p.plates?.color).filter(Boolean).join(', ')
        const aspects: string[] = (changedJob.changed_aspects ?? []) as string[]
        warnings.push(
          `${reused.length} plate${reused.length > 1 ? 's are' : ' is'} reused from the original job`
          + (which ? ` (${which})` : '')
          + `, but this repeat changed${aspects.length ? ' ' + aspects.join(', ') : ''}.`
          + ` Check every reused plate still matches the approved artwork.`
        )
      }
    }

    const { data: jobRow } = await supabase.from('jobs' as any)
      .select('board_type_id, sheet_qty').eq('id', jobId).eq('company_id', companyId).maybeSingle()
    const boardTypeId = (jobRow as any)?.board_type_id
    const sheetQty = (jobRow as any)?.sheet_qty
    if (boardTypeId && sheetQty) {
      const { data: boardRows } = await supabase.from('board_inventory' as any)
        .select('current_stock').eq('company_id', companyId).eq('board_type_id', boardTypeId).is('deleted_at', null)
      const totalStock = ((boardRows ?? []) as any[]).reduce((sum, r) => sum + Number(r.current_stock || 0), 0)
      if (totalStock < sheetQty) {
        warnings.push(`Board stock (${totalStock}) is short of this job's required ${sheetQty} sheets — proceeding is your call.`)
      }
    }
  }

  // ─── Board Issue ↔ MRN auto-link (Feature 4, Batch 3) ──────────────────────
  // Starting the Board Issue stage auto-creates a draft MRN for this job (if
  // one doesn't already exist) with a line item pre-filled from the job's
  // board type + sheet quantity — Store still does the real work (approve,
  // pick the exact board_inventory lot, issue) through the existing Store
  // module, this just removes the "someone has to remember to raise an MRN
  // separately" manual step. Completing Board Issue is HARD-blocked until
  // that MRN reaches status 'issued' — board genuinely has to be in hand
  // before the stage can be marked done, unlike the soft board check on
  // Printing (which is about the shop's overall stock position, not this
  // specific job's requisition).
  if (action === 'start' && targetStageType === 'board_issue') {
    const { data: existingMrn } = await supabase.from('material_requisitions' as any)
      .select('id').eq('job_id', jobId).eq('company_id', companyId).is('deleted_at', null).limit(1).maybeSingle()

    if (!existingMrn) {
      const { data: jobRow } = await supabase.from('jobs' as any)
        .select('board_type_id, sheet_qty, board_types(name)').eq('id', jobId).eq('company_id', companyId).maybeSingle()
      const boardTypeName = (jobRow as any)?.board_types?.name
      const sheetQty = (jobRow as any)?.sheet_qty

      if (boardTypeName && sheetQty) {
        const { data: mrnNumber } = await (supabase as any).rpc('get_next_sequence_number', {
          p_company_id: companyId, p_document_type: 'MRN',
        })
        const { data: newMrn } = await supabase.from('material_requisitions' as any).insert({
          company_id: companyId, mrn_number: mrnNumber, job_id: jobId,
          requested_by: userTableId, status: 'pending',
          notes: 'Auto-created when Board Issue stage started',
        }).select('id').single()

        if (newMrn) {
          await supabase.from('material_requisition_items' as any).insert({
            company_id: companyId, requisition_id: (newMrn as any).id,
            material_name: boardTypeName, material_type: 'board',
            quantity_required: sheetQty,
          })
        }
      }
      // No board_type_id/sheet_qty on the job — nothing to auto-fill; Store
      // can still raise the MRN manually as before, this just doesn't
      // pre-create a placeholder MRN with no real content.
    }
  }

  if (action === 'complete' && targetStageType === 'board_issue') {
    const { data: mrnRows } = await supabase.from('material_requisitions' as any)
      .select('status').eq('job_id', jobId).eq('company_id', companyId).is('deleted_at', null)

    const hasIssuedMrn = ((mrnRows ?? []) as any[]).some(m => m.status === 'issued')
    if (!hasIssuedMrn) {
      return NextResponse.json(
        { error: `Cannot complete "${targetStageName}" — this job's material requisition hasn't been fully issued by Store yet.` },
        { status: 400 }
      )
    }
  }

  const now = new Date().toISOString()
  const updateData: Record<string, any> = {}

  if (action === 'start') {
    updateData.status = 'in_progress'
    updateData.started_at = now
  } else if (action === 'complete') {
    updateData.status = 'completed'
    updateData.completed_at = now
    updateData.completed_by = userTableId
    if (notes) updateData.notes = notes
  } else if (action === 'skip') {
    updateData.status = 'skipped'
    if (notes) updateData.notes = notes
  }

  const { data, error } = await supabase.from('job_stage_progress' as any)
    .update(updateData)
    .eq('id', stage_progress_id)
    .eq('company_id', companyId)
    .select('*, workflow_stages(name)')
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  const stageName = (data as any)?.workflow_stages?.name || 'Stage'

  // Record event
  await recordJobEvent({
    company_id: companyId,
    job_id: params.id,
    event_type: action === 'start' ? 'stage_started' : action === 'complete' ? 'stage_completed' : 'stage_skipped',
    new_value: stageName,
    notes: notes || null,
    stage_id: stage_progress_id,
    actor_id: userTableId,
  }, supabase)

  // First activity on the job takes it out of 'new'.
  if (action === 'start') {
    await supabase.from('jobs' as any)
      .update({ status: 'in_progress' })
      .eq('id', params.id)
      .eq('company_id', companyId)
      .eq('status', 'new')
  }

  // Keep "which stage is this job on" true after every transition, not just
  // the first start — start, complete and skip all move it. Bookkeeping only:
  // the stage change itself is already committed above, so this never fails
  // the request.
  await syncJobCurrentStage(supabase, companyId, jobId).catch(() => null)

  // Auto-notify whichever department owns the next stage(s) that just
  // became startable — best-effort, never blocks the response.
  let jobClosed = false
  if (action === 'complete' || action === 'skip') {
    await notifyNewlyUnblockedStages(supabase, companyId, jobId).catch(() => null)

    // Was that the last stage? Then the job itself is done — nothing else was
    // ever moving it out of 'in_progress'.
    jobClosed = await closeJobIfWorkflowDone(supabase, companyId, jobId).catch(() => false)

    if (jobClosed) {
      await recordJobEvent({
        company_id: companyId,
        job_id: params.id,
        event_type: 'status_changed',
        old_value: 'in_progress',
        new_value: 'completed',
        notes: 'All workflow stages finished',
        actor_id: userTableId,
      }, supabase)
    }
  }

  return NextResponse.json({
    data,
    ...(jobClosed ? { job_completed: true } : {}),
    ...(warnings.length > 0 ? { warnings } : {}),
  })
})
