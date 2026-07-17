import { NextResponse, type NextRequest } from 'next/server'
import { createSupabaseServerClient } from '@/lib/supabase/server'
import { getCompanyId } from '@/lib/utils/getCompanyId'
import { getUserTableId } from '@/lib/utils/getUserTableId'
import { recordJobEvent } from '@/modules/jobs/services/jobEventService'

export async function GET(_: NextRequest, { params }: { params: { id: string } }) {
  const supabase = createSupabaseServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { data, error } = await supabase.from('qc_inspections' as any)
    .select(`
      *,
      jobs(job_number,job_title,quantity,customers(name)),
      qc_templates(name),
      qc_checklist_responses(*),
      qc_defects(*)
    `)
    .eq('id', params.id).single()

  if (error) return NextResponse.json({ error: 'Not found' }, { status: 404 })
  return NextResponse.json({ data })
}

export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  const supabase = createSupabaseServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const companyId = await getCompanyId(user, supabase)
  const userTableId = await getUserTableId(user, supabase)
  const body = await req.json()

  // Sign-off action — Phase 40
  if (body.action === 'signoff') {
    const { data: current } = await supabase.from('qc_inspections' as any)
      .select('job_id, result, inspection_no').eq('id', params.id).single()

    const { data, error } = await supabase.from('qc_inspections' as any).update({
      signed_off_by: userTableId,
      signed_off_at: new Date().toISOString(),
      result:        body.result || (current as any)?.result,
      notes:         body.notes || null,
    }).eq('id', params.id).select().single()

    if (error) return NextResponse.json({ error: error.message }, { status: 500 })

    const curr = current as any
    const result = body.result || curr?.result

    // Update job status based on QC result
    if (result === 'pass') {
      await supabase.from('jobs' as any)
        .update({ status: 'completed' })
        .eq('id', curr.job_id)
        .eq('status', 'in_progress')
    }

    await recordJobEvent({
      company_id: companyId,
      job_id:     curr.job_id,
      event_type: 'status_changed',
      new_value:  `QC Sign-off #${curr.inspection_no}: ${result?.toUpperCase()}`,
      actor_id:   userTableId,
    }, supabase)

    return NextResponse.json({ data })
  }

  // Generic patch
  const { data, error } = await supabase.from('qc_inspections' as any)
    .update(body).eq('id', params.id).select().single()
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ data })
}
