import { NextResponse, type NextRequest } from 'next/server'
import { createSupabaseServerClient } from '@/lib/supabase/server'
import { getCompanyId } from '@/lib/utils/getCompanyId'
import { getUserTableId } from '@/lib/utils/getUserTableId'
import { requirePermission } from '@/lib/utils/requirePermission'
import { withErrorHandling } from '@/lib/utils/apiHandler'

export const GET = withErrorHandling(async function GET() {
  const supabase = createSupabaseServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const companyId = await getCompanyId(user, supabase)

  const { data, error } = await supabase.from('cost_item_types' as any)
    .select('*').eq('company_id', companyId).is('deleted_at', null).eq('is_active', true)
    .order('sort_order').order('name')
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ data: data ?? [] })
})

export const POST = withErrorHandling(async function POST(req: NextRequest) {
  const supabase = createSupabaseServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const companyId = await getCompanyId(user, supabase)
  const userTableId = await getUserTableId(user, supabase)
  const denied = await requirePermission(userTableId, 'settings', 'create', supabase)
  if (denied) return denied

  const body = await req.json()
  if (!body.name || !body.unit_basis) return NextResponse.json({ error: 'name and unit_basis are required' }, { status: 400 })

  // New custom items always append after the workflow-ordered defaults
  // rather than landing wherever alphabetical sort happens to put them.
  const { data: maxRow } = await supabase.from('cost_item_types' as any)
    .select('sort_order').eq('company_id', companyId).order('sort_order', { ascending: false }).limit(1).maybeSingle()
  const nextSortOrder = ((maxRow as any)?.sort_order || 0) + 10

  const { data, error } = await supabase.from('cost_item_types' as any).insert({
    company_id: companyId,
    name: body.name,
    unit_basis: body.unit_basis,
    default_rate: body.default_rate ? parseFloat(body.default_rate) : 0,
    sort_order: nextSortOrder,
  }).select().single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ data })
})
