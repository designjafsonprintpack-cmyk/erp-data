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
    // vendors is embeddable only since 113 added the missing foreign key.
    .select('*, board_types(name), paper_types(name), vendors(name)', { count: 'exact' })
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
    // Board OR paper, never both (115 enforces it with a CHECK). The form
    // sends exactly one of the two, so the other is written NULL rather than
    // left off — an omitted key on an insert is the same as NULL here, but
    // being explicit is what keeps the invariant readable.
    board_type_id: body.board_type_id || null,
    paper_type_id: body.board_type_id ? null : (body.paper_type_id || null),
    description:   body.description,
    sheet_width_in:        body.sheet_width_in ? parseFloat(String(body.sheet_width_in)) : null,
    sheet_height_in:        body.sheet_height_in ? parseFloat(String(body.sheet_height_in)) : null,
    gsm:           body.gsm ? parseFloat(String(body.gsm)) : null,
    // Sheets — the client converts from packets before sending (113).
    current_stock: parseFloat(String(body.current_stock ?? '0')),
    reserved_stock: 0,
    reorder_level: parseFloat(String(body.reorder_level ?? '0')),
    sheets_per_packet: body.sheets_per_packet ? parseInt(String(body.sheets_per_packet), 10) : 100,
    vendor_id:     body.vendor_id || null,
    unit_id:       body.unit_id || null,
    unit_cost:     body.unit_cost ? parseFloat(String(body.unit_cost)) : 0,
    location:      body.location || null,
  }).select().single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  // Record initial movement if stock > 0.
  //
  // This row is what the stock report reads Opening from — it takes the last
  // balance_after before the window (114). If the insert fails, the item exists
  // with stock but the ledger starts from nothing, and every report on it is
  // wrong from then on. Returned as a warning: the item was created, so this
  // must not 500, but it must not be invisible either.
  let warning: string | undefined
  if (parseFloat(String(body.current_stock ?? '0')) > 0) {
    const { error: movErr } = await supabase.from('board_inventory_movements' as any).insert({
      company_id:    companyId,
      board_item_id: (data as any).id,
      movement_type: 'in',
      quantity:      parseFloat(String(body.current_stock)),
      balance_after: parseFloat(String(body.current_stock)),
      reference_type: 'manual',
      notes:         'Opening stock',
      moved_by:      userTableId,
    })
    if (movErr) {
      console.error('[Board item create] opening stock movement failed', movErr)
      warning = `${body.description} was created, but its opening stock ledger entry failed: ${movErr.message}`
    }
  }

  return NextResponse.json(warning ? { data, warning } : { data })
})
