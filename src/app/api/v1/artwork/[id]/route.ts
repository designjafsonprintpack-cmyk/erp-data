import { NextResponse, type NextRequest } from 'next/server'
import { createSupabaseServerClient } from '@/lib/supabase/server'
import { getCompanyId } from '@/lib/utils/getCompanyId'
import { getUserTableId } from '@/lib/utils/getUserTableId'
import { requirePermission } from '@/lib/utils/requirePermission'
import { recordJobEvent } from '@/modules/jobs/services/jobEventService'
import { notifyArtworkStatusChange } from '@/lib/utils/notifyArtworkStatusChange'
import { autoStartArtworkStage } from '@/lib/utils/autoStartArtworkStage'
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
    .from('job_artworks' as any).select('job_id, status, version, design_no').eq('id', params.id).eq('company_id', companyId).single()
  if (!current) return NextResponse.json({ error: 'Not found' }, { status: 404 })
  const currentRow = current as any

  // approved_at/approved_by/is_production_ready are server-derived from
  // status, not client-settable — built as a separate update payload
  // (rather than mutating the validated body) so a client can never spoof
  // who/when something was approved by sending those fields directly.
  const updatePayload: Record<string, any> = { ...body }

  if (body.status === 'approved') {
    // A new approved version supersedes the previously-approved version of the
    // SAME DESIGN (rather than leaving two versions both marked approved).
    //
    // Scoped to design_no since 124. Job-wide — which is what this did — it
    // archived design 1's approval the moment design 2 was approved, and the
    // gate wants EVERY design approved, so a two-design job could never clear
    // it: approving the base un-approved the lid and vice versa.
    await supabase.from('job_artworks' as any)
      .update({ status: 'archived', is_production_ready: false })
      .eq('job_id', currentRow.job_id)
      .eq('company_id', companyId)
      .eq('design_no', currentRow.design_no ?? 1)
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

    // Auto-start the Artwork stage — now shared with the upload route, which is
    // where it fires in practice (an upload IS the approval, so a version no
    // longer passes through "Waiting Customer Approval"). Kept here for a job
    // whose status is still moved by hand.
    if (body.status === 'waiting_customer_approval') {
      await autoStartArtworkStage(
        supabase, companyId, currentRow.job_id, userTableId,
        'Auto-started — artwork sent for customer approval',
      )
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
