import { NextResponse, type NextRequest } from 'next/server'
import { createSupabaseServerClient } from '@/lib/supabase/server'
import { getCompanyId } from '@/lib/utils/getCompanyId'
import { recordJobEvent } from '@/modules/jobs/services/jobEventService'

// PATCH — advance a stage (start / complete / skip)
export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  const supabase = createSupabaseServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const companyId = await getCompanyId(user, supabase)
  const { stage_progress_id, action, notes } = await req.json()
  // action: 'start' | 'complete' | 'skip'

  if (!['start', 'complete', 'skip'].includes(action)) {
    return NextResponse.json({ error: 'Invalid action' }, { status: 400 })
  }

  const now = new Date().toISOString()
  const updateData: Record<string, any> = {}

  if (action === 'start') {
    updateData.status = 'in_progress'
    updateData.started_at = now
  } else if (action === 'complete') {
    updateData.status = 'completed'
    updateData.completed_at = now
    updateData.completed_by = user.id
    if (notes) updateData.notes = notes
  } else if (action === 'skip') {
    updateData.status = 'skipped'
    if (notes) updateData.notes = notes
  }

  const { data, error } = await supabase.from('job_stage_progress' as any)
    .update(updateData)
    .eq('id', stage_progress_id)
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
    actor_id: user.id,
  }, supabase)

  // If completing: update job status to in_progress if it was 'new'
  if (action === 'start') {
    await supabase.from('jobs' as any)
      .update({ status: 'in_progress', current_stage_id: stage_progress_id })
      .eq('id', params.id)
      .eq('status', 'new')
  }

  return NextResponse.json({ data })
}
