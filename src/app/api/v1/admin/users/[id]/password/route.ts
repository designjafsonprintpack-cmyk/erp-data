import { NextResponse, type NextRequest } from 'next/server'
import { createSupabaseServerClient } from '@/lib/supabase/server'
import { createSupabaseAdminClient } from '@/lib/supabase/admin'
import { getCompanyId } from '@/lib/utils/getCompanyId'
import { getUserTableId } from '@/lib/utils/getUserTableId'
import { requireSuperadmin } from '@/lib/utils/requireSuperadmin'
import { withErrorHandling } from '@/lib/utils/apiHandler'
import { parseBody } from '@/lib/utils/validate'
import { resetUserPasswordSchema } from '@/lib/schemas/adminUser'

/**
 * Superadmin password reset.
 *
 * WHY THE EXISTING PASSWORD CANNOT BE SHOWN: Supabase Auth stores only a bcrypt
 * hash of the password (auth.users.encrypted_password). A hash is one-way — not
 * Supabase, not the service-role key, and not this route can turn it back into
 * the text the user typed. So "view password" is impossible without keeping a
 * second, reversible copy of every password, which would mean one database leak
 * exposes every account. This route does the safe equivalent instead: it SETS a
 * new password and returns it once, in the response, for the superadmin to hand
 * over. It is never stored anywhere in readable form afterwards.
 *
 * Deliberately requireSuperadmin, not requirePermission('users','edit') — the
 * same stricter bar as job edit/delete. Being able to set anyone's password is
 * being able to become anyone.
 */

/** Ambiguity-free alphabet: no O/0, l/1/I. Shop staff read these off a screen. */
const ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789'

function generatePassword(length = 12): string {
  const bytes = new Uint32Array(length)
  crypto.getRandomValues(bytes)
  let out = ''
  for (let i = 0; i < length; i++) out += ALPHABET[bytes[i] % ALPHABET.length]
  return out
}

export const POST = withErrorHandling(async function POST(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  const supabase = createSupabaseServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const denied = await requireSuperadmin(user, supabase)
  if (denied) return denied

  const parsed = await parseBody(req, resetUserPasswordSchema)
  if ('error' in parsed) return parsed.error

  const companyId    = await getCompanyId(user, supabase)
  const actorId      = await getUserTableId(user, supabase)
  const newPassword  = parsed.data.password || generatePassword()

  // params.id is the public.users row id, NOT the auth user id — they are
  // different UUIDs (see the note in ../route.ts). The auth id has to be looked
  // up, and the company filter is what stops a superadmin of one company from
  // resetting a user in another.
  const { data: target, error: lookupErr } = await supabase
    .from('users' as any)
    .select('id, auth_user_id, full_name, email')
    .eq('id', params.id)
    .eq('company_id', companyId)
    .is('deleted_at', null)
    .maybeSingle()

  if (lookupErr) return NextResponse.json({ error: lookupErr.message }, { status: 500 })
  const row = target as any
  if (!row) return NextResponse.json({ error: 'User not found' }, { status: 404 })
  if (!row.auth_user_id) {
    return NextResponse.json(
      { error: 'This user has no login account linked, so there is no password to reset.' },
      { status: 400 }
    )
  }

  const admin = createSupabaseAdminClient()
  const { error: authErr } = await admin.auth.admin.updateUserById(row.auth_user_id, {
    password: newPassword,
  })
  if (authErr) return NextResponse.json({ error: authErr.message }, { status: 500 })

  // A reset is also the way out of a lockout — clearing the counter here saves
  // the "naya password de diya, phir bhi login nahi ho raha" support call.
  await supabase.from('users' as any)
    .update({ failed_login_attempts: 0, locked_until: null })
    .eq('id', row.id)

  // The password change happens inside auth.users, which carries no audit
  // trigger, so record the fact (never the password) against public.users.
  await admin.from('audit_log' as any).insert({
    company_id: companyId,
    table_name: 'users',
    record_id:  row.id,
    action:     'UPDATE',
    new_values: { password_reset: true, reset_by: actorId },
    changed_by: actorId,
  })

  return NextResponse.json({
    data: {
      password:  newPassword,
      full_name: row.full_name,
      email:     row.email,
    },
  })
})
