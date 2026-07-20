import { NextResponse, type NextRequest } from 'next/server'
import { randomBytes } from 'crypto'
import { createSupabaseServerClient } from '@/lib/supabase/server'
import { getCompanyId } from '@/lib/utils/getCompanyId'
import { getUserTableId } from '@/lib/utils/getUserTableId'
import { requirePermission } from '@/lib/utils/requirePermission'
import { withErrorHandling } from '@/lib/utils/apiHandler'

// Generates (or rotates) a customer's portal access token. Re-calling this
// invalidates any previously-shared link — same behavior as the quotation
// approval token, and for the same reason: a link that leaked or was sent
// to the wrong person should be revocable by generating a fresh one.
export const POST = withErrorHandling(async function POST(_: NextRequest, { params }: { params: { id: string } }) {
  const supabase = createSupabaseServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const companyId = await getCompanyId(user, supabase)
  const userTableId = await getUserTableId(user, supabase)
  const denied = await requirePermission(userTableId, 'customers', 'edit', supabase)
  if (denied) return denied

  const token = randomBytes(32).toString('hex')
  const expiresAt = new Date(Date.now() + 90 * 86400000).toISOString() // 90 days

  const { data, error } = await supabase.from('customers' as any).update({
    portal_token: token,
    portal_token_expires_at: expiresAt,
    portal_enabled: true,
  }).eq('id', params.id).eq('company_id', companyId).select('id, portal_token, portal_token_expires_at').single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ data })
})

// Revoke portal access without deleting the customer record.
export const DELETE = withErrorHandling(async function DELETE(_: NextRequest, { params }: { params: { id: string } }) {
  const supabase = createSupabaseServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const companyId = await getCompanyId(user, supabase)
  const userTableId = await getUserTableId(user, supabase)
  const denied = await requirePermission(userTableId, 'customers', 'edit', supabase)
  if (denied) return denied

  const { error } = await supabase.from('customers' as any).update({
    portal_enabled: false,
    portal_token: null,
    portal_token_expires_at: null,
  }).eq('id', params.id).eq('company_id', companyId)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ success: true })
})
