import { NextResponse, type NextRequest } from 'next/server'
import { createSupabaseServerClient } from '@/lib/supabase/server'
import { getCompanyId } from '@/lib/utils/getCompanyId'
import { getUserTableId } from '@/lib/utils/getUserTableId'
import { requirePermission } from '@/lib/utils/requirePermission'
import { escapeFilterValue } from '@/lib/utils/escapeFilterValue'
import { withErrorHandling } from '@/lib/utils/apiHandler'

export const GET = withErrorHandling(async function GET(req: NextRequest) {
  const supabase = createSupabaseServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const companyId = await getCompanyId(user, supabase)

  const { searchParams } = new URL(req.url)
  const search = searchParams.get('search') || ''

  let q = supabase.from('vendors' as any).select('*', { count: 'exact' })
    .eq('company_id', companyId)
    .is('deleted_at', null).eq('is_active', true)
  if (search) q = q.or(`name.ilike."%${escapeFilterValue(search)}%",vendor_code.ilike."%${escapeFilterValue(search)}%"`)

  const { data, error, count } = await q.order('name')
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ data: data ?? [], total: count ?? 0 })
})

export const POST = withErrorHandling(async function POST(req: NextRequest) {
  const supabase = createSupabaseServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const companyId = await getCompanyId(user, supabase)
  const userTableId = await getUserTableId(user, supabase)
  const denied = await requirePermission(userTableId, 'purchase', 'create', supabase)
  if (denied) return denied
  const body = await req.json()

  const { data: vendorCode } = await (supabase as any).rpc('get_next_sequence_number', {
    p_company_id: companyId, p_document_type: 'VND',
  })

  const { data, error } = await supabase.from('vendors' as any).insert({
    ...body, company_id: companyId, vendor_code: vendorCode,
    payment_terms: parseInt(body.payment_terms || '30'),
  }).select().single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ data })
})
