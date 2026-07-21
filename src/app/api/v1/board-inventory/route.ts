import { NextResponse, type NextRequest } from 'next/server'
import { createSupabaseServerClient } from '@/lib/supabase/server'
import { getCompanyId } from '@/lib/utils/getCompanyId'
import { getUserTableId } from '@/lib/utils/getUserTableId'
import { requirePermission } from '@/lib/utils/requirePermission'
import { withErrorHandling } from '@/lib/utils/apiHandler'
import { parseBody } from '@/lib/utils/validate'
import { boardInventorySchema } from '@/lib/schemas/inventory'

export const GET = withErrorHandling(async function GET(req: NextRequest) {
  const supabase = createSupabaseServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const companyId = await getCompanyId(user, supabase)

  const { searchParams } = new URL(req.url)
  const search   = searchParams.get('search') || ''
  const lowStock = searchParams.get('low_stock') === 'true'
  const page  = parseInt(searchParams.get('page') || '1')
  const limit = parseInt(searchParams.get('limit') || '100')
  const offset = (page - 1) * limit

  let q = supabase.from('board_inventory' as any)
    .select('*, board_types(name)', { count: 'exact' })
    .eq('company_id', companyId)
    .is('deleted_at', null).eq('is_active', true)

  if (search) q = q.ilike('description', `%${search}%`)
  if (lowStock) q = q.lte('current_stock', supabase.rpc as any)  // simplified — client filters

  // The low-stock view is a client-side filter over reorder_level (no direct
  // column-to-column comparison in a PostgREST filter) — it needs to see
  // every row to filter correctly, so pagination is skipped for that case;
  // the result set it returns is inherently small (only items at/under
  // their reorder point), not a full table dump.
  const { data, error, count } = lowStock
    ? await q.order('description')
    : await q.order('description').range(offset, offset + limit - 1)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  const filtered = lowStock
    ? (data ?? []).filter((i: any) => i.current_stock <= i.reorder_level)
    : (data ?? [])

  return NextResponse.json({ data: filtered, total: lowStock ? filtered.length : (count ?? 0), page, limit })
})

export const POST = withErrorHandling(async function POST(req: NextRequest) {
  const supabase = createSupabaseServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const companyId = await getCompanyId(user, supabase)
  const userTableId = await getUserTableId(user, supabase)
  const denied = await requirePermission(userTableId, 'store', 'create', supabase)
  if (denied) return denied
  const parsed = await parseBody(req, boardInventorySchema)
  if ('error' in parsed) return parsed.error
  const body = parsed.data

  const { data, error } = await supabase.from('board_inventory' as any).insert({
    company_id:    companyId,
    board_type_id: body.board_type_id || null,
    description:   body.description,
    size_l:        body.size_l ? parseFloat(String(body.size_l)) : null,
    size_w:        body.size_w ? parseFloat(String(body.size_w)) : null,
    gsm:           body.gsm ? parseFloat(String(body.gsm)) : null,
    current_stock: parseFloat(String(body.current_stock ?? '0')),
    reserved_stock: 0,
    reorder_level: parseFloat(String(body.reorder_level ?? '0')),
    unit_id:       body.unit_id || null,
    unit_cost:     body.unit_cost ? parseFloat(String(body.unit_cost)) : 0,
    location:      body.location || null,
  }).select().single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  // Record initial movement if stock > 0
  if (parseFloat(String(body.current_stock ?? '0')) > 0) {
    await supabase.from('board_inventory_movements' as any).insert({
      company_id:    companyId,
      board_item_id: (data as any).id,
      movement_type: 'in',
      quantity:      parseFloat(String(body.current_stock)),
      balance_after: parseFloat(String(body.current_stock)),
      reference_type: 'manual',
      notes:         'Opening stock',
      moved_by:      userTableId,
    })
  }

  return NextResponse.json({ data })
})
