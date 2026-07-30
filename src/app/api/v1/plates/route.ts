import { NextResponse, type NextRequest } from 'next/server'
import { createSupabaseServerClient } from '@/lib/supabase/server'
import { getCompanyId } from '@/lib/utils/getCompanyId'
import { getUserTableId } from '@/lib/utils/getUserTableId'
import { requirePermission } from '@/lib/utils/requirePermission'
import { escapeFilterValue } from '@/lib/utils/escapeFilterValue'
import { attachCurrentJob } from '@/lib/utils/platesWithCurrentJob'
import { recordJobEvent } from '@/modules/jobs/services/jobEventService'
import { withErrorHandling } from '@/lib/utils/apiHandler'
import { parseBody } from '@/lib/utils/validate'
import { addPlatesSchema } from '@/lib/schemas/plate'
import { isPageOutOfRange, outOfRangeResponse } from '@/lib/utils/pagedResponse'

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

  // The Plates page groups by the job a plate is mounted on RIGHT NOW, and its
  // dropdown offers job numbers plus "unassigned". Both were browser-side
  // filters over a capped array; they are query filters now.
  const jobNumber = searchParams.get('job_number') || ''
  const assigned  = searchParams.get('assigned') || ''   // '' | 'none'

  let resolvedJobId = jobId
  if (!resolvedJobId && jobNumber) {
    const { data: j } = await supabase.from('jobs' as any)
      .select('id').eq('company_id', companyId).eq('job_number', jobNumber)
      .is('deleted_at', null).maybeSingle()
    if (!j) return NextResponse.json({ data: [], total: 0, page, limit })
    resolvedJobId = (j as any).id
  }

  // Plates with an OPEN assignment — used either to restrict to one job's
  // current plates, or to exclude all of them for "unassigned".
  let excludeIds: string[] = []
  if (assigned === 'none') {
    const { data: open } = await supabase.from('job_plates' as any)
      .select('plate_id').eq('company_id', companyId)
      .is('deleted_at', null).is('returned_at', null)
    excludeIds = Array.from(new Set((open ?? []).map((r: any) => r.plate_id)))
  }

  // Filtering by job means "ever assigned to this job" — go via job_plates first.
  let plateIdsForJob: string[] | null = null
  if (resolvedJobId) {
    const { data: jp } = await supabase
      .from('job_plates' as any)
      .select('plate_id')
      .eq('company_id', companyId)
      .eq('job_id', resolvedJobId)
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
  if (excludeIds.length) q = q.not('id', 'in', `(${excludeIds.join(',')})`)

  const { data, error, count } = await q
    .order('created_at', { ascending: false })
    // Tiebreaker — plates created in the same batch share a created_at.
    .order('id', { ascending: false })
    .range(offset, offset + limit - 1)

  // A page past the end is an empty page, not a 500 — see pagedResponse.
  if (isPageOutOfRange(error)) return NextResponse.json(outOfRangeResponse(page, limit))
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  // Same "who's it really with right now" enrichment the Plates page needs.
  // Shared with the server component so the two cannot drift.
  const enriched = await attachCurrentJob(supabase, companyId, (data ?? []) as any[])

  return NextResponse.json({ data: enriched, total: count ?? 0, page, limit })
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

  const parsed = await parseBody(req, addPlatesSchema)
  if ('error' in parsed) return parsed.error
  const body = parsed.data
  const jobId: string | null = body.job_id || null
  const plateSize: string | null = body.plate_size || null
  const machineId: string | null = body.machine_id || null
  const rows = body.colors

  if (plateSize && !['1030 x 790', '1030 x 770'].includes(plateSize)) {
    return NextResponse.json({ error: 'Invalid plate size' }, { status: 400 })
  }

  // Resolved once and stamped onto every plate this call touches, so the
  // client can show "Currently at" immediately without a page refresh —
  // matches the enrichment the list/page.tsx do from job_plates, just
  // computed directly here since we already know the job for this call.
  let currentJob: { job_number: string; job_title: string } | null = null
  if (jobId) {
    const { data: jobRow } = await supabase.from('jobs' as any)
      .select('job_number, job_title').eq('id', jobId).eq('company_id', companyId).maybeSingle()
    currentJob = jobRow ? { job_number: (jobRow as any).job_number, job_title: (jobRow as any).job_title } : null
  }

  const created: any[] = []

  for (const row of rows) {
    if (row.mode === 'old') {
      if (!row.existing_plate_id) return NextResponse.json({ error: 'Select an existing plate for each "Old" row' }, { status: 400 })

      // Close out any still-open assignment for this plate before opening a
      // new one — a plate can only really be "with" one job at a time, and
      // leaving a stale open row behind would make the current-job lookup
      // ambiguous the next time this plate is reused again.
      if (jobId) {
        await supabase.from('job_plates' as any)
          .update({ returned_at: new Date().toISOString() })
          .eq('plate_id', row.existing_plate_id).eq('company_id', companyId)
          .is('returned_at', null)
      }

      const { data: updated, error: updErr } = await supabase.from('plates' as any)
        .update({ status: jobId ? 'in_use' : 'in_storage', last_used_at: jobId ? new Date().toISOString() : undefined })
        .eq('id', row.existing_plate_id).eq('company_id', companyId).select().single()
      if (updErr) return NextResponse.json({ error: updErr.message }, { status: 500 })
      // `.catch()` on a Supabase builder throws synchronously (it only
      // implements PromiseLike), so this whole branch — reusing an existing
      // plate — always 500'd. Never noticed because plates was at 0 rows.
      // See api/v1/purchase-orders/route.ts for the full note.
      const { error: reuseErr } = await (supabase as any).rpc('mark_plate_reused', { p_plate_id: row.existing_plate_id })
      if (reuseErr) console.error('[Plates] mark_plate_reused failed', reuseErr)

      let assignmentId: string | null = null
      if (jobId) {
        const { data: assignment } = await supabase.from('job_plates' as any).insert({
          company_id: companyId, job_id: jobId, plate_id: row.existing_plate_id,
          machine_id: machineId, is_reused: true, condition_on_assign: 'good',
        }).select('id').single()
        assignmentId = (assignment as any)?.id ?? null
        await recordJobEvent({
          company_id: companyId, job_id: jobId, event_type: 'plate_assigned',
          new_value: `${row.color} — reused plate`, actor_id: userTableId,
        }, supabase)
      }
      created.push({
        ...(updated as any),
        current_job: jobId && currentJob && assignmentId ? { assignment_id: assignmentId, ...currentJob } : null,
      })
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

      let assignmentId: string | null = null
      if (jobId) {
        const { data: assignment } = await supabase.from('job_plates' as any).insert({
          company_id: companyId, job_id: jobId, plate_id: (plate as any).id,
          machine_id: machineId, is_reused: false, condition_on_assign: 'new',
        }).select('id').single()
        assignmentId = (assignment as any)?.id ?? null
        await recordJobEvent({
          company_id: companyId, job_id: jobId, event_type: 'plate_assigned',
          new_value: `${row.color} — new plate`, actor_id: userTableId,
        }, supabase)
      }
      created.push({
        ...(plate as any),
        current_job: jobId && currentJob && assignmentId ? { assignment_id: assignmentId, ...currentJob } : null,
      })
    }
  }

  return NextResponse.json({ data: created })
})
