import { NextResponse, type NextRequest } from 'next/server'
import { createSupabaseServerClient } from '@/lib/supabase/server'
import { getCompanyId } from '@/lib/utils/getCompanyId'
import { getUserTableId } from '@/lib/utils/getUserTableId'
import { requirePermission } from '@/lib/utils/requirePermission'
import { withErrorHandling } from '@/lib/utils/apiHandler'
import { parseBody } from '@/lib/utils/validate'
import { createPurchaseOrderSchema } from '@/lib/schemas/purchaseOrder'

export const GET = withErrorHandling(async function GET(req: NextRequest) {
  const supabase = createSupabaseServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const companyId = await getCompanyId(user, supabase)

  const { searchParams } = new URL(req.url)
  const status = searchParams.get('status') || ''
  const search = searchParams.get('search') || ''
  const page   = parseInt(searchParams.get('page') || '1')
  const limit  = 25; const offset = (page - 1) * limit

  let q = supabase.from('purchase_orders' as any)
    .select('*, vendors(name,vendor_code), purchase_order_items(*)', { count: 'exact' })
    .eq('company_id', companyId)
    .is('deleted_at', null)

  if (status) q = q.eq('status', status)
  if (search) q = q.or(`po_number.ilike.%${search}%`)

  const { data, error, count } = await q
    .order('created_at', { ascending: false }).range(offset, offset + limit - 1)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ data: data ?? [], total: count ?? 0, page })
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

  const { data: poNumber } = await (supabase as any).rpc('get_next_sequence_number', {
    p_company_id: companyId, p_document_type: 'PO',
  })

  // Compute totals from items
  const lineItems = (items || []).map((item: any, idx: number) => ({
    ...item,
    line_no:   idx + 1,
    sort_order: idx + 1,
    subtotal:  parseFloat(String(item.quantity ?? '0')) * parseFloat(String(item.unit_price ?? '0')),
  }))
  const subtotal = lineItems.reduce((s: number, i: any) => s + i.subtotal, 0)
  const taxRate  = parseFloat(String(body.tax_rate ?? '0')) / 100
  const taxAmt   = subtotal * taxRate

  const { data: po, error } = await supabase.from('purchase_orders' as any).insert({
    company_id:    companyId,
    po_number:     poNumber,
    vendor_id:     body.vendor_id,
    order_date:    body.order_date || new Date().toISOString().slice(0, 10),
    expected_date: body.expected_date || null,
    notes:         body.notes || null,
    terms:         body.terms || null,
    subtotal,
    tax_amount:    taxAmt,
    total_amount:  subtotal + taxAmt,
    status:        'draft',
  }).select().single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  const poRow = po as any

  // Post the corresponding credit to the supplier ledger (PO increases AP).
  await (supabase as any).rpc('record_supplier_ledger_entry', {
    p_company_id: companyId,
    p_vendor_id: body.vendor_id,
    p_entry_type: 'purchase_order',
    p_description: `PO ${poRow.po_number}`,
    p_debit: 0,
    p_credit: poRow.total_amount,
    p_reference_type: 'purchase_order',
    p_reference_id: poRow.id,
    p_entry_date: poRow.order_date,
    p_created_by: userTableId,
  }).catch(() => null) // non-blocking, same reasoning as invoice creation

  if (lineItems.length) {
    await supabase.from('purchase_order_items' as any).insert(
      lineItems.map((item: any) => ({
        company_id:  companyId,
        po_id:       (po as any).id,
        line_no:     item.line_no,
        description: item.description,
        specification: item.specification || null,
        quantity:    parseFloat(item.quantity || '1'),
        unit_id:     item.unit_id || null,
        unit_price:  parseFloat(item.unit_price || '0'),
        subtotal:    item.subtotal,
        board_item_id: item.board_item_id || null,
        notes:       item.notes || null,
        sort_order:  item.sort_order,
      }))
    )
  }

  return NextResponse.json({ data: po })
})
