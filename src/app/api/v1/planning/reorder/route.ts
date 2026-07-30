import { NextResponse, type NextRequest } from 'next/server'
import { createSupabaseServerClient } from '@/lib/supabase/server'
import { getCompanyId } from '@/lib/utils/getCompanyId'
import { getUserTableId } from '@/lib/utils/getUserTableId'
import { requirePermission } from '@/lib/utils/requirePermission'
import { withErrorHandling } from '@/lib/utils/apiHandler'
import { parseBody } from '@/lib/utils/validate'
import { planReorderSchema } from '@/lib/schemas/planning'

/**
 * Rewrites the running order of one planned day: day_order = 1..n in the order
 * the ids arrive (migration 112).
 *
 * The whole day is sent in a single call rather than swapping two rows, so the
 * result is idempotent, gaps left by cancelled plans close themselves, and the
 * order can never drift out of step with what the client is showing.
 *
 * The literal `reorder` segment sits next to the `[id]` dynamic segment; Next.js
 * resolves static before dynamic, so this is not swallowed by `planning/[id]`.
 */
export const PATCH = withErrorHandling(async function PATCH(req: NextRequest) {
  const supabase = createSupabaseServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const companyId = await getCompanyId(user, supabase)
  const userTableId = await getUserTableId(user, supabase)
  const denied = await requirePermission(userTableId, 'planning', 'edit', supabase)
  if (denied) return denied

  const parsed = await parseBody(req, planReorderSchema)
  if ('error' in parsed) return parsed.error
  const { planned_date, ordered_ids } = parsed.data

  if (new Set(ordered_ids).size !== ordered_ids.length) {
    return NextResponse.json({ error: 'ordered_ids contains duplicates' }, { status: 400 })
  }

  // Every id must be a live plan of THIS company on THIS date. Checked up front
  // so a bad id is a clear 400 rather than a silently skipped row — the caller
  // would otherwise see 200 and a list that didn't move.
  const { data: owned, error: ownErr } = await supabase.from('job_plans' as any)
    .select('id')
    .eq('company_id', companyId)
    .eq('planned_date', planned_date)
    .is('deleted_at', null)
    .in('id', ordered_ids)

  if (ownErr) return NextResponse.json({ error: ownErr.message }, { status: 500 })

  const ownedIds = new Set(((owned ?? []) as any[]).map(r => r.id))
  const strays = ordered_ids.filter(id => !ownedIds.has(id))
  if (strays.length) {
    return NextResponse.json(
      { error: `${strays.length} plan(s) are not on ${planned_date} — reorder rejected` },
      { status: 400 }
    )
  }

  // Sequential single-row updates. A day holds a handful of plans, so this is
  // cheap, and every statement is scoped to the company as well as the id.
  // Not wrapped in a transaction: a partial write leaves a mixed order, which
  // is visually wrong but self-heals the next time the full list is sent — no
  // data is lost either way, and one planner means the race is theoretical.
  for (let i = 0; i < ordered_ids.length; i++) {
    const { error } = await supabase.from('job_plans' as any)
      .update({ day_order: i + 1, updated_by: userTableId })
      .eq('id', ordered_ids[i])
      .eq('company_id', companyId)
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json({ success: true, reordered: ordered_ids.length })
})
