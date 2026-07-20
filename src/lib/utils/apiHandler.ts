import { NextResponse } from 'next/server'

/**
 * Wraps a Next.js route handler so an unexpected throw (bad JSON body,
 * Supabase timeout, a null-deref bug, etc.) returns a JSON 500 instead of
 * crashing into Next's raw HTML error page — which breaks every frontend
 * `.json()` call silently instead of surfacing a readable error.
 *
 * Usage:
 *   export const GET = withErrorHandling(async (req: NextRequest) => { ... })
 *   export const PATCH = withErrorHandling(async (req, { params }) => { ... })
 *
 * Does not change any response a handler already returns — only catches
 * what the handler didn't.
 */
export function withErrorHandling<T extends (...args: any[]) => Promise<Response>>(
  handler: T
): T {
  return (async (...args: Parameters<T>) => {
    try {
      return await handler(...args)
    } catch (err: any) {
      console.error('[API Error]', err)
      const message =
        process.env.NODE_ENV === 'production'
          ? 'Internal server error'
          : err?.message || 'Internal server error'
      return NextResponse.json({ error: message }, { status: 500 })
    }
  }) as T
}
