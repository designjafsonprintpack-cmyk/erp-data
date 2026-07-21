import { NextResponse, type NextRequest } from 'next/server'

/**
 * Lightweight in-memory rate limiter for public/unauthenticated routes
 * (token-based approval links, login).
 *
 * LIMITATION — read before extending usage: this tracks counts in a plain
 * in-process Map, not a shared store. On Vercel, each serverless function
 * instance has its own memory, so a client's requests can land on different
 * instances and each will have its own counter — this is a best-effort
 * additional layer, not a hard per-IP guarantee across the whole deployment.
 * It still meaningfully raises the cost of casual automated abuse (token
 * scanning, login spraying) with zero new infrastructure. If stronger
 * guarantees are ever needed, that's a separate decision (e.g. a shared
 * store like Upstash Redis) — not something to silently swap in here.
 */

interface Bucket {
  count: number
  resetAt: number
}

const buckets = new Map<string, Bucket>()

// Crude safety valve so a long-lived warm instance under sustained abuse
// doesn't grow this Map unbounded — not a proper LRU, just a floor against
// unbounded memory growth. Under normal traffic this is never reached.
const MAX_TRACKED_KEYS = 5000

export function getClientIp(req: NextRequest): string {
  return (
    req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ||
    req.headers.get('x-real-ip') ||
    'unknown'
  )
}

/**
 * Returns a ready-to-return 429 NextResponse if `key` has exceeded `max`
 * requests within `windowMs`, or null if the request is allowed (and has
 * been counted against the window).
 *
 * Usage:
 *   const limited = rateLimit(`quotation-approval:${getClientIp(req)}`, { windowMs: 5 * 60_000, max: 30 })
 *   if (limited) return limited
 */
export function rateLimit(
  key: string,
  { windowMs, max }: { windowMs: number; max: number }
): NextResponse | null {
  const now = Date.now()
  const existing = buckets.get(key)

  if (!existing || existing.resetAt <= now) {
    if (buckets.size >= MAX_TRACKED_KEYS) buckets.clear()
    buckets.set(key, { count: 1, resetAt: now + windowMs })
    return null
  }

  if (existing.count >= max) {
    const retryAfterSeconds = Math.ceil((existing.resetAt - now) / 1000)
    return NextResponse.json(
      { error: 'Too many requests. Please try again shortly.' },
      { status: 429, headers: { 'Retry-After': String(retryAfterSeconds) } }
    )
  }

  existing.count += 1
  return null
}
