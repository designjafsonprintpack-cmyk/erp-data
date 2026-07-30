import { NextResponse, type NextRequest } from 'next/server'
import { createSupabaseServerClient } from '@/lib/supabase/server'
import { getCompanyId } from '@/lib/utils/getCompanyId'
import { getUserTableId } from '@/lib/utils/getUserTableId'
import { requirePermission } from '@/lib/utils/requirePermission'
import { withErrorHandling } from '@/lib/utils/apiHandler'
import { parseBody } from '@/lib/utils/validate'
import { createInvoiceSchema } from '@/lib/schemas/invoice'
import { isPageOutOfRange, outOfRangeResponse } from '@/lib/utils/pagedResponse'

export const GET = withErrorHandling(async function GET(req: NextRequest) {
  const supabase = createSupabaseServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const companyId = await getCompanyId(user, supabase)

  const { searchParams } = new URL(req.url)
  const status     = searchParams.get('status') || ''
  const customerId = searchParams.get('customer_id') || ''
  const search     = searchParams.get('search') || ''
  const from       = searchParams.get('from') || ''
  const to         = searchParams.get('to') || ''
  const page       = parseInt(searchParams.get('page') || '1')
  // Was a hard 25 — the Finance list asks for LIST_PAGE_SIZE (50).
  const limit      = Math.min(parseInt(searchParams.get('limit') || '25') || 25, 200)
  const offset     = (page - 1) * limit

  let q = supabase.from('invoices' as any)
    .select('*, customers(name,customer_code), invoice_items(*), payments(id,amount,payment_date)', { count: 'exact' })
    .eq('company_id', companyId)
    .is('deleted_at', null)

  if (status)     q = q.eq('status', status)
  if (customerId) q = q.eq('customer_id', customerId)
  if (search)     q = q.ilike('invoice_number', `%${search}%`)
  if (from)       q = q.gte('invoice_date', from)
  if (to)         q = q.lte('invoice_date', to)

  const { data, error, count } = await q
    .order('invoice_date', { ascending: false })
    // Tiebreaker — several invoices share an invoice_date, and an unstable
    // order makes page 2 repeat rows page 1 already showed.
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
  const denied = await requirePermission(userTableId, 'finance', 'create', supabase)
  if (denied) return denied

  const parsed = await parseBody(req, createInvoiceSchema)
  if ('error' in parsed) return parsed.error
  const { items, ...body } = parsed.data

  const { data: invNumber } = await (supabase as any).rpc('get_next_sequence_number', {
    p_company_id: companyId, p_document_type: 'INV',
  })

  // If a specific tax was selected, trust the DB's configured rate over
  // whatever percentage the client sent — the dropdown already fills tax_pct
  // client-side, but re-deriving it server-side prevents a stale/tampered
  // value from ever being stored against a real tax_id.
  let taxPct = parseFloat(String(body.tax_pct ?? '0'))
  if (body.tax_id) {
    const { data: taxRow } = await supabase.from('taxes' as any)
      .select('rate_percent').eq('id', body.tax_id).single()
    if (taxRow) taxPct = Number((taxRow as any).rate_percent)
  }

  // Compute totals
  const lineItems = (items || []).map((item: any) => ({
    ...item,
    subtotal: parseFloat(String(item.quantity ?? '1')) * parseFloat(String(item.unit_price ?? '0')),
  }))
  const subtotal = lineItems.reduce((s: number, i: any) => s + i.subtotal, 0)
  const discPct  = parseFloat(String(body.discount_pct ?? '0'))
  const discAmt  = subtotal * discPct / 100
  const afterDisc = subtotal - discAmt
  const taxAmt   = afterDisc * taxPct / 100
  const total    = afterDisc + taxAmt

  // Due date
  const payTerms  = parseInt(String(body.payment_terms ?? '30'))
  const dueDate   = body.due_date || new Date(Date.now() + payTerms * 86400000).toISOString().slice(0, 10)

  const invoiceDate = body.invoice_date || new Date().toISOString().slice(0, 10)

  const { data: invoice, error } = await supabase.from('invoices' as any).insert({
    company_id:      companyId,
    invoice_number:  invNumber,
    customer_id:     body.customer_id,
    dispatch_id:     body.dispatch_id || null,
    status:          'draft',
    invoice_date:    invoiceDate,
    due_date:        dueDate,
    payment_terms:   payTerms,
    subtotal,
    discount_pct:    discPct,
    discount_amount: discAmt,
    tax_id:          body.tax_id || null,
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

  // Post the corresponding debit to the customer ledger (invoice increases AR).
  //
  // A Supabase builder has `then()` and no `catch()`, so the `.rpc(…).catch(…)`
  // that used to be here threw synchronously and made EVERY invoice creation a
  // 500 (invoices and customer_ledger_entries were both at 0 rows). Same fault
  // in five places; see the note in api/v1/purchase-orders/route.ts.
  const { error: ledgerErr } = await (supabase as any).rpc('record_customer_ledger_entry', {
    p_company_id: companyId,
    p_customer_id: body.customer_id,
    p_entry_type: 'invoice',
    p_description: `Invoice ${inv.invoice_number}`,
    p_debit: total,
    p_credit: 0,
    p_reference_type: 'invoice',
    p_reference_id: inv.id,
    p_entry_date: inv.invoice_date,
    p_created_by: userTableId,
  })
  // Non-blocking on purpose: an invoice must never fail to create because the
  // ledger write hiccuped — the balance can be reconciled from
  // invoices/payments directly. But it is logged now instead of vanishing.
  if (ledgerErr) console.error('[Invoice create] customer ledger entry failed', ledgerErr)

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
})
