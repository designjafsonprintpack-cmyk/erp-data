import { NextResponse, type NextRequest } from 'next/server'
import { createSupabaseServerClient } from '@/lib/supabase/server'
import { getCompanyId } from '@/lib/utils/getCompanyId'
import { recordJobEvent } from '@/modules/jobs/services/jobEventService'

export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const supabase = createSupabaseServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const companyId = user.app_metadata?.company_id
    || user.user_metadata?.company_id
    || (user.app_metadata as any)?.claims?.app_metadata?.company_id

  const { hold_reason_id, hold_notes } = await req.json()
  if (!hold_reason_id) return NextResponse.json({ error: 'Delay reason is required' }, { status: 400 })

  // Fetch current job state
  const { data: job } = await supabase.from('jobs' as any)
    .select('status, is_on_hold').eq('id', params.id).single()

  if (!job) return NextResponse.json({ error: 'Job not found' }, { status: 404 })
  if ((job as any).is_on_hold) return NextResponse.json({ error: 'Job is already on hold' }, { status: 400 })

  const { data, error } = await supabase.from('jobs' as any).update({
    is_on_hold: true,
    hold_reason_id,
    hold_notes: hold_notes || null,
    hold_started_at: new Date().toISOString(),
    status: 'on_hold',
  }).eq('id', params.id).select().single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  await recordJobEvent({
    company_id: companyId,
    job_id: params.id,
    event_type: 'hold_started',
    old_value: (job as any).status,
    new_value: 'on_hold',
    notes: hold_notes || null,
    actor_id: user.id,
  }, supabase)

  return NextResponse.json({ data })
}
