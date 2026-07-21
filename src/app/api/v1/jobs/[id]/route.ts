import { NextResponse, type NextRequest } from 'next/server'
import { createSupabaseServerClient } from '@/lib/supabase/server'
import { getCompanyId } from '@/lib/utils/getCompanyId'
import { requireSuperadmin } from '@/lib/utils/requireSuperadmin'
import { recordJobEvent } from '@/modules/jobs/services/jobEventService'
import { withErrorHandling } from '@/lib/utils/apiHandler'
import { parseBody } from '@/lib/utils/validate'
import { jobUpdateSchema } from '@/lib/schemas/job'

export const GET = withErrorHandling(async function GET(_: NextRequest, { params }: { params: { id: string } }) {
  const supabase = createSupabaseServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const companyId = await getCompanyId(user, supabase)

  const [jobRes, stagesRes, eventsRes] = await Promise.all([
    supabase.from('jobs' as any)
      .select('*, customers(name,customer_code,email,phone), workflow_templates(name), sales_orders(so_number)')
      .eq('id', params.id).eq('company_id', companyId).single(),
    supabase.from('job_stage_progress' as any)
      .select('*, workflow_stages(name, is_optional, estimated_hours)')
      .eq('job_id', params.id)
      .order('sequence_order'),
    supabase.from('job_stage_events' as any)
      .select('*, users(full_name)')
      .eq('job_id', params.id)
      .order('occurred_at', { ascending: false })
      .limit(50),
  ])

  if (jobRes.error) return NextResponse.json({ error: 'Not found' }, { status: 404 })
  return NextResponse.json({
    job: jobRes.data,
    stages: stagesRes.data ?? [],
    events: eventsRes.data ?? [],
  })
})

export const PATCH = withErrorHandling(async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  const supabase = createSupabaseServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const companyId = await getCompanyId(user, supabase)
  const denied = await requireSuperadmin(user, supabase)
  if (denied) return denied

  const parsed = await parseBody(req, jobUpdateSchema)
  if ('error' in parsed) return parsed.error
  const body = parsed.data

  // Get current state for event recording
  const { data: current } = await supabase.from('jobs' as any)
    .select('status, priority, quantity, ups').eq('id', params.id).eq('company_id', companyId).single()

  const updateData: Record<string, any> = { ...body }
  if (body.size_l !== undefined) updateData.size_l = body.size_l ? parseFloat(String(body.size_l)) : null
  if (body.size_w !== undefined) updateData.size_w = body.size_w ? parseFloat(String(body.size_w)) : null
  if (body.size_h !== undefined) updateData.size_h = body.size_h ? parseFloat(String(body.size_h)) : null
  if (body.quantity !== undefined) updateData.quantity = parseFloat(String(body.quantity ?? '0'))
  if (body.no_of_colors !== undefined) updateData.no_of_colors = parseInt(String(body.no_of_colors))
  if (body.quoted_amount !== undefined) updateData.quoted_amount = body.quoted_amount ? parseFloat(String(body.quoted_amount)) : null
  if (body.ups !== undefined) updateData.ups = body.ups ? parseInt(String(body.ups)) : null

  // Sheet Qty = ceil(Quantity / Ups) — recompute whenever either input changes,
  // using whichever value wasn't part of this particular update.
  if (body.quantity !== undefined || body.ups !== undefined) {
    const effectiveQty = body.quantity !== undefined ? updateData.quantity : (current as any)?.quantity
    const effectiveUps = body.ups !== undefined ? updateData.ups : (current as any)?.ups
    updateData.sheet_qty = effectiveUps && effectiveUps > 0 ? Math.ceil((effectiveQty || 0) / effectiveUps) : null
  }

  const { data, error } = await supabase.from('jobs' as any)
    .update(updateData).eq('id', params.id).eq('company_id', companyId).select().single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  // Record status change
  if (body.status && current && body.status !== (current as any).status) {
    await recordJobEvent({
      company_id: companyId, job_id: params.id, event_type: 'status_changed',
      old_value: (current as any).status, new_value: body.status,
    }, supabase)
  }

  // Record priority change
  if (body.priority && current && body.priority !== (current as any).priority) {
    await recordJobEvent({
      company_id: companyId, job_id: params.id, event_type: 'priority_changed',
      old_value: (current as any).priority, new_value: body.priority,
    }, supabase)
  }

  return NextResponse.json({ data })
})

export const DELETE = withErrorHandling(async function DELETE(_: NextRequest, { params }: { params: { id: string } }) {
  const supabase = createSupabaseServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const companyId = await getCompanyId(user, supabase)
  const denied = await requireSuperadmin(user, supabase)
  if (denied) return denied

  // Hard delete (not soft-delete) per explicit requirement — actually
  // removes the row from the database, not just deleted_at/is_active.
  // Several child tables (dispatch_items, qc_reprints, job_plate_assignments,
  // and a few pre-production/finance tables) reference jobs(id) WITHOUT
  // ON DELETE CASCADE — deliberately, since those are downstream business/
  // audit records (dispatch, invoicing, QC history) that shouldn't silently
  // vanish just because a job row is removed. That means a job with any
  // real activity on it will still fail this delete with a Postgres
  // foreign-key error (23503) — surfaced here as a clear message rather
  // than a raw DB error, instead of quietly cascading that history away.
  const { error } = await supabase.from('jobs' as any)
    .delete()
    .eq('id', params.id).eq('company_id', companyId)

  if (error) {
    if ((error as any).code === '23503') {
      return NextResponse.json({
        error: 'This job has related records (dispatch, invoicing, QC, plate assignments, or repeat jobs linked to it) and can\'t be permanently deleted while those exist.',
      }, { status: 409 })
    }
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
  return NextResponse.json({ success: true })
})
