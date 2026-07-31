/**
 * One gang run: read it, or break it up again.
 *
 * DELETE is an UNGANG, not a tidy-up. Every member job goes back to the ups and
 * the quantity it had before — otherwise a cancelled gang would leave JOB-A
 * planned at 3 ups for 12,000 boxes forever, and the next repeat would inherit
 * a layout that only ever existed inside that one run.
 */
import { NextResponse, type NextRequest } from 'next/server'
import { createSupabaseServerClient } from '@/lib/supabase/server'
import { getCompanyId } from '@/lib/utils/getCompanyId'
import { getUserTableId } from '@/lib/utils/getUserTableId'
import { requirePermission } from '@/lib/utils/requirePermission'
import { withErrorHandling } from '@/lib/utils/apiHandler'
import { recordJobEvent } from '@/modules/jobs/services/jobEventService'

export const GET = withErrorHandling(async function GET(_: NextRequest, { params }: { params: { id: string } }) {
  const supabase = createSupabaseServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const companyId = await getCompanyId(user, supabase)

  const { data, error } = await supabase.from('job_gangs' as any)
    .select('*, customers(name,customer_code), board_types(name), ' +
            'job_gang_members(id,job_id,ups_on_layout,original_quantity,original_ups,' +
            'jobs(job_number,job_title,quantity,ups,sheet_qty,status))')
    .eq('id', params.id).eq('company_id', companyId).is('deleted_at', null).maybeSingle()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  if (!data) return NextResponse.json({ error: 'Gang not found' }, { status: 404 })
  return NextResponse.json({ data })
})

export const DELETE = withErrorHandling(async function DELETE(req: NextRequest, { params }: { params: { id: string } }) {
  const supabase = createSupabaseServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const companyId = await getCompanyId(user, supabase)
  const userTableId = await getUserTableId(user, supabase)
  const denied = await requirePermission(userTableId, 'planning', 'delete', supabase)
  if (denied) return denied

  const { data: gang, error: gErr } = await supabase.from('job_gangs' as any)
    .select('id, gang_number, status, job_gang_members(id,job_id,ups_on_layout,original_quantity,original_ups,jobs(job_number,sales_order_item_id))')
    .eq('id', params.id).eq('company_id', companyId).is('deleted_at', null).maybeSingle()
  if (gErr) return NextResponse.json({ error: gErr.message }, { status: 500 })
  if (!gang) return NextResponse.json({ error: 'Gang not found' }, { status: 404 })

  const members = ((gang as any).job_gang_members ?? []).filter((m: any) => !m.deleted_at)
  const jobIds = members.map((m: any) => m.job_id)

  // Production already under way? Board has been issued for the whole run and
  // plates cut for the shared layout; splitting the jobs now would leave both
  // sides wrong. Cancel the run on the floor first.
  const { data: started, error: stErr } = await supabase
    .from('job_stage_progress' as any)
    .select('job_id, status, workflow_stages!inner(name, is_gang_shared)')
    .in('job_id', jobIds.length ? jobIds : ['00000000-0000-0000-0000-000000000000'])
    .eq('company_id', companyId)
    .eq('workflow_stages.is_gang_shared', true)
    .neq('status', 'pending')
  if (stErr) return NextResponse.json({ error: stErr.message }, { status: 500 })

  const force = new URL(req.url).searchParams.get('force') === '1'
  if (((started ?? []) as any[]).length && !force) {
    const names = Array.from(new Set(((started ?? []) as any[]).map(s => s.workflow_stages?.name))).join(', ')
    return NextResponse.json({
      error: `This gang has already started ${names}. Breaking it up now leaves the board and plates recorded against a run that no longer exists.`,
      code: 'GANG_IN_PRODUCTION',
    }, { status: 409 })
  }

  const warnings: string[] = []

  // ─── Put every job back ──────────────────────────────────────────────────
  for (const m of members) {
    const patch: Record<string, any> = { updated_by: userTableId }
    if (m.original_ups != null) patch.ups = m.original_ups
    if (m.original_quantity != null) patch.quantity = m.original_quantity
    if (m.original_ups != null && m.original_quantity != null && Number(m.original_ups) > 0) {
      patch.sheet_qty = Math.ceil(Number(m.original_quantity) / Number(m.original_ups))
    }

    const { error: jErr } = await supabase.from('jobs' as any)
      .update(patch).eq('id', m.job_id).eq('company_id', companyId)
    if (jErr) { warnings.push(`${m.jobs?.job_number ?? m.job_id}: ${jErr.message}`); continue }

    // And the Sales Order line, which the gang had rewritten to the agreed
    // figure. Left alone, dispatch and invoicing would keep working to a
    // quantity nobody is producing any more.
    const soItemId = m.jobs?.sales_order_item_id
    if (soItemId && m.original_quantity != null) {
      const { data: soItem } = await supabase.from('sales_order_items' as any)
        .select('id, unit_price, sales_order_id').eq('id', soItemId).eq('company_id', companyId).maybeSingle()
      if (soItem) {
        const unit = Number((soItem as any).unit_price) || 0
        const qty = Number(m.original_quantity)
        const { error: soErr } = await supabase.from('sales_order_items' as any)
          .update({ quantity: qty, subtotal: Math.round(unit * qty * 100) / 100, updated_by: userTableId })
          .eq('id', (soItem as any).id).eq('company_id', companyId)
        if (soErr) warnings.push(`${m.jobs?.job_number}: sales order line not restored — ${soErr.message}`)
      } else {
        warnings.push(`${m.jobs?.job_number}: sales order line not found to restore.`)
      }
    }

    await recordJobEvent({
      company_id: companyId, job_id: m.job_id,
      event_type: 'gang_removed',
      old_value: `${(gang as any).gang_number} — ${m.ups_on_layout} ups`,
      new_value: m.original_ups != null
        ? `Back to ${m.original_ups} ups, ${Number(m.original_quantity ?? 0).toLocaleString()}`
        : 'Removed from gang',
      actor_id: userTableId,
    }, supabase)
  }

  // Memberships first, then the gang: the partial unique index is on live
  // membership rows, so leaving them behind would block re-ganging those jobs.
  const now = new Date().toISOString()
  const { error: mErr } = await supabase.from('job_gang_members' as any)
    .update({ deleted_at: now, is_active: false }).eq('gang_id', params.id).eq('company_id', companyId)
  if (mErr) return NextResponse.json({ error: mErr.message }, { status: 500 })

  // The day's plan is released too — one press slot no longer has a run in it.
  const { error: pErr } = await supabase.from('job_plans' as any)
    .update({ deleted_at: now, status: 'cancelled' })
    .eq('gang_id', params.id).eq('company_id', companyId).is('deleted_at', null)
  if (pErr) warnings.push(`Planning entry not released — ${pErr.message}`)

  const { error: dErr } = await supabase.from('job_gangs' as any)
    .update({ deleted_at: now, is_active: false, status: 'cancelled', updated_by: userTableId })
    .eq('id', params.id).eq('company_id', companyId)
  if (dErr) return NextResponse.json({ error: dErr.message }, { status: 500 })

  return NextResponse.json({ success: true, restored: members.length, warnings })
})
