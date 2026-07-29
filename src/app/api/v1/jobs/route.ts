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
import { withCurrentStageNames } from '@/lib/utils/currentStageNames'
import { isPageOutOfRange, outOfRangeResponse } from '@/lib/utils/pagedResponse'

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
  // Press proof runs (104) are jobs too, so the list defaults to production
  // only and callers opt in explicitly. 'all' is here for reports/debugging
  // that genuinely want both; anything else is treated as production.
  const kindParam = searchParams.get('kind') || 'production'
  const kind = ['production', 'proofing', 'all'].includes(kindParam) ? kindParam : 'production'

  // Resolved before the query, not after it. This used to be read further down
  // purely to enrich stage names, leaving the list itself scoped by RLS alone.
  // RLS does hold — but every other route in this codebase also filters
  // company_id explicitly, and a list route is the wrong place to depend on a
  // single layer. Costs nothing: the same call was already being made.
  const companyId = await getCompanyId(user, supabase)

  let q = supabase
    .from('jobs' as any)
    .select('id,job_number,job_title,status,priority,quantity,required_date,order_date,is_on_hold,is_repeat,created_at,current_stage_id,customers(name,customer_code),workflow_templates(name)', { count: 'exact' })
    .eq('company_id', companyId)
    .is('deleted_at', null)
    .eq('is_active', true)

  if (kind !== 'all') q = q.eq('job_kind', kind)
  if (status)   q = q.eq('status', status)
  if (priority) q = q.eq('priority', priority)
  if (customer) q = q.eq('customer_id', customer)
  if (search)   q = q.or(`job_number.ilike."%${escapeFilterValue(search)}%",job_title.ilike."%${escapeFilterValue(search)}%"`)

  const { data, error, count } = await q
    .order('created_at', { ascending: false })
    // Tiebreaker — the legacy jobs all share one backdated created_at, and an
    // unstable order across pages makes "Load More" repeat rows and skip
    // others. Must match the ORDER BY on the jobs list page.
    .order('id', { ascending: false })
    .range(offset, offset + limit - 1)

  // A page past the end is an empty page, not a 500 — see pagedResponse.
  if (isPageOutOfRange(error)) return NextResponse.json(outOfRangeResponse(page, limit))
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  // Same current-stage enrichment the server-rendered first page does, so
  // filtering or searching doesn't blank out the Stage column.
  const rows = await withCurrentStageNames(supabase, companyId, (data ?? []) as any[])

  return NextResponse.json({ data: rows, total: count ?? 0, page, limit })
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

  // ─── "Repeat with Changes" linkage (migration 097) ─────────────────────────
  // Ordinary create unless parent_job_id came in. The parent is verified
  // against this company before anything is linked to it — the id arrives from
  // a client dropdown, so it can't be trusted on its own.
  let parentJob: any = null
  let repeatSequence: number | null = null
  if (body.parent_job_id) {
    const { data: parent } = await supabase.from('jobs' as any)
      .select('id, job_number, job_title')
      .eq('id', body.parent_job_id).eq('company_id', companyId)
      .is('deleted_at', null).maybeSingle()
    if (!parent) {
      return NextResponse.json({ error: 'The job you are repeating was not found.' }, { status: 404 })
    }
    parentJob = parent
    // Same counting rule as the /repeat route: existing children + 2, so the
    // original itself reads as #1.
    const { count } = await supabase.from('jobs' as any)
      .select('*', { count: 'exact', head: true }).eq('parent_job_id', parentJob.id)
    repeatSequence = (count ?? 0) + 2
  }

  const isChanged = !!parentJob && body.repeat_kind === 'changed'
  if (isChanged && !(body.changed_aspects ?? []).length) {
    return NextResponse.json(
      { error: 'Select at least one thing that changed on this repeat.' },
      { status: 400 }
    )
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
    sales_order_item_id:  body.sales_order_item_id || null,
    job_title:            body.job_title,
    description:          body.description || null,
    size_l:               body.size_l ? parseFloat(String(body.size_l)) : null,
    size_w:               body.size_w ? parseFloat(String(body.size_w)) : null,
    size_h:               body.size_h ? parseFloat(String(body.size_h)) : null,
    sheet_width_in:       body.sheet_width_in ? parseFloat(String(body.sheet_width_in)) : null,
    sheet_height_in:      body.sheet_height_in ? parseFloat(String(body.sheet_height_in)) : null,
    box_type_id:          body.box_type_id || null,
    quantity:             parseFloat(String(body.quantity ?? '0')),
    no_of_colors:         body.no_of_colors ? parseInt(String(body.no_of_colors)) : 4,
    die_number:           body.die_number || null,
    gsm:                  body.gsm ? parseFloat(String(body.gsm)) : null,
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
    parent_job_id:        parentJob?.id ?? null,
    is_repeat:            !!parentJob,
    repeat_sequence:      repeatSequence,
    repeat_kind:          parentJob ? (body.repeat_kind || 'changed') : null,
    changed_aspects:      isChanged ? body.changed_aspects : [],
    change_note:          isChanged ? (body.change_note || null) : null,
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
    notes: parentJob
      ? `Repeat with changes, created from ${parentJob.job_number}`
      : `Job created: ${jobData.job_title}`,
  }, supabase)

  // The parent's own history has to show it too, otherwise the only way to
  // learn that a changed repeat exists is to already know its number.
  if (parentJob) {
    await recordJobEvent({
      company_id: companyId,
      job_id: parentJob.id,
      event_type: 'repeat_created',
      new_value: jobData.job_number,
      notes: body.change_note
        ? `Changed repeat ${jobData.job_number} created — ${body.change_note}`
        : `Changed repeat ${jobData.job_number} created`,
    }, supabase)
  }

  return NextResponse.json({ data: jobData })
})
