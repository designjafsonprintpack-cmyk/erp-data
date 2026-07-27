import { NextResponse, type NextRequest } from 'next/server'
import { createSupabaseServerClient } from '@/lib/supabase/server'
import { getCompanyId } from '@/lib/utils/getCompanyId'
import { getUserTableId } from '@/lib/utils/getUserTableId'
import { requirePermission } from '@/lib/utils/requirePermission'
import { recordJobEvent } from '@/modules/jobs/services/jobEventService'
import { withErrorHandling } from '@/lib/utils/apiHandler'
import { parseBody } from '@/lib/utils/validate'
import { jobInkSchema } from '@/lib/schemas/jobActions'

// Ink consumed on a job (migration 102). Deliberately the same shape as the
// wastage route next door — the same operator records both from the same
// screen, so they behave identically.

export const GET = withErrorHandling(async function GET(_req: NextRequest, { params }: { params: { id: string } }) {
  const supabase = createSupabaseServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const companyId = await getCompanyId(user, supabase)

  const { data, error } = await supabase
    .from('job_ink_usage' as any)
    .select('*, ink_types(name,color_code), machines(name), users(full_name)')
    .eq('job_id', params.id)
    .eq('company_id', companyId)
    .is('deleted_at', null)
    .order('occurred_at', { ascending: false })

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ data: data ?? [] })
})

export const POST = withErrorHandling(async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const supabase = createSupabaseServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const companyId = await getCompanyId(user, supabase)
  const userTableId = await getUserTableId(user, supabase)
  const denied = await requirePermission(userTableId, 'jobs', 'edit', supabase)
  if (denied) return denied

  const parsed = await parseBody(req, jobInkSchema)
  if ('error' in parsed) return parsed.error
  const body = parsed.data

  const quantityKg = parseFloat(String(body.quantity_kg ?? '0'))
  if (!quantityKg || quantityKg <= 0) {
    return NextResponse.json({ error: 'Quantity must be greater than 0' }, { status: 400 })
  }

  // recorded_by is a FK to public.users(id), which is NOT the Supabase auth id
  // — same note as the wastage route.
  const { data, error } = await supabase.from('job_ink_usage' as any).insert({
    company_id:        companyId,
    job_id:            params.id,
    stage_progress_id: body.stage_progress_id || null,
    machine_id:        body.machine_id || null,
    ink_type_id:       body.ink_type_id,
    quantity_kg:       quantityKg,
    shift:             body.shift || null,
    notes:             body.notes || null,
    recorded_by:       userTableId || null,
  }).select('*, ink_types(name,color_code), machines(name)').single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  const inkName = (data as any)?.ink_types?.name || 'Ink'
  await recordJobEvent({
    company_id: companyId,
    job_id: params.id,
    event_type: 'ink_recorded',
    new_value: `${quantityKg} kg ${inkName}${body.shift ? ` (Shift ${body.shift})` : ''}`,
    notes: body.notes || null,
    actor_id: userTableId || null,
  }, supabase)

  return NextResponse.json({ data })
})
