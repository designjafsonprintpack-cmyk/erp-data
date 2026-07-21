import { NextResponse, type NextRequest } from 'next/server'
import { createSupabaseAdminClient } from '@/lib/supabase/admin'
import { withErrorHandling } from '@/lib/utils/apiHandler'
import { rateLimit, getClientIp } from '@/lib/utils/rateLimit'
import { parseBody } from '@/lib/utils/validate'
import { publicQuotationActionSchema } from '@/lib/schemas/publicToken'

// Public, unauthenticated — reachable from the emailed/shared link. Every
// query is scoped by the token itself (never by any auth session), and we
// use the service-role client because there is no logged-in user/company
// context to satisfy RLS with.
export const GET = withErrorHandling(async function GET(req: NextRequest, { params }: { params: { token: string } }) {
  const limited = rateLimit(`public-quotation-view:${getClientIp(req)}`, { windowMs: 5 * 60_000, max: 30 })
  if (limited) return limited

  const supabase = createSupabaseAdminClient()

  const { data, error } = await supabase.from('quotations' as any)
    .select('id, quotation_number, status, valid_until, notes, terms_conditions, subtotal, tax_amount, discount_amount, total_amount, approval_token_expires_at, approval_responded_at, customers(name), quotation_items(product_desc, size_l, size_w, size_h, quantity, no_of_colors, unit_price, subtotal, sort_order)')
    .eq('approval_token', params.token)
    .is('deleted_at', null)
    .maybeSingle()

  if (error || !data) return NextResponse.json({ error: 'This approval link is invalid.' }, { status: 404 })

  const expiresAt = (data as any).approval_token_expires_at
  if (expiresAt && new Date(expiresAt) < new Date()) {
    return NextResponse.json({ error: 'This approval link has expired. Please ask us to resend it.' }, { status: 410 })
  }

  const items = ((data as any).quotation_items || []).slice()
    .sort((a: any, b: any) => a.sort_order - b.sort_order)

  return NextResponse.json({ data: { ...(data as any), quotation_items: items } })
})

export const POST = withErrorHandling(async function POST(req: NextRequest, { params }: { params: { token: string } }) {
  const limited = rateLimit(`public-quotation-action:${getClientIp(req)}`, { windowMs: 5 * 60_000, max: 10 })
  if (limited) return limited

  const supabase = createSupabaseAdminClient()
  const parsed = await parseBody(req, publicQuotationActionSchema)
  if ('error' in parsed) return parsed.error
  const { action } = parsed.data

  const { data: quotation, error: findErr } = await supabase.from('quotations' as any)
    .select('id, status, approval_token_expires_at, approval_responded_at')
    .eq('approval_token', params.token)
    .is('deleted_at', null)
    .maybeSingle()

  if (findErr || !quotation) return NextResponse.json({ error: 'This approval link is invalid.' }, { status: 404 })

  const q = quotation as any
  const expiresAt = q.approval_token_expires_at
  if (expiresAt && new Date(expiresAt) < new Date()) {
    return NextResponse.json({ error: 'This approval link has expired. Please ask us to resend it.' }, { status: 410 })
  }
  if (q.approval_responded_at) {
    return NextResponse.json({ error: 'This quotation has already been responded to.' }, { status: 409 })
  }
  if (q.status !== 'sent') {
    return NextResponse.json({ error: `This quotation is no longer awaiting approval (status: ${q.status}).` }, { status: 409 })
  }

  const ip = req.headers.get('x-forwarded-for')?.split(',')[0]?.trim()
    || req.headers.get('x-real-ip')
    || 'unknown'

  const { data: updated, error: updErr } = await supabase.from('quotations' as any).update({
    status: action === 'approve' ? 'approved' : 'rejected',
    approval_responded_at: new Date().toISOString(),
    approval_ip: ip,
  }).eq('id', q.id).select('id, status').single()

  if (updErr) return NextResponse.json({ error: updErr.message }, { status: 500 })
  return NextResponse.json({ data: updated })
})
