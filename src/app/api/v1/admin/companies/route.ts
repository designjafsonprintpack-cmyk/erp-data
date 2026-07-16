import { NextResponse, type NextRequest } from 'next/server'
import { createSupabaseServerClient } from '@/lib/supabase/server'
import { getCompanyId } from '@/lib/utils/getCompanyId'

export async function GET(_req: NextRequest) {
  const supabase = createSupabaseServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  // Only superadmins see all companies
  const role = user.app_metadata?.app_role || user.user_metadata?.app_role
  if (!['superadmin','super_admin'].includes(role)) {
    // Regular users: return only their own company
    const companyId = await getCompanyId(user, supabase)
    const { data } = await supabase.from('companies' as any).select('*').eq('id', companyId)
    return NextResponse.json({ data: data ?? [] })
  }

  const { data, error } = await supabase.from('companies' as any)
    .select('*, branches(id,name,is_default)').order('name')
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ data: data ?? [] })
}
