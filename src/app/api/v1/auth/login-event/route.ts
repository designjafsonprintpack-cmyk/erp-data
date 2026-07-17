import { NextResponse, type NextRequest } from 'next/server'
import { createSupabaseServerClient } from '@/lib/supabase/server'
import { getCompanyId } from '@/lib/utils/getCompanyId'
import { getUserTableId } from '@/lib/utils/getUserTableId'

// Called by the client right after a successful sign-in. login_history
// existed in the schema but nothing ever wrote to it — this fills that gap.
// Best-effort: if this fails, it should never block or affect the login
// itself, so the client treats errors here as non-fatal.
export async function POST(req: NextRequest) {
  const supabase = createSupabaseServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const companyId = await getCompanyId(user, supabase)
  const userTableId = await getUserTableId(user, supabase)

  const ipAddress =
    req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ||
    req.headers.get('x-real-ip') ||
    null
  const deviceInfo = req.headers.get('user-agent') || null

  const { data, error } = await supabase.from('login_history' as any).insert({
    company_id:   companyId,
    user_id:      userTableId,
    ip_address:   ipAddress,
    device_info:  deviceInfo,
  }).select('id').single()

  // Keep last_login_at on the user row in sync too — it already existed as a
  // column but was never updated either.
  if (userTableId) {
    await supabase.from('users' as any)
      .update({ last_login_at: new Date().toISOString() })
      .eq('id', userTableId)
  }

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ data })
}
