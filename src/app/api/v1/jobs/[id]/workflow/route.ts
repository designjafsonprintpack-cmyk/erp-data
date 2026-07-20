import { NextResponse, type NextRequest } from 'next/server'
import { createSupabaseServerClient } from '@/lib/supabase/server'
import { getCompanyId } from '@/lib/utils/getCompanyId'
import { getUserTableId } from '@/lib/utils/getUserTableId'
import { requirePermission } from '@/lib/utils/requirePermission'
import { recordJobEvent } from '@/modules/jobs/services/jobEventService'
import { withErrorHandling } from '@/lib/utils/apiHandler'

// PATCH — advance a stage (start / complete / skip)
export const PATCH = withErrorHandling(async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  const supabase = createSupabaseServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const companyId = await getCompanyId(user, supabase)
  const userTableId = await getUserTableId(user, supabase)
  const denied = await requirePermission(userTableId, 'jobs', 'edit', supabase)
  if (denied) return denied

  const { stage_progress_id, action, notes } = await req.json()
  // action: 'start' | 'complete' | 'skip'

  if (!['start', 'complete', 'skip'].includes(action)) {
    return NextResponse.json({ error: 'Invalid action' }, { status: 400 })
  }

  // Load the stage being acted on — needed for the sequential/artwork checks below.
  const { data: targetStage, error: targetErr } = await supabase
    .from('job_stage_progress' as any)
    .select('id, job_id, sequence_order, workflow_stages(name, stage_type)')
    .eq('id', stage_progress_id)
    .eq('company_id', companyId)
    .single()

  if (targetErr || !targetStage) {
    return NextResponse.json({ error: 'Stage not found' }, { status: 404 })
  }

  const targetStageName = (targetStage as any).workflow_stages?.name || 'Stage'
  const targetStageType = (targetStage as any).workflow_stages?.stage_type || null
  const sequenceOrder = (targetStage as any).sequence_order
  const jobId = (targetStage as any).job_id

  // ─── Hard sequential enforcement ───────────────────────────────────────────
  // A stage can only be started, completed, or skipped once every earlier
  // stage in the same job's workflow is itself completed or skipped.
  const { data: earlierStages } = await supabase
    .from('job_stage_progress' as any)
    .select('status, workflow_stages(name)')
    .eq('job_id', jobId)
    .eq('company_id', companyId)
    .lt('sequence_order', sequenceOrder)

  const blocking = ((earlierStages ?? []) as any[]).filter(
    (s) => !['completed', 'skipped'].includes(s.status)
  )
  if (blocking.length > 0) {
    const names = blocking.map((s) => s.workflow_stages?.name || 'a previous stage').join(', ')
    return NextResponse.json(
      { error: `Cannot update "${targetStageName}" — earlier stage(s) not yet finished: ${names}` },
      { status: 400 }
    )
  }

  // ─── Artwork approval gate ──────────────────────────────────────────────────
  // The artwork stage cannot be marked complete until a version of this job's
  // artwork has status = 'approved'. Matches on workflow_stages.stage_type
  // ('artwork'), not the stage's display name — renaming the stage in a
  // template no longer silently disables this gate the way name-matching did.
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

  return NextResponse.json({ data })
})
