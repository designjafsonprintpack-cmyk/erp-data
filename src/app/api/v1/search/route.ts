import { NextResponse, type NextRequest } from 'next/server'
import { createSupabaseServerClient } from '@/lib/supabase/server'
import { getCompanyId } from '@/lib/utils/getCompanyId'
import { escapeFilterValue } from '@/lib/utils/escapeFilterValue'
import { withErrorHandling } from '@/lib/utils/apiHandler'

export const GET = withErrorHandling(async function GET(req: NextRequest) {
  const supabase = createSupabaseServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const companyId = await getCompanyId(user, supabase)

  const { searchParams } = new URL(req.url)
  const query = searchParams.get('q')?.trim() || ''
  const type  = searchParams.get('type') || '' // 'job' | 'customer' | 'sales_order' | ''

  if (query.length < 2) return NextResponse.json({ data: [] })

  // Build tsquery — handle single words and phrases
  const tsQuery = query.split(/\s+/).filter(Boolean).map(w => w + ':*').join(' & ')

  let q = supabase
    .from('global_search_index' as any)
    .select('id, entity_type, code, title, status, customer_name, created_at, required_date')
    .eq('company_id', companyId)
    // No `type` here on purpose: tsQuery above is built with `word:*` prefix
    // syntax, which only to_tsquery understands. `type: 'websearch'` (or
    // 'plain'/'phrase') would route through websearch_to_tsquery/
    // plainto_tsquery instead, neither of which parses `:*` — so prefix
    // matching silently wouldn't work if that option were set.
    .textSearch('search_vector', tsQuery, { config: 'simple' })
    .limit(20)

  if (type) q = q.eq('entity_type', type)

  const { data, error } = await q

  if (error) {
    // Fallback to ilike if materialized view fails
    const fallback = await supabase
      .from('jobs' as any)
      // Sizes here too, or the palette would silently lose the size line
      // exactly when the search index is broken and nobody would connect the
      // two. Same columns as the enrichment below.
      .select('id,job_number,job_title,status,size_l,size_w,size_h,sheet_width_in,sheet_height_in,customers(name)')
      .eq('company_id', companyId)
      .is('deleted_at', null)
      .or(`job_number.ilike."%${escapeFilterValue(query)}%",job_title.ilike."%${escapeFilterValue(query)}%"`)
      .limit(10)

    return NextResponse.json({
      data: (fallback.data ?? []).map((j: any) => ({
        id: j.id, entity_type: 'job', code: j.job_number,
        title: j.job_title, status: j.status,
        customer_name: j.customers?.name || '',
        size_l: j.size_l, size_w: j.size_w, size_h: j.size_h,
        sheet_width_in: j.sheet_width_in, sheet_height_in: j.sheet_height_in,
      }))
    })
  }

  // Mehboob: "main search main b show ho" — the palette shows a job's code,
  // title and customer, none of which say what the box actually is. Two jobs
  // called "50g Inner & Outer" for the same customer are told apart by their
  // size and nothing else.
  //
  // Enriched here rather than added to `global_search_index`: that view is
  // shared by every entity type and widening it means a migration plus a
  // refresh of the whole index, for a field only one entity has. At most 20
  // rows come back, so this is one small keyed lookup.
  const rows = (data ?? []) as any[]
  const jobIds = rows.filter(r => r.entity_type === 'job').map(r => r.id)

  if (jobIds.length) {
    const { data: sizes, error: sizeErr } = await supabase
      .from('jobs' as any)
      .select('id,size_l,size_w,size_h,sheet_width_in,sheet_height_in')
      .in('id', jobIds)

    // Checked, not swallowed — but a failure only costs the size line, so the
    // search still returns its results rather than 500ing.
    if (sizeErr) console.error('[search] size lookup failed:', sizeErr.message)
    else {
      const byId = new Map((sizes ?? []).map((s: any) => [s.id, s]))
      for (const r of rows) {
        const s = byId.get(r.id)
        if (s) {
          r.size_l = s.size_l; r.size_w = s.size_w; r.size_h = s.size_h
          r.sheet_width_in = s.sheet_width_in; r.sheet_height_in = s.sheet_height_in
        }
      }
    }
  }

  return NextResponse.json({ data: rows })
})
