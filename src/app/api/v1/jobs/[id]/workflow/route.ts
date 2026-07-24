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
  if (action === 'complete' && targetStageType === 'artwork') {
    const { data: approvedArtwork } = await supabase
      .from('job_artworks' as any)
      .select('id')
      .eq('job_id', jobId)
      .eq('company_id', companyId)
      .eq('status', 'approved')
      .is('deleted_at', null)
      .limit(1)
      .maybeSingle()

    if (!approvedArtwork) {
      return NextResponse.json(
        { error: `Cannot complete "${targetStageName}" — no approved artwork version exists for this job yet.` },
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

  // If completing: update job status to in_progress if it was 'new'
  if (action === 'start') {
    await supabase.from('jobs' as any)
      .update({ status: 'in_progress', current_stage_id: stage_progress_id })
      .eq('id', params.id)
      .eq('company_id', companyId)
      .eq('status', 'new')
  }

  // Auto-notify whichever department owns the next stage(s) that just
  // became startable — best-effort, never blocks the response.
  if (action === 'complete' || action === 'skip') {
    await notifyNewlyUnblockedStages(supabase, companyId, jobId).catch(() => null)
  }

  return NextResponse.json({ data, ...(warnings.length > 0 ? { warnings } : {}) })
})
