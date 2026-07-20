import { NextResponse, type NextRequest } from 'next/server'
import { createSupabaseServerClient } from '@/lib/supabase/server'
import { getCompanyId } from '@/lib/utils/getCompanyId'
import { getUserTableId } from '@/lib/utils/getUserTableId'
import { requirePermission } from '@/lib/utils/requirePermission'
import { escapeFilterValue } from '@/lib/utils/escapeFilterValue'
import { createClient } from '@supabase/supabase-js'
import { withErrorHandling } from '@/lib/utils/apiHandler'

// NOTE: the users table columns are `role` and `phone` (see migration 002).
// The Settings → Users UI (UsersClient.tsx) calls them `app_role` and `mobile`.
// Rather than rename the DB columns — which are read directly by the JWT hook,
// has_permission(), and RLS policies across the app — we alias them at the API
// boundary so the frontend never has to change.
const USER_SELECT =
  'id,full_name,email,employee_code,app_role:role,mobile:phone,is_active,created_at,departments(name),user_roles(roles(name))'

export const GET = withErrorHandling(async function GET(req: NextRequest) {
  const supabase = createSupabaseServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const companyId = await getCompanyId(user, supabase)

  const { searchParams } = new URL(req.url)
  const search = searchParams.get('search') || ''
  const role   = searchParams.get('role') || ''

  let q = supabase.from('users' as any)
    .select(USER_SELECT, { count: 'exact' })
    .eq('company_id', companyId)
    .is('deleted_at', null)

  if (search) q = q.or(`full_name.ilike."%${escapeFilterValue(search)}%",email.ilike."%${escapeFilterValue(search)}%",employee_code.ilike."%${escapeFilterValue(search)}%"`)
  if (role)   q = q.eq('role', role)

  const { data, error, count } = await q.order('full_name')
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ data: data ?? [], total: count ?? 0 })
})

export const POST = withErrorHandling(async function POST(req: NextRequest) {
  const supabase = createSupabaseServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const companyId = await getCompanyId(user, supabase)
  const userTableId = await getUserTableId(user, supabase)

  const denied = await requirePermission(userTableId, 'users', 'create', supabase)
  if (denied) return denied

  const body = await req.json()

  // Create auth user via admin client
  const adminClient = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )

  const { data: authUser, error: authErr } = await adminClient.auth.admin.createUser({
    email:          body.email,
    password:       body.password || Math.random().toString(36).slice(-10),
    email_confirm:  true,
    user_metadata:  { full_name: body.full_name }, // display-only, not used for JWT claims
  })

  if (authErr) return NextResponse.json({ error: authErr.message }, { status: 500 })

  // Insert into public.users. `id` is left to its own default (a separate
  // app-level primary key) — it must never be set equal to the auth user's id.
  // `auth_user_id` is what custom_access_token_hook actually looks up, so this
  // is the field that has to be correct for the new user to be able to log in.
  const { data, error } = await supabase.from('users' as any).insert({
    company_id:     companyId,
    auth_user_id:   authUser.user.id,
    full_name:      body.full_name,
    email:          body.email,
    employee_code:  body.employee_code || null,
    role:           body.app_role || 'staff',
    department_id:  body.department_id || null,
    phone:          body.mobile || null,
    is_active:      true,
  }).select(USER_SELECT).single()

  if (error) {
    // Don't leave an orphaned auth account with no matching public.users row —
    // that combination is exactly what blocked login earlier in this project.
    await adminClient.auth.admin.deleteUser(authUser.user.id)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
  return NextResponse.json({ data })
})
