/**
 * Search jobs and return their full PRODUCTION SPEC — the lookup behind
 * "Same spec as an old job?" on New Job.
 *
 * WHY IT EXISTS
 *   The New Job page pre-loads jobs for its pickers with `.limit(200)`, newest
 *   first, and the search box filters that array in the browser. With 479 jobs
 *   on live that means **279 of them cannot be found at all** — and because the
 *   478 legacy jobs all share one backdated `created_at`, WHICH 200 arrive is
 *   not even stable. Copying a spec from an old job is precisely the case that
 *   breaks on.
 *
 *   This is the same defect CLAUDE.md §6 records: a filter that stays in the
 *   browser silently reinstates the cap, because it can only filter the page in
 *   hand. The fix is the same one every list page took — make the filter a
 *   query the server runs.
 *
 * WHAT IT RETURNS
 *   The columns the New Job spec form binds to, and nothing else.
 *
 *   `quoted_amount` is the one money field among them — "Repeat with Changes"
 *   prefills it — so it is returned ONLY to a caller who passes
 *   `canSeeMoneyServer('cost')`, and stripped to null for everyone else. That
 *   is stricter than what it replaces: `jobs/new/page.tsx` puts the amount of
 *   200 jobs into the page payload for **every** role, gated only by
 *   `MoneyGate` on the way to the screen. A production operator could read it
 *   in the HTML today.
 */
import { NextResponse, type NextRequest } from 'next/server'
import { createSupabaseServerClient } from '@/lib/supabase/server'
import { getCompanyId } from '@/lib/utils/getCompanyId'
import { getUserTableId } from '@/lib/utils/getUserTableId'
import { requirePermission } from '@/lib/utils/requirePermission'
import { escapeFilterValue } from '@/lib/utils/escapeFilterValue'
import { withErrorHandling } from '@/lib/utils/apiHandler'
import { canSeeMoneyServer } from '@/lib/utils/canSeeMoneyServer'
import { parseSizeQuery, applySizeFilter } from '@/lib/utils/parseSizeQuery'

/** Enough to choose from; small enough that the dropdown stays usable. */
const MAX_RESULTS = 50

export const GET = withErrorHandling(async function GET(req: NextRequest) {
  const supabase = createSupabaseServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const companyId = await getCompanyId(user, supabase)
  const userTableId = await getUserTableId(user, supabase)
  // Whoever can create a job may read a spec to copy into it.
  const denied = await requirePermission(userTableId, 'jobs', 'create', supabase)
  if (denied) return denied

  const q = (new URL(req.url).searchParams.get('q') || '').trim()

  let query = supabase
    .from('jobs' as any)
    .select('id,job_number,job_title,customer_id,customers(name),description,' +
            'size_l,size_w,size_h,sheet_width_in,sheet_height_in,box_type_id,' +
            'quantity,no_of_colors,die_number,gsm,ups,board_type_id,paper_type_id,' +
            'lamination_type_id,foil_type_id,uv_coating,special_finishing,' +
            'pasting,workflow_template_id,quoted_amount')
    .eq('company_id', companyId)
    .is('deleted_at', null)
    .eq('is_active', true)
    // Press proofs share their parent's identity and are not a spec anyone
    // would copy from — the jobs list hides them for the same reason (104).
    .eq('job_kind', 'production')

  // "190x100x45" is a SIZE, not text. Checked before the text search because a
  // dimension is what an inquiry actually arrives as — the customer says "wohi
  // 190 x 100 x 45 wala dabba", not a job number.
  const size = parseSizeQuery(q)
  if (size) {
    query = applySizeFilter(query, size)
  } else if (q) {
    const safe = escapeFilterValue(q)
    const clauses = [
      `job_number.ilike."%${safe}%"`,
      `job_title.ilike."%${safe}%"`,
      `die_number.ilike."%${safe}%"`,
    ]

    // Customer name lives on the EMBEDDED customers row, and PostgREST cannot
    // put an embedded column inside a parent-level .or(). So the name is
    // resolved to ids first and matched on jobs.customer_id, which is a real
    // column on this table. Without this, searching "Ags" would find nothing —
    // and the browser-side filter it replaces did support customer name.
    const { data: custs } = await supabase
      .from('customers' as any)
      .select('id')
      .eq('company_id', companyId)
      .ilike('name', `%${q.replace(/([\\%_])/g, '\\$1')}%`)
      .limit(50)

    const ids = ((custs ?? []) as any[]).map(c => c.id)
    if (ids.length) clauses.push(`customer_id.in.(${ids.join(',')})`)

    query = query.or(clauses.join(','))
  }

  const { data, error } = await query
    // .order('id') is the tiebreaker the 478 legacy jobs need — they all share
    // one backdated created_at, so without it the same search can return
    // different rows twice.
    .order('created_at', { ascending: false })
    .order('id', { ascending: false })
    .limit(MAX_RESULTS)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  // Stripped server-side, not hidden client-side. Every other money gate in
  // this codebase is a DISPLAY gate over data the API still returns (119); this
  // one can afford to be real, because the field has exactly one consumer and
  // dropping it costs nothing else.
  const showMoney = await canSeeMoneyServer(supabase, 'cost')
  const rows = ((data ?? []) as any[]).map(r => showMoney ? r : { ...r, quoted_amount: null })

  return NextResponse.json({ data: rows, limit: MAX_RESULTS, money_visible: showMoney })
})
