import { NextResponse, type NextRequest } from 'next/server'
import { createSupabaseServerClient } from '@/lib/supabase/server'
import { getCompanyId } from '@/lib/utils/getCompanyId'
import { getUserTableId } from '@/lib/utils/getUserTableId'
import { requirePermission } from '@/lib/utils/requirePermission'
import { recordJobEvent } from '@/modules/jobs/services/jobEventService'
import { withErrorHandling } from '@/lib/utils/apiHandler'

export const GET = withErrorHandling(async function GET(req: NextRequest, { params }: { params: { id: string } }) {
  const supabase = createSupabaseServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const companyId = await getCompanyId(user, supabase)

  const { data, error } = await supabase
    .from('job_plates' as any)
    .select('*, plates(*), machines(name,code)')
    .eq('job_id', params.id)
    .eq('company_id', companyId)
    .is('deleted_at', null)
    .order('assigned_at', { ascending: false })

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ data: data ?? [] })
})

// POST — assign a plate to this job. Either:
//   { plate_id }               -> reuse an existing plate from storage
//   { plate_code, color, ... } -> make (create) a new plate for this job
export const POST = withErrorHandling(async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const supabase = createSupabaseServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const companyId = await getCompanyId(user, supabase)
  const userTableId = await getUserTableId(user, supabase)
  const denied = await requirePermission(userTableId, 'plates', 'create', supabase)
  if (denied) return denied

  const body = await req.json()
  const jobId = params.id

  let plateId: string
  let plateLabel: string
  let isReused: boolean

  if (body.plate_id) {
    // ─── Reuse an existing stored plate ───────────────────────────────────
    const { data: existing, error: findErr } = await supabase
      .from('plates' as any)
      .select('id, plate_code, color, status')
      .eq('id', body.plate_id)
      .eq('company_id', companyId)
      .is('deleted_at', null)
      .maybeSingle()

    if (findErr || !existing) return NextResponse.json({ error: 'Plate not found' }, { status: 404 })
    if (['mounted', 'printing'].includes((existing as any).status)) {
      return NextResponse.json({ error: 'This plate is already assigned to another job' }, { status: 409 })
    }
    if (['damaged', 'disposed', 'lost'].includes((existing as any).status)) {
      return NextResponse.json({ error: 'This plate is damaged/disposed and cannot be reused' }, { status: 409 })
    }

    plateId = (existing as any).id
    plateLabel = `${(existing as any).plate_code} (${(existing as any).color}) — reused`
    isReused = true

    const { error: rpcErr } = await (supabase as any).rpc('mark_plate_reused', { p_plate_id: plateId })
    if (rpcErr) return NextResponse.json({ error: rpcErr.message }, { status: 500 })
  } else {
    // ─── Make a new plate for this job ────────────────────────────────────
    if (!body.plate_code || !body.color) {
      return NextResponse.json({ error: 'plate_code and color are required' }, { status: 400 })
    }
    const { data: created, error: createErr } = await supabase.from('plates' as any).insert({
      company_id:       companyId,
      plate_code:       body.plate_code,
      color:            body.color,
      die_number:       body.die_number || null,
      plate_size:       body.plate_size || null,
      material:         body.material || 'aluminum',
      status:           'mounted',
      origin_job_id:    jobId,
      vendor_id:        body.vendor_id || null,
      cost:             body.cost || null,
      made_date:        body.made_date || null,
      storage_location: body.storage_location || null,
      reuse_count:      0,
      last_used_at:     new Date().toISOString(),
    }).select().single()

    if (createErr) return NextResponse.json({ error: createErr.message }, { status: 500 })
    plateId = (created as any).id
    plateLabel = `${body.plate_code} (${body.color}) — new plate`
    isReused = false
  }

  const { data: assignment, error: jpError } = await supabase.from('job_plates' as any).insert({
    company_id:  companyId,
    job_id:      jobId,
    plate_id:    plateId,
    machine_id:  body.machine_id || null,
    operator_id: body.operator_id || null,
    is_reused:   isReused,
    condition_on_assign: body.condition_on_assign || (isReused ? 'good' : 'new'),
    remarks:     body.remarks || null,
  }).select('*, plates(*)').single()

  if (jpError) return NextResponse.json({ error: jpError.message }, { status: 500 })

  // Auto-link to job costing: a new plate carries its make cost; a reused
  // plate carries no incremental cost but still counts toward plates-on-press.
  await (supabase as any).rpc('apply_job_actual_cost', {
    p_company_id:   companyId,
    p_job_id:       jobId,
    p_bucket:       'plate',
    p_amount:       isReused ? 0 : (body.cost ? parseFloat(body.cost) : 0),
    p_sheets_delta: null,
    p_plates_delta: 1,
  }).catch(() => null)

  await recordJobEvent({
    company_id: companyId, job_id: jobId,
    event_type: 'plate_assigned',
    new_value: plateLabel,
    actor_id: userTableId,
  }, supabase)

  return NextResponse.json({ data: assignment })
})
