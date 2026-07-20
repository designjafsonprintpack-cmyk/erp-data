import { NextResponse, type NextRequest } from 'next/server'
import { createSupabaseServerClient } from '@/lib/supabase/server'
import { getCompanyId } from '@/lib/utils/getCompanyId'
import { getUserTableId } from '@/lib/utils/getUserTableId'
import { requirePermission } from '@/lib/utils/requirePermission'
import { recordJobEvent } from '@/modules/jobs/services/jobEventService'
import { withErrorHandling } from '@/lib/utils/apiHandler'

// PATCH — return the plate (job is done with it). Updates the plate's own
// status based on the condition it came back in.
export const PATCH = withErrorHandling(async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  const supabase = createSupabaseServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const companyId = await getCompanyId(user, supabase)
  const userTableId = await getUserTableId(user, supabase)
  const denied = await requirePermission(userTableId, 'plates', 'edit', supabase)
  if (denied) return denied

  const body = await req.json()
  const condition = body.condition_on_return as string
  if (!['good', 'worn', 'damaged', 'discarded'].includes(condition)) {
    return NextResponse.json({ error: 'condition_on_return must be good, worn, damaged or discarded' }, { status: 400 })
  }

  const { data: assignment, error: findErr } = await supabase
    .from('job_plates' as any)
    .select('id, job_id, plate_id, plates(plate_code, color)')
    .eq('id', params.id)
    .eq('company_id', companyId)
    .is('deleted_at', null)
    .maybeSingle()

  if (findErr || !assignment) return NextResponse.json({ error: 'Assignment not found' }, { status: 404 })

  const { error: updErr } = await supabase.from('job_plates' as any).update({
    returned_at: new Date().toISOString(),
    condition_on_return: condition,
    remarks: body.remarks ?? undefined,
    updated_by: userTableId,
  }).eq('id', params.id).eq('company_id', companyId)

  if (updErr) return NextResponse.json({ error: updErr.message }, { status: 500 })

  const newPlateStatus = condition === 'good' || condition === 'worn' ? 'in_storage' : 'damaged'
  const { error: plateErr } = await supabase.from('plates' as any).update({
    status: newPlateStatus,
    retired_reason: condition === 'discarded' ? 'Discarded on return from job' : undefined,
    updated_by: userTableId,
  }).eq('id', (assignment as any).plate_id).eq('company_id', companyId)

  if (plateErr) return NextResponse.json({ error: plateErr.message }, { status: 500 })

  const plateInfo = (assignment as any).plates
  await recordJobEvent({
    company_id: companyId, job_id: (assignment as any).job_id,
    event_type: 'plate_returned',
    new_value: `${plateInfo?.plate_code} (${plateInfo?.color}) — returned ${condition}`,
    actor_id: userTableId,
  }, supabase)

  return NextResponse.json({ data: { success: true } })
})

export const DELETE = withErrorHandling(async function DELETE(req: NextRequest, { params }: { params: { id: string } }) {
  const supabase = createSupabaseServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const companyId = await getCompanyId(user, supabase)
  const userTableId = await getUserTableId(user, supabase)
  const denied = await requirePermission(userTableId, 'plates', 'delete', supabase)
  if (denied) return denied

  const { error } = await supabase
    .from('job_plates' as any)
    .update({ deleted_at: new Date().toISOString(), is_active: false, updated_by: userTableId })
    .eq('id', params.id)
    .eq('company_id', companyId)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ data: { success: true } })
})
