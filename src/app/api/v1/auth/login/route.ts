import { NextResponse, type NextRequest } from 'next/server'
import { createSupabaseServerClient } from '@/lib/supabase/server'
import { createSupabaseAdminClient } from '@/lib/supabase/admin'
import { withErrorHandling } from '@/lib/utils/apiHandler'
import { rateLimit, getClientIp } from '@/lib/utils/rateLimit'
import { parseBody } from '@/lib/utils/validate'
import { loginSchema } from '@/lib/schemas/auth'

const MAX_ATTEMPTS = 5
const LOCKOUT_MINUTES = 15

// Login now goes through this route instead of calling Supabase Auth
// directly from the browser — that's the only way to count failures and
// enforce a lockout, since nothing server-side ever saw a failed attempt
// under the old client → Supabase Auth flow. Uses createSupabaseServerClient
// (not the admin client) for the actual sign-in so the session cookies are
// set the normal way; the admin client is only used for the pre-auth lockout
// check and to update the failure counter, since there is no session yet to
// authorize those reads/writes through RLS.
export const POST = withErrorHandling(async function POST(req: NextRequest) {
  // IP-based limit, complementary to the per-account lockout below: the
  // per-account lockout only starts counting once a *known* email is
  // guessed against, so an attacker spraying many different (including
  // nonexistent) emails from one IP would otherwise never be throttled at
  // all. This doesn't replace the per-account lockout, it covers the gap
  // that lockout can't see.
  const limited = rateLimit(`login:${getClientIp(req)}`, { windowMs: 15 * 60_000, max: 10 })
  if (limited) return limited

  const parsed = await parseBody(req, loginSchema)
  if ('error' in parsed) return parsed.error
  const { email, password } = parsed.data

  const admin = createSupabaseAdminClient()

  // Look up by email across all companies — this is intentionally the ONE
  // place in the app that queries users without a company_id filter, because
  // there is no session yet to know which company the caller belongs to.
  const { data: userRow } = await admin.from('users' as any)
    .select('id, failed_login_attempts, locked_until')
    .eq('email', email).is('deleted_at', null).eq('is_active', true).maybeSingle()

  const row = userRow as any
  if (row?.locked_until && new Date(row.locked_until) > new Date()) {
    const minutesLeft = Math.ceil((new Date(row.locked_until).getTime() - Date.now()) / 60000)
    return NextResponse.json(
      { error: `Too many failed attempts. Try again in ${minutesLeft} minute${minutesLeft !== 1 ? 's' : ''}.` },
      { status: 423 }
    )
  }

  const supabase = createSupabaseServerClient()
  const { data, error } = await supabase.auth.signInWithPassword({ email, password })

  if (error) {
    // Only track failures for accounts that exist in our users table — a
    // typo'd email for a nonexistent account shouldn't create a phantom
    // lockout record, and doing nothing here reveals no more than the
    // generic error message already does either way.
    if (row) {
      const attempts = (row.failed_login_attempts ?? 0) + 1
      const locked = attempts >= MAX_ATTEMPTS
      await admin.from('users' as any).update({
        failed_login_attempts: attempts,
        locked_until: locked ? new Date(Date.now() + LOCKOUT_MINUTES * 60000).toISOString() : null,
      }).eq('id', row.id)

      if (locked) {
        return NextResponse.json(
          { error: `Too many failed attempts. Account locked for ${LOCKOUT_MINUTES} minutes.` },
          { status: 423 }
        )
      }
    }
    return NextResponse.json({ error: 'Invalid email or password.' }, { status: 401 })
  }

  // Successful login — clear the counter so a bad guess three months ago
  // doesn't count toward a lockout today.
  if (row) {
    await admin.from('users' as any).update({
      failed_login_attempts: 0,
      locked_until: null,
    }).eq('id', row.id)
  }

  return NextResponse.json({ success: true })
})
