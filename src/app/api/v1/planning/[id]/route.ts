import { NextResponse, type NextRequest } from 'next/server'
import { createSupabaseServerClient } from '@/lib/supabase/server'
import { getCompanyId } from '@/lib/utils/getCompanyId'
import { getUserTableId } from '@/lib/utils/getUserTableId'
import { requirePermission } from '@/lib/utils/requirePermission'
import { withErrorHandling } from '@/lib/utils/apiHandler'
import { parseBody } from '@/lib/utils/validate'
import { jobPlanUpdateSchema } from '@/lib/schemas/planning'
import { nextDayOrder } from '@/lib/utils/planDayOrder'

export const PATCH = withErrorHandling(async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  const supabase = createSupabaseServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const companyId = await getCompanyId(user, supabase)
  const userTableId = await getUserTableId(user, supabase)
  const denied = await requirePermission(userTableId, 'planning', 'edit', supabase)
  if (denied) return denied

  const parsed = await parseBody(req, jobPlanUpdateSchema)
  if ('error' in parsed) return parsed.error
  const body = parsed.data

  // Moving a plan to another date has to re-slot it, or it keeps the number it
  // held on the old day and lands in the middle of the new one. Done here rather
  // than in the client so every caller that changes the date gets it.
  const patch: Record<string, any> = { ...body }
  if (body.planned_date) {
    const { data: current, error: curErr } = await supabase.from('job_plans' as any)
      .select('planned_date')
      .eq('id', params.id)
      .eq('company_id', companyId)
      .is('deleted_at', null)
      .maybeSingle()
    if (curErr) return NextResponse.json({ error: curErr.message }, { status: 500 })
    if (!current) return NextResponse.json({ error: 'Plan not found' }, { status: 404 })

    if ((current as any).planned_date !== body.planned_date) {
      patch.day_order = await nextDayOrder(supabase, companyId, body.planned_date)
    }
  }

  const { data, error } = await supabase.from('job_plans' as any)
    .update(patch).eq('id', params.id).eq('company_id', companyId).select().single()
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ data })
})

export const DELETE = withErrorHandling(async function DELETE(_: NextRequest, { params }: { params: { id: string } }) {
  const supabase = createSupabaseServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const companyId = await getCompanyId(user, supabase)
  const userTableId = await getUserTableId(user, supabase)
  const denied = await requirePermission(userTableId, 'planning', 'delete', supabase)
  if (denied) return denied

  const { error } = await supabase.from('job_plans' as any)
    .update({ deleted_at: new Date().toISOString(), is_active: false })
    .eq('id', params.id).eq('company_id', companyId)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ success: true })
})
