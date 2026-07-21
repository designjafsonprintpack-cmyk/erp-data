import { NextResponse, type NextRequest } from 'next/server'
import { createSupabaseServerClient } from '@/lib/supabase/server'
import { getCompanyId } from '@/lib/utils/getCompanyId'
import { getUserTableId } from '@/lib/utils/getUserTableId'
import { requirePermission } from '@/lib/utils/requirePermission'
import { recordJobEvent } from '@/modules/jobs/services/jobEventService'
import { withErrorHandling } from '@/lib/utils/apiHandler'
import { parseBody } from '@/lib/utils/validate'
import { qcInspectionSchema } from '@/lib/schemas/qc'

export const GET = withErrorHandling(async function GET(req: NextRequest) {
  const supabase = createSupabaseServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const companyId = await getCompanyId(user, supabase)

  const { searchParams } = new URL(req.url)
  const jobId  = searchParams.get('job_id') || ''
  const result = searchParams.get('result') || ''
  const page   = parseInt(searchParams.get('page') || '1')
  const limit  = 25; const offset = (page - 1) * limit

  let q = supabase.from('qc_inspections' as any)
    .select(`
      *,
      jobs(job_number,job_title,customers(name)),
      qc_templates(name),
      inspector:users!qc_inspections_inspector_id_fkey(full_name),
      signed_off_user:users!qc_inspections_signed_off_by_fkey(full_name),
      qc_checklist_responses(*),
      qc_defects(id,defect_type,severity,quantity_affected,resolved)
    `, { count: 'exact' })
    .eq('company_id', companyId)
    .is('deleted_at', null)

  if (jobId)  q = q.eq('job_id', jobId)
  if (result) q = q.eq('result', result)

  const { data, error, count } = await q
    .order('created_at', { ascending: false })
    .range(offset, offset + limit - 1)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ data: data ?? [], total: count ?? 0, page })
})

export const POST = withErrorHandling(async function POST(req: NextRequest) {
  const supabase = createSupabaseServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const companyId = await getCompanyId(user, supabase)
  const userTableId = await getUserTableId(user, supabase)
  const denied = await requirePermission(userTableId, 'qc', 'create', supabase)
  if (denied) return denied

  const parsed = await parseBody(req, qcInspectionSchema)
  if ('error' in parsed) return parsed.error
  const { responses, ...body } = parsed.data

  // Count existing inspections for this job
  const { count: existingCount } = await supabase
    .from('qc_inspections' as any)
    .select('*', { count: 'exact', head: true })
    .eq('job_id', body.job_id)
    .is('deleted_at', null)

  const { data: inspection, error } = await supabase
    .from('qc_inspections' as any).insert({
      company_id:     companyId,
      job_id:         body.job_id,
      template_id:    body.template_id || null,
      inspection_no:  (existingCount ?? 0) + 1,
      inspector_id:   userTableId,
      sample_size:    body.sample_size ? parseInt(String(body.sample_size)) : null,
      notes:          body.notes || null,
      inspected_at:   new Date().toISOString(),
    }).select().single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  const insp = inspection as any

  // Save checklist responses
  if (responses?.length) {
    await supabase.from('qc_checklist_responses' as any).insert(
      responses.map((r: any) => ({
        company_id:       companyId,
        inspection_id:    insp.id,
        template_item_id: r.template_item_id || null,
        question:         r.question,
        is_critical:      r.is_critical || false,
        response:         r.response,
        notes:            r.notes || null,
      }))
    )

    // Auto-compute result
    const failed      = responses.filter((r: any) => r.response === 'fail')
    const critFailed  = failed.filter((r: any) => r.is_critical)
    const autoResult  = critFailed.length > 0 ? 'fail' :
                        failed.length > 0      ? 'conditional_pass' : 'pass'

    await supabase.from('qc_inspections' as any)
      .update({ result: autoResult, defect_count: failed.length })
      .eq('id', insp.id)
    insp.result = autoResult
  }

  // Mirror to job timeline
  await recordJobEvent({
    company_id: companyId,
    job_id:     body.job_id,
    event_type: 'status_changed',
    new_value:  `QC Inspection #${insp.inspection_no}: ${insp.result || 'pending'}`,
    notes:      body.notes || null,
    actor_id:   userTableId,
  }, supabase)

  return NextResponse.json({ data: insp })
})
