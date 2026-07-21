/**
 * Runs pattern analysis over aggregated QC defect-trend data (by type,
 * severity, week, top customers — already computed by get_qc_defect_trends,
 * same data the Trends tab charts already show) and asks OpenAI to surface
 * patterns/correlations a human might not notice at a glance, plus
 * practical recommendations. Needs OPENAI_API_KEY set.
 *
 * Deliberately works off the already-aggregated stats, not raw defect rows
 * or images — this is a text-reasoning task (find patterns in numbers),
 * not a vision task like aiArtworkPreflight.ts. Advisory only: never
 * writes anything back to qc_defects or any other table.
 */

export interface DefectPatternInsight {
  summary: string
  patterns: { title: string; detail: string }[]
  recommendations: string[]
}

const SYSTEM_PROMPT = `You are a quality-control analyst for a commercial packaging/carton printing company. You will be given aggregated defect statistics for a recent period: counts by defect type, by severity, by week, and by top customers.

Look for patterns a busy QC manager might not notice at a glance — e.g. a defect type trending up over the weeks, a customer with a disproportionately high share of defects, a severity mix that's shifting worse, or a defect type that looks concentrated rather than spread evenly. Only report patterns the data actually supports — do not invent causes (like blaming a specific machine or operator) that aren't in the data given to you.

Respond ONLY with a JSON object matching this exact shape, no other text:
{
  "summary": "one or two sentence overall assessment",
  "patterns": [ { "title": "short title", "detail": "one or two sentence explanation grounded in the numbers given" } ],
  "recommendations": [ "one practical, actionable suggestion" ]
}
If the data is too sparse or flat to say anything meaningful, return empty arrays and say so in the summary.`

export async function detectDefectPatterns(
  trendData: Record<string, any>
): Promise<{ ok: true; data: DefectPatternInsight } | { ok: false; reason: string }> {
  const apiKey = process.env.OPENAI_API_KEY
  if (!apiKey) return { ok: false, reason: 'OPENAI_API_KEY is not configured' }

  try {
    const res = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` },
      body: JSON.stringify({
        model: 'gpt-4o',
        response_format: { type: 'json_object' },
        messages: [
          { role: 'system', content: SYSTEM_PROMPT },
          { role: 'user', content: `Defect trend data:\n\n${JSON.stringify(trendData)}` },
        ],
        max_tokens: 700,
      }),
      signal: AbortSignal.timeout(30_000),
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

    return {
      ok: true,
      data: {
        summary: parsed.summary || '',
        patterns: Array.isArray(parsed.patterns) ? parsed.patterns : [],
        recommendations: Array.isArray(parsed.recommendations) ? parsed.recommendations : [],
      },
    }
  } catch (err: any) {
    return { ok: false, reason: err?.message || 'network_error' }
  }
}
