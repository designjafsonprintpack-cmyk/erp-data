import { NextResponse, type NextRequest } from 'next/server'
import { createSupabaseServerClient } from '@/lib/supabase/server'
import { getCompanyId } from '@/lib/utils/getCompanyId'
import { getUserTableId } from '@/lib/utils/getUserTableId'
import { requirePermission } from '@/lib/utils/requirePermission'
import { withErrorHandling } from '@/lib/utils/apiHandler'
import { parseBody } from '@/lib/utils/validate'
import { vendorBillSchema } from '@/lib/schemas/vendor'

export const GET = withErrorHandling(async function GET(_: NextRequest, { params }: { params: { id: string } }) {
  const supabase = createSupabaseServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const companyId = await getCompanyId(user, supabase)

  const { data, error } = await supabase.from('vendor_bills' as any)
    .select('*, vendor_bill_items(*)')
    .eq('company_id', companyId).eq('po_id', params.id).is('deleted_at', null)
    .order('bill_date', { ascending: false })

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ data: data ?? [] })
})

export const POST = withErrorHandling(async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const supabase = createSupabaseServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const companyId = await getCompanyId(user, supabase)
  const userTableId = await getUserTableId(user, supabase)
  const denied = await requirePermission(userTableId, 'purchase', 'create', supabase)
  if (denied) return denied

  const parsed = await parseBody(req, vendorBillSchema)
  if ('error' in parsed) return parsed.error
  const { items, ...body } = parsed.data

  const { data: poRow } = await supabase.from('purchase_orders' as any)
    .select('vendor_id').eq('id', params.id).eq('company_id', companyId).single()
  if (!poRow) return NextResponse.json({ error: 'Purchase order not found' }, { status: 404 })

  const lineItems = (items || []).map((item: any) => ({
    ...item,
    subtotal: parseFloat(String(item.quantity_billed ?? '0')) * parseFloat(String(item.unit_price ?? '0')),
  }))
  const totalAmount = lineItems.reduce((s: number, i: any) => s + i.subtotal, 0)

  const { data: bill, error } = await supabase.from('vendor_bills' as any).insert({
    company_id:   companyId,
    po_id:        params.id,
    vendor_id:    (poRow as any).vendor_id,
    bill_number:  body.bill_number,
    bill_date:    body.bill_date || new Date().toISOString().slice(0, 10),
    due_date:     body.due_date || null,
    total_amount: totalAmount,
    notes:        body.notes || null,
  }).select().single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  if (lineItems.length) {
    await supabase.from('vendor_bill_items' as any).insert(
      lineItems.map((item: any) => ({
        company_id:      companyId,
        bill_id:         (bill as any).id,
        po_item_id:      item.po_item_id || null,
        description:     item.description,
        quantity_billed: parseFloat(String(item.quantity_billed ?? '0')),
        unit_price:      parseFloat(String(item.unit_price ?? '0')),
        subtotal:        item.subtotal,
      }))
    )
  }

  return NextResponse.json({ data: bill })
})
