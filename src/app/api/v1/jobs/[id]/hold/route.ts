import { NextResponse, type NextRequest } from 'next/server'
import { createSupabaseServerClient } from '@/lib/supabase/server'
import { getCompanyId } from '@/lib/utils/getCompanyId'
import { getUserTableId } from '@/lib/utils/getUserTableId'
import { requirePermission } from '@/lib/utils/requirePermission'
import { recordJobEvent } from '@/modules/jobs/services/jobEventService'
import { withErrorHandling } from '@/lib/utils/apiHandler'
import { parseBody } from '@/lib/utils/validate'
import { jobHoldSchema } from '@/lib/schemas/jobActions'

export const POST = withErrorHandling(async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const supabase = createSupabaseServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const companyId = await getCompanyId(user, supabase)
  const userTableId = await getUserTableId(user, supabase)
  const denied = await requirePermission(userTableId, 'jobs', 'edit', supabase)
  if (denied) return denied


  const parsed = await parseBody(req, jobHoldSchema)
  if ('error' in parsed) return parsed.error
  const { hold_reason_id, hold_notes } = parsed.data

  // Fetch current job state
  const { data: job } = await supabase.from('jobs' as any)
    .select('status, is_on_hold').eq('id', params.id).eq('company_id', companyId).single()

  if (!job) return NextResponse.json({ error: 'Job not found' }, { status: 404 })
  if ((job as any).is_on_hold) return NextResponse.json({ error: 'Job is already on hold' }, { status: 400 })

  const { data, error } = await supabase.from('jobs' as any).update({
    is_on_hold: true,
    hold_reason_id,
    hold_notes: hold_notes || null,
    hold_started_at: new Date().toISOString(),
    status: 'on_hold',
  }).eq('id', params.id).eq('company_id', companyId).select().single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  await recordJobEvent({
    company_id: companyId,
    job_id: params.id,
    event_type: 'hold_started',
    old_value: (job as any).status,
    new_value: 'on_hold',
    notes: hold_notes || null,
    actor_id: userTableId,
  }, supabase)

  return NextResponse.json({ data })
})
