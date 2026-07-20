/**
 * Sends an email via Resend's REST API (https://resend.com). Nothing is
 * configured yet — this returns { sent: false, reason: 'not_configured' }
 * until the following environment variables are set (Vercel → Project →
 * Settings → Environment Variables):
 *
 *   RESEND_API_KEY      API key from Resend dashboard → API Keys.
 *   RESEND_FROM_EMAIL    The verified sender address, e.g.
 *                        "Jafson Print Pack <notifications@jafsonprintpack.com>"
 *                        — the domain must be verified in Resend first, or
 *                        sends will be rejected.
 *
 * Why Resend and not SMTP/Nodemailer: this runs in Next.js API routes on
 * Vercel's serverless/edge runtime, where a raw SMTP socket connection is
 * unreliable (and blocked entirely on the edge runtime). A plain HTTPS POST
 * to a transactional email API is the same shape of integration already
 * used for WhatsApp (sendWhatsApp.ts) — no new SDK dependency needed.
 *
 * This function deliberately never throws — a failed/unconfigured email
 * should never block whatever business action (e.g. invoice creation)
 * triggered it. Callers should check the returned `sent` flag if they want
 * to log/notify.
 */
export async function sendEmail(
  toEmail: string,
  subject: string,
  htmlBody: string
): Promise<{ sent: boolean; reason?: string }> {
  const apiKey = process.env.RESEND_API_KEY
  const fromEmail = process.env.RESEND_FROM_EMAIL

  if (!apiKey || !fromEmail) {
    return { sent: false, reason: 'not_configured' }
  }
  if (!toEmail) {
    return { sent: false, reason: 'no_recipient_email' }
  }

  try {
    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        from: fromEmail,
        to: [toEmail],
        subject,
        html: htmlBody,
      }),
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
