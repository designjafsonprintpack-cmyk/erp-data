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

const VALID_SIZES = ['1030 x 790', '1030 x 770']

// POST — assign a plate to this job. Either:
//   { plate_id }              -> reuse an existing plate from storage
//   { color, plate_size, ... } -> make (create) a new plate for this job
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
      .select('id, color, status')
      .eq('id', body.plate_id)
      .eq('company_id', companyId)
      .is('deleted_at', null)
      .maybeSingle()

    if (findErr || !existing) return NextResponse.json({ error: 'Plate not found' }, { status: 404 })
    if ((existing as any).status === 'in_use') {
      return NextResponse.json({ error: 'This plate is already assigned to another job' }, { status: 409 })
    }
    if ((existing as any).status === 'damaged') {
      return NextResponse.json({ error: 'This plate is damaged and cannot be reused' }, { status: 409 })
    }

    plateId = (existing as any).id
    plateLabel = `${(existing as any).color} — reused`
    isReused = true

    const { error: rpcErr } = await (supabase as any).rpc('mark_plate_reused', { p_plate_id: plateId })
    if (rpcErr) return NextResponse.json({ error: rpcErr.message }, { status: 500 })
  } else {
    // ─── Make a new plate for this job ────────────────────────────────────
    if (!body.color) return NextResponse.json({ error: 'color is required' }, { status: 400 })
    if (body.plate_size && !VALID_SIZES.includes(body.plate_size)) {
      return NextResponse.json({ error: 'Invalid plate size' }, { status: 400 })
    }
    const plateCode = `PL-${Date.now().toString(36).toUpperCase()}-${Math.random().toString(36).slice(2, 6).toUpperCase()}`
    const { data: created, error: createErr } = await supabase.from('plates' as any).insert({
      company_id:    companyId,
      plate_code:    plateCode,
      color:         body.color,
      plate_size:    body.plate_size || null,
      status:        'in_use',
      origin_job_id: jobId,
      made_date:     new Date().toISOString().slice(0, 10),
      last_used_at:  new Date().toISOString(),
    }).select().single()

    if (createErr) return NextResponse.json({ error: createErr.message }, { status: 500 })
    plateId = (created as any).id
    plateLabel = `${body.color} — new plate`
    isReused = false
  }

  const { data: assignment, error: jpError } = await supabase.from('job_plates' as any).insert({
    company_id:  companyId,
    job_id:      jobId,
    plate_id:    plateId,
    machine_id:  body.machine_id || null,
    operator_id: body.operator_id || null,
    is_reused:   isReused,
    condition_on_assign: isReused ? 'good' : 'new',
  }).select('*, plates(*)').single()

  if (jpError) return NextResponse.json({ error: jpError.message }, { status: 500 })

  await recordJobEvent({
    company_id: companyId, job_id: jobId,
    event_type: 'plate_assigned',
    new_value: plateLabel,
    actor_id: userTableId,
  }, supabase)

  return NextResponse.json({ data: assignment })
})
