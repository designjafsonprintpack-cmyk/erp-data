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
      .select('id,job_number,job_title,status,customers(name)')
      .eq('company_id', companyId)
      .is('deleted_at', null)
      .or(`job_number.ilike."%${escapeFilterValue(query)}%",job_title.ilike."%${escapeFilterValue(query)}%"`)
      .limit(10)

    return NextResponse.json({
      data: (fallback.data ?? []).map((j: any) => ({
        id: j.id, entity_type: 'job', code: j.job_number,
        title: j.job_title, status: j.status,
        customer_name: j.customers?.name || '',
      }))
    })
  }

  return NextResponse.json({ data: data ?? [] })
})
