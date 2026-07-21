import { NextResponse, type NextRequest } from 'next/server'
import { createSupabaseServerClient } from '@/lib/supabase/server'
import { getCompanyId } from '@/lib/utils/getCompanyId'
import { getUserTableId } from '@/lib/utils/getUserTableId'
import { requirePermission } from '@/lib/utils/requirePermission'
import { recordJobEvent } from '@/modules/jobs/services/jobEventService'
import { withErrorHandling } from '@/lib/utils/apiHandler'
import { parseBody } from '@/lib/utils/validate'
import { jobWastageSchema } from '@/lib/schemas/jobActions'

export const GET = withErrorHandling(async function GET(_req: NextRequest, { params }: { params: { id: string } }) {
  const supabase = createSupabaseServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const companyId = await getCompanyId(user, supabase)

  const { data, error } = await supabase
    .from('job_wastage' as any)
    .select('*, wastage_reasons(name,category), machines(name), users(full_name)')
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
  const parsed = await parseBody(req, jobWastageSchema)
  if ('error' in parsed) return parsed.error
  const body = parsed.data

  const quantity = parseFloat(String(body.quantity ?? '0'))
  if (!quantity || quantity <= 0) return NextResponse.json({ error: 'Quantity must be greater than 0' }, { status: 400 })

  // recorded_by / actor_id below are FKs to public.users(id) — NOT the same UUID
  // as user.id (the Supabase auth id). Resolve the real public.users.id from the
  // JWT's user_table_id claim (set by custom_access_token_hook) so this insert
  // doesn't fail a foreign key check for any user created the correct way.

  const { data, error } = await supabase.from('job_wastage' as any).insert({
    company_id:        companyId,
    job_id:             params.id,
    stage_progress_id:  body.stage_progress_id || null,
    machine_id:         body.machine_id || null,
    wastage_reason_id:  body.wastage_reason_id,
    quantity,
    notes:              body.notes || null,
    recorded_by:        userTableId || null,
  }).select('*, wastage_reasons(name,category), machines(name)').single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  const reasonName = (data as any)?.wastage_reasons?.name || 'Unknown reason'
  await recordJobEvent({
    company_id: companyId,
    job_id: params.id,
    event_type: 'wastage_recorded',
    new_value: `${quantity} (${reasonName})`,
    notes: body.notes || null,
    actor_id: userTableId || null,
  }, supabase)

  return NextResponse.json({ data })
})
