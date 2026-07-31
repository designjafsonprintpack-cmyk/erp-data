import { NextResponse, type NextRequest } from 'next/server'
import { createSupabaseServerClient } from '@/lib/supabase/server'
import { getCompanyId } from '@/lib/utils/getCompanyId'
import { getUserTableId } from '@/lib/utils/getUserTableId'
import { requirePermission } from '@/lib/utils/requirePermission'
import { withErrorHandling } from '@/lib/utils/apiHandler'
import { parseBody } from '@/lib/utils/validate'
import { departmentSchema, departmentUpdateSchema } from '@/lib/schemas/settingsConfig'
import { guardDuplicateName } from '@/lib/utils/duplicateName'

export const GET = withErrorHandling(async function GET() {
  const supabase = createSupabaseServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const { data, error } = await supabase.from('departments' as any).select('*').is('deleted_at', null).order('name')
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ data })
})

export const POST = withErrorHandling(async function POST(req: NextRequest) {
  const supabase = createSupabaseServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const companyId = await getCompanyId(user, supabase)
  const userTableId = await getUserTableId(user, supabase)
  const denied = await requirePermission(userTableId, 'settings', 'create', supabase)
  if (denied) return denied
  const parsed = await parseBody(req, departmentSchema)
  if ('error' in parsed) return parsed.error
  const body = parsed.data

  // 104 looks a workflow stage's department up BY NAME. A second department
  // with the same name is how that lookup starts picking the wrong one.
  const dupe = await guardDuplicateName(supabase, 'department', {
    table: 'departments', companyId, name: (body as any).name,
  })
  if (dupe) return dupe

  const { data, error } = await supabase.from('departments' as any)
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
  const denied = await requirePermission(userTableId, 'settings', 'edit', supabase)
  if (denied) return denied
  const parsed = await parseBody(req, departmentUpdateSchema)
  if ('error' in parsed) return parsed.error
  const { id, ...fields } = parsed.data

  if ((fields as any).name !== undefined) {
    const dupe = await guardDuplicateName(supabase, 'department', {
      table: 'departments', companyId, name: (fields as any).name, excludeId: id,
    })
    if (dupe) return dupe
  }

  // company_id added to the filter — this update was scoped by id alone,
  // relying on RLS as the only tenant boundary. Every other route in this
  // codebase filters it explicitly; a settings write is the wrong place to
  // depend on a single layer.
  const { data, error } = await supabase.from('departments' as any).update(fields).eq('id', id).eq('company_id', companyId).select().single()
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ data })
})

export const DELETE = withErrorHandling(async function DELETE(req: NextRequest) {
  const supabase = createSupabaseServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const userTableId = await getUserTableId(user, supabase)
  const denied = await requirePermission(userTableId, 'settings', 'delete', supabase)
  if (denied) return denied
  const { id } = await req.json()
  const { error } = await supabase.from('departments' as any)
    .update({ deleted_at: new Date().toISOString(), is_active: false }).eq('id', id)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ success: true })
})
