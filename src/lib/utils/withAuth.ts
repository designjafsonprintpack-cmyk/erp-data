import { NextResponse, type NextRequest } from 'next/server'
import type { User } from '@supabase/supabase-js'
import { createSupabaseServerClient } from '@/lib/supabase/server'
import { getCompanyId } from '@/lib/utils/getCompanyId'
import { getUserTableId } from '@/lib/utils/getUserTableId'
import { requirePermission } from '@/lib/utils/requirePermission'
import { withErrorHandling } from '@/lib/utils/apiHandler'

type SupabaseServerClient = ReturnType<typeof createSupabaseServerClient>

export interface AuthContext {
  supabase: SupabaseServerClient
  user: User
  companyId: string
  userTableId: string | null
}

type AuthedHandler<TExtra extends any[]> = (
  req: NextRequest,
  ctx: AuthContext,
  ...extra: TExtra
) => Promise<Response>

/**
 * Composes the auth + company + permission boilerplate repeated at the top
 * of most route handlers — getUser() -> getCompanyId() -> getUserTableId()
 * -> requirePermission(module, action) — into a single call, wrapped in
 * withErrorHandling the same way every route already is.
 *
 * This is a NEW utility only. No existing route has been migrated to use
 * it in this change — that's a separate, deliberately incremental follow-up
 * so no working route is touched here. New routes (or routes being revisited
 * for other reasons) can adopt it going forward.
 *
 * Usage — replaces the routes' existing repeated block 1:1, handler receives
 * the resolved context instead of re-deriving it itself:
 *
 *   export const POST = withAuth('customers', 'create', async (req, { supabase, companyId }) => {
 *     const body = await req.json()
 *     ... same handler body as before, minus the auth/company/permission lines
 *   })
 *
 * For routes with a dynamic segment (e.g. [id]), Next.js's second argument
 * ({ params }) is forwarded through unchanged as the wrapped handler's third
 * parameter:
 *
 *   export const PATCH = withAuth('jobs', 'edit', async (req, { companyId }, { params }) => {
 *     ...
 *   })
 *
 * Returns exactly the same 401 (`{ error: 'Unauthorized' }`) and 403
 * (`{ error: 'You do not have permission to <action> <module>.' }`) shapes
 * the manual pattern already returns — swapping a route over to this wrapper
 * is a behavior-preserving refactor, not a new authorization rule.
 */
export function withAuth<TExtra extends any[] = []>(
  module: string,
  action: string,
  handler: AuthedHandler<TExtra>
) {
  return withErrorHandling(async (req: NextRequest, ...extra: TExtra) => {
    const supabase = createSupabaseServerClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const companyId = await getCompanyId(user, supabase)
    const userTableId = await getUserTableId(user, supabase)
    const denied = await requirePermission(userTableId, module, action, supabase)
    if (denied) return denied

    return handler(req, { supabase, user, companyId, userTableId }, ...extra)
  })
}
