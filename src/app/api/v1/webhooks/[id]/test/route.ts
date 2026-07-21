import { NextResponse, type NextRequest } from 'next/server'
import { createSupabaseServerClient } from '@/lib/supabase/server'
import { getCompanyId } from '@/lib/utils/getCompanyId'
import { getUserTableId } from '@/lib/utils/getUserTableId'
import { requirePermission } from '@/lib/utils/requirePermission'
import { withErrorHandling } from '@/lib/utils/apiHandler'
import crypto from 'crypto'

// Sends a synthetic ping.test event straight to this one endpoint (not via
// deliverWebhook's event_types matching — a test ping should always reach
// the endpoint being tested, regardless of what it's subscribed to) and
// reports success/failure back to the UI immediately instead of only via
// the async delivery log.
export const POST = withErrorHandling(async function POST(_req: NextRequest, { params }: { params: { id: string } }) {
  const supabase = createSupabaseServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const companyId = await getCompanyId(user, supabase)
  const userTableId = await getUserTableId(user, supabase)
  const denied = await requirePermission(userTableId, 'settings', 'edit', supabase)
  if (denied) return denied

  const { data: endpoint } = await supabase.from('webhook_endpoints' as any)
    .select('id, url, secret').eq('id', params.id).eq('company_id', companyId).maybeSingle()
  if (!endpoint) return NextResponse.json({ error: 'Endpoint not found' }, { status: 404 })
  const ep = endpoint as any

  const payload = { message: 'This is a test ping from Jafson Print ERP', triggered_at: new Date().toISOString() }
  const body = JSON.stringify({ event: 'ping.test', data: payload, sent_at: new Date().toISOString() })
  const signature = crypto.createHmac('sha256', ep.secret).update(body).digest('hex')

  let ok = false
  let responseCode: number | null = null
  let errorMessage: string | null = null

  try {
    const res = await fetch(ep.url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-Webhook-Signature': signature, 'X-Webhook-Event': 'ping.test' },
      body,
      signal: AbortSignal.timeout(10_000),
    })
    responseCode = res.status
    ok = res.ok
    if (!res.ok) errorMessage = `HTTP ${res.status}`
  } catch (err: any) {
    errorMessage = err?.message || 'network_error'
  }

  await supabase.from('webhook_deliveries' as any).insert({
    company_id: companyId, endpoint_id: ep.id, event_type: 'ping.test', payload,
    status: ok ? 'success' : 'failed', response_code: responseCode, error_message: errorMessage,
    attempt_count: 1, attempted_at: new Date().toISOString(),
  })

  return NextResponse.json({ ok, response_code: responseCode, error: errorMessage })
})
