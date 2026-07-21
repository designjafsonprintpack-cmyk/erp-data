import type { SupabaseClient } from '@supabase/supabase-js'
import crypto from 'crypto'

/**
 * Delivers a webhook event to every active endpoint in this company that's
 * subscribed to eventType. Same non-blocking, never-throws contract as
 * sendEmail.ts/sendWhatsApp.ts — a webhook delivery failure should never
 * roll back or interrupt the business action that triggered it (dispatch
 * marked delivered, payment recorded, etc). Every attempt — success or
 * failure — is written to webhook_deliveries so Mehboob has a visible log
 * instead of a silent failure.
 *
 * Payload is signed with HMAC-SHA256 using the endpoint's own secret, sent
 * as an `X-Webhook-Signature` header (hex digest) — the same convention
 * used by Stripe/GitHub webhooks, so the receiving side has a standard
 * pattern to verify against.
 */
export async function deliverWebhook(
  supabase: SupabaseClient,
  companyId: string,
  eventType: string,
  payload: Record<string, any>
): Promise<void> {
  const { data: endpoints } = await supabase.from('webhook_endpoints' as any)
    .select('id, url, secret')
    .eq('company_id', companyId)
    .eq('is_active', true)
    .is('deleted_at', null)
    .contains('event_types', [eventType])

  for (const ep of ((endpoints ?? []) as any[])) {
    const body = JSON.stringify({ event: eventType, data: payload, sent_at: new Date().toISOString() })
    const signature = crypto.createHmac('sha256', ep.secret).update(body).digest('hex')

    let status = 'failed'
    let responseCode: number | null = null
    let errorMessage: string | null = null

    try {
      const res = await fetch(ep.url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'X-Webhook-Signature': signature, 'X-Webhook-Event': eventType },
        body,
        signal: AbortSignal.timeout(10_000),
      })
      responseCode = res.status
      status = res.ok ? 'success' : 'failed'
      if (!res.ok) errorMessage = `HTTP ${res.status}`
    } catch (err: any) {
      errorMessage = err?.message || 'network_error'
    }

    try {
      await supabase.from('webhook_deliveries' as any).insert({
        company_id: companyId,
        endpoint_id: ep.id,
        event_type: eventType,
        payload,
        status,
        response_code: responseCode,
        error_message: errorMessage,
        attempt_count: 1,
        attempted_at: new Date().toISOString(),
      })
    } catch { /* logging failure shouldn't compound the original failure */ }
  }
}
