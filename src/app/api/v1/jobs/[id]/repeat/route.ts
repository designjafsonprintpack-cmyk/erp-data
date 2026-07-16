import { NextResponse, type NextRequest } from 'next/server'
import { createSupabaseServerClient } from '@/lib/supabase/server'
import { getCompanyId } from '@/lib/utils/getCompanyId'
import { recordJobEvent, initializeJobWorkflow } from '@/modules/jobs/services/jobEventService'

export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const supabase = createSupabaseServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const companyId = await getCompanyId(user, supabase)
  const { quantity, required_date, notes, same_artwork } = await req.json()

  // Fetch original job
  const { data: original, error: origErr } = await supabase.from('jobs' as any)
    .select('*').eq('id', params.id).single()

  if (origErr || !original) return NextResponse.json({ error: 'Job not found' }, { status: 404 })

  const orig = original as any

  // Count existing repeats
  const { count: repeatCount } = await supabase
    .from('jobs' as any)
    .select('*', { count: 'exact', head: true })
    .eq('parent_job_id', params.id)

  // Generate new job number
  const { data: jobNumber } = await (supabase as any).rpc('get_next_sequence_number', {
    p_company_id: companyId,
    p_document_type: 'JOB',
  })

  // Create repeat job — copy all specs from original
  const { data: newJob, error: createErr } = await supabase.from('jobs' as any).insert({
    company_id:           companyId,
    job_number:           jobNumber,
    parent_job_id:        params.id,
    is_repeat:            true,
    repeat_sequence:      (repeatCount ?? 0) + 2,
    customer_id:          orig.customer_id,
    sales_order_id:       null, // Repeat jobs start fresh
    job_title:            `${orig.job_title} (Repeat ${(repeatCount ?? 0) + 2})`,
    description:          orig.description,
    size_l:               orig.size_l,
    size_w:               orig.size_w,
    size_h:               orig.size_h,
    sheet_size:           orig.sheet_size,
    quantity:             quantity ? parseFloat(quantity) : orig.quantity,
    no_of_colors:         orig.no_of_colors,
    die_number:           orig.die_number,
    board_type_id:        orig.board_type_id,
    paper_type_id:        orig.paper_type_id,
    lamination_type_id:   orig.lamination_type_id,
    uv_coating:           orig.uv_coating,
    foil_type_id:         orig.foil_type_id,
    special_finishing:    orig.special_finishing,
    pasting:              orig.pasting,
    workflow_template_id: orig.workflow_template_id,
    priority:             'normal',
    required_date:        required_date || null,
    status:               'new',
  }).select().single()

  if (createErr) return NextResponse.json({ error: createErr.message }, { status: 500 })

  const newJobData = newJob as any

  // Initialize workflow
  if (orig.workflow_template_id) {
    await initializeJobWorkflow(newJobData.id, orig.workflow_template_id, companyId, supabase)
  }

  // Link artwork reference if same_artwork
  if (same_artwork) {
    await supabase.from('job_artwork_references' as any).insert({
      company_id: companyId,
      job_id: newJobData.id,
      reference_job_id: params.id,
      artwork_version: 1,
      notes: 'Artwork reused from original job',
    })
  }

  // Record events on both jobs
  await recordJobEvent({
    company_id: companyId, job_id: newJobData.id,
    event_type: 'created', new_value: newJobData.job_number,
    notes: `Repeat job created from ${orig.job_number}`,
  }, supabase)

  await recordJobEvent({
    company_id: companyId, job_id: params.id,
    event_type: 'repeat_created', new_value: newJobData.job_number,
    notes: notes || `Repeat job ${newJobData.job_number} created`,
  }, supabase)

  return NextResponse.json({ data: newJobData })
}
