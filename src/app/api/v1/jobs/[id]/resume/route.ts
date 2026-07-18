import { NextResponse, type NextRequest } from 'next/server'
import { createSupabaseServerClient } from '@/lib/supabase/server'
import { getCompanyId } from '@/lib/utils/getCompanyId'
import { getUserTableId } from '@/lib/utils/getUserTableId'
import { requirePermission } from '@/lib/utils/requirePermission'
import { recordJobEvent } from '@/modules/jobs/services/jobEventService'

export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const supabase = createSupabaseServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const companyId = await getCompanyId(user, supabase)
  const userTableId = await getUserTableId(user, supabase)
  const denied = await requirePermission(userTableId, 'jobs', 'edit', supabase)
  if (denied) return denied


  const { notes } = await req.json()

  const { data: job } = await supabase.from('jobs' as any)
    .select('is_on_hold').eq('id', params.id).eq('company_id', companyId).single()

  if (!job || !(job as any).is_on_hold) {
    return NextResponse.json({ error: 'Job is not on hold' }, { status: 400 })
  }

  const { data, error } = await supabase.from('jobs' as any).update({
    is_on_hold: false,
    hold_reason_id: null,
    hold_notes: null,
    hold_started_at: null,
    status: 'in_progress',
  }).eq('id', params.id).eq('company_id', companyId).select().single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  await recordJobEvent({
    company_id: companyId,
    job_id: params.id,
    event_type: 'hold_ended',
    old_value: 'on_hold',
    new_value: 'in_progress',
    notes: notes || null,
    actor_id: userTableId,
  }, supabase)

  return NextResponse.json({ data })
}
