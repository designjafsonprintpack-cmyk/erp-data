import { NextResponse, type NextRequest } from 'next/server'
import { createSupabaseServerClient } from '@/lib/supabase/server'
import { getCompanyId } from '@/lib/utils/getCompanyId'
import { escapeFilterValue } from '@/lib/utils/escapeFilterValue'
import { jobNumberStem } from '@/lib/utils/jobRunNumber'
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

  // ─── One carton, one result ────────────────────────────────────────────────
  // Mehboob: "search main abhi bhi 2 hi show ho rahe hain … job number aik hi
  // hona chahiye." A reorder is the same box, so listing every run separately
  // made the palette read as duplicates and buried other matches.
  //
  // Collapsed on the number STEM (jobRunNumber.ts): every run of a carton now
  // shares one — JOB-00408 and JOB-00408-R2. That needs no extra
  // query and no join, and it works however deep the repeat chain goes.
  //
  // WHICH RUN SURVIVES, AND WHY IT IS NOT SIMPLY THE NEWEST
  //   An EXACT match on what the user typed always wins. Someone who types the
  //   old number is looking for that run — a search that answered with a
  //   different job would be worse than showing two. Otherwise the live run
  //   wins (the one still being worked), falling back to the newest, because
  //   "where is this job now" is the question the palette is usually answering.
  const typed = query.trim().toUpperCase()
  const CLOSED = ['completed', 'dispatched', 'cancelled']

  const byStem = new Map<string, any>()
  const out: any[] = []

  for (const r of rows) {
    if (r.entity_type !== 'job') { out.push(r); continue }

    const stem = jobNumberStem(r.code)
    const seen = byStem.get(stem)
    if (!seen) {
      byStem.set(stem, r)
      out.push(r)
      r.run_count = 1
      continue
    }

    seen.run_count = (seen.run_count ?? 1) + 1

    const better =
      String(r.code ?? '').toUpperCase() === typed ? true
      : String(seen.code ?? '').toUpperCase() === typed ? false
      : !CLOSED.includes(String(r.status ?? '')) && CLOSED.includes(String(seen.status ?? '')) ? true
      : false

    if (better) {
      // Swap in place so the palette's ordering (relevance) is preserved.
      out[out.indexOf(seen)] = r
      r.run_count = seen.run_count
      byStem.set(stem, r)
    }
  }

  return NextResponse.json({ data: out })
})
