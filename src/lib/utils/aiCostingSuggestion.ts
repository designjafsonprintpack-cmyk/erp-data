/**
 * Runs an AI-assisted sanity check on a job's cost breakdown by comparing
 * it against historical costings for similar jobs (same board type, close
 * quantity range) and asking OpenAI to flag anomalies — a line item that
 * looks unusually high/low vs comparable past jobs — and suggest a
 * reasonable total cost range. Needs OPENAI_API_KEY set.
 *
 * Advisory only, same as aiArtworkPreflight.ts: this NEVER writes to the
 * job_costings row or changes any number on the form — it only returns
 * text/flags for the staff member to read and decide on. The actual
 * costing figures remain 100% manually entered, matching the locked-in
 * "no auto-pricing without an explicit human action" pattern already used
 * elsewhere in the costing engine (Profit Margin % apply button is the one
 * deliberate exception, and it stays a one-click human action too).
 */

export interface CostingSuggestion {
  summary: string
  suggested_total_low: number | null
  suggested_total_high: number | null
  flags: { field: string; message: string }[]
}

interface HistoricalCosting {
  total_cost: number
  quantity: number
  board_cost: number
  printing_cost: number
}

const SYSTEM_PROMPT = `You are a cost-estimation assistant for a commercial packaging/carton printing company. You will be given a job's current cost breakdown (entered so far, may be incomplete) and a list of historical costings for similar past jobs (same board type, roughly similar quantity).

Compare the current entry against the historical comparables and:
- Flag any individual cost line that looks unusually high or low compared to the historical data, scaled for quantity
- Give a suggested total cost range based on the historical data, scaled for this job's quantity
- Keep it brief and practical — this is a sanity check for a human who will make the final call, not a definitive answer

Respond ONLY with a JSON object matching this exact shape, no other text:
{
  "summary": "one or two sentence overall assessment",
  "suggested_total_low": number or null,
  "suggested_total_high": number or null,
  "flags": [ { "field": "e.g. board_cost", "message": "one sentence explanation" } ]
}
If there isn't enough historical data to say anything useful, return null for the range and an empty flags array, and say so in the summary.`

export async function suggestJobCosting(
  currentCosts: Record<string, number>,
  quantity: number,
  boardType: string | null,
  historical: HistoricalCosting[]
): Promise<{ ok: true; data: CostingSuggestion } | { ok: false; reason: string }> {
  const apiKey = process.env.OPENAI_API_KEY
  if (!apiKey) return { ok: false, reason: 'OPENAI_API_KEY is not configured' }

  const userContent = [
    `Current job: quantity ${quantity.toLocaleString()}${boardType ? `, board type "${boardType}"` : ''}`,
    `Current cost entry (PKR): ${JSON.stringify(currentCosts)}`,
    `Historical comparable costings (PKR): ${JSON.stringify(historical)}`,
  ].join('\n\n')

  try {
    const res = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` },
      body: JSON.stringify({
        model: 'gpt-4o',
        response_format: { type: 'json_object' },
        messages: [
          { role: 'system', content: SYSTEM_PROMPT },
          { role: 'user', content: userContent },
        ],
        max_tokens: 600,
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
        suggested_total_low: typeof parsed.suggested_total_low === 'number' ? parsed.suggested_total_low : null,
        suggested_total_high: typeof parsed.suggested_total_high === 'number' ? parsed.suggested_total_high : null,
        flags: Array.isArray(parsed.flags) ? parsed.flags : [],
      },
    }
  } catch (err: any) {
    return { ok: false, reason: err?.message || 'network_error' }
  }
}
