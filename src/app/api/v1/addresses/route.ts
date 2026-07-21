import { NextResponse, type NextRequest } from 'next/server'
import { createSupabaseServerClient } from '@/lib/supabase/server'
import { getCompanyId } from '@/lib/utils/getCompanyId'
import { getUserTableId } from '@/lib/utils/getUserTableId'
import { requirePermission } from '@/lib/utils/requirePermission'
import { withErrorHandling } from '@/lib/utils/apiHandler'
import { parseBody } from '@/lib/utils/validate'
import { addressSchema, addressUpdateSchema } from '@/lib/schemas/crmSubResource'

export const POST = withErrorHandling(async function POST(req: NextRequest) {
  const supabase = createSupabaseServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const companyId = await getCompanyId(user, supabase)
  const userTableId = await getUserTableId(user, supabase)
  const denied = await requirePermission(userTableId, 'customers', 'create', supabase)
  if (denied) return denied
  const parsed = await parseBody(req, addressSchema)
  if ('error' in parsed) return parsed.error
  const body = parsed.data
  const { data, error } = await supabase.from('customer_addresses' as any)
    .insert({ ...body, company_id: companyId }).select().single()
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ data })
})

export const PATCH = withErrorHandling(async function PATCH(req: NextRequest) {
  const supabase = createSupabaseServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const companyId = await getCompanyId(user, supabase)
  const userTableId = await getUserTableId(user, supabase)
  const denied = await requirePermission(userTableId, 'customers', 'edit', supabase)
  if (denied) return denied
  const parsed = await parseBody(req, addressUpdateSchema)
  if ('error' in parsed) return parsed.error
  const { id, ...fields } = parsed.data
  const { data, error } = await supabase.from('customer_addresses' as any).update(fields).eq('id', id).eq('company_id', companyId).select().single()
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ data })
})

export const DELETE = withErrorHandling(async function DELETE(req: NextRequest) {
  const supabase = createSupabaseServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const companyId = await getCompanyId(user, supabase)
  const userTableId = await getUserTableId(user, supabase)
  const denied = await requirePermission(userTableId, 'customers', 'delete', supabase)
  if (denied) return denied
  const { id } = await req.json()
  await supabase.from('customer_addresses' as any)
    .update({ deleted_at: new Date().toISOString(), is_active: false }).eq('id', id).eq('company_id', companyId)
  return NextResponse.json({ success: true })
})
