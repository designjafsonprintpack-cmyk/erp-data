import { NextResponse, type NextRequest } from 'next/server'
import { createSupabaseServerClient } from '@/lib/supabase/server'
import { getCompanyId } from '@/lib/utils/getCompanyId'
import { createClient } from '@supabase/supabase-js'

export async function GET(req: NextRequest) {
  const supabase = createSupabaseServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { searchParams } = new URL(req.url)
  const search = searchParams.get('search') || ''
  const role   = searchParams.get('role') || ''

  let q = supabase.from('users' as any)
    .select('id,full_name,email,employee_code,app_role,is_active,created_at,departments(name),user_roles(roles(name))', { count: 'exact' })
    .is('deleted_at', null)

  if (search) q = q.or(`full_name.ilike.%${search}%,email.ilike.%${search}%,employee_code.ilike.%${search}%`)
  if (role)   q = q.eq('app_role', role)

  const { data, error, count } = await q.order('full_name')
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ data: data ?? [], total: count ?? 0 })
}

export async function POST(req: NextRequest) {
  const supabase = createSupabaseServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const companyId = await getCompanyId(user, supabase)
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
    app_metadata: {
      company_id: companyId,
      app_role:   body.app_role || 'staff',
    },
    user_metadata: {
      full_name:  body.full_name,
      company_id: companyId,
    },
  })

  if (authErr) return NextResponse.json({ error: authErr.message }, { status: 500 })

  // Insert into users table
  const { data, error } = await supabase.from('users' as any).insert({
    id:             authUser.user.id,
    company_id:     companyId,
    full_name:      body.full_name,
    email:          body.email,
    employee_code:  body.employee_code || null,
    app_role:       body.app_role || 'staff',
    department_id:  body.department_id || null,
    mobile:         body.mobile || null,
    is_active:      true,
  }).select().single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ data })
}
