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
  const { data: rawData, error } = await supabase.from('sales_orders' as any)
    .select('*, customers(name, customer_code, email, phone), sales_order_items(*)')
    .eq('id', params.id).eq('company_id', companyId).single()
  if (error) return NextResponse.json({ error: 'Not found' }, { status: 404 })
  const data = rawData as unknown as Record<string, any>
  const result = { ...data, sales_order_items: Array.isArray((data as any).sales_order_items)
    ? [...(data as any).sales_order_items].sort((a: any, b: any) => a.sort_order - b.sort_order) : [] }
  return NextResponse.json({ data: result })
})

export const PATCH = withErrorHandling(async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  const supabase = createSupabaseServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const companyId = await getCompanyId(user, supabase)
  const userTableId = await getUserTableId(user, supabase)
  const denied = await requirePermission(userTableId, 'sales_orders', 'edit', supabase)
  if (denied) return denied

  const body = await req.json()
  const { data, error } = await supabase.from('sales_orders' as any).update(body)
    .eq('id', params.id).eq('company_id', companyId).select().single()
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ data })
})

export const DELETE = withErrorHandling(async function DELETE(_: NextRequest, { params }: { params: { id: string } }) {
  const supabase = createSupabaseServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const companyId = await getCompanyId(user, supabase)
  const userTableId = await getUserTableId(user, supabase)
  const denied = await requirePermission(userTableId, 'sales_orders', 'delete', supabase)
  if (denied) return denied

  await supabase.from('sales_orders' as any)
    .update({ deleted_at: new Date().toISOString(), status: 'cancelled' })
    .eq('id', params.id).eq('company_id', companyId)
  return NextResponse.json({ success: true })
})
