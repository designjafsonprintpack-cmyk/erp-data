import { NextResponse, type NextRequest } from 'next/server'
import { createSupabaseServerClient } from '@/lib/supabase/server'
import { createSupabaseAdminClient } from '@/lib/supabase/admin'
import { getUserTableId } from '@/lib/utils/getUserTableId'
import { getCompanyId } from '@/lib/utils/getCompanyId'
import { requirePermission } from '@/lib/utils/requirePermission'
import { withErrorHandling } from '@/lib/utils/apiHandler'
import { syncUserDepartments } from '@/lib/utils/syncUserDepartments'
import { parseBody } from '@/lib/utils/validate'
import { updateUserSchema } from '@/lib/schemas/adminUser'

const USER_SELECT =
  'id,full_name,email,employee_code,app_role:role,mobile:phone,is_active,created_at,department_id'

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

  // Department ki poori fehrist (146). `department_ids` bheji gayi ho tab hi
  // chhua jata hai — warna sirf naam badalne wali PATCH us aadmi ke saare
  // department uRa deti.
  if (body.department_ids !== undefined) {
    const companyId = await getCompanyId(user, supabase)
    const { error: depErr } = await syncUserDepartments(
      supabase, companyId, params.id, body.department_ids,
      body.department_id !== undefined ? body.department_id : (data as any).department_id)
    if (depErr) return NextResponse.json({ error: depErr }, { status: 500 })
  }

  return NextResponse.json({ data })
})

export const DELETE = withErrorHandling(async function DELETE(_: NextRequest, { params }: { params: { id: string } }) {
  const supabase = createSupabaseServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const userTableId = await getUserTableId(user, supabase)
  const denied = await requirePermission(userTableId, 'users', 'delete', supabase)
  if (denied) return denied

  // There is no way back in from inside the app once you've deleted the account
  // you're signed in with, so this is refused server-side and not just hidden
  // in the UI.
  if (userTableId && params.id === userTableId) {
    return NextResponse.json({ error: 'You cannot delete your own account.' }, { status: 400 })
  }

  const { data: target } = await supabase.from('users' as any)
    .select('id, auth_user_id').eq('id', params.id).is('deleted_at', null).maybeSingle()
  const authUserId = (target as any)?.auth_user_id as string | null

  // Soft-delete only — never hard delete users. auth_user_id is cleared in the
  // SAME update, before the login account is removed below: users.auth_user_id
  // is declared REFERENCES auth.users(id) ON DELETE CASCADE (migration 002), so
  // deleting the auth account while it is still linked would CASCADE and hard
  // delete this row — taking the audit trail and every user_roles row with it.
  const { error } = await supabase.from('users' as any)
    .update({ is_active: false, deleted_at: new Date().toISOString(), auth_user_id: null })
    .eq('id', params.id)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  // Remove the Supabase Auth account itself. Without this the address stays
  // registered forever and re-creating the same person later fails with
  // "email already registered" — a delete you can't undo AND can't redo.
  // Best-effort: the row is already soft-deleted and the login route filters on
  // deleted_at, so a failure here cannot leave the account usable.
  if (authUserId) {
    try {
      await createSupabaseAdminClient().auth.admin.deleteUser(authUserId)
    } catch {
      // swallowed deliberately — see above
    }
  }

  return NextResponse.json({ success: true })
})
