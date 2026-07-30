import { NextResponse, type NextRequest } from 'next/server'
import { createSupabaseServerClient } from '@/lib/supabase/server'
import { getCompanyId } from '@/lib/utils/getCompanyId'
import { getUserTableId } from '@/lib/utils/getUserTableId'
import { requirePermission } from '@/lib/utils/requirePermission'
import { withErrorHandling } from '@/lib/utils/apiHandler'
import { parseBody } from '@/lib/utils/validate'
import { planMachinesSchema } from '@/lib/schemas/planning'

/**
 * Replaces the machine assignments on an existing plan. Machines could only ever
 * be attached at create time, so a press breakdown or a job moved to another
 * machine had nowhere to go.
 *
 * "Replace" is deliberately NOT a delete-and-reinsert. job_machine_assignments
 * has no deleted_at — only is_active — and production writes start_time,
 * end_time, actual_hours and operator_id onto these very rows. Wiping them would
 * hard-delete real captured shop-floor data with no way back. So:
 *
 *   • a row production has already touched (start_time or actual_hours set)
 *     cannot be removed at all — the request is refused, naming the machine
 *   • any other removal sets is_active = false
 *   • rows still listed are updated in place, keeping their history
 */
export const PUT = withErrorHandling(async function PUT(req: NextRequest, { params }: { params: { id: string } }) {
  const supabase = createSupabaseServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const companyId = await getCompanyId(user, supabase)
  const userTableId = await getUserTableId(user, supabase)
  const denied = await requirePermission(userTableId, 'planning', 'edit', supabase)
  if (denied) return denied

  const parsed = await parseBody(req, planMachinesSchema)
  if ('error' in parsed) return parsed.error
  const { machines } = parsed.data

  // The plan itself — also the company-scope check, and where job_id comes from
  // (assignments carry it so the shop floor can reach them without the plan).
  const { data: plan, error: planErr } = await supabase.from('job_plans' as any)
    .select('id, job_id')
    .eq('id', params.id)
    .eq('company_id', companyId)
    .is('deleted_at', null)
    .maybeSingle()

  if (planErr) return NextResponse.json({ error: planErr.message }, { status: 500 })
  if (!plan) return NextResponse.json({ error: 'Plan not found' }, { status: 404 })

  const { data: existing, error: exErr } = await supabase.from('job_machine_assignments' as any)
    .select('id, machine_id, start_time, actual_hours, machines(name)')
    .eq('job_plan_id', params.id)
    .eq('company_id', companyId)
    .eq('is_active', true)

  if (exErr) return NextResponse.json({ error: exErr.message }, { status: 500 })

  const existingRows = (existing ?? []) as any[]
  const keepIds = new Set(machines.map(m => m.id).filter(Boolean) as string[])

  // An id in the payload that isn't on this plan is a client bug, not something
  // to quietly ignore — it would read as "saved" while nothing changed.
  const known = new Set(existingRows.map(r => r.id))
  const unknown = Array.from(keepIds).filter(id => !known.has(id))
  if (unknown.length) {
    return NextResponse.json(
      { error: `${unknown.length} assignment(s) do not belong to this plan` },
      { status: 400 }
    )
  }

  const removals = existingRows.filter(r => !keepIds.has(r.id))
  const started = removals.filter(r => r.start_time !== null || r.actual_hours !== null)
  if (started.length) {
    const names = started.map(r => r.machines?.name ?? 'a machine').join(', ')
    return NextResponse.json(
      { error: `Work is already recorded on ${names} — remove the recorded time first, or leave the machine assigned.` },
      { status: 409 }
    )
  }

  for (const r of removals) {
    const { error } = await supabase.from('job_machine_assignments' as any)
      .update({ is_active: false, updated_by: userTableId })
      .eq('id', r.id)
      .eq('company_id', companyId)
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  }

  for (const m of machines.filter(x => x.id)) {
    const { error } = await supabase.from('job_machine_assignments' as any)
      .update({
        machine_id:      m.machine_id,
        stage_id:        m.stage_id || null,
        estimated_hours: m.estimated_hours ? parseFloat(String(m.estimated_hours)) : null,
        operator_id:     m.operator_id || null,
        notes:           m.notes || null,
        updated_by:      userTableId,
      })
      .eq('id', m.id!)
      .eq('company_id', companyId)
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  }

  const additions = machines.filter(x => !x.id)
  if (additions.length) {
    const { error } = await supabase.from('job_machine_assignments' as any).insert(
      additions.map(m => ({
        company_id:      companyId,
        job_plan_id:     params.id,
        job_id:          (plan as any).job_id,
        machine_id:      m.machine_id,
        stage_id:        m.stage_id || null,
        estimated_hours: m.estimated_hours ? parseFloat(String(m.estimated_hours)) : null,
        operator_id:     m.operator_id || null,
        notes:           m.notes || null,
        created_by:      userTableId,
      }))
    )
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  }

  // Fresh state back, so the client doesn't have to guess new row ids.
  const { data: after, error: afterErr } = await supabase.from('job_machine_assignments' as any)
    .select('id, machine_id, estimated_hours, operator_id, notes, machines(name,machine_type)')
    .eq('job_plan_id', params.id)
    .eq('company_id', companyId)
    .eq('is_active', true)
    .order('created_at')

  if (afterErr) return NextResponse.json({ error: afterErr.message }, { status: 500 })
  return NextResponse.json({ data: after ?? [] })
})
