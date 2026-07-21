import { NextResponse, type NextRequest } from 'next/server'
import { createSupabaseServerClient } from '@/lib/supabase/server'
import { getCompanyId } from '@/lib/utils/getCompanyId'
import { getUserTableId } from '@/lib/utils/getUserTableId'
import { requirePermission } from '@/lib/utils/requirePermission'
import { withErrorHandling } from '@/lib/utils/apiHandler'
import { parseBody } from '@/lib/utils/validate'
import { branchSchema, branchUpdateSchema } from '@/lib/schemas/settingsConfig'

export const POST = withErrorHandling(async function POST(req: NextRequest) {
  const supabase = createSupabaseServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const companyId = await getCompanyId(user, supabase)
  const userTableId = await getUserTableId(user, supabase)
  const denied = await requirePermission(userTableId, 'settings', 'create', supabase)
  if (denied) return denied
  const parsed = await parseBody(req, branchSchema)
  if ('error' in parsed) return parsed.error
  const body = parsed.data

  const { data, error } = await supabase
    .from('branches' as any)
    .insert({ ...body, company_id: companyId })
    .select().single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ data })
})

export const PATCH = withErrorHandling(async function PATCH(req: NextRequest) {
  const supabase = createSupabaseServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const companyId = await getCompanyId(user, supabase)
  const userTableId = await getUserTableId(user, supabase)
  const denied = await requirePermission(userTableId, 'settings', 'edit', supabase)
  if (denied) return denied

  const parsed = await parseBody(req, branchUpdateSchema)
  if ('error' in parsed) return parsed.error
  const { id, ...fields } = parsed.data

  const { data, error } = await supabase
    .from('branches' as any).update(fields).eq('id', id).eq('company_id', companyId).select().single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ data })
})

export const DELETE = withErrorHandling(async function DELETE(req: NextRequest) {
  const supabase = createSupabaseServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const companyId = await getCompanyId(user, supabase)
  const userTableId = await getUserTableId(user, supabase)
  const denied = await requirePermission(userTableId, 'settings', 'delete', supabase)
  if (denied) return denied

  const { id } = await req.json()
  const { error } = await supabase.from('branches' as any)
    .update({ deleted_at: new Date().toISOString(), is_active: false }).eq('id', id).eq('company_id', companyId)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ success: true })
})
