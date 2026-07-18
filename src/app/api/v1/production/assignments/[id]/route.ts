import { NextResponse, type NextRequest } from 'next/server'
import { createSupabaseServerClient } from '@/lib/supabase/server'
import { getCompanyId } from '@/lib/utils/getCompanyId'
import { getUserTableId } from '@/lib/utils/getUserTableId'
import { requirePermission } from '@/lib/utils/requirePermission'
import { recordJobEvent } from '@/modules/jobs/services/jobEventService'

export async function GET(_: NextRequest, { params }: { params: { id: string } }) {
  const supabase = createSupabaseServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const companyId = await getCompanyId(user, supabase)

  const [asgn, logs] = await Promise.all([
    supabase.from('production_assignments' as any)
      .select('*, jobs(job_number,job_title,priority,quantity,required_date,customers(name)), machines(name,machine_type), users(full_name)')
      .eq('id', params.id).eq('company_id', companyId).single(),
    supabase.from('production_logs' as any)
      .select('*, users(full_name)')
      .eq('assignment_id', params.id)
      .order('occurred_at', { ascending: false }),
  ])

  if (asgn.error) return NextResponse.json({ error: 'Not found' }, { status: 404 })
  return NextResponse.json({ assignment: asgn.data, logs: logs.data ?? [] })
}

export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  const supabase = createSupabaseServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const companyId = await getCompanyId(user, supabase)
  const userTableId = await getUserTableId(user, supabase)
  const denied = await requirePermission(userTableId, 'production', 'edit', supabase)
  if (denied) return denied

  const body = await req.json()
  const { action, notes, quantity_done } = body

  // Fetch current assignment
  const { data: current } = await supabase.from('production_assignments' as any)
    .select('*, jobs(job_number)').eq('id', params.id).eq('company_id', companyId).single()
  if (!current) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  const now = new Date().toISOString()
  const updateData: Record<string, any> = {}
  let logEvent: string | null = null

  switch (action) {
    case 'start':
      updateData.status = 'running'
      updateData.actual_start = now
      logEvent = 'started'
      break
    case 'pause':
      updateData.status = 'paused'
      logEvent = 'paused'
      break
    case 'resume':
      updateData.status = 'running'
      logEvent = 'resumed'
      break
    case 'complete':
      updateData.status = 'completed'
      updateData.actual_end = now
      if ((current as any).actual_start) {
        const mins = Math.round((Date.now() - new Date((current as any).actual_start).getTime()) / 60000)
        updateData.actual_minutes = mins
      }
      logEvent = 'completed'
      break
    case 'note':
      logEvent = 'note_added'
      break
    case 'issue':
      logEvent = 'issue_reported'
      break
    default:
      // Generic patch
      Object.assign(updateData, body)
      delete updateData.action
      delete updateData.notes
      delete updateData.quantity_done
  }

  let assignment = current
  if (Object.keys(updateData).length > 0) {
    const { data, error } = await supabase.from('production_assignments' as any)
      .update(updateData).eq('id', params.id).eq('company_id', companyId).select().single()
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    assignment = data
  }

  // Write production log
  if (logEvent) {
    await supabase.from('production_logs' as any).insert({
      company_id:    companyId,
      assignment_id: params.id,
      job_id:        (current as any).job_id,
      machine_id:    (current as any).machine_id,
      event_type:    logEvent,
      notes:         notes || null,
      quantity_done: quantity_done ? parseFloat(quantity_done) : null,
      actor_id:      userTableId,
    })

    // Mirror to job timeline for key events
    if (['started', 'completed', 'issue_reported'].includes(logEvent)) {
      const machineName = (current as any).machines?.name || 'Machine'
      await recordJobEvent({
        company_id: companyId,
        job_id:     (current as any).job_id,
        event_type: logEvent === 'started'   ? 'stage_started'   :
                    logEvent === 'completed' ? 'stage_completed' : 'status_changed',
        new_value:  machineName,
        notes:      notes || null,
        actor_id:   userTableId,
      }, supabase)
    }
  }

  return NextResponse.json({ data: assignment })
}

export async function DELETE(_: NextRequest, { params }: { params: { id: string } }) {
  const supabase = createSupabaseServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const companyId = await getCompanyId(user, supabase)

  const { error } = await supabase.from('production_assignments' as any)
    .update({ deleted_at: new Date().toISOString(), is_active: false, status: 'cancelled' })
    .eq('id', params.id).eq('company_id', companyId)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ success: true })
}
