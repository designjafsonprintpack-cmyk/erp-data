import { NextResponse, type NextRequest } from 'next/server'
import { createSupabaseServerClient } from '@/lib/supabase/server'
import { getCompanyId } from '@/lib/utils/getCompanyId'

export async function GET(req: NextRequest) {
  const supabase = createSupabaseServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { searchParams } = new URL(req.url)
  const status     = searchParams.get('status') || ''
  const customerId = searchParams.get('customer_id') || ''
  const search     = searchParams.get('search') || ''
  const page       = parseInt(searchParams.get('page') || '1')
  const limit      = 25; const offset = (page - 1) * limit

  let q = supabase.from('invoices' as any)
    .select('*, customers(name,customer_code), invoice_items(*), payments(id,amount,payment_date)', { count: 'exact' })
    .is('deleted_at', null)

  if (status)     q = q.eq('status', status)
  if (customerId) q = q.eq('customer_id', customerId)
  if (search)     q = q.ilike('invoice_number', `%${search}%`)

  const { data, error, count } = await q
    .order('invoice_date', { ascending: false })
    .range(offset, offset + limit - 1)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ data: data ?? [], total: count ?? 0, page })
}

export async function POST(req: NextRequest) {
  const supabase = createSupabaseServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const companyId = await getCompanyId(user, supabase)
  const { items, ...body } = await req.json()

  const { data: invNumber } = await (supabase as any).rpc('get_next_sequence_number', {
    p_company_id: companyId, p_document_type: 'INV',
  })

  // Compute totals
  const lineItems = (items || []).map((item: any) => ({
    ...item,
    subtotal: parseFloat(item.quantity || '1') * parseFloat(item.unit_price || '0'),
  }))
  const subtotal = lineItems.reduce((s: number, i: any) => s + i.subtotal, 0)
  const discPct  = parseFloat(body.discount_pct || '0')
  const discAmt  = subtotal * discPct / 100
  const afterDisc = subtotal - discAmt
  const taxPct   = parseFloat(body.tax_pct || '0')
  const taxAmt   = afterDisc * taxPct / 100
  const total    = afterDisc + taxAmt

  // Due date
  const payTerms  = parseInt(body.payment_terms || '30')
  const dueDate   = body.due_date || new Date(Date.now() + payTerms * 86400000).toISOString().slice(0, 10)

  const { data: invoice, error } = await supabase.from('invoices' as any).insert({
    company_id:      companyId,
    invoice_number:  invNumber,
    customer_id:     body.customer_id,
    dispatch_id:     body.dispatch_id || null,
    status:          'draft',
    invoice_date:    body.invoice_date || new Date().toISOString().slice(0, 10),
    due_date:        dueDate,
    payment_terms:   payTerms,
    subtotal,
    discount_pct:    discPct,
    discount_amount: discAmt,
    tax_pct:         taxPct,
    tax_amount:      taxAmt,
    total_amount:    total,
    paid_amount:     0,
    balance_due:     total,
    notes:           body.notes || null,
    terms:           body.terms || 'Payment due within 30 days of invoice date.',
  }).select().single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  const inv = invoice as any

  if (lineItems.length) {
    await supabase.from('invoice_items' as any).insert(
      lineItems.map((item: any, idx: number) => ({
        company_id:  companyId,
        invoice_id:  inv.id,
        job_id:      item.job_id || null,
        description: item.description,
        quantity:    parseFloat(item.quantity || '1'),
        unit_price:  parseFloat(item.unit_price || '0'),
        subtotal:    item.subtotal,
        sort_order:  idx + 1,
      }))
    )
  }

  return NextResponse.json({ data: inv })
}
