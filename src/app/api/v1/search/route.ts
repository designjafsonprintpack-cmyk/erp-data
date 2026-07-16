import { NextResponse, type NextRequest } from 'next/server'
import { createSupabaseServerClient } from '@/lib/supabase/server'

export async function GET(req: NextRequest) {
  const supabase = createSupabaseServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { searchParams } = new URL(req.url)
  const query = searchParams.get('q')?.trim() || ''
  const type  = searchParams.get('type') || '' // 'job' | 'customer' | 'sales_order' | ''

  if (query.length < 2) return NextResponse.json({ data: [] })

  // Build tsquery — handle single words and phrases
  const tsQuery = query.split(/\s+/).filter(Boolean).map(w => w + ':*').join(' & ')

  let q = supabase
    .from('global_search_index' as any)
    .select('id, entity_type, code, title, status, customer_name, created_at, required_date')
    .textSearch('search_vector', tsQuery, { type: 'websearch', config: 'simple' })
    .limit(20)

  if (type) q = q.eq('entity_type', type)

  const { data, error } = await q

  if (error) {
    // Fallback to ilike if materialized view fails
    const fallback = await supabase
      .from('jobs' as any)
      .select('id,job_number,job_title,status,customers(name)')
      .is('deleted_at', null)
      .or(`job_number.ilike.%${query}%,job_title.ilike.%${query}%`)
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
}
