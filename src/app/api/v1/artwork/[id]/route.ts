import { NextResponse, type NextRequest } from 'next/server'
import { createSupabaseServerClient } from '@/lib/supabase/server'
import { getCompanyId } from '@/lib/utils/getCompanyId'
import { getUserTableId } from '@/lib/utils/getUserTableId'
import { requirePermission } from '@/lib/utils/requirePermission'
import { recordJobEvent } from '@/modules/jobs/services/jobEventService'
import { notifyArtworkStatusChange } from '@/lib/utils/notifyArtworkStatusChange'
import { syncJobCurrentStage } from '@/lib/utils/syncJobCurrentStage'
import { withErrorHandling } from '@/lib/utils/apiHandler'
import { parseBody } from '@/lib/utils/validate'
import { artworkUpdateSchema } from '@/lib/schemas/artwork'

const VALID_STATUSES = [
  'draft', 'internal_review', 'waiting_customer_approval',
  'changes_requested', 'approved', 'rejected', 'archived',
]

export const PATCH = withErrorHandling(async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  const supabase = createSupabaseServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const companyId = await getCompanyId(user, supabase)
  const userTableId = await getUserTableId(user, supabase)

  const parsed = await parseBody(req, artworkUpdateSchema)
  if ('error' in parsed) return parsed.error
  const body = parsed.data

  if (body.status !== undefined && !VALID_STATUSES.includes(body.status)) {
    return NextResponse.json({ error: `Invalid status. Must be one of: ${VALID_STATUSES.join(', ')}` }, { status: 400 })
  }

  // Moving to Approved or Rejected is an approval-type decision; anything
  // else (Draft/Internal Review/renaming/notes) is a regular edit.
  const isApprovalDecision = body.status === 'approved' || body.status === 'rejected'
  const denied = await requirePermission(
    userTableId, 'artwork', isApprovalDecision ? 'approve' : 'edit', supabase
  )
  if (denied) return denied

  const { data: current } = await supabase
    .from('job_artworks' as any).select('job_id, status, version').eq('id', params.id).eq('company_id', companyId).single()
  if (!current) return NextResponse.json({ error: 'Not found' }, { status: 404 })
  const currentRow = current as any

  // approved_at/approved_by/is_production_ready are server-derived from
  // status, not client-settable — built as a separate update payload
  // (rather than mutating the validated body) so a client can never spoof
  // who/when something was approved by sending those fields directly.
  const updatePayload: Record<string, any> = { ...body }

  if (body.status === 'approved') {
    // A new approved version supersedes any previously-approved version of
    // the same job (rather than leaving two versions both marked approved).
    await supabase.from('job_artworks' as any)
      .update({ status: 'archived', is_production_ready: false })
      .eq('job_id', currentRow.job_id)
      .eq('company_id', companyId)
      .eq('status', 'approved')
      .neq('id', params.id)

    updatePayload.approved_at = new Date().toISOString()
    updatePayload.approved_by = userTableId
  }

  // is_production_ready is kept in sync as a derived/mirrored field —
  // still what older callers might read during the transition, even though
  // the production gate itself now reads `status` directly. Only ever true
  // for the single approved version of a job.
  if (body.status !== undefined) {
    updatePayload.is_production_ready = body.status === 'approved'
  }

  const { data, error } = await supabase.from('job_artworks' as any)
    .update(updatePayload).eq('id', params.id).eq('company_id', companyId).select().single()
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  if (body.status !== undefined && body.status !== currentRow.status) {
    await recordJobEvent({
      company_id: companyId, job_id: currentRow.job_id,
      event_type: 'artwork_status_changed',
      old_value: `v${currentRow.version}: ${currentRow.status}`,
      new_value: `v${currentRow.version}: ${body.status}`,
      actor_id: userTableId,
    }, supabase)

    await notifyArtworkStatusChange(supabase, {
      companyId, jobId: currentRow.job_id, artworkVersion: currentRow.version, newStatus: body.status,
    })

    // ─── Auto-start the Artwork workflow stage ───────────────────────────────
    // Moving a version to "Waiting Customer Approval" is the real-world signal
    // that artwork work has begun and the design has gone out to the customer —
    // now on WhatsApp. Staff shouldn't have to separately remember to also
    // click Start on the Artwork stage.
    //
    // This lived in POST /artwork/[id]/approval-link, which fired on generating
    // the customer approval link. That link was retired, and this behaviour
    // moved here rather than being lost with it: the trigger is the same event,
    // it is just recorded by hand now instead of by the link.
    //
    // Only acts if the stage is still 'pending' — a stage already started,
    // completed or skipped is left alone — and only if no earlier stage is
    // unfinished, the same hard sequential rule /api/v1/jobs/[id]/workflow
    // enforces. If blocked it silently does nothing rather than failing the
    // status change for a sequencing reason nobody can fix from this screen.
    if (body.status === 'waiting_customer_approval') {
      const { data: artworkStage } = await supabase.from('job_stage_progress' as any)
        .select('id, status, sequence_order, workflow_stages!inner(stage_type)')
        .eq('job_id', currentRow.job_id).eq('company_id', companyId)
        .in('workflow_stages.stage_type', ['artwork', 'artwork_approval'])
        .maybeSingle()

      const stage = artworkStage as any
      if (stage && stage.status === 'pending') {
        const { data: earlierStages } = await supabase.from('job_stage_progress' as any)
          .select('status').eq('job_id', currentRow.job_id).eq('company_id', companyId)
          .lt('sequence_order', stage.sequence_order)

        const blocked = ((earlierStages ?? []) as any[]).some(e => !['completed', 'skipped'].includes(e.status))
        if (!blocked) {
          await supabase.from('job_stage_progress' as any)
            .update({ status: 'in_progress', started_at: new Date().toISOString() })
            .eq('id', stage.id)

          await recordJobEvent({
            company_id: companyId, job_id: currentRow.job_id,
            event_type: 'stage_started',
            new_value: 'Artwork',
            notes: 'Auto-started — artwork sent for customer approval',
            stage_id: stage.id, actor_id: userTableId,
          }, supabase)

          // Mirrors the "first activity on this job" transition the manual
          // stage-start performs, including the current-stage bookkeeping, so
          // both paths leave the job pointing at the same live stage.
          await supabase.from('jobs' as any)
            .update({ status: 'in_progress' })
            .eq('id', currentRow.job_id).eq('company_id', companyId)
            .eq('status', 'new')

          await syncJobCurrentStage(supabase, companyId, currentRow.job_id).catch(() => null)
        }
      }
    }
  }

  return NextResponse.json({ data })
})

export const DELETE = withErrorHandling(async function DELETE(_: NextRequest, { params }: { params: { id: string } }) {
  const supabase = createSupabaseServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const companyId = await getCompanyId(user, supabase)
  const userTableId = await getUserTableId(user, supabase)
  const denied = await requirePermission(userTableId, 'artwork', 'delete', supabase)
  if (denied) return denied

  const { error } = await supabase.from('job_artworks' as any)
    .update({ deleted_at: new Date().toISOString(), is_active: false })
    .eq('id', params.id).eq('company_id', companyId)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ success: true })
})
