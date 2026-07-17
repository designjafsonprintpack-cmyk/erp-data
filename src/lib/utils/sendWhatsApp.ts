/**
 * Sends a WhatsApp message via Meta's WhatsApp Cloud API (Graph API).
 * Nothing is configured yet — this returns { sent: false, reason:
 * 'not_configured' } until the following environment variables are set
 * (Vercel → Project → Settings → Environment Variables):
 *
 *   WHATSAPP_PHONE_NUMBER_ID   The "Phone number ID" from Meta for Developers
 *                              → WhatsApp → API Setup (NOT the phone number
 *                              itself — a numeric ID Meta assigns to it).
 *   WHATSAPP_ACCESS_TOKEN      A permanent access token for a System User
 *                              with whatsapp_business_messaging permission
 *                              (the temporary token Meta shows by default
 *                              expires in 24 hours — generate a permanent one
 *                              under Business Settings → System Users).
 *   WHATSAPP_TEMPLATE_NAME     (optional) Name of an approved message
 *                              template — see note below.
 *   WHATSAPP_TEMPLATE_LANG     (optional) Template language code, e.g. 'en_US'.
 *                              Defaults to 'en_US' if a template name is set.
 *
 * IMPORTANT — templates vs. free text:
 * WhatsApp only allows free-form text messages within a 24-hour window after
 * the customer last messaged your business number. A business-initiated
 * notification like "your order was dispatched" is usually sent OUTSIDE that
 * window, which Meta requires to go through a pre-approved Message Template
 * (create and submit one for approval in Meta Business Manager → WhatsApp
 * Manager → Message Templates — approval can take from minutes to ~24 hours).
 * If WHATSAPP_TEMPLATE_NAME is set, this function sends that template. If
 * not, it falls back to a free-text message, which will only actually
 * deliver if the customer messaged within the last 24 hours — Meta will
 * reject it otherwise, and that rejection is surfaced via the returned
 * `reason`, not swallowed.
 *
 * This function deliberately never throws — a failed/unconfigured message
 * should never block whatever business action (e.g. dispatch) triggered it.
 * Callers should check the returned `sent` flag if they want to log/notify.
 */
export async function sendWhatsApp(
  toPhone: string,
  message: string,
  templateParams?: string[] // values to fill the approved template's {{1}}, {{2}}, ... placeholders, in order
): Promise<{ sent: boolean; reason?: string }> {
  const phoneNumberId = process.env.WHATSAPP_PHONE_NUMBER_ID
  const accessToken = process.env.WHATSAPP_ACCESS_TOKEN
  const templateName = process.env.WHATSAPP_TEMPLATE_NAME
  const templateLang = process.env.WHATSAPP_TEMPLATE_LANG || 'en_US'

  if (!phoneNumberId || !accessToken) {
    return { sent: false, reason: 'not_configured' }
  }
  if (!toPhone) {
    return { sent: false, reason: 'no_recipient_phone' }
  }

  // WhatsApp numbers must be in international format with no leading '+',
  // spaces, or dashes (e.g. 923001234567 for a Pakistani number).
  const to = toPhone.replace(/[^\d]/g, '')

  const payload = templateName
    ? {
        messaging_product: 'whatsapp',
        to,
        type: 'template',
        template: {
          name: templateName,
          language: { code: templateLang },
          ...(templateParams?.length
            ? { components: [{ type: 'body', parameters: templateParams.map((p) => ({ type: 'text', text: p })) }] }
            : {}),
        },
      }
    : {
        messaging_product: 'whatsapp',
        to,
        type: 'text',
        text: { body: message },
      }

  try {
    const res = await fetch(`https://graph.facebook.com/v19.0/${phoneNumberId}/messages`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${accessToken}`,
      },
      body: JSON.stringify(payload),
    })
    if (!res.ok) {
      const errBody = await res.text()
      return { sent: false, reason: `provider_error: ${errBody.slice(0, 300)}` }
    }
    return { sent: true }
  } catch (err: any) {
    return { sent: false, reason: `network_error: ${err?.message || 'unknown'}` }
  }
}
