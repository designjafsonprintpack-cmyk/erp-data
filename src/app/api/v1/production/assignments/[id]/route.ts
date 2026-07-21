import { NextResponse, type NextRequest } from 'next/server'
import { createSupabaseServerClient } from '@/lib/supabase/server'
import { getCompanyId } from '@/lib/utils/getCompanyId'
import { getUserTableId } from '@/lib/utils/getUserTableId'
import { requirePermission } from '@/lib/utils/requirePermission'
import { recordJobEvent } from '@/modules/jobs/services/jobEventService'
import { withErrorHandling } from '@/lib/utils/apiHandler'
import { parseBody } from '@/lib/utils/validate'
import { productionAssignmentUpdateSchema } from '@/lib/schemas/production'

export const GET = withErrorHandling(async function GET(_: NextRequest, { params }: { params: { id: string } }) {
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
})

export const PATCH = withErrorHandling(async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  const supabase = createSupabaseServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const companyId = await getCompanyId(user, supabase)
  const userTableId = await getUserTableId(user, supabase)
  const denied = await requirePermission(userTableId, 'production', 'edit', supabase)
  if (denied) return denied

  const parsed = await parseBody(req, productionAssignmentUpdateSchema)
  if ('error' in parsed) return parsed.error
  const body = parsed.data
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

      // Re-check for scheduling conflicts whenever the machine, start time,
      // or duration changes. The POST /production/assignments route already
      // does this on create — this closes the gap where editing an existing
      // assignment (reschedule, machine reassignment) bypassed the check
      // entirely, allowing a double-booking the create-time check exists
      // specifically to prevent.
      {
        const effectiveMachineId = updateData.machine_id ?? (current as any).machine_id
        const effectiveStart = updateData.scheduled_start !== undefined ? updateData.scheduled_start : (current as any).scheduled_start
        const effectiveMinutes = updateData.estimated_minutes !== undefined ? updateData.estimated_minutes : (current as any).estimated_minutes

        if (effectiveStart && effectiveMinutes) {
          const newStart = new Date(effectiveStart)
          const newEnd = new Date(newStart.getTime() + Number(effectiveMinutes) * 60000)

          const { data: existing } = await supabase.from('production_assignments' as any)
            .select('scheduled_start, estimated_minutes, jobs(job_number)')
            .eq('machine_id', effectiveMachineId)
            .eq('company_id', companyId)
            .neq('id', params.id)
            .in('status', ['queued', 'running', 'paused'])
            .is('deleted_at', null)
            .not('scheduled_start', 'is', null)
            .not('estimated_minutes', 'is', null)

          const conflict = ((existing ?? []) as any[]).find(a => {
            const aStart = new Date(a.scheduled_start)
            const aEnd = new Date(aStart.getTime() + a.estimated_minutes * 60000)
            return newStart < aEnd && aStart < newEnd
          })

          if (conflict) {
            return NextResponse.json({
              error: `This machine is already scheduled for job ${conflict.jobs?.job_number || 'another job'} ` +
                     `from ${new Date(conflict.scheduled_start).toLocaleString()} for ${conflict.estimated_minutes} min — overlaps with the requested time.`,
            }, { status: 400 })
          }
        }
      }
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
      quantity_done: quantity_done ? parseFloat(String(quantity_done)) : null,
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
})

export const DELETE = withErrorHandling(async function DELETE(_: NextRequest, { params }: { params: { id: string } }) {
  const supabase = createSupabaseServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const companyId = await getCompanyId(user, supabase)

  const { error } = await supabase.from('production_assignments' as any)
    .update({ deleted_at: new Date().toISOString(), is_active: false, status: 'cancelled' })
    .eq('id', params.id).eq('company_id', companyId)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ success: true })
})
