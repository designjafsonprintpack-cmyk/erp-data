import { NextResponse, type NextRequest } from 'next/server'
import { randomBytes } from 'crypto'
import { createSupabaseServerClient } from '@/lib/supabase/server'
import { getCompanyId } from '@/lib/utils/getCompanyId'
import { getUserTableId } from '@/lib/utils/getUserTableId'
import { requirePermission } from '@/lib/utils/requirePermission'
import { withErrorHandling } from '@/lib/utils/apiHandler'
import { artworkApprovalLinkSchema } from '@/lib/schemas/artwork'

const EXPIRY_MS: Record<string, number | null> = {
  '7d':   7  * 24 * 60 * 60 * 1000,
  '14d':  14 * 24 * 60 * 60 * 1000,
  '30d':  30 * 24 * 60 * 60 * 1000,
  'never': null,
}

// POST — generate (or rotate) this artwork version's public approval link.
// Also moves status to 'waiting_customer_approval' if it wasn't already
// there, since sending a link out IS the "now waiting on the customer"
// transition — staff shouldn't have to separately remember to also change
// the status dropdown.
export const POST = withErrorHandling(async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const supabase = createSupabaseServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const companyId = await getCompanyId(user, supabase)
  const userTableId = await getUserTableId(user, supabase)
  const denied = await requirePermission(userTableId, 'artwork', 'edit', supabase)
  if (denied) return denied

  // Tolerates a missing/empty body (client may POST with no payload to use
  // the default 7d expiry) — parseBody's hard-400-on-unparseable-JSON
  // behavior would be a regression here, so this validates the same schema
  // manually instead, still rejecting anything that IS sent but malformed.
  const rawBody = await req.json().catch(() => ({}))
  const bodyResult = artworkApprovalLinkSchema.safeParse(rawBody)
  if (!bodyResult.success) {
    return NextResponse.json({ error: 'Validation failed', fieldErrors: bodyResult.error.flatten().fieldErrors }, { status: 400 })
  }
  const body = bodyResult.data
  const expiryKey = body.expiry && body.expiry in EXPIRY_MS ? body.expiry : '7d'
  const expiryMs = EXPIRY_MS[expiryKey]

  const token = randomBytes(32).toString('hex')
  const now = new Date()

  const updateData: Record<string, any> = {
    approval_token: token,
    approval_link_created_at: now.toISOString(),
    approval_token_expires_at: expiryMs ? new Date(now.getTime() + expiryMs).toISOString() : null,
  }
  // Only move status forward if it isn't already at/past this point in the
  // flow — re-sending a link for an artwork that's already approved/
  // rejected shouldn't silently reset its outcome.
  const { data: current } = await supabase.from('job_artworks' as any)
    .select('status').eq('id', params.id).eq('company_id', companyId).single()
  if (current && ['draft', 'internal_review'].includes((current as any).status)) {
    updateData.status = 'waiting_customer_approval'
  }

  const { data, error } = await supabase.from('job_artworks' as any)
    .update(updateData)
    .eq('id', params.id).eq('company_id', companyId)
    .select().single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  const approvalUrl = `${req.nextUrl.origin}/artwork/approve/${token}`
  return NextResponse.json({ data, approval_url: approvalUrl })
})
