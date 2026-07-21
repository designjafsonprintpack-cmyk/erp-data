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
    .select('*, origin_job:jobs!plates_origin_job_id_fkey(job_number,job_title)', { count: 'exact' })
    .eq('company_id', companyId)
    .is('deleted_at', null)
    .eq('is_active', true)

  if (status) q = q.eq('status', status)
  if (search) q = q.or(`color.ilike."%${escapeFilterValue(search)}%"`)
  if (plateIdsForJob) q = q.in('id', plateIdsForJob)

  const { data, error, count } = await q
    .order('created_at', { ascending: false })
    .range(offset, offset + limit - 1)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ data: data ?? [], total: count ?? 0, page, limit })
})

// A single POST call can create/reuse several plates at once — one job, one
// size, one machine, several colors (this is the "Add plates" flow: each
// color row is independently either a brand new plate or an existing
// in-storage plate being reused).
export const POST = withErrorHandling(async function POST(req: NextRequest) {
  const supabase = createSupabaseServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const companyId = await getCompanyId(user, supabase)
  const userTableId = await getUserTableId(user, supabase)
  const denied = await requirePermission(userTableId, 'plates', 'create', supabase)
  if (denied) return denied

  const body = await req.json()
  const jobId: string | null = body.job_id || null
  const plateSize: string | null = body.plate_size || null
  const machineId: string | null = body.machine_id || null
  const rows: Array<{ color: string; mode: 'new' | 'old'; existing_plate_id?: string }> = body.colors || []

  if (rows.length === 0) return NextResponse.json({ error: 'Add at least one color' }, { status: 400 })
  if (plateSize && !['1030 x 790', '1030 x 770'].includes(plateSize)) {
    return NextResponse.json({ error: 'Invalid plate size' }, { status: 400 })
  }

  const created: any[] = []

  for (const row of rows) {
    if (row.mode === 'old') {
      if (!row.existing_plate_id) return NextResponse.json({ error: 'Select an existing plate for each "Old" row' }, { status: 400 })
      const { data: updated, error: updErr } = await supabase.from('plates' as any)
        .update({ status: jobId ? 'in_use' : 'in_storage', last_used_at: jobId ? new Date().toISOString() : undefined })
        .eq('id', row.existing_plate_id).eq('company_id', companyId).select().single()
      if (updErr) return NextResponse.json({ error: updErr.message }, { status: 500 })
      await (supabase as any).rpc('mark_plate_reused', { p_plate_id: row.existing_plate_id }).catch(() => null)
      created.push(updated)

      if (jobId) {
        await supabase.from('job_plates' as any).insert({
          company_id: companyId, job_id: jobId, plate_id: row.existing_plate_id,
          machine_id: machineId, is_reused: true, condition_on_assign: 'good',
        })
        await recordJobEvent({
          company_id: companyId, job_id: jobId, event_type: 'plate_assigned',
          new_value: `${row.color} — reused plate`, actor_id: userTableId,
        }, supabase)
      }
    } else {
      // Auto-generated identifier — never shown to the user, just needs to
      // satisfy the DB's NOT NULL UNIQUE constraint.
      const plateCode = `PL-${Date.now().toString(36).toUpperCase()}-${Math.random().toString(36).slice(2, 6).toUpperCase()}`
      const madeDate = body.made_date || new Date().toISOString().slice(0, 10)
      const { data: plate, error } = await supabase.from('plates' as any).insert({
        company_id: companyId, plate_code: plateCode, color: row.color,
        plate_size: plateSize, status: jobId ? 'in_use' : 'in_storage',
        origin_job_id: jobId, made_date: madeDate,
        last_used_at: jobId ? new Date().toISOString() : null,
      }).select().single()
      if (error) return NextResponse.json({ error: error.message }, { status: 500 })
      created.push(plate)

      if (jobId) {
        await supabase.from('job_plates' as any).insert({
          company_id: companyId, job_id: jobId, plate_id: (plate as any).id,
          machine_id: machineId, is_reused: false, condition_on_assign: 'new',
        })
        await recordJobEvent({
          company_id: companyId, job_id: jobId, event_type: 'plate_assigned',
          new_value: `${row.color} — new plate`, actor_id: userTableId,
        }, supabase)
      }
    }
  }

  return NextResponse.json({ data: created })
})
