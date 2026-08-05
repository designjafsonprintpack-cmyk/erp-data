import { NextResponse, type NextRequest } from 'next/server'
import { createSupabaseServerClient } from '@/lib/supabase/server'
import { getCompanyId } from '@/lib/utils/getCompanyId'
import { getUserTableId } from '@/lib/utils/getUserTableId'
import { requirePermission } from '@/lib/utils/requirePermission'
import { escapeFilterValue } from '@/lib/utils/escapeFilterValue'
import { withErrorHandling } from '@/lib/utils/apiHandler'
import { parseBody } from '@/lib/utils/validate'
import { createPurchaseOrderSchema } from '@/lib/schemas/purchaseOrder'
// PO banane ka poora amal ab yahan hai — Demands se banne wala PO bhi wahi
// chalata hai, taake rate-basis, supplier ledger aur demand link kabhi alag na hon.
import { createPurchaseOrder } from '@/lib/services/purchaseOrderCreate'
import { isPageOutOfRange, outOfRangeResponse } from '@/lib/utils/pagedResponse'

export const GET = withErrorHandling(async function GET(req: NextRequest) {
  const supabase = createSupabaseServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const companyId = await getCompanyId(user, supabase)

  const { searchParams } = new URL(req.url)
  const status = searchParams.get('status') || ''
  const search = searchParams.get('search') || ''
  const page   = parseInt(searchParams.get('page') || '1')
  // Was a hard 25 — the list pages ask for LIST_PAGE_SIZE (50) and Export
  // walks the pages in chunks of 200.
  const limit  = Math.min(parseInt(searchParams.get('limit') || '25') || 25, 200)
  const offset = (page - 1) * limit

  let q = supabase.from('purchase_orders' as any)
    // jobs embedded so a line can show which job it was bought for (113).
    // Unhinted is correct — that FK is the only relationship between these two.
    .select('*, vendors(name,vendor_code), purchase_order_items(*, jobs(job_number,job_title))', { count: 'exact' })
    .eq('company_id', companyId)
    .is('deleted_at', null)

  if (status) q = q.eq('status', status)
  if (search) q = q.or(`po_number.ilike."%${escapeFilterValue(search)}%"`)

  const { data, error, count } = await q
    .order('created_at', { ascending: false })
    // Tiebreaker — without it page 2 can repeat rows from page 1.
    .order('id', { ascending: false })
    .range(offset, offset + limit - 1)
  // A page past the end is an empty page, not a 500 — see pagedResponse.
  if (isPageOutOfRange(error)) return NextResponse.json(outOfRangeResponse(page, limit))
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ data: data ?? [], total: count ?? 0, page, limit })
})

export const POST = withErrorHandling(async function POST(req: NextRequest) {
  const supabase = createSupabaseServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const companyId = await getCompanyId(user, supabase)
  const userTableId = await getUserTableId(user, supabase)
  const denied = await requirePermission(userTableId, 'purchase', 'create', supabase)
  if (denied) return denied

  const parsed = await parseBody(req, createPurchaseOrderSchema)
  if ('error' in parsed) return parsed.error
  const { items, ...body } = parsed.data

  const result = await createPurchaseOrder(supabase as any, companyId, userTableId, body, items as any)
  if (result.error) return NextResponse.json({ error: result.error }, { status: result.status ?? 500 })

  return NextResponse.json({ data: result.po })
})
