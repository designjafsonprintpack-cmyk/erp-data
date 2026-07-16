import { NextResponse, type NextRequest } from 'next/server'
import { createSupabaseServerClient } from '@/lib/supabase/server'
import { getCompanyId } from '@/lib/utils/getCompanyId'

export async function GET(req: NextRequest) {
  const supabase = createSupabaseServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { searchParams } = new URL(req.url)
  const search = searchParams.get('search') || ''
  const page = parseInt(searchParams.get('page') || '1')
  const limit = parseInt(searchParams.get('limit') || '25')
  const offset = (page - 1) * limit

  let query = supabase.from('customers' as any).select('*', { count: 'exact' })
    .is('deleted_at', null).eq('is_active', true)

  if (search) {
    query = query.or(`name.ilike.%${search}%,customer_code.ilike.%${search}%,email.ilike.%${search}%,phone.ilike.%${search}%`)
  }

  const { data, error, count } = await query.order('name').range(offset, offset + limit - 1)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  return NextResponse.json({ data: data ?? [], total: count ?? 0, page, limit })
}

export async function POST(req: NextRequest) {
  const supabase = createSupabaseServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const companyId = await getCompanyId(user, supabase)
  const body = await req.json()

  // Generate customer code atomically
  const { data: seqData } = await (supabase as any).rpc('get_next_sequence_number', {
    p_company_id: companyId,
    p_document_type: 'CUST',
  })

  const { data, error } = await supabase.from('customers' as any).insert({
    ...body,
    company_id: companyId,
    customer_code: seqData || `CUST-${Date.now()}`,
    credit_limit: parseFloat(body.credit_limit || '0'),
    payment_terms: parseInt(body.payment_terms || '30'),
  }).select().single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ data })
}
