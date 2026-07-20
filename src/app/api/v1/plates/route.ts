import { NextResponse, type NextRequest } from 'next/server'
import { createSupabaseServerClient } from '@/lib/supabase/server'
import { getCompanyId } from '@/lib/utils/getCompanyId'
import { getUserTableId } from '@/lib/utils/getUserTableId'
import { requirePermission } from '@/lib/utils/requirePermission'
import { escapeFilterValue } from '@/lib/utils/escapeFilterValue'
import { recordJobEvent } from '@/modules/jobs/services/jobEventService'
import { withErrorHandling } from '@/lib/utils/apiHandler'

export const GET = withErrorHandling(async function GET(req: NextRequest) {
  const supabase = createSupabaseServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const companyId = await getCompanyId(user, supabase)

  const { searchParams } = new URL(req.url)
  const search = searchParams.get('search') || ''
  const status = searchParams.get('status') || ''
  const jobId  = searchParams.get('job_id') || ''
  const page   = parseInt(searchParams.get('page') || '1')
  const limit  = parseInt(searchParams.get('limit') || '50')
  const offset = (page - 1) * limit

  // Filtering by job means "ever assigned to this job" — go via job_plates first.
  let plateIdsForJob: string[] | null = null
  if (jobId) {
    const { data: jp } = await supabase
      .from('job_plates' as any)
      .select('plate_id')
      .eq('company_id', companyId)
      .eq('job_id', jobId)
      .is('deleted_at', null)
    plateIdsForJob = (jp ?? []).map((r: any) => r.plate_id)
    if (plateIdsForJob.length === 0) {
      return NextResponse.json({ data: [], total: 0, page, limit })
    }
  }

  let q = supabase
    .from('plates' as any)
    .select('*, origin_job:jobs!plates_origin_job_id_fkey(job_number,job_title), vendors(name)', { count: 'exact' })
    .eq('company_id', companyId)
    .is('deleted_at', null)
    .eq('is_active', true)

  if (status) q = q.eq('status', status)
  if (search) q = q.or(`plate_code.ilike."%${escapeFilterValue(search)}%",color.ilike."%${escapeFilterValue(search)}%",die_number.ilike."%${escapeFilterValue(search)}%"`)
  if (plateIdsForJob) q = q.in('id', plateIdsForJob)

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
  const denied = await requirePermission(userTableId, 'plates', 'create', supabase)
  if (denied) return denied

  const body = await req.json()
  if (!body.plate_code || !body.color) {
    return NextResponse.json({ error: 'plate_code and color are required' }, { status: 400 })
  }

  const assignToJob = !!body.job_id

  const { data: plate, error } = await supabase.from('plates' as any).insert({
    company_id:       companyId,
    plate_code:       body.plate_code,
    color:            body.color,
    die_number:       body.die_number || null,
    plate_size:       body.plate_size || null,
    material:         body.material || 'aluminum',
    status:           assignToJob ? 'mounted' : 'in_storage',
    origin_job_id:    body.job_id || null,
    vendor_id:        body.vendor_id || null,
    cost:             body.cost || null,
    made_date:        body.made_date || null,
    storage_location: body.storage_location || null,
    reuse_count:      0,
    last_used_at:     assignToJob ? new Date().toISOString() : null,
    remarks:          body.remarks || null,
  }).select().single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  // If created directly against a job, also create the assignment row so it
  // shows up in that job's plate list immediately.
  if (assignToJob) {
    const { error: jpError } = await supabase.from('job_plates' as any).insert({
      company_id:  companyId,
      job_id:      body.job_id,
      plate_id:    (plate as any).id,
      machine_id:  body.machine_id || null,
      is_reused:   false,
      condition_on_assign: 'new',
    })
    if (jpError) return NextResponse.json({ error: jpError.message }, { status: 500 })

    // Auto-link: a newly-made plate is an actual printing cost for this job.
    await (supabase as any).rpc('apply_job_actual_cost', {
      p_company_id:   companyId,
      p_job_id:       body.job_id,
      p_bucket:       'plate',
      p_amount:       body.cost ? parseFloat(body.cost) : 0,
      p_sheets_delta: null,
      p_plates_delta: 1,
    }).catch(() => null)

    await recordJobEvent({
      company_id: companyId, job_id: body.job_id,
      event_type: 'plate_assigned',
      new_value: `${body.plate_code} (${body.color}) — new plate`,
      actor_id: userTableId,
    }, supabase)
  }

  return NextResponse.json({ data: plate })
})
