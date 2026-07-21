/**
 * Runs an AI-assisted print-readiness check on an artwork JPG using
 * OpenAI's vision-capable chat completions API (gpt-4o). Needs
 * OPENAI_API_KEY set (Vercel → Project → Settings → Environment Variables).
 *
 * Takes the actual file bytes (base64) rather than a URL — the artwork
 * bucket is private, and downloading via the service-role client + sending
 * bytes directly is more reliable than trying to hand OpenAI a short-lived
 * signed URL to fetch itself. Job print-spec context (title/quantity/board/
 * size) is included in the prompt so size-relative judgement calls (e.g.
 * "does this look high-res enough for a 6x4 inch box") have something to
 * be relative to, not just an assessment in a vacuum.
 *
 * This is a synchronous, user-triggered call (staff clicks "Run Pre-flight
 * Check" and waits) — unlike sendEmail.ts/deliverWebhook.ts it reports
 * failure via the returned `ok: false` shape rather than throwing, so the
 * route can turn that into a clean 502 without a try/catch at the call site.
 * Deliberately advisory-only: never touches the production gate or any
 * approval logic — only writes an informational result for staff to read.
 */

export interface PreflightIssue {
  severity: 'info' | 'warning' | 'critical'
  title: string
  detail: string
}

interface JobContext {
  jobTitle: string
  quantity: number
  boardType: string | null
  requiredWidthIn: number | null
  requiredHeightIn: number | null
}

type PreflightOutcome =
  | { ok: true; status: 'pass' | 'warning' | 'fail'; summary: string; issues: PreflightIssue[] }
  | { ok: false; reason: string }

const SYSTEM_PROMPT = `You are a print-production pre-flight checker for a commercial packaging/carton printing company. You will be shown an artwork JPG that a customer or designer has submitted for printing, along with the job's print specs.

Look for common print-readiness problems visible in the image itself, such as:
- Visible pixelation, blurriness, or low apparent resolution relative to the physical print size given
- Important text, logos, or cut lines placed very close to the image edge with no visible margin/bleed
- Text that appears too small to read clearly when printed at this size
- Washed-out, overly dark, or clipped/banded colors
- Obvious missing elements (blank areas that look unintentional, broken layout)
- Visible compression artifacts or color shifts that suggest a low-quality source file

Respond ONLY with a JSON object matching this exact shape, no other text:
{
  "status": "pass" | "warning" | "fail",
  "summary": "one or two sentence overall assessment",
  "issues": [
    { "severity": "info" | "warning" | "critical", "title": "short title", "detail": "one sentence explanation" }
  ]
}
Use "fail" only if there's a critical issue that would clearly ruin the print. Use "warning" for real but non-blocking concerns. Use "pass" with an empty issues array if the artwork looks print-ready.`

export async function runAiArtworkPreflight(
  base64: string,
  mimeType: string,
  job: JobContext
): Promise<PreflightOutcome> {
  const apiKey = process.env.OPENAI_API_KEY
  if (!apiKey) return { ok: false, reason: 'OPENAI_API_KEY is not configured' }

  const specLines = [
    `Job: ${job.jobTitle}`,
    `Quantity: ${job.quantity.toLocaleString()}`,
    job.boardType ? `Board/material: ${job.boardType}` : null,
    job.requiredWidthIn && job.requiredHeightIn ? `Print size: ${job.requiredWidthIn} x ${job.requiredHeightIn} in` : null,
  ].filter(Boolean).join('\n')

  try {
    const res = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` },
      body: JSON.stringify({
        model: 'gpt-4o',
        response_format: { type: 'json_object' },
        messages: [
          { role: 'system', content: SYSTEM_PROMPT },
          {
            role: 'user',
            content: [
              { type: 'text', text: `Check this artwork for print-readiness issues.\n\n${specLines}` },
              { type: 'image_url', image_url: { url: `data:${mimeType};base64,${base64}` } },
            ],
          },
        ],
        max_tokens: 800,
      }),
      signal: AbortSignal.timeout(45_000),
    })

    if (!res.ok) {
      const errBody = await res.text()
      return { ok: false, reason: `OpenAI request failed: ${errBody.slice(0, 300)}` }
    }

    const json = await res.json()
    const raw = json?.choices?.[0]?.message?.content
    if (!raw) return { ok: false, reason: 'OpenAI returned no content' }

    let parsed: any
    try { parsed = JSON.parse(raw) } catch { return { ok: false, reason: 'Could not parse the AI response as JSON' } }

    const status = ['pass', 'warning', 'fail'].includes(parsed.status) ? parsed.status : 'warning'
    const issues = Array.isArray(parsed.issues) ? parsed.issues : []
    return { ok: true, status, summary: parsed.summary || '', issues }
  } catch (err: any) {
    return { ok: false, reason: err?.message || 'network_error' }
  }
}
