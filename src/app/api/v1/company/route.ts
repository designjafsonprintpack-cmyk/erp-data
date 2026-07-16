import { NextResponse, type NextRequest } from 'next/server'
import { createSupabaseServerClient } from '@/lib/supabase/server'
import { getCompanyId } from '@/lib/utils/getCompanyId'

export async function GET() {
  const supabase = createSupabaseServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const companyId = await getCompanyId(user, supabase)

  const [companyRes, branchesRes, warehousesRes] = await Promise.all([
    supabase.from('companies' as any).select('*').eq('id', companyId).single(),
    supabase.from('branches' as any).select('*').eq('company_id', companyId).is('deleted_at', null).order('name'),
    supabase.from('warehouses' as any).select('*').eq('company_id', companyId).is('deleted_at', null).order('name'),
  ])

  return NextResponse.json({
    company: companyRes.data,
    branches: branchesRes.data ?? [],
    warehouses: warehousesRes.data ?? [],
  })
}

export async function PATCH(req: NextRequest) {
  const supabase = createSupabaseServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  // Get company_id from JWT claims, or fallback to user's company from DB
  let companyId = user.app_metadata?.company_id || user.user_metadata?.company_id

  // If no company_id in JWT (Auth Hook not registered yet), get from users table
  if (!companyId) {
    const { data: dbUser } = await supabase
      .from('users' as any).select('company_id').eq('id', user.id).maybeSingle()
    companyId = (dbUser as any)?.company_id
  }

  // Final fallback to seed company
  if (!companyId) companyId = '00000000-0000-0000-0000-000000000001'

  const body = await req.json()
  const { name, ntn, address } = body

  const { data, error } = await supabase
    .from('companies' as any)
    .update({ name, ntn, address })
    .eq('id', companyId)
    .select()
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ data })
}
