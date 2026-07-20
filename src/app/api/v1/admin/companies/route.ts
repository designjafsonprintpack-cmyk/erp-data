import { NextResponse, type NextRequest } from 'next/server'
import { createSupabaseServerClient } from '@/lib/supabase/server'
import { getCompanyId } from '@/lib/utils/getCompanyId'
import { withErrorHandling } from '@/lib/utils/apiHandler'

function decodeJwtPayload(token: string): Record<string, any> | null {
  try {
    const payload = token.split('.')[1]
    if (!payload) return null
    const base64 = payload.replace(/-/g, '+').replace(/_/g, '/')
    return JSON.parse(Buffer.from(base64, 'base64').toString('utf-8'))
  } catch {
    return null
  }
}

export const GET = withErrorHandling(async function GET(_req: NextRequest) {
  const supabase = createSupabaseServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  // Only superadmins see all companies.
  // role is written onto the TOP LEVEL of the JWT claims by
  // custom_access_token_hook — not into app_metadata/user_metadata.
  const { data: { session } } = await supabase.auth.getSession()
  const role = session?.access_token ? decodeJwtPayload(session.access_token)?.app_role : undefined

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
})
