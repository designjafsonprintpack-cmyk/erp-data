import { NextResponse, type NextRequest } from 'next/server'
import { createSupabaseServerClient } from '@/lib/supabase/server'
import { getCompanyId } from '@/lib/utils/getCompanyId'
import { getUserTableId } from '@/lib/utils/getUserTableId'
import { requirePermission } from '@/lib/utils/requirePermission'
import { withErrorHandling } from '@/lib/utils/apiHandler'

export const GET = withErrorHandling(async function GET(_: NextRequest, { params }: { params: { id: string } }) {
  const supabase = createSupabaseServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const companyId = await getCompanyId(user, supabase)

  const { data, error } = await supabase.from('machine_downtime_log' as any)
    .select('*, reported:users!machine_downtime_log_reported_by_fkey(full_name), resolved:users!machine_downtime_log_resolved_by_fkey(full_name)')
    .eq('company_id', companyId).eq('machine_id', params.id).is('deleted_at', null)
    .order('started_at', { ascending: false }).limit(50)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ data: data ?? [] })
})

// Start a downtime entry AND flip the machine's status in one call — a
// breakdown/maintenance log entry and the machine's own status field should
// never disagree with each other.
export const POST = withErrorHandling(async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const supabase = createSupabaseServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const companyId = await getCompanyId(user, supabase)
  const userTableId = await getUserTableId(user, supabase)
  const denied = await requirePermission(userTableId, 'machines', 'edit', supabase)
  if (denied) return denied

  const body = await req.json()
  if (!body.category) return NextResponse.json({ error: 'category is required' }, { status: 400 })

  // A machine can only be down once at a time — guard against double-logging
  // if two people report the same breakdown within seconds of each other.
  const { data: existing } = await supabase.from('machine_downtime_log' as any)
    .select('id').eq('machine_id', params.id).eq('company_id', companyId).is('ended_at', null).maybeSingle()
  if (existing) return NextResponse.json({ error: 'This machine already has an open downtime entry.' }, { status: 409 })

  const { data, error } = await supabase.from('machine_downtime_log' as any).insert({
    company_id:   companyId,
    machine_id:   params.id,
    category:     body.category,
    reason:       body.reason || null,
    reported_by:  userTableId,
  }).select().single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  const newStatus = body.category === 'breakdown' ? 'breakdown' : 'maintenance'
  await supabase.from('machines' as any).update({ status: newStatus }).eq('id', params.id).eq('company_id', companyId)
  await supabase.from('machine_status_history' as any).insert({
    company_id: companyId, machine_id: params.id, status: newStatus,
    reason: body.reason || null, changed_by: userTableId,
  })

  return NextResponse.json({ data })
})
