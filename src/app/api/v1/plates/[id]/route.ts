import { NextResponse, type NextRequest } from 'next/server'
import { createSupabaseServerClient } from '@/lib/supabase/server'
import { getCompanyId } from '@/lib/utils/getCompanyId'
import { getUserTableId } from '@/lib/utils/getUserTableId'
import { requirePermission } from '@/lib/utils/requirePermission'
import { withErrorHandling } from '@/lib/utils/apiHandler'

export const GET = withErrorHandling(async function GET(req: NextRequest, { params }: { params: { id: string } }) {
  const supabase = createSupabaseServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const companyId = await getCompanyId(user, supabase)

  const { data: plate, error } = await supabase
    .from('plates' as any)
    .select('*, origin_job:jobs!plates_origin_job_id_fkey(job_number,job_title), vendors(name)')
    .eq('id', params.id)
    .eq('company_id', companyId)
    .is('deleted_at', null)
    .maybeSingle()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  if (!plate) return NextResponse.json({ error: 'Plate not found' }, { status: 404 })

  const { data: history } = await supabase
    .from('job_plates' as any)
    .select('*, jobs(job_number,job_title), machines(name,code)')
    .eq('plate_id', params.id)
    .eq('company_id', companyId)
    .is('deleted_at', null)
    .order('assigned_at', { ascending: false })

  return NextResponse.json({ data: { ...(plate as any), history: history ?? [] } })
})

export const PATCH = withErrorHandling(async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  const supabase = createSupabaseServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const companyId = await getCompanyId(user, supabase)
  const userTableId = await getUserTableId(user, supabase)
  const denied = await requirePermission(userTableId, 'plates', 'edit', supabase)
  if (denied) return denied

  const body = await req.json()
  const allowed = [
    'plate_code', 'color', 'die_number', 'plate_size', 'material', 'status',
    'vendor_id', 'cost', 'made_date', 'storage_location', 'retired_reason', 'remarks',
  ]
  const update: Record<string, any> = { updated_by: userTableId }
  for (const key of allowed) if (key in body) update[key] = body[key]

  const { data, error } = await supabase
    .from('plates' as any)
    .update(update)
    .eq('id', params.id)
    .eq('company_id', companyId)
    .select()
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ data })
})

export const DELETE = withErrorHandling(async function DELETE(req: NextRequest, { params }: { params: { id: string } }) {
  const supabase = createSupabaseServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const companyId = await getCompanyId(user, supabase)
  const userTableId = await getUserTableId(user, supabase)
  const denied = await requirePermission(userTableId, 'plates', 'delete', supabase)
  if (denied) return denied

  const { error } = await supabase
    .from('plates' as any)
    .update({ deleted_at: new Date().toISOString(), is_active: false, updated_by: userTableId })
    .eq('id', params.id)
    .eq('company_id', companyId)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ data: { success: true } })
})
