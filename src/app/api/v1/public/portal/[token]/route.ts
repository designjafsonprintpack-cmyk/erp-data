import { NextResponse, type NextRequest } from 'next/server'
import { createSupabaseAdminClient } from '@/lib/supabase/admin'
import { withErrorHandling } from '@/lib/utils/apiHandler'
import { rateLimit, getClientIp } from '@/lib/utils/rateLimit'

// Public, unauthenticated — reachable from a shared portal link. Every query
// is scoped by the token itself (never by any auth session), same pattern as
// /api/v1/public/quotations/[token]. Read-only: no POST/PATCH/DELETE here —
// the portal shows status, it doesn't let customers change anything.
export const GET = withErrorHandling(async function GET(req: NextRequest, { params }: { params: { token: string } }) {
  const limited = rateLimit(`public-portal-view:${getClientIp(req)}`, { windowMs: 5 * 60_000, max: 30 })
  if (limited) return limited

  const supabase = createSupabaseAdminClient()

  const { data: customer, error } = await supabase.from('customers' as any)
    .select('id, company_id, name, customer_code, portal_enabled, portal_token_expires_at')
    .eq('portal_token', params.token)
    .is('deleted_at', null)
    .maybeSingle()

  if (error || !customer) return NextResponse.json({ error: 'This portal link is invalid.' }, { status: 404 })
  const cust = customer as any

  if (!cust.portal_enabled) {
    return NextResponse.json({ error: 'Portal access has been disabled for this account. Please contact us.' }, { status: 403 })
  }
  if (cust.portal_token_expires_at && new Date(cust.portal_token_expires_at) < new Date()) {
    return NextResponse.json({ error: 'This portal link has expired. Please ask us to resend it.' }, { status: 410 })
  }

  const [jobsRes, quotationsRes, invoicesRes, ledgerRes, dispatchesRes] = await Promise.all([
    supabase.from('jobs' as any)
      .select('id, job_number, job_title, status, quantity, required_date, created_at')
      .eq('customer_id', cust.id).is('deleted_at', null)
      .order('created_at', { ascending: false }).limit(20),
    supabase.from('quotations' as any)
      .select('id, quotation_number, status, total_amount, valid_until, created_at')
      .eq('customer_id', cust.id).is('deleted_at', null)
      .order('created_at', { ascending: false }).limit(20),
    supabase.from('invoices' as any)
      .select('id, invoice_number, status, total_amount, paid_amount, balance_due, due_date, invoice_date')
      .eq('customer_id', cust.id).is('deleted_at', null)
      .order('invoice_date', { ascending: false }).limit(20),
    supabase.from('customer_ledger_entries' as any)
      .select('balance_after')
      .eq('customer_id', cust.id).is('deleted_at', null)
      .order('entry_date', { ascending: false }).order('created_at', { ascending: false })
      .limit(1),
    supabase.from('dispatch_orders' as any)
      .select('id, dispatch_number, status, dispatch_method, tracking_number, courier_name, scheduled_date, dispatched_at, delivered_at, created_at, dispatch_items(job_id, quantity_dispatched, jobs(job_number,job_title))')
      .eq('customer_id', cust.id).is('deleted_at', null)
      .order('created_at', { ascending: false }).limit(20),
  ])

  const currentBalance = (ledgerRes.data && ledgerRes.data[0]) ? (ledgerRes.data[0] as any).balance_after : 0

  return NextResponse.json({
    customer: { name: cust.name, customer_code: cust.customer_code },
    jobs: jobsRes.data ?? [],
    quotations: quotationsRes.data ?? [],
    invoices: invoicesRes.data ?? [],
    dispatches: dispatchesRes.data ?? [],
    current_balance: currentBalance,
  })
})
