import { NextResponse } from 'next/server'
import type { ZodSchema } from 'zod'

/**
 * Parses and validates a request body against a zod schema.
 *
 * Returns `{ data }` on success (typed to the schema's output), or
 * `{ error }` with a ready-to-return 400 NextResponse on failure — either
 * because the body wasn't valid JSON, or because it didn't match the shape.
 *
 * Usage:
 *   const parsed = await parseBody(req, createCustomerSchema)
 *   if ('error' in parsed) return parsed.error
 *   const body = parsed.data   // fully typed, already validated
 *
 * Deliberately permissive by default (schemas below only require what the
 * existing handler already required) — the goal is to catch malformed
 * input Zod would previously have silently passed through as `any`, not to
 * add new business rules that could reject requests the app used to accept.
 */
export async function parseBody<T>(
  req: Request,
  schema: ZodSchema<T>
): Promise<{ data: T } | { error: NextResponse }> {
  let json: unknown
  try {
    json = await req.json()
  } catch {
    return { error: NextResponse.json({ error: 'Request body must be valid JSON' }, { status: 400 }) }
  }

  const result = schema.safeParse(json)
  if (!result.success) {
    const details = result.error.flatten()
    return {
      error: NextResponse.json(
        { error: 'Validation failed', fieldErrors: details.fieldErrors, formErrors: details.formErrors },
        { status: 400 }
      ),
    }
  }

  return { data: result.data }
}
