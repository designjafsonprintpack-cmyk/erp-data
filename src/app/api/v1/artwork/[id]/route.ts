import { NextResponse, type NextRequest } from 'next/server'
import { createSupabaseServerClient } from '@/lib/supabase/server'
import { getCompanyId } from '@/lib/utils/getCompanyId'
import { getUserTableId } from '@/lib/utils/getUserTableId'
import { requirePermission } from '@/lib/utils/requirePermission'
import { recordJobEvent } from '@/modules/jobs/services/jobEventService'
import { notifyArtworkStatusChange } from '@/lib/utils/notifyArtworkStatusChange'
import { withErrorHandling } from '@/lib/utils/apiHandler'

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

  const body = await req.json()

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

  if (body.status === 'approved') {
    // A new approved version supersedes any previously-approved version of
    // the same job (rather than leaving two versions both marked approved).
    await supabase.from('job_artworks' as any)
      .update({ status: 'archived', is_production_ready: false })
      .eq('job_id', currentRow.job_id)
      .eq('company_id', companyId)
      .eq('status', 'approved')
      .neq('id', params.id)

    body.approved_at = new Date().toISOString()
    body.approved_by = userTableId
  }

  // is_production_ready is kept in sync as a derived/mirrored field —
  // still what older callers might read during the transition, even though
  // the production gate itself now reads `status` directly. Only ever true
  // for the single approved version of a job.
  if (body.status !== undefined) {
    body.is_production_ready = body.status === 'approved'
  }

  const { data, error } = await supabase.from('job_artworks' as any)
    .update(body).eq('id', params.id).eq('company_id', companyId).select().single()
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
