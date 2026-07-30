import type { SupabaseClient } from '@supabase/supabase-js'

/**
 * The next free running position on a planned day (migration 112).
 *
 * A plan that is created, or moved onto a date, must land at the END of that
 * day — keeping its old number would drop it near the top of a day it has
 * nothing to do with yet, and DEFAULT 0 would put it above everything.
 *
 * Cancelled plans are counted deliberately: they still hold their slot, so
 * reusing their number would collide with a live plan.
 *
 * Throws rather than returning a fallback. An error swallowed here would look
 * exactly like "the day is empty" and quietly stack every new plan on 1 — the
 * same `(await q).data ?? []` mistake CLAUDE.md §8 records.
 */
export async function nextDayOrder(
  supabase: SupabaseClient,
  companyId: string,
  plannedDate: string
): Promise<number> {
  const { data, error } = await supabase.from('job_plans' as any)
    .select('day_order')
    .eq('company_id', companyId)
    .eq('planned_date', plannedDate)
    .is('deleted_at', null)
    .order('day_order', { ascending: false })
    .limit(1)
    .maybeSingle()

  if (error) throw new Error(`Could not read the day's running order: ${error.message}`)
  return (((data as any)?.day_order as number) ?? 0) + 1
}

export default nextDayOrder
