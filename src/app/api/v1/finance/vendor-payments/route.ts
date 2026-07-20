import { NextResponse, type NextRequest } from 'next/server'
import { createSupabaseServerClient } from '@/lib/supabase/server'
import { getCompanyId } from '@/lib/utils/getCompanyId'
import { getUserTableId } from '@/lib/utils/getUserTableId'
import { requirePermission } from '@/lib/utils/requirePermission'
import { withErrorHandling } from '@/lib/utils/apiHandler'

export const GET = withErrorHandling(async function GET(req: NextRequest) {
  const supabase = createSupabaseServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const companyId = await getCompanyId(user, supabase)

  const { searchParams } = new URL(req.url)
  const vendorId = searchParams.get('vendor_id') || ''
  const poId     = searchParams.get('po_id') || ''

  let q = supabase.from('vendor_payments' as any)
    .select('*, vendors(name,vendor_code), purchase_orders(po_number)')
    .eq('company_id', companyId)
    .is('deleted_at', null)

  if (vendorId) q = q.eq('vendor_id', vendorId)
  if (poId)     q = q.eq('po_id', poId)

  const { data, error } = await q.order('payment_date', { ascending: false }).limit(100)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ data: data ?? [] })
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
  const amount = parseFloat(String(body.amount ?? '0'))
  if (!body.vendor_id) return NextResponse.json({ error: 'vendor_id is required' }, { status: 400 })
  if (!amount || amount <= 0) return NextResponse.json({ error: 'Amount must be greater than 0' }, { status: 400 })

  const { data: payment, error } = await supabase.from('vendor_payments' as any).insert({
    company_id:     companyId,
    vendor_id:      body.vendor_id,
    po_id:          body.po_id || null,
    amount,
    payment_date:   body.payment_date || new Date().toISOString().slice(0, 10),
    payment_method: body.payment_method || 'bank_transfer',
    reference:      body.reference || null,
    bank_name:      body.bank_name || null,
    notes:          body.notes || null,
    paid_by:        userTableId,
  }).select().single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  // Post the corresponding debit to the supplier ledger (reduces what we owe).
  const { data: vendor } = await supabase.from('vendors' as any)
    .select('name').eq('id', body.vendor_id).single()

  const { data: ledgerEntry, error: ledgerError } = await (supabase as any).rpc('record_supplier_ledger_entry', {
    p_company_id: companyId,
    p_vendor_id: body.vendor_id,
    p_entry_type: 'payment',
    p_description: `Payment${body.reference ? ` — ${body.reference}` : ''}`,
    p_debit: amount,
    p_credit: 0,
    p_reference_type: 'vendor_payment',
    p_reference_id: (payment as any).id,
    p_entry_date: body.payment_date || new Date().toISOString().slice(0, 10),
    p_created_by: userTableId,
  })

  if (ledgerError) return NextResponse.json({ error: ledgerError.message }, { status: 500 })

  return NextResponse.json({ data: payment, ledger_entry: ledgerEntry, vendor_name: (vendor as any)?.name })
})
