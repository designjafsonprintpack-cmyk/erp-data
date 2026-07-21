import { NextResponse, type NextRequest } from 'next/server'
import { createSupabaseServerClient } from '@/lib/supabase/server'
import { getCompanyId } from '@/lib/utils/getCompanyId'
import { getUserTableId } from '@/lib/utils/getUserTableId'
import { requirePermission } from '@/lib/utils/requirePermission'
import { escapeFilterValue } from '@/lib/utils/escapeFilterValue'
import { recordJobEvent, initializeJobWorkflow } from '@/modules/jobs/services/jobEventService'
import { withErrorHandling } from '@/lib/utils/apiHandler'
import { parseBody } from '@/lib/utils/validate'
import { jobSchema } from '@/lib/schemas/job'

export const GET = withErrorHandling(async function GET(req: NextRequest) {
  const supabase = createSupabaseServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { searchParams } = new URL(req.url)
  const search   = searchParams.get('search') || ''
  const status   = searchParams.get('status') || ''
  const priority = searchParams.get('priority') || ''
  const customer = searchParams.get('customer_id') || ''
  const page     = parseInt(searchParams.get('page') || '1')
  const limit    = parseInt(searchParams.get('limit') || '25')
  const offset   = (page - 1) * limit

  let q = supabase
    .from('jobs' as any)
    .select('id,job_number,job_title,status,priority,quantity,required_date,order_date,is_on_hold,is_repeat,created_at,customers(name,customer_code),workflow_templates(name)', { count: 'exact' })
    .is('deleted_at', null)
    .eq('is_active', true)

  if (status)   q = q.eq('status', status)
  if (priority) q = q.eq('priority', priority)
  if (customer) q = q.eq('customer_id', customer)
  if (search)   q = q.or(`job_number.ilike."%${escapeFilterValue(search)}%",job_title.ilike."%${escapeFilterValue(search)}%"`)

  const { data, error, count } = await q
    .order('created_at', { ascending: false })
    .range(offset, offset + limit - 1)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ data: data ?? [], total: count ?? 0, page, limit })
})

export const POST = withErrorHandling(async function POST(req: NextRequest) {
  const supabase = createSupabaseServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const companyId = await getCompanyId(user, supabase)
  const userTableId = await getUserTableId(user, supabase)
  const denied = await requirePermission(userTableId, 'jobs', 'create', supabase)
  if (denied) return denied

  const parsed = await parseBody(req, jobSchema)
  if ('error' in parsed) return parsed.error
  const body = parsed.data

  // Respect the "Auto-assign jobs to default workflow" system setting
  // (Settings → System Settings). It existed in the UI but nothing checked
  // it — the New Job form's own dropdown default only applies when someone
  // uses that specific form, not for jobs created any other way.
  let workflowTemplateId = body.workflow_template_id || null
  if (!workflowTemplateId) {
    const { data: autoAssignSetting } = await supabase.from('system_settings' as any)
      .select('value').eq('company_id', companyId).eq('key', 'job_auto_assign').maybeSingle()
    if ((autoAssignSetting as any)?.value === 'true') {
      const { data: defaultTemplate } = await supabase.from('workflow_templates' as any)
        .select('id').eq('company_id', companyId).eq('is_default', true)
        .is('deleted_at', null).eq('is_active', true).maybeSingle()
      workflowTemplateId = (defaultTemplate as any)?.id ?? null
    }
  }

  // Generate job number
  const { data: jobNumber } = await (supabase as any).rpc('get_next_sequence_number', {
    p_company_id: companyId,
    p_document_type: 'JOB',
  })

  const { data: job, error } = await supabase.from('jobs' as any).insert({
    company_id:           companyId,
    job_number:           jobNumber,
    customer_id:          body.customer_id,
    sales_order_id:       body.sales_order_id || null,
    job_title:            body.job_title,
    description:          body.description || null,
    size_l:               body.size_l ? parseFloat(String(body.size_l)) : null,
    size_w:               body.size_w ? parseFloat(String(body.size_w)) : null,
    size_h:               body.size_h ? parseFloat(String(body.size_h)) : null,
    sheet_size:           body.sheet_size || null,
    quantity:             parseFloat(String(body.quantity ?? '0')),
    no_of_colors:         body.no_of_colors ? parseInt(String(body.no_of_colors)) : 4,
    die_number:           body.die_number || null,
    grain_direction:      body.grain_direction || null,
    ups:                  body.ups ? parseInt(String(body.ups)) : null,
    sheet_qty:            body.ups && parseInt(String(body.ups)) > 0
                             ? Math.ceil(parseFloat(String(body.quantity ?? '0')) / parseInt(String(body.ups)))
                             : null,
    board_type_id:        body.board_type_id || null,
    paper_type_id:        body.paper_type_id || null,
    lamination_type_id:   body.lamination_type_id || null,
    uv_coating:           body.uv_coating || null,
    foil_type_id:         body.foil_type_id || null,
    special_finishing:    body.special_finishing || null,
    pasting:              body.pasting || null,
    workflow_template_id: workflowTemplateId,
    priority:             body.priority || 'normal',
    required_date:        body.required_date || null,
    quoted_amount:        body.quoted_amount ? parseFloat(String(body.quoted_amount)) : null,
    internal_remarks:     body.internal_remarks || null,
    status:               'new',
  }).select().single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  const jobData = job as any

  // Initialize workflow stages if template assigned
  if (workflowTemplateId) {
    await initializeJobWorkflow(jobData.id, workflowTemplateId, companyId, supabase)
  }

  // Record creation event
  await recordJobEvent({
    company_id: companyId,
    job_id: jobData.id,
    event_type: 'created',
    new_value: jobData.job_number,
    notes: `Job created: ${jobData.job_title}`,
  }, supabase)

  return NextResponse.json({ data: jobData })
})
