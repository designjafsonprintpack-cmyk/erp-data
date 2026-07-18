import { NextResponse, type NextRequest } from 'next/server'
import { createSupabaseServerClient } from '@/lib/supabase/server'
import { getCompanyId } from '@/lib/utils/getCompanyId'
import { getUserTableId } from '@/lib/utils/getUserTableId'
import { requirePermission } from '@/lib/utils/requirePermission'

export async function GET(_: NextRequest, { params }: { params: { id: string } }) {
  const supabase = createSupabaseServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const companyId = await getCompanyId(user, supabase)

  const { data, error } = await supabase.from('payments' as any)
    .select('*').eq('invoice_id', params.id).eq('company_id', companyId).is('deleted_at', null)
    .order('payment_date', { ascending: false })
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ data: data ?? [] })
}

export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const supabase = createSupabaseServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const companyId = await getCompanyId(user, supabase)
  const userTableId = await getUserTableId(user, supabase)
  const denied = await requirePermission(userTableId, 'finance', 'create', supabase)
  if (denied) return denied

  const body = await req.json()

  // Validate amount against balance
  const { data: invoice } = await supabase.from('invoices' as any)
    .select('balance_due, customer_id, total_amount').eq('id', params.id).eq('company_id', companyId).single()
  if (!invoice) return NextResponse.json({ error: 'Invoice not found' }, { status: 404 })

  const amount = parseFloat(body.amount || '0')
  if (amount <= 0) return NextResponse.json({ error: 'Amount must be greater than 0' }, { status: 400 })

  const { data, error } = await supabase.from('payments' as any).insert({
    company_id:     companyId,
    invoice_id:     params.id,
    customer_id:    (invoice as any).customer_id,
    amount,
    payment_date:   body.payment_date || new Date().toISOString().slice(0, 10),
    payment_method: body.payment_method || 'bank_transfer',
    reference:      body.reference || null,
    bank_name:      body.bank_name || null,
    notes:          body.notes || null,
    received_by:    userTableId,
  }).select().single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  // Fetch updated invoice balance (trigger auto-updates it)
  const { data: updatedInv } = await supabase.from('invoices' as any)
    .select('paid_amount,balance_due,status').eq('id', params.id).eq('company_id', companyId).single()

  return NextResponse.json({ data, invoice: updatedInv })
}
