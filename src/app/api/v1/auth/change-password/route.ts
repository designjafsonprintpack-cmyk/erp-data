import { NextResponse, type NextRequest } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { createSupabaseServerClient } from '@/lib/supabase/server'
import { createSupabaseAdminClient } from '@/lib/supabase/admin'
import { getCompanyId } from '@/lib/utils/getCompanyId'
import { getUserTableId } from '@/lib/utils/getUserTableId'
import { withErrorHandling } from '@/lib/utils/apiHandler'
import { rateLimit, getClientIp } from '@/lib/utils/rateLimit'
import { parseBody } from '@/lib/utils/validate'
import { changeOwnPasswordSchema } from '@/lib/schemas/adminUser'

/**
 * Any signed-in user changing their own password.
 *
 * The current password is re-verified before the change. Without that, anyone
 * walking up to an unlocked machine on the shop floor could lock the real user
 * out of their own account — and these machines are shared.
 */
export const POST = withErrorHandling(async function POST(req: NextRequest) {
  // Stops an attacker with a stolen session from brute-forcing the current
  // password through this endpoint. Deliberately looser than the login limit:
  // a legitimate user mistyping their old password twice must not be blocked.
  const limited = rateLimit(`change-password:${getClientIp(req)}`, { windowMs: 15 * 60_000, max: 10 })
  if (limited) return limited

  const supabase = createSupabaseServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (!user.email) {
    return NextResponse.json({ error: 'Your account has no email address, so the password cannot be verified.' }, { status: 400 })
  }

  const parsed = await parseBody(req, changeOwnPasswordSchema)
  if ('error' in parsed) return parsed.error
  const { current_password, new_password } = parsed.data

  if (current_password === new_password) {
    return NextResponse.json({ error: 'The new password must be different from the current one.' }, { status: 400 })
  }

  // Verify on a throwaway client, NOT the cookie-backed server client — signing
  // in on that one would rewrite this request's session cookies as a side
  // effect of what is only meant to be a check.
  const verifier = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  )
  const { error: verifyErr } = await verifier.auth.signInWithPassword({
    email:    user.email,
    password: current_password,
  })
  if (verifyErr) {
    return NextResponse.json({ error: 'Current password is incorrect.' }, { status: 401 })
  }

  const admin = createSupabaseAdminClient()
  const { error: updateErr } = await admin.auth.admin.updateUserById(user.id, {
    password: new_password,
  })
  if (updateErr) return NextResponse.json({ error: updateErr.message }, { status: 500 })

  const companyId   = await getCompanyId(user, supabase)
  const userTableId = await getUserTableId(user, supabase)

  // auth.users has no audit trigger — record that it happened, never the value.
  if (userTableId) {
    await admin.from('audit_log' as any).insert({
      company_id: companyId,
      table_name: 'users',
      record_id:  userTableId,
      action:     'UPDATE',
      new_values: { password_changed_by_self: true },
      changed_by: userTableId,
    })
  }

  return NextResponse.json({ success: true })
})
