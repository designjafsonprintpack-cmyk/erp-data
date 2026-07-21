import { NextResponse, type NextRequest } from 'next/server'
import { createSupabaseServerClient } from '@/lib/supabase/server'
import { getCompanyId } from '@/lib/utils/getCompanyId'
import { getUserTableId } from '@/lib/utils/getUserTableId'
import { requirePermission } from '@/lib/utils/requirePermission'
import { withErrorHandling } from '@/lib/utils/apiHandler'
import { parseBody } from '@/lib/utils/validate'
import { machineMaintenanceSchema } from '@/lib/schemas/machine'

export const GET = withErrorHandling(async function GET(_: NextRequest, { params }: { params: { id: string } }) {
  const supabase = createSupabaseServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const companyId = await getCompanyId(user, supabase)

  const { data, error } = await supabase.from('machine_maintenance_log' as any)
    .select('*')
    .eq('company_id', companyId).eq('machine_id', params.id).is('deleted_at', null)
    .order('scheduled_date', { ascending: false, nullsFirst: false })
    .order('created_at', { ascending: false })
    .limit(50)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ data: data ?? [] })
})

export const POST = withErrorHandling(async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const supabase = createSupabaseServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const companyId = await getCompanyId(user, supabase)
  const userTableId = await getUserTableId(user, supabase)
  const denied = await requirePermission(userTableId, 'machines', 'edit', supabase)
  if (denied) return denied

  const parsed = await parseBody(req, machineMaintenanceSchema)
  if ('error' in parsed) return parsed.error
  const body = parsed.data

  const { data, error } = await supabase.from('machine_maintenance_log' as any).insert({
    company_id:       companyId,
    machine_id:       params.id,
    maintenance_type: body.maintenance_type,
    status:           body.status || 'scheduled',
    scheduled_date:   body.scheduled_date || null,
    completed_date:   body.status === 'completed' ? (body.completed_date || new Date().toISOString().slice(0, 10)) : null,
    description:      body.description,
    performed_by:     body.performed_by || null,
    cost:             body.cost ? parseFloat(String(body.cost)) : null,
    next_due_date:    body.next_due_date || null,
    notes:            body.notes || null,
  }).select().single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ data })
})
