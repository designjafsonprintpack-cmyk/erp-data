import { NextResponse, type NextRequest } from 'next/server'
import { createSupabaseServerClient } from '@/lib/supabase/server'
import { getCompanyId } from '@/lib/utils/getCompanyId'
import { recordJobEvent, initializeJobWorkflow } from '@/modules/jobs/services/jobEventService'

export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  const supabase = createSupabaseServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const companyId = await getCompanyId(user, supabase)
  const body = await req.json()

  const { data: rpr } = await supabase.from('reprint_requests' as any)
    .select('*, jobs!reprint_requests_original_job_id_fkey(*)')
    .eq('id', params.id).single()
  if (!rpr) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  const req_ = rpr as any

  if (body.action === 'approve') {
    // Create a new repeat job for the re-print
    const origJob = req_.jobs
    const { data: jobNum } = await (supabase as any).rpc('get_next_sequence_number', {
      p_company_id: companyId, p_document_type: 'JOB',
    })

    const { data: newJob } = await supabase.from('jobs' as any).insert({
      company_id:           companyId,
      job_number:           jobNum,
      parent_job_id:        origJob.id,
      is_repeat:            true,
      repeat_sequence:      99, // reprint flag
      customer_id:          origJob.customer_id,
      job_title:            `${origJob.job_title} (Re-print)`,
      description:          `Re-print: ${req_.reason}`,
      size_l:               origJob.size_l, size_w: origJob.size_w, size_h: origJob.size_h,
      sheet_size:           origJob.sheet_size,
      quantity:             req_.quantity,
      no_of_colors:         origJob.no_of_colors,
      die_number:           origJob.die_number,
      board_type_id:        origJob.board_type_id,
      lamination_type_id:   origJob.lamination_type_id,
      uv_coating:           origJob.uv_coating,
      foil_type_id:         origJob.foil_type_id,
      special_finishing:    origJob.special_finishing,
      pasting:              origJob.pasting,
      workflow_template_id: origJob.workflow_template_id,
      priority:             req_.priority,
      status:               'new',
    }).select().single()

    if (newJob && origJob.workflow_template_id) {
      await initializeJobWorkflow((newJob as any).id, origJob.workflow_template_id, companyId, supabase)
    }

    const { data, error } = await supabase.from('reprint_requests' as any).update({
      status:         'approved',
      approved_by:    user.id,
      approved_at:    new Date().toISOString(),
      reprint_job_id: (newJob as any)?.id || null,
    }).eq('id', params.id).select().single()

    if (error) return NextResponse.json({ error: error.message }, { status: 500 })

    await recordJobEvent({
      company_id: companyId,
      job_id:     req_.original_job_id,
      event_type: 'repeat_created',
      new_value:  `Re-print job ${(newJob as any)?.job_number} created`,
      actor_id:   user.id,
    }, supabase)

    return NextResponse.json({ data, reprint_job: newJob })
  }

  if (body.action === 'reject') {
    const { data, error } = await supabase.from('reprint_requests' as any).update({
      status: 'rejected',
      notes:  body.notes || null,
    }).eq('id', params.id).select().single()
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json({ data })
  }

  const { data, error } = await supabase.from('reprint_requests' as any)
    .update(body).eq('id', params.id).select().single()
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ data })
}
