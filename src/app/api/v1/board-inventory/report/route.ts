import { NextResponse, type NextRequest } from 'next/server'
import { createSupabaseServerClient } from '@/lib/supabase/server'
import { getCompanyId } from '@/lib/utils/getCompanyId'
import { withErrorHandling } from '@/lib/utils/apiHandler'

/**
 * The monthly board stock report: Opening / Received / Return / Issued /
 * Balance per item, grouped by vendor — the shop's own Excel, rebuilt from the
 * movement ledger (migration 114).
 *
 * Every figure is COMPUTED in the database by get_board_stock_report(). Nothing
 * is totalled from a fetched array: that is how the Finance stat cards went
 * silently wrong past 200 rows (103), and PostgREST caps a plain select at 1000
 * rows with no error at all.
 *
 * The window defaults to the current calendar month. company_id comes from the
 * JWT, never from the query string.
 */
export const GET = withErrorHandling(async function GET(req: NextRequest) {
  const supabase = createSupabaseServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const companyId = await getCompanyId(user, supabase)

  const { searchParams } = new URL(req.url)
  const now = new Date()
  const firstOfMonth = new Date(now.getFullYear(), now.getMonth(), 1)
  const lastOfMonth  = new Date(now.getFullYear(), now.getMonth() + 1, 0)
  const iso = (d: Date) =>
    `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`

  const from = searchParams.get('from') || iso(firstOfMonth)
  const to   = searchParams.get('to')   || iso(lastOfMonth)

  if (!/^\d{4}-\d{2}-\d{2}$/.test(from) || !/^\d{4}-\d{2}-\d{2}$/.test(to)) {
    return NextResponse.json({ error: 'from and to must be YYYY-MM-DD dates' }, { status: 400 })
  }
  if (from > to) {
    return NextResponse.json({ error: 'from cannot be after to' }, { status: 400 })
  }

  const { data, error } = await (supabase as any).rpc('get_board_stock_report', {
    p_company_id: companyId,
    p_from: from,
    p_to: to,
  })
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  const rows = (data ?? []) as any[]

  // Surfaced rather than hidden: if the arithmetic and the ledger's own
  // balance_after disagree on any row, something wrote a movement wrong and
  // every total below it is suspect. Better a visible warning than a neat lie.
  const drifted = rows
    .filter(r => Number(r.closing_sheets) !== Number(r.ledger_closing))
    .map(r => r.description)

  return NextResponse.json({
    data: rows,
    from,
    to,
    ...(drifted.length ? { warning: `Ledger and computed balance disagree on: ${drifted.join(', ')}` } : {}),
  })
})
