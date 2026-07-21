import { NextResponse, type NextRequest } from 'next/server'
import { createSupabaseServerClient } from '@/lib/supabase/server'
import { getUserTableId } from '@/lib/utils/getUserTableId'
import { requirePermission } from '@/lib/utils/requirePermission'
import { withErrorHandling } from '@/lib/utils/apiHandler'
import { parseBody } from '@/lib/utils/validate'
import { updateUserSchema } from '@/lib/schemas/adminUser'

const USER_SELECT =
  'id,full_name,email,employee_code,app_role:role,mobile:phone,is_active,created_at'

export const PATCH = withErrorHandling(async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  const supabase = createSupabaseServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const userTableId = await getUserTableId(user, supabase)
  const denied = await requirePermission(userTableId, 'users', 'edit', supabase)
  if (denied) return denied

  const parsed = await parseBody(req, updateUserSchema)
  if ('error' in parsed) return parsed.error
  const body = parsed.data
  const updateData: Record<string, any> = {}

  if (body.full_name !== undefined)     updateData.full_name     = body.full_name
  if (body.employee_code !== undefined) updateData.employee_code = body.employee_code
  if (body.app_role !== undefined)      updateData.role          = body.app_role
  if (body.department_id !== undefined) updateData.department_id = body.department_id
  if (body.mobile !== undefined)        updateData.phone         = body.mobile
  if (body.is_active !== undefined)     updateData.is_active     = body.is_active

  // NOTE: role is read live from public.users.role by custom_access_token_hook
  // on every token refresh, so there is nothing to sync to Supabase Auth
  // metadata here. (The previous version of this route tried to, but did so
  // using params.id as if it were the auth user's id — it's actually the
  // public.users row id, a different UUID — so that call was always targeting
  // a nonexistent auth user.)
  const { data, error } = await supabase.from('users' as any)
    .update(updateData).eq('id', params.id).select(USER_SELECT).single()
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  return NextResponse.json({ data })
})

export const DELETE = withErrorHandling(async function DELETE(_: NextRequest, { params }: { params: { id: string } }) {
  const supabase = createSupabaseServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const userTableId = await getUserTableId(user, supabase)
  const denied = await requirePermission(userTableId, 'users', 'delete', supabase)
  if (denied) return denied

  // Soft-delete only — never hard delete users
  const { error } = await supabase.from('users' as any)
    .update({ is_active: false, deleted_at: new Date().toISOString() })
    .eq('id', params.id)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ success: true })
})
